import { describe, expect, it } from "vitest";
import { CompositionSchema } from "@still-shift/scene-contract";
import { narratedCycleFixture } from "../helpers/mechanism-narrated-cycle.ts";
import { compileMechanismNarratedCycle } from "../../packages/animation-engine/src/mechanism/narrated-cycle.ts";
import {
  applyMechanismCuePatch,
  inspectMechanismCueAuthoring,
} from "../../packages/animation-engine/src/mechanism/cue-authoring.ts";
import { partitionMechanismCueNativePicture } from "../../packages/animation-engine/src/mechanism/cue-native-picture.ts";

const families = ["tape-hook", "cable-tie", "clothespeg"] as const;
describe("cue native picture partition", () => {
  it.each(families)(
    "preserves native motion/graphics while excluding screen and audio changes: %s",
    (family) => {
      const { instance, document } = narratedCycleFixture(family, 96000);
      const current = inspectMechanismCueAuthoring(instance, document);
      const original = JSON.stringify(current.compiled.composition);
      const changed = applyMechanismCuePatch(instance, document, {
        schemaVersion: "mechanism-cue-patch-1",
        baseRevision: current.document.revision,
        baseHash: current.projectHash,
        operations: [
          { cue: "contact", property: "caption", value: "Here" },
          {
            cue: "contact",
            annotation: "part",
            property: "annotation",
            value: {
              text: "Tip",
              anchor: document.cues[1]!.annotations[0]!.anchor,
              position: [24, 24],
            },
          },
          { cue: "contact", sound: "tick", property: "sound-gain", value: -6 },
        ],
      });
      const a = partitionMechanismCueNativePicture(
        current.compiled.composition,
      );
      const b = partitionMechanismCueNativePicture(
        changed.compiled.composition,
      );
      expect(a).toEqual(b);
      expect(a.layers.map((layer) => layer.type)).toEqual(["native3d"]);
      expect(a.assets.map((asset) => asset.type).sort()).toEqual(
        family === "tape-hook" ? ["font", "native3d"] : ["native3d"],
      );
      expect(a.frameCount).toBe(60);
      expect(CompositionSchema.parse(a)).toEqual(a);
      expect(JSON.stringify(current.compiled.composition)).toBe(original);
    },
  );
  it("retains the physical graduation font and rejects a missing body dependency", () => {
    const { instance, document } = narratedCycleFixture("tape-hook", 96000);
    const original = compileMechanismNarratedCycle(
      instance,
      document,
    ).composition;
    const a = partitionMechanismCueNativePicture(original);
    const font = a.assets.find((asset) => asset.type === "font")!;
    const edited = structuredClone(original);
    edited.assets.find((asset) => asset.id === font.id)!.sha256 =
      "sha256:" + "e".repeat(64);
    expect(partitionMechanismCueNativePicture(edited)).not.toEqual(a);
    edited.assets = edited.assets.filter((asset) => asset.id !== font.id);
    expect(() => partitionMechanismCueNativePicture(edited)).toThrow(/asset/);
  });
  it("retains pinned world text/fonts and makes world edits change the native picture", () => {
    const { instance, document } = narratedCycleFixture("tape-hook", 96000);
    document.cues[0]!.worldAnnotations = [
      {
        id: "mark",
        kind: "world-text",
        text: "Pin",
        part: "hook",
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          pivot: [0, 0, 0],
        },
        sizePixels: [64, 32],
        fontSizePixels: 12,
        pixelsPerUnit: 256,
        ink: "#ff0000",
        side: "front",
      },
    ];
    const a = partitionMechanismCueNativePicture(
      compileMechanismNarratedCycle(instance, document).composition,
    );
    document.cues[0]!.worldAnnotations![0]!.text = "Tip";
    const b = partitionMechanismCueNativePicture(
      compileMechanismNarratedCycle(instance, document).composition,
    );
    expect(a).not.toEqual(b);
    expect(a.layers.filter((layer) => layer.type === "text")).toHaveLength(1);
    expect(a.assets.map((asset) => asset.type).sort()).toEqual([
      "font",
      "native3d",
    ]);
    expect(a.textStyles).toEqual({ font: { fontAsset: "font" } });
  });
  it("makes physical camera, output dimensions and native asset identities change the partition", () => {
    const { instance, document } = narratedCycleFixture("tape-hook", 96000);
    const original = compileMechanismNarratedCycle(
      instance,
      document,
    ).composition;
    const a = partitionMechanismCueNativePicture(original);
    for (const mutate of [
      (comp: typeof original) => {
        comp.width += 16;
      },
      (comp: typeof original) => {
        comp.background = "#ffffff";
      },
      (comp: typeof original) => {
        comp.assets.find((asset) => asset.type === "native3d")!.sha256 =
          "sha256:" + "0".repeat(64);
      },
    ]) {
      const comp = structuredClone(original);
      mutate(comp);
      expect(partitionMechanismCueNativePicture(comp)).not.toEqual(a);
    }
    document.cues[1]!.camera = {
      ...instance.scene.camera,
      position: [8, 8, 8],
    };
    document.cues[1]!.editing = "cut";
    expect(
      partitionMechanismCueNativePicture(
        compileMechanismNarratedCycle(instance, document).composition,
      ),
    ).not.toEqual(a);
  });
  it("rejects arbitrary dependency-bearing roots, native parents and missing world fonts with located failures", () => {
    const { instance, document } = narratedCycleFixture("tape-hook", 96000);
    const original = compileMechanismNarratedCycle(
      instance,
      document,
    ).composition;
    const root = {
      ...original,
      camera2d: { keys: [{ frame: 0, x: 0, y: 0, zoom: 2 }] },
    };
    expect(() => partitionMechanismCueNativePicture(root)).toThrow(/camera2d/);
    const parent = structuredClone(original);
    parent.layers.find((layer) => layer.type === "native3d")!.parent =
      original.layers[0]!.id;
    expect(() => partitionMechanismCueNativePicture(parent)).toThrow(/parent/);
    const absent = structuredClone(original);
    absent.assets = [];
    expect(() => partitionMechanismCueNativePicture(absent)).toThrow(/asset/);
  });
});
