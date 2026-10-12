import assert from "node:assert/strict";
import type { z } from "zod";
import {
  readMechanismFamilyAuthoring,
  readMechanismCueAuthoring,
  patchMechanismCueAuthoring,
  createMechanismCameraRecipeFrame,
  compileMechanismCueProject,
} from "@still-shift/animation-engine";
import type { MechanismCuePatchSchema } from "@still-shift/animation-engine";
import type {
  MechanismCamera,
  MechanismNarratedCycle,
} from "@still-shift/scene-contract";
import { prepareMechanismSceneV2 } from "../../packages/renderer-core/src/mechanism/prepare-v2.ts";
import { evaluateMechanismFrameV2 } from "../../packages/renderer-core/src/mechanism/evaluate-v2.ts";
import { nativeAnchorVisibilities } from "../../packages/renderer-core/src/native3d/physical-visibility.ts";
import { join, dirname } from "node:path";

type Project = {
  id: string;
  family: string;
  familyPath: string;
  cuePath: string;
};
type Cue = MechanismNarratedCycle["cues"][number];
/** Revise framing of the existing teaching poses. This does not retime or synthesize speech. */
export async function reviseSpokenCuePresentation(project: Project) {
  const { instance } = await readMechanismFamilyAuthoring(project.familyPath);
  const initial = await readMechanismCueAuthoring(instance, project.cuePath);
  const { document, compiled } = initial;
  const cameraByCue = new Map<string, MechanismCamera>();
  const recipes: unknown[] = [];
  const plan = (ids: string[], target: string, directionIndex = 0) => {
    const cues = ids.map((id) => document.cues.find((cue) => cue.id === id)!);
    assert.ok(cues.every(Boolean));
    const start = Math.ceil(cues[0]!.startSample / 1600);
    const end = Math.ceil(cues.at(-1)!.endSampleExclusive / 1600);
    const envelopeFrames = [
      ...new Set([
        ...Array.from(
          { length: 32 },
          (_, index) => start + Math.floor(((end - start - 1) * index) / 31),
        ),
        ...cues.map((cue) => Math.ceil(cue.startSample / 1600)),
      ]),
    ].sort((a, b) => a - b);
    const recipe = createMechanismCameraRecipeFrame(instance, {
      target,
      directionIndex,
      frame: start,
      envelopeFrames,
      width: 640,
      height: 360,
      rigControls: compiled.timeline.timeline.rigControls,
      safeInsets: { left: 12, top: 88, right: 12, bottom: 95 },
    });
    // Narrated tracks keep the immutable source clipping planes. Recheck the selected pose with those planes.
    const camera: MechanismCamera = {
      ...recipe.camera,
      near: instance.scene.camera.near,
      far: instance.scene.camera.far,
    };
    const clippingChecks = envelopeFrames.map(
      (frame) =>
        createMechanismCameraRecipeFrame(instance, {
          target,
          frame,
          width: 640,
          height: 360,
          rigControls: compiled.timeline.timeline.rigControls,
          safeInsets: { left: 12, top: 88, right: 12, bottom: 95 },
          authoredCamera: camera,
        }).check,
    );
    for (const id of ids) cameraByCue.set(id, camera);
    recipes.push({
      cues: ids,
      sourceFrames: [start, end],
      envelopeFrames,
      recipe,
      selectedCamera: camera,
      clippingChecks,
    });
  };
  if (project.family === "tape-hook") {
    plan(["intro"], "recognition");
    plan(["inside-face"], "approach");
    plan(["outside-face"], "comparison");
    plan(["thickness"], "macro");
    plan(["compensate"], "approach");
    if (document.cues.some((cue) => cue.id === "aligned"))
      plan(["aligned"], "comparison");
  } else if (project.family === "cable-tie") {
    plan(["intro"], "recognition");
    plan(["tongue", "forward-pass", "blocked-reverse"], "macro");
  } else {
    assert.equal(project.family, "clothespeg");
    plan(["intro", "open", "release", "fabric"], "recognition");
    plan(["bias"], "macro");
  }
  const annotations = (cue: Cue) => {
    const original = cue.annotations[0]!;
    let anchor = original.anchor,
      text = original.text;
    if (project.family === "tape-hook") {
      if (cue.id === "intro") anchor = "hook.flange";
      if (cue.id === "thickness") anchor = "hook.thicknessMarker";
      if (cue.id === "compensate") {
        anchor = "rivet.travel";
        text = "Travel at rivet";
      }
    } else if (project.family === "cable-tie" && cue.id === "tongue")
      anchor = "pawl.tip";
    else if (project.family === "clothespeg") {
      if (cue.id === "intro") anchor = "lower.seat";
      if (cue.id === "open") anchor = "upper.tip";
      if (cue.id === "release" || cue.id === "bias") anchor = "spring.seat.b";
    }
    const { id, ...value } = original;
    return { id, value: { ...value, text, anchor } };
  };
  let previousCamera: MechanismCamera | undefined;
  const operations: z.input<typeof MechanismCuePatchSchema>["operations"] =
    document.cues.flatMap((cue) => {
      const camera = cameraByCue.get(cue.id)!;
      assert.ok(camera);
      const editing =
        previousCamera === camera ? ("hold" as const) : ("cut" as const);
      previousCamera = camera;
      const annotation = annotations(cue);
      return [
        {
          cue: cue.id,
          property: "camera" as const,
          value: { camera, editing },
        },
        {
          cue: cue.id,
          property: "annotation" as const,
          annotation: annotation.id,
          value: annotation.value,
        },
      ];
    });
  const expectedControls = structuredClone(document.controls);
  if (project.family === "clothespeg") {
    // Held states interpolate toward the next held state. Keep the intro closed,
    // then open during the actual spoken opening window, before the unchanged release.
    for (const writer of expectedControls) {
      assert.equal(writer.control.type, "spring-return");
      if (writer.control.type !== "spring-return")
        throw Error("Missing spring-return writer");
      const [intro, open, release] = writer.control.states;
      assert.ok(intro && open && release);
      writer.control.states = [
        intro,
        { ...open, value: 0 },
        { ...open, at: { cue: "open", edge: "start", offsetSamples: 48000 } },
        release,
      ];
      operations.push({
        rig: writer.rig,
        property: "rig-control" as const,
        value: writer.control,
      });
    }
  }
  const patch = {
    schemaVersion: "mechanism-cue-patch-1",
    baseRevision: document.revision,
    baseHash: initial.projectHash,
    operations,
  };
  const revised = await patchMechanismCueAuthoring(
    instance,
    project.cuePath,
    patch,
  );
  assert.equal(revised.document.revision, document.revision + 1);
  assert.deepEqual(revised.document.narration, document.narration);
  assert.deepEqual(revised.document.source, document.source);
  assert.deepEqual(revised.document.controls, expectedControls);
  assert.deepEqual(
    revised.document.cues.map((cue) => [
      cue.startSample,
      cue.endSampleExclusive,
      cue.text,
      cue.sounds,
    ]),
    document.cues.map((cue) => [
      cue.startSample,
      cue.endSampleExclusive,
      cue.text,
      cue.sounds,
    ]),
  );
  const prepared = prepareMechanismSceneV2(instance.scene);
  const pegOpeningFrame =
    project.family === "clothespeg"
      ? Math.ceil(
          document.cues.find((cue) => cue.id === "open")!.startSample / 1600,
        )
      : 0;
  const pegReleaseFrame =
    project.family === "clothespeg"
      ? Math.ceil(
          document.cues.find((cue) => cue.id === "release")!.startSample / 1600,
        )
      : 0;
  let pegMotionFrames = 0;
  const visibility = revised.document.cues.map((cue) => {
    const start = Math.ceil(cue.startSample / 1600),
      end = Math.ceil(cue.endSampleExclusive / 1600);
    const counts: Record<string, number> = {};
    for (let frame = start; frame < end; frame++) {
      const pose = evaluateMechanismFrameV2(prepared, {
        frame,
        width: 640,
        height: 360,
        camera: cue.camera,
        rigControls: revised.compiled.timeline.timeline.rigControls,
      });
      if (project.family === "clothespeg") {
        for (const [side, sign] of [
          ["upper", -1],
          ["lower", 1],
        ] as const) {
          const rig = pose.rigs[side + ".return"]!;
          assert.equal(rig.type, "spring-return");
          if (rig.type !== "spring-return") throw Error("Missing return state");
          if (frame < pegReleaseFrame) {
            const expected =
              sign *
              0.16 *
              Math.min(1, Math.max(0, (frame - pegOpeningFrame) / 30));
            assert.ok(
              Math.abs(rig.value - expected) < 1e-12,
              "Opening escaped its one-second spoken window",
            );
            assert.equal(rig.phase, "held");
          }
        }
        pegMotionFrames++;
      }
      const actual = nativeAnchorVisibilities(
        instance.scene.geometry,
        pose,
        Object.fromEntries(
          Object.values(pose.shapeStates).map((shape) => [
            shape.mesh,
            shape.positions,
          ]),
        ),
      )[cue.annotations[0]!.anchor]!;
      counts[actual.visibility] = (counts[actual.visibility] ?? 0) + 1;
      if (project.family === "clothespeg" && cue.id === "fabric")
        assert.equal(actual.visibility, "occluded");
      else if (
        project.family === "clothespeg" &&
        cue.id === "open" &&
        frame < start + 30
      ) {
        assert.ok(
          actual.visibility === "visible" || actual.visibility === "occluded",
        );
        if (frame === start) assert.equal(actual.visibility, "occluded");
      } else
        assert.equal(
          actual.visibility,
          "visible",
          `${project.id}/${cue.id} label at frame ${frame}: ${actual.occluderMesh}`,
        );
    }
    return {
      cue: cue.id,
      anchor: cue.annotations[0]!.anchor,
      frames: [start, end],
      counts,
      evidence:
        "pure expected physical visibility, not native observation or encoded glyph proof",
    };
  });
  const saved = await compileMechanismCueProject(
    project.familyPath,
    project.cuePath,
    join(
      dirname(project.cuePath),
      `compiled-presentation-r${revised.document.revision}`,
    ),
  );
  return {
    document: revised.document,
    compiled: saved,
    record: {
      version: "ms2-supplied-speech-presentation-1",
      patch,
      pegMotionFrames,
      pegMotionExpectation:
        project.family === "clothespeg"
          ? {
              closedThroughFrameExclusive: pegOpeningFrame,
              openingFrames: [pegOpeningFrame, pegOpeningFrame + 30],
              releasedAtFrame: pegReleaseFrame,
              amplitudeRadians: 0.16,
              evidence:
                "independent linear angle expectation on every authored output frame; not natural-speed playback",
            }
          : null,
      recipes,
      visibility,
      exactDelta:
        "named stationary camera cuts/holds and existing physical annotation anchors; source geometry, captions, supplied words, sounds and sample windows preserved; peg held controls now remain closed through intro and open linearly during the first second of its opening cue, with unchanged release and stop",
      retainedCompromise:
        project.family === "clothespeg"
          ? "Fabric contact remains occluded under hide-occluded; its caption and visible cloth remain required. Held poses interpolate linearly; opening is moved from intro into its spoken cue. Illustrative spring return does not establish natural continuous motion or a force simulation."
          : null,
    },
  };
}
