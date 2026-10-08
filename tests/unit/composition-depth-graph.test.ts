import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import {
  CompositionSchema,
  type CompositionAsset,
} from "@still-shift/scene-contract";
import {
  evaluateComp,
  type EvaluatedLayerTree,
} from "@still-shift/renderer-core";
import {
  depthGraphFixtures,
  depthRasterReference,
} from "../helpers/composition-depth-graph.ts";
import { renderCompositionExposure } from "../../packages/renderer-core/src/composition/render/exposure.ts";
import type { RenderBackend } from "../../packages/renderer-core/src/composition/render/backend.ts";

const base = CompositionSchema.parse(
  JSON.parse(
    readFileSync(
      "benchmarks/fixtures/composition/ce4d/native-depth.json",
      "utf8",
    ),
  ),
);
base.width = 160;
base.height = 90;
const photo = base.layers[0]!;
if (photo.type !== "depth-image") throw Error("fixture depth missing");
photo.size = [160, 90];
const font = JSON.parse(
  readFileSync(
    "benchmarks/fixtures/story-motion-continuous/access-constraint.json",
    "utf8",
  ),
).fonts[0] as Extract<CompositionAsset, { type: "font" }>;
const frames = Array.from({ length: base.frameCount }, (_, frame) => ({
  id: `old-raster-${frame}`,
  type: "image" as const,
  path: `old-${frame}.png`,
  width: 160,
  height: 90,
  sha256: "sha256:" + "a".repeat(64),
}));

it("builds valid mixed depth graphs and independently clocked local-raster substitutes", () => {
  const fixtures = depthGraphFixtures(base, { ...font, type: "font" });
  expect(fixtures).toHaveLength(6);
  for (const fixture of fixtures) {
    const reference = depthRasterReference(fixture, frames);
    expect(CompositionSchema.safeParse(reference).success).toBe(true);
    const compare = (
      native: EvaluatedLayerTree,
      expected: EvaluatedLayerTree,
    ) => {
      for (const state of native.layers) {
        const other = expected.layers.find((layer) => layer.id === state.id)!;
        expect(other.time).toBe(state.time);
        expect(other.visible).toBe(state.visible);
        expect(other.screenMatrix).toEqual(state.screenMatrix);
        expect(other.worldMatrix3d).toEqual(state.worldMatrix3d);
        if (state.layer.type === "depth-image") {
          if (state.layer.receivesLight) {
            expect(other.layer.type).toBe("image");
            expect(other.state).toBe(Math.floor(state.time) - 30);
            continue;
          }
          expect(other.layer.type).toBe("provider");
          if (other.layer.type !== "provider") throw Error("oracle missing");
          expect(other.layer.assets).toHaveLength(base.frameCount);
          expect(other.layer.bounds).toEqual([0, 0, 160, 90]);
          expect(other.layer.params.frames).toEqual(
            frames.map((asset) => asset.id),
          );
        }
        if (state.precomp) compare(state.precomp, other.precomp!);
      }
    };
    for (let frame = fixture.frameCount - 1; frame >= 0; frame--)
      compare(evaluateComp(fixture, frame), evaluateComp(reference, frame));
  }
});

it("preflights depth camera shutter samples against the selected backend before painting", () => {
  const doc = depthGraphFixtures(base, { ...font, type: "font" }).find(
    (item) => item.id === "depth-camera-applied-once",
  )!;
  doc.motionBlur = {
    enabled: true,
    shutterAngle: 180,
    shutterPhase: -90,
    samples: 4,
  };
  doc.layers.find((layer) => layer.type === "depth-image")!.motionBlur = true;
  const clear = vi.fn(),
    drawDepthImage = vi.fn(),
    project = vi.fn();
  const backend: RenderBackend = {
    version: "test",
    createSurface: (width, height) => ({ width, height }),
    releaseSurface: () => {},
    clear,
    fillRect: () => {},
    drawImage: () => {},
    drawText: () => {},
    drawShape: () => {},
    drawProvider: () => {},
    composite: () => {},
    drawDepthImage,
    project,
    applyProjectiveClips: () => {},
    applyEffects: () => {},
    applyMask: () => {},
    applyMatte: () => {},
    lerp: () => {},
    readPixels: () => new Uint8ClampedArray(),
    accumulateExposure: (_target, count, draw) => {
      for (let index = 0; index < count; index++) draw(index);
    },
  };
  const target = { width: doc.width, height: doc.height };
  const unsupported = { ...backend };
  delete unsupported.drawDepthImage;
  expect(() => renderCompositionExposure(unsupported, target, doc, 10)).toThrow(
    "Depth displacement requires",
  );
  expect(clear).not.toHaveBeenCalled();
  const report = renderCompositionExposure(backend, target, doc, 10);
  expect(report.samples).toBe(4);
  expect(drawDepthImage).toHaveBeenCalledTimes(4);
  expect(project).toHaveBeenCalledTimes(4);
});
