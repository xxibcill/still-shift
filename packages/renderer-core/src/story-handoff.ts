import type { Handoff } from "../../scene-contract/src/story-authoring.ts";
import type { StoryScene } from "../../scene-contract/src/story.ts";
import { compileStoryScene } from "./story-scene.ts";
import { evaluatePreparedNode } from "./prepared-scene.ts";
import {
  sampleStoryCamera,
  storyCameraBoundaryVelocity,
  storyCameraTransform,
} from "./story-camera.ts";
import { passageError } from "./passage-diagnostics.ts";

export function applyStoryHandoff(
  scene: StoryScene,
  previous: StoryScene | undefined,
  handoff: Handoff,
) {
  if (
    handoff.mode !== "continue" &&
    (handoff.camera === "carry" ||
      handoff.subjects.some((s) => s.mode === "carry"))
  )
    passageError("invalid-handoff", "Carry state requires a continue handoff");
  if (
    !previous &&
    (handoff.mode === "continue" || handoff.subjects.some((s) => s.from))
  )
    passageError("missing-previous-beat", "Handoff requires a preceding beat");
  const before = previous ? compileStoryScene(previous) : undefined;
  const after = compileStoryScene(scene);
  const targets = new Set<string>();
  for (const mapping of handoff.subjects) {
    const source = previous?.nodes.find((n) => n.id === mapping.from);
    const target = scene.nodes.find((n) => n.id === mapping.to);
    if (mapping.from && !source)
      passageError(
        "missing-handoff-subject",
        "Missing outgoing subject for " + mapping.id,
        { node: mapping.from },
      );
    if (mapping.to && !target)
      passageError(
        "missing-handoff-subject",
        "Missing incoming subject for " + mapping.id,
        { node: mapping.to },
      );
    if (mapping.mode === "carry" || mapping.mode === "exit") {
      if (!source || !before)
        passageError(
          "missing-handoff-subject",
          "Missing outgoing subject for " + mapping.id,
          { node: mapping.from ?? mapping.id },
        );
    }
    if (mapping.mode !== "exit") {
      if (!target)
        passageError(
          "missing-handoff-subject",
          "Missing incoming subject for " + mapping.id,
          { node: mapping.to ?? mapping.id },
        );
      if (targets.has(target.id))
        passageError(
          "duplicate-handoff-target",
          "Multiple identities target " + target.id,
          { node: target.id },
        );
      targets.add(target.id);
    }
    if (mapping.mode === "carry") {
      if (
        source!.parent ||
        target!.parent ||
        source!.type !== target!.type ||
        source!.width !== target!.width ||
        source!.height !== target!.height ||
        source!.origin.join() !== target!.origin.join()
      )
        passageError(
          "incompatible-handoff",
          "Carry requires matching root-node geometry; use a reset for a different coordinate space",
          { node: target!.id },
        );
      const state = evaluatePreparedNode(
        before!,
        source!,
        previous!.frameCount - 1,
      );
      scene.initialState ??= {};
      scene.initialState[target!.id] = {
        ...scene.initialState[target!.id],
        ...Object.fromEntries(mapping.properties.map((p) => [p, state[p]])),
      };
    }
    if (
      mapping.mode === "enter" &&
      evaluatePreparedNode(after, target!, 0).opacity !== 0
    )
      passageError(
        "invalid-entry",
        "An entering subject must begin invisible",
        { node: target!.id, frame: 0 },
      );
    if (
      mapping.mode === "exit" &&
      evaluatePreparedNode(before!, source!, previous!.frameCount - 1)
        .opacity !== 0
    )
      passageError("invalid-exit", "An exiting subject must finish invisible", {
        node: source!.id,
        frame: previous!.frameCount - 1,
      });
  }
  if (handoff.camera === "carry") {
    if (!previous?.camera || !scene.camera || scene.motionGrammar !== "v2")
      passageError(
        "missing-handoff-camera",
        "Camera carry requires authored v2 cameras in both beats",
      );
    scene.camera = structuredClone(scene.camera);
    const end = sampleStoryCamera(previous, previous.frameCount - 1);
    const first = scene.camera.keys[0]!;
    if (first.frame !== 0)
      passageError(
        "invalid-handoff-camera",
        "Incoming camera must start at frame zero",
      );
    Object.assign(first, end);
    const tangent = storyCameraBoundaryVelocity(previous, "end");
    scene.camera.startTangent = tangent;
    scene.camera.easeIn = false;
    const actual = storyCameraBoundaryVelocity(scene, "start");
    if (
      (["x", "y", "zoom"] as const).some(
        (axis) => Math.abs(actual[axis] - tangent[axis]) > 1e-6,
      )
    )
      passageError(
        "incompatible-camera-velocity",
        "Incoming camera keys cannot preserve the outgoing velocity; adjust the keys or use a camera reset",
      );
  }
  for (const mapping of handoff.subjects.filter((s) => s.mode === "carry")) {
    const outgoing = storyCameraTransform(
      previous!,
      mapping.from!,
      previous!.frameCount - 1,
    );
    const incoming = storyCameraTransform(scene, mapping.to!, 0);
    if (
      (["x", "y", "scale"] as const).some(
        (axis) => Math.abs(outgoing[axis] - incoming[axis]) > 1e-6,
      )
    )
      passageError(
        "incompatible-screen-handoff",
        "Carried subjects require matching camera projection; carry the camera or reset the subject",
        { node: mapping.to! },
      );
  }
}
