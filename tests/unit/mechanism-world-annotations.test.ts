import { describe, expect, it } from "vitest";
import { MechanismNarratedCycleSchema } from "@still-shift/scene-contract";
import { compileMechanismNarratedCycle } from "../../packages/animation-engine/src/mechanism/narrated-cycle.ts";
import {
  inspectMechanismCueAuthoring,
  applyMechanismCuePatch,
} from "../../packages/animation-engine/src/mechanism/cue-authoring.ts";
import { prepareNative3DSceneV2 } from "../../packages/renderer-core/src/native3d/prepare-v2.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import { narratedCycleFixture } from "../helpers/mechanism-narrated-cycle.ts";
const worldText = (part: string) => ({
  id: "mark",
  kind: "world-text",
  text: "Pin",
  part,
  transform: { position: [0, 0, 3], rotation: [0, 0.3, 0] },
  pixelsPerUnit: 128,
  sizePixels: [64, 32],
  fontSizePixels: 16,
  ink: "#d04020",
});
function input(family: "tape-hook" | "cable-tie" | "clothespeg" = "tape-hook") {
  const f = narratedCycleFixture(family);
  return {
    ...f,
    document: {
      ...f.document,
      cues: f.document.cues.map((cue, index) => ({
        ...cue,
        ...(index
          ? {}
          : { worldAnnotations: [worldText(f.instance.scene.parts[0]!.id)] }),
      })),
    },
  };
}
describe("cue world text authoring", () => {
  it("compiles an explicit part-local mask text plane for three families without changing supplied audio or native rig tracks", () => {
    for (const family of ["tape-hook", "cable-tie", "clothespeg"] as const) {
      const f = input(family),
        legacy = narratedCycleFixture(family);
      const result = compileMechanismNarratedCycle(f.instance, f.document),
        before = compileMechanismNarratedCycle(
          legacy.instance,
          legacy.document,
        );
      expect(result.recording).toEqual(before.recording);
      expect(result.timeline).toEqual(before.timeline);
      expect(result.labelLayout).toEqual(before.labelLayout);
      const layer = result.composition.layers.find(
        (layer) => layer.metadata?.track === "world-annotation",
      );
      expect(layer).toMatchObject({
        type: "text",
        text: "Pin",
        fontAsset: f.document.font.id,
        color: "#d04020",
        fontSize: 16,
        size: [64, 32],
        native3D: {
          role: "world-graphic",
          part: f.instance.scene.parts[0]!.id,
          alphaMode: "mask",
          pixelsPerUnit: 128,
          originPixels: [32, 16],
          transform: { position: [0, 0, 3], rotation: [0, 0.3, 0] },
        },
      });
      expect(layer?.overlayAfter).toBeUndefined();
      expect(Object.isFrozen(result.composition)).toBe(true);
    }
  });
  it("preserves exact legacy output when world annotations are omitted or empty", () => {
    const f = narratedCycleFixture();
    const empty = {
      ...f.document,
      cues: f.document.cues.map((cue) => ({ ...cue, worldAnnotations: [] })),
    };
    expect(
      compileMechanismNarratedCycle(f.instance, empty).composition,
    ).toEqual(
      compileMechanismNarratedCycle(f.instance, f.document).composition,
    );
  });
  it("bounds authored plane/text resources and rejects unknown routes or silently discarded fields", () => {
    const f = input();
    for (const change of [
      { kind: "surface-marking" },
      { sizePixels: [1025, 32] },
      { pixelsPerUnit: 0 },
      { fontSizePixels: 257 },
      { ink: "red" },
      { ignored: true },
    ]) {
      const document = structuredClone(f.document);
      Object.assign(document.cues[0]!.worldAnnotations![0]!, change);
      expect(MechanismNarratedCycleSchema.safeParse(document).success).toBe(
        false,
      );
    }
  });
  it("returns a cue-located missing physical part before rendering", () => {
    const f = input();
    const annotation = f.document.cues[0]!.worldAnnotations![0]!;
    if (!("part" in annotation)) throw Error("Expected world text part");
    annotation.part = "missing";
    try {
      compileMechanismNarratedCycle(f.instance, f.document);
      throw Error("Expected a located part rejection");
    } catch (error) {
      expect((error as { location: unknown }).location).toMatchObject({
        code: "mechanism-cue-part",
        path: ["cues", 0, "worldAnnotations", 0, "part"],
      });
    }
  });
  it("inherits hidden physical parts and ancestors while retaining the legacy unbound world route", async () => {
    const f = input(),
      compiled = compileMechanismNarratedCycle(f.instance, f.document);
    const prepared = await prepareNative3DSceneV2(
      f.instance.scene,
      f.document.source.sha256,
    );
    const root = f.instance.scene.parts[0]!.id;
    const child = f.instance.scene.parts.find(
      (part) => part.parent === root,
    )!.id;
    for (const [target, hidden] of [
      [root, root],
      [child, root],
      [child, child],
    ]) {
      const composition = structuredClone(compiled.composition);
      const controller = composition.layers.find(
        (layer) => layer.type === "native3d",
      )!;
      if (controller.type !== "native3d")
        throw Error("Missing native controller");
      controller.hiddenParts = [hidden!];
      const annotation = composition.layers.find(
        (layer) => layer.metadata?.track === "world-annotation",
      )!;
      if (annotation.native3D?.role !== "world-graphic")
        throw Error("Missing world binding");
      annotation.native3D.part = target!;
      const options = {
        preparedNative3D: { [f.document.source.id]: prepared },
      };
      expect(
        evaluateComp(composition, 0, options).layers.find(
          (state) => state.id === annotation.id,
        )!.visible,
      ).toBe(false);
      delete annotation.native3D.part;
      expect(
        evaluateComp(composition, 0, options).layers.find(
          (state) => state.id === annotation.id,
        )!.visible,
      ).toBe(true);
    }
  });
  it("rejects conflicting screen/world identities and insufficient reading time at their authored fields", () => {
    const f = input();
    for (const change of [{ id: "part" }, { text: "x".repeat(100) }]) {
      const document = structuredClone(f.document);
      Object.assign(document.cues[0]!.worldAnnotations![0]!, change);
      expect(() =>
        compileMechanismNarratedCycle(f.instance, document),
      ).toThrow();
    }
  });
  it("patches stable world annotation IDs with CAS and invalidates the native plate while preserving the recording", () => {
    const f = input(),
      current = inspectMechanismCueAuthoring(f.instance, f.document);
    const patch = {
      schemaVersion: "mechanism-cue-patch-1",
      baseRevision: current.document.revision,
      baseHash: current.projectHash,
      operations: [
        {
          cue: "intro",
          annotation: "mark",
          property: "world-annotation",
          value: { ...worldText(f.instance.scene.parts[0]!.id), text: "Tip" },
        },
      ],
    };
    delete (patch.operations[0]!.value as Partial<ReturnType<typeof worldText>>)
      .id;
    const result = applyMechanismCuePatch(f.instance, f.document, patch);
    expect(result.cacheEffects.nativePlates).toBe(
      "invalidate-whole-native-clip",
    );
    expect(result.compiled.recording).toEqual(current.compiled.recording);
    expect(result.affectedShots).toEqual(["intro"]);
    expect(f.document.cues[0]!.worldAnnotations![0]!.text).toBe("Pin");
    expect(() =>
      applyMechanismCuePatch(f.instance, result.document, patch),
    ).toThrow("revision/hash");
    expect(() =>
      applyMechanismCuePatch(f.instance, f.document, {
        ...patch,
        operations: [patch.operations[0], patch.operations[0]],
      }),
    ).toThrow("Duplicate scoped property writer");
    expect(() =>
      applyMechanismCuePatch(f.instance, f.document, {
        ...patch,
        operations: [{ ...patch.operations[0], annotation: "missing" }],
      }),
    ).toThrow("Unknown stable world annotation target");
  });
});
