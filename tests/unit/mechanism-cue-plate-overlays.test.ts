import { describe, expect, it } from "vitest";
import {
  CompositionSchema,
  MechanismNarratedCycleSchema,
  COMPOSITION_LIMITS,
  type Composition,
  type BezierPath,
} from "@still-shift/scene-contract";
import { narratedCycleFixture } from "../helpers/mechanism-narrated-cycle.ts";
import { mechanismPackHash } from "../../packages/animation-engine/src/mechanism/pack-support.ts";
import { compileMechanismNarratedCycle } from "../../packages/animation-engine/src/mechanism/narrated-cycle.ts";
import { lowerMechanismCuePlateOverlays } from "../../packages/animation-engine/src/mechanism/cue-plate-overlays.ts";
import { prepareNative3DSceneV2 } from "../../packages/renderer-core/src/native3d/prepare-v2.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
type SequenceAsset = Extract<
  Composition["assets"][number],
  { type: "sequence" }
>;
function plates(comp: Composition): SequenceAsset {
  return {
    id: "retained-plates",
    type: "sequence",
    path: "/private/tmp/retained-native-%06d.png",
    manifestPath: "/private/tmp/retained-native.json",
    sha256: "sha256:" + "0".repeat(64),
    firstFrame: 0,
    width: comp.width,
    height: comp.height,
    frameCount: comp.frameCount,
    frameRate: { numerator: comp.fps, denominator: 1 },
    color: {
      primaries: "bt709",
      transfer: "bt709",
      matrix: "gbr",
      range: "pc",
    },
  };
}
// The path schema defines omitted tangents as zero; keyed path evaluation materializes them.
function canonicalPath(path: BezierPath) {
  return {
    ...path,
    firstVertex: path.firstVertex ?? 0,
    inTangents: path.inTangents ?? path.vertices.map(() => [0, 0]),
    outTangents: path.outTangents ?? path.vertices.map(() => [0, 0]),
  };
}
describe("cue cached-plate screen bindings", () => {
  it.each(["tape-hook", "cable-tie", "clothespeg"] as const)(
    "restores all integer-frame overlay matrices, effective visibility and paths without a native controller: %s",
    async (family) => {
      const { instance, document } = narratedCycleFixture(family, 96000);
      document.output = { width: 240, height: 136, fps: 30 };
      const primary =
        family === "tape-hook"
          ? "hook.outerFace"
          : family === "cable-tie"
            ? "strap.outerSurface"
            : "lower.seat";
      const framed =
        family === "cable-tie"
          ? {
              ...document,
              cues: document.cues.map((cue, index) => ({
                ...cue,
                camera: {
                  ...instance.scene.camera,
                  position: [8, 5, 2] as [number, number, number],
                },
                editing: index === 0 ? ("cut" as const) : ("hold" as const),
              })),
            }
          : document;
      const initial = compileMechanismNarratedCycle(
        instance,
        framed,
      ).composition;
      const initialAsset = initial.assets.find(
        (asset) => asset.type === "native3d",
      )!;
      const prepared = await prepareNative3DSceneV2(
        instance.scene,
        initialAsset.sha256,
      );
      const sources = { [initialAsset.id]: prepared };
      const possible = new Set(
        instance.scene.anchors
          .map((anchor) => anchor.id)
          .filter((id) => id !== primary),
      );
      for (let frame = 15; frame < 30; frame++) {
        const world = evaluateComp(initial, frame, {
          preparedNative3D: sources,
        }).layers.find((layer) => layer.layer.type === "native3d")!;
        for (const id of possible)
          if (world.nativeFrame!.anchors[id]!.visibility !== "visible")
            possible.delete(id);
      }
      const secondary = [...possible].sort()[0];
      expect(secondary).toBeDefined();
      const styles = [
        { kind: "tab" as const },
        { kind: "open-callout" as const },
        {
          kind: "bracket" as const,
          toAnchor: secondary!,
          offsetPixels: [0, 16] as [number, number],
          tickPixels: 6,
        },
        { kind: "arrow" as const },
        {
          kind: "highlight" as const,
          sizePixels: [28, 20] as [number, number],
        },
      ];
      const authored = MechanismNarratedCycleSchema.parse({
        ...framed,
        cues: framed.cues.map((cue, cueIndex) => ({
          ...cue,
          annotations: [
            styles[[0, 2, 3, 4][cueIndex]!]!,
            ...(cueIndex === 0 ? [styles[1]!] : []),
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
      const comp = structuredClone(
        compileMechanismNarratedCycle(instance, authored).composition,
      );
      const bracketParent = comp.layers.find(
        (layer) =>
          layer.type === "group" && layer.native3D?.role === "screen-anchor",
      )!;
      bracketParent.transform = {
        ...bracketParent.transform,
        position: [2, 3],
        opacity: {
          keys: [
            { frame: 0, value: 0.25, interpolation: "hold" },
            { frame: 22, value: 0, interpolation: "hold" },
          ],
        },
      };
      const asset = comp.assets.find((asset) => asset.type === "native3d")!;
      expect(asset.id).toBe(initialAsset.id);
      const styleReferences = authored.cues.flatMap((cue) =>
        cue.annotations.map((annotation) => ({
          kind: annotation.style!.kind,
          suffix: mechanismPackHash([cue.id, annotation.id]).slice(7, 39),
        })),
      );
      const original = JSON.stringify(comp);
      const restored = lowerMechanismCuePlateOverlays(
        comp,
        sources,
        plates(comp),
      );
      expect(
        restored.layers.some(
          (layer) =>
            layer.type === "native3d" || layer.native3D || layer.overlayAfter,
        ),
      ).toBe(false);
      expect(restored.assets.some((asset) => asset.type === "native3d")).toBe(
        false,
      );
      expect(CompositionSchema.parse(restored)).toEqual(restored);
      expect(restored.layers.filter((layer) => layer.type === "audio")).toEqual(
        comp.layers.filter((layer) => layer.type === "audio"),
      );
      let visibleBindings = 0;
      const visibleStyles = new Set<string>();
      const pathSamples = new Set<string>();
      for (const frame of [
        ...Array.from({ length: 60 }, (_, i) => i),
        ...Array.from({ length: 60 }, (_, i) => 59 - i),
      ]) {
        const before = evaluateComp(comp, frame, { preparedNative3D: sources });
        const after = evaluateComp(restored, frame);
        for (const layer of before.layers.filter(
          (layer) => layer.layer.native3D?.role === "screen-anchor",
        )) {
          const restoredLayer = after.layers.find(
            (entry) => entry.id === layer.id,
          )!;
          expect(restoredLayer.visible ? restoredLayer.opacity : 0).toBeCloseTo(
            layer.visible ? layer.opacity : 0,
            12,
          );
          if (!layer.visible || layer.opacity === 0) continue;
          visibleBindings++;
          for (const reference of styleReferences)
            if (layer.id.endsWith(reference.suffix))
              visibleStyles.add(reference.kind);
          if (layer.contents)
            pathSamples.add(
              JSON.stringify(
                layer.contents.filter((content) => content.type === "path"),
              ),
            );
          expect(restoredLayer.screenMatrix).toEqual(layer.screenMatrix);
          if (layer.contents) {
            const actualPaths = restoredLayer
              .contents!.filter((content) => content.type === "path")
              .map((content) => ({
                ...content,
                path: canonicalPath(content.path),
              }));
            const expectedPaths = layer.contents
              .filter((content) => content.type === "path")
              .map((content) => ({
                ...content,
                path: canonicalPath(content.path),
              }));
            expect(actualPaths).toEqual(expectedPaths);
          }
        }
      }
      expect(visibleBindings).toBeGreaterThan(0);
      expect([...visibleStyles].sort()).toEqual(
        styles.map((style) => style.kind).sort(),
      );
      expect(pathSamples.size).toBeGreaterThan(5);
      expect(JSON.stringify(comp)).toBe(original);
    },
    30000,
  );
  it("preserves hidden bindings without turning hidden content visible", async () => {
    const { instance, document } = narratedCycleFixture("cable-tie", 96000);
    const comp = compileMechanismNarratedCycle(instance, document).composition;
    const native = comp.assets.find((asset) => asset.type === "native3d")!;
    const prepared = await prepareNative3DSceneV2(
      instance.scene,
      native.sha256,
    );
    const sources = { [native.id]: prepared };
    const restored = lowerMechanismCuePlateOverlays(
      comp,
      sources,
      plates(comp),
    );
    let hidden = 0;
    for (let frame = 0; frame < comp.frameCount; frame++) {
      const before = evaluateComp(comp, frame, { preparedNative3D: sources });
      const after = evaluateComp(restored, frame);
      for (const state of before.layers.filter(
        (layer) => layer.layer.native3D?.role === "screen-anchor",
      )) {
        const actual = after.layers.find((layer) => layer.id === state.id)!;
        if (!state.visible || !state.opacity) hidden++;
        expect(actual.visible ? actual.opacity : 0).toBeCloseTo(
          state.visible ? state.opacity : 0,
          12,
        );
      }
    }
    expect(hidden).toBeGreaterThan(0);
  });
  it("rejects every local clock modifier before sampled binding keys can use the wrong clock", () => {
    const { instance, document } = narratedCycleFixture("cable-tie", 96000);
    const comp = compileMechanismNarratedCycle(instance, document).composition;
    for (const [field, value] of Object.entries({
      startFrame: 1,
      stretch: 2,
      posterizeFps: 15,
      holdFrame: 2,
      sampleTimes: [0, 2],
    })) {
      const changed = structuredClone(comp);
      Object.assign(
        changed.layers.find(
          (layer) => layer.native3D?.role === "screen-anchor",
        )!,
        { [field]: value },
      );
      expect(() =>
        lowerMechanismCuePlateOverlays(changed, {}, plates(changed)),
      ).toThrow(/clock/);
    }
  });
  it("rejects mismatched plate facts and clock expansion beyond the existing key limit before evaluation", () => {
    const { instance, document } = narratedCycleFixture("cable-tie", 96000);
    const comp = compileMechanismNarratedCycle(instance, document).composition;
    const wrong = { ...plates(comp), width: comp.width + 16 };
    expect(() => lowerMechanismCuePlateOverlays(comp, {}, wrong)).toThrow(
      /width/,
    );
    const long = { ...comp, frameCount: COMPOSITION_LIMITS.maxKeys + 1 };
    expect(() =>
      lowerMechanismCuePlateOverlays(long, {}, plates(long)),
    ).toThrow(/frameCount/);
  });
});
