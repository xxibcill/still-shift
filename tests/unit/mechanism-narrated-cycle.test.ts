import { prepareMechanismSceneV2 } from "../../packages/renderer-core/src/mechanism/prepare-v2.ts";
import { evaluateMechanismFrameV2 } from "../../packages/renderer-core/src/mechanism/evaluate-v2.ts";
import {
  evaluateTeachingShape,
  teachingShapeInputsForPartsV2,
} from "../../packages/renderer-core/src/mechanism/teaching-shapes.ts";
import { describe, expect, it } from "vitest";
import { compileMechanismNarratedCycle } from "../../packages/animation-engine/src/mechanism/narrated-cycle.ts";
import { MechanismPackInvariantError } from "../../packages/animation-engine/src/mechanism/pack-invariant.ts";
import { narratedCycleFixture } from "../helpers/mechanism-narrated-cycle.ts";
import { CompositionPcmClock } from "@still-shift/scene-contract";
function failure(run: () => unknown) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(MechanismPackInvariantError);
    return (error as MechanismPackInvariantError).location;
  }
  throw Error("Expected located compiler rejection");
}
describe("supplied narration cue compiler", () => {
  it("compiles all five tracks for three distinct family consumers with unchanged source clock", () => {
    for (const family of ["tape-hook", "cable-tie", "clothespeg"] as const) {
      const { instance, document } = narratedCycleFixture(family),
        result = compileMechanismNarratedCycle(instance, document);
      expect(result.composition.frameCount).toBe(120);
      expect(
        result.composition.layers.filter((layer) => layer.type === "native3d"),
      ).toHaveLength(1);
      expect(
        result.composition.layers.filter((layer) => layer.type === "text"),
      ).toHaveLength(8);
      expect(
        result.composition.layers.filter((layer) => layer.type === "shape"),
      ).toHaveLength(12);
      expect(
        result.composition.layers.filter((layer) => layer.type === "audio"),
      ).toHaveLength(4);
      expect(
        result.composition.layers.find(
          (layer) => layer.type === "audio" && layer.role === "narration",
        ),
      ).toMatchObject({
        inPoint: 0,
        outPoint: 120,
        sourceStartSample: 0,
        sourceEndSample: 192000,
      });
      expect(
        result.timeline.timeline.events.map((event) => event.frame),
      ).toEqual([0, 30, 60, 90]);
      expect(Object.isFrozen(result.composition)).toBe(true);
      expect(
        result.composition.layers.every(
          (layer) => !("timeStretch" in layer) && !("timeRemap" in layer),
        ),
      ).toBe(true);
    }
  });
  it("pins the tape artwork texture font and rejects unresolved alternate font bindings", () => {
    const { instance, document } = narratedCycleFixture();
    const result = compileMechanismNarratedCycle(instance, document);
    expect(
      result.composition.assets.find((asset) => asset.type === "native3d"),
    ).toMatchObject({ textureFont: document.font.id });
    expect(
      failure(() =>
        compileMechanismNarratedCycle(instance, {
          ...document,
          source: { ...document.source, textureFont: "missing" },
        }),
      ),
    ).toMatchObject({
      code: "mechanism-cue-font",
      path: ["source", "textureFont"],
    });
  });
  it("recompiles a valid shorter take across motion, cameras, annotations, captions and sound", () => {
    const long = narratedCycleFixture(),
      shorter = narratedCycleFixture("tape-hook", 144000);
    const before = compileMechanismNarratedCycle(long.instance, long.document),
      after = compileMechanismNarratedCycle(shorter.instance, shorter.document);
    expect(before.composition.frameCount).toBe(120);
    expect(after.composition.frameCount).toBe(90);
    const world = after.composition.layers.find(
      (layer) => layer.type === "native3d",
    )!;
    if (world.type !== "native3d") throw Error("Expected native world");
    expect(world.cameraKeys!.map((key) => key.frame)).toEqual([0, 23, 45, 68]);
    expect(world.rigControls!.slider).toMatchObject({
      keys: [{ frame: 0 }, { frame: 45 }, { frame: 68 }],
    });
    expect(
      after.composition.layers.find(
        (layer) => layer.type === "text" && layer.text === "Touch",
      )!.inPoint,
    ).toBe(23);
    expect(
      after.composition.layers.find(
        (layer) =>
          layer.type === "text" &&
          layer.metadata?.cue === "contact" &&
          layer.text === "Part",
      )!.inPoint,
    ).toBe(23);
    expect(
      after.composition.layers.find(
        (layer) =>
          layer.type === "audio" &&
          layer.role === "sfx" &&
          layer.metadata?.cue === "contact",
      )!.startFrame,
    ).toBe(23);
    expect(after.recording.sourceSamples).toBe(144000);
    expect(after.cueMap[1]!.onsetDelaySamples).toBe(800);
  });
  it("rejects overfull shots and captions or annotations without reading time", () => {
    const { instance, document } = narratedCycleFixture();
    const action = structuredClone(document);
    action.cues[1]!.minimumActionSamples = 48001;
    expect(
      failure(() => compileMechanismNarratedCycle(instance, action)),
    ).toMatchObject({
      code: "mechanism-cue-action",
      path: ["cues", 1, "minimumActionSamples"],
    });
    const reading = structuredClone(document);
    reading.cues[2]!.text =
      "This sentence cannot fit into this short cue interval.";
    expect(
      failure(() => compileMechanismNarratedCycle(instance, reading)),
    ).toMatchObject({
      code: "mechanism-cue-reading",
      path: ["cues", 2, "text"],
    });
    const label = structuredClone(document);
    label.cues[3]!.annotations[0]!.text =
      "An annotation with more text than its reading interval allows.";
    expect(
      failure(() => compileMechanismNarratedCycle(instance, label)),
    ).toMatchObject({
      code: "mechanism-cue-reading",
      path: ["cues", 3, "annotations", 0, "text"],
    });
  });
  it("rejects action holds shortened below their minimum by frame quantization", () => {
    const { instance, document } = narratedCycleFixture("tape-hook", 144000);
    document.cues[1]!.minimumActionSamples = 36000;
    expect(
      failure(() => compileMechanismNarratedCycle(instance, document)),
    ).toMatchObject({
      code: "mechanism-cue-action",
      frame: 23,
      path: ["cues", 1, "minimumActionSamples"],
    });
  });
  it("keeps authored camera cuts/transitions and rejects hidden pose or clip-plane changes", () => {
    const { instance, document } = narratedCycleFixture();
    document.cues[1]!.camera = {
      ...instance.scene.camera,
      position: [2, 4, 12],
    };
    document.cues[1]!.editing = "cut";
    document.cues[2]!.camera = {
      ...instance.scene.camera,
      position: [3, 4, 12],
    };
    document.cues[2]!.editing = "transition";
    const result = compileMechanismNarratedCycle(instance, document);
    const world = result.composition.layers.find(
      (layer) => layer.type === "native3d",
    )!;
    if (world.type !== "native3d") throw Error("Expected native world");
    expect(world.cameraKeys![1]).toMatchObject({
      frame: 30,
      position: [2, 4, 12],
      easing: "smoothstep",
    });
    const held = structuredClone(document);
    held.cues[1]!.editing = "hold";
    expect(
      failure(() => compileMechanismNarratedCycle(instance, held)).code,
    ).toBe("mechanism-cue-camera");
    const planes = structuredClone(document);
    planes.cues[1]!.camera!.far++;
    expect(
      failure(() => compileMechanismNarratedCycle(instance, planes)).code,
    ).toBe("mechanism-cue-camera");
  });
  it("rejects cue and motion references outside the recording, overlaps and duplicate writers", () => {
    const { instance, document } = narratedCycleFixture();
    const bounds = structuredClone(document);
    bounds.cues[3]!.endSampleExclusive++;
    expect(
      failure(() => compileMechanismNarratedCycle(instance, bounds)).code,
    ).toBe("mechanism-cue-recording");
    const overlap = structuredClone(document);
    overlap.cues[1]!.startSample--;
    expect(
      failure(() => compileMechanismNarratedCycle(instance, overlap)).code,
    ).toBe("mechanism-cue-order");
    const unknown = structuredClone(document);
    unknown.controls[0]!.control = {
      type: "slider",
      keys: [
        {
          at: { cue: "missing", edge: "start", offsetSamples: 0 },
          value: 0,
          easing: "linear",
        },
      ],
    };
    expect(
      failure(() => compileMechanismNarratedCycle(instance, unknown)).code,
    ).toBe("mechanism-cue-reference");
    const writers = structuredClone(document);
    writers.controls.push(writers.controls[0]!);
    expect(
      failure(() => compileMechanismNarratedCycle(instance, writers)).code,
    ).toBe("mechanism-cue-writer");
  });
  it("rejects incompatible source versions and illegal event order", () => {
    const { instance, document } = narratedCycleFixture();
    expect(
      failure(() =>
        compileMechanismNarratedCycle(instance, {
          ...document,
          source: { ...document.source, format: "mechanism-scene-1" },
        }),
      ).code,
    ).toBe("mechanism-cue-contract");
    const illegal = structuredClone(document);
    illegal.cues[1]!.kind = "release";
    expect(
      failure(() => compileMechanismNarratedCycle(instance, illegal)),
    ).toMatchObject({
      code: "mechanism-timeline-transition",
      frame: 30,
      rig: "slider",
      relationship: "hook.innerRange",
    });
  });
  it("keeps awkward frame rates sample-bounded and exposes deterministic quantization", () => {
    const { instance, document } = narratedCycleFixture("tape-hook", 144001);
    for (const fps of [7, 29, 59]) {
      const result = compileMechanismNarratedCycle(instance, {
        ...document,
        output: { ...document.output, fps },
      });
      expect(result.recording.frameCount).toBe(
        Math.ceil((144001 * fps) / 48000),
      );
      expect(result.recording.renderBoundarySamples - 144001).toBeLessThan(
        Math.ceil(48000 / fps),
      );
      for (const cue of result.cueMap)
        expect(
          new CompositionPcmClock().place(cue.startFrame, fps).sample -
            cue.startSample,
        ).toBe(cue.onsetDelaySamples);
      expect(
        result.composition.layers.find(
          (layer) => layer.type === "audio" && layer.role === "narration",
        ),
      ).toMatchObject({ sourceEndSample: 144001 });
    }
  });
  it("rejects sound tails and conflicting metadata instead of silently trimming or replacing sources", () => {
    const { instance, document } = narratedCycleFixture();
    const tail = structuredClone(document);
    tail.cues[3]!.sounds[0]!.asset.sampleCount = 48001;
    expect(
      failure(() => compileMechanismNarratedCycle(instance, tail)).code,
    ).toBe("mechanism-cue-sound");
    const conflict = structuredClone(document);
    conflict.cues[2]!.sounds[0]!.asset.sha256 = "sha256:" + "e".repeat(64);
    expect(
      failure(() => compileMechanismNarratedCycle(instance, conflict)).code,
    ).toBe("mechanism-cue-asset");
  });
  it("keeps long authored IDs bounded and distinguishes ambiguous concatenations", () => {
    const { instance, document } = narratedCycleFixture();
    document.cues[0]!.annotations = [
      { ...document.cues[0]!.annotations[0]!, id: "part" + "x".repeat(120) },
      { ...document.cues[0]!.annotations[0]!, id: "a-b", position: [190, 18] },
    ];
    const result = compileMechanismNarratedCycle(instance, document);
    expect(
      result.composition.layers.every((layer) => layer.id.length <= 128),
    ).toBe(true);
    expect(
      new Set(result.composition.layers.map((layer) => layer.id)).size,
    ).toBe(result.composition.layers.length);
    const repeat = compileMechanismNarratedCycle(instance, document);
    expect(repeat.composition).toEqual(result.composition);
  });
  it("keeps spring driver identity portable at GPU precision without changing sampled streams", () => {
    const { instance, document } = narratedCycleFixture("clothespeg", 144000);
    const compiled = compileMechanismNarratedCycle(instance, document);
    const prepared = prepareMechanismSceneV2(instance.scene);
    const frame = evaluateMechanismFrameV2(prepared, {
      frame: 22,
      width: 240,
      height: 136,
      rigControls: compiled.timeline.timeline.rigControls,
    });
    const definition = instance.scene.teachingShapes[0]!;
    const inputs = teachingShapeInputsForPartsV2(
      definition,
      instance.scene,
      frame.parts,
      frame.rigs,
    );
    if (inputs.generator !== "seated-torsion-spring-1")
      throw Error("Expected spring inputs");
    const variant = structuredClone(inputs);
    variant.seats[0][0] -= Number.EPSILON;
    const a = evaluateTeachingShape(
      prepared.teachingShapes[definition.id]!,
      inputs,
    );
    const b = evaluateTeachingShape(
      prepared.teachingShapes[definition.id]!,
      variant,
    );
    expect(a.stateKey.startsWith("spring-f32:")).toBe(true);
    expect(b.stateKey).toBe(a.stateKey);
    expect(Array.from(new Float32Array(b.positions))).toEqual(
      Array.from(new Float32Array(a.positions)),
    );
    expect(Array.from(new Float32Array(b.normals))).toEqual(
      Array.from(new Float32Array(a.normals)),
    );
    variant.seats[0][0] -= 0.001;
    const changed = evaluateTeachingShape(
      prepared.teachingShapes[definition.id]!,
      variant,
    );
    expect(changed.stateKey).not.toBe(a.stateKey);
    expect(Array.from(new Float32Array(changed.positions))).not.toEqual(
      Array.from(new Float32Array(a.positions)),
    );
  });
  it("accepts Thai grapheme timing and preserves caption/annotation text", () => {
    const { instance, document } = narratedCycleFixture();
    const thai = {
      ...document,
      locale: "th",
      cues: document.cues.map((cue) => ({
        ...cue,
        text: "จับ",
        annotations: cue.annotations.map((label) => ({ ...label, text: "ขอ" })),
      })),
    };
    const result = compileMechanismNarratedCycle(instance, thai);
    expect(
      result.composition.layers.find(
        (layer) =>
          layer.type === "text" &&
          layer.metadata?.track === "caption" &&
          layer.metadata?.cue === "intro",
      ),
    ).toMatchObject({ text: "จับ", textBox: { locale: "th" } });
  });
});
