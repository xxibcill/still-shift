import assert from "node:assert/strict";
import { MechanismNarratedCycleSchema } from "@still-shift/scene-contract";
import {
  readMechanismCueAuthoring,
  saveMechanismCueAuthoring,
} from "@still-shift/animation-engine";
import { compileMechanismNarratedCycle } from "../../packages/animation-engine/src/mechanism/narrated-cycle.ts";
import { prepareNative3DSceneV2 } from "../../packages/renderer-core/src/native3d/prepare-v2.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import { createCueProjectFixture } from "./mechanism-cue-project.ts";
/** Each screen style has actual visible physical anchors on its authored integer frames. */
export async function createVisibleCueProject(
  directory: string,
  family: "tape-hook" | "cable-tie" | "clothespeg",
) {
  const fixture = await createCueProjectFixture(directory, family);
  const original = await readMechanismCueAuthoring(
    fixture.instance,
    fixture.cuePath,
  );
  const primary =
    family === "tape-hook"
      ? "hook.outerFace"
      : family === "cable-tie"
        ? "strap.outerSurface"
        : "lower.seat";
  const framed =
    family === "cable-tie"
      ? {
          ...fixture.document,
          cues: fixture.document.cues.map((cue, index) => ({
            ...cue,
            camera: {
              ...fixture.instance.scene.camera,
              position: [8, 5, 2] as [number, number, number],
            },
            editing: index === 0 ? ("cut" as const) : ("hold" as const),
          })),
        }
      : fixture.document;
  const initial = compileMechanismNarratedCycle(
    fixture.instance,
    framed,
  ).composition;
  const asset = initial.assets.find((a) => a.type === "native3d")!;
  const native = await prepareNative3DSceneV2(
    fixture.instance.scene,
    asset.sha256,
  );
  const possible = new Set(
    fixture.instance.scene.anchors
      .map((a) => a.id)
      .filter((id) => id !== primary),
  );
  for (let frame = 15; frame < 30; frame++) {
    const physical = evaluateComp(initial, frame, {
      preparedNative3D: { [asset.id]: native },
    }).layers.find((l) => l.layer.type === "native3d")!;
    for (const id of possible)
      if (physical.nativeFrame!.anchors[id]!.visibility !== "visible")
        possible.delete(id);
  }
  const secondary = [...possible].sort()[0];
  assert(
    secondary,
    "Bracket needs two distinct anchors visible throughout its actual integer grid",
  );
  const styles = [
    { kind: "tab" as const },
    { kind: "open-callout" as const },
    {
      kind: "bracket" as const,
      toAnchor: secondary,
      offsetPixels: [0, 16] as [number, number],
      tickPixels: 6,
    },
    { kind: "arrow" as const },
    { kind: "highlight" as const, sizePixels: [28, 20] as [number, number] },
  ];
  const document = MechanismNarratedCycleSchema.parse({
    ...framed,
    revision: original.document.revision + 1,
    cues: framed.cues.map((cue, index) => ({
      ...cue,
      annotations: [
        styles[[0, 2, 3, 4][index]!]!,
        ...(index === 0 ? [styles[1]!] : []),
      ].map((style) => ({
        ...cue.annotations[0]!,
        id: style.kind,
        text: "Pin",
        anchor: primary,
        position: style.kind === "open-callout" ? [140, 18] : [18, 18],
        layout: { locked: true },
        style,
        visibility: { policy: "hide-occluded" },
      })),
    })),
  });
  await saveMechanismCueAuthoring(fixture.instance, document, fixture.cuePath, {
    revision: original.document.revision,
    hash: original.projectHash,
  });
  return { ...fixture, document };
}
