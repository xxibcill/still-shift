import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  depthToComposition,
  resolveDepthPreviewPreset,
  evaluateComp,
  evaluateFrame,
} from "@still-shift/renderer-core";
import {
  CompositionSchema,
  type CompositionAsset,
} from "@still-shift/scene-contract";
import { createHash } from "node:crypto";
import {
  depthReferenceFixtures,
  extendedDepthReferenceFixtures,
} from "../helpers/composition-depth-fixtures.ts";
import { compositionTracks } from "../../apps/lab/src/composition-keys.ts";
import { ownCurve } from "../../packages/renderer-core/src/composition/evaluate/expression-keys.ts";
import { requireSpatialCapabilities } from "../../packages/renderer-core/src/composition/render/spatial-capabilities.ts";
import { buildRenderGraph } from "@still-shift/renderer-core";

const assets = JSON.parse(
  readFileSync(
    new URL(
      "../../benchmarks/fixtures/composition/ce4d/native-depth.json",
      import.meta.url,
    ),
    "utf8",
  ),
).assets as Extract<CompositionAsset, { type: "image" }>[];
const source = assets[0]!,
  depth = assets[1]!;

describe("prepared depth/flat preset adaptation", () => {
  it("compiles all additional auto/framing/alpha/depth-resolution reference cases", () => {
    const fixtures = extendedDepthReferenceFixtures(source.sha256);
    expect(fixtures).toHaveLength(6);
    for (const fixture of fixtures) {
      const asset = (
        id: string,
        path: string,
        width: number,
        height: number,
      ) => ({
        id,
        type: "image" as const,
        path,
        width,
        height,
        sha256:
          "sha256:" +
          createHash("sha256")
            .update(
              readFileSync(`benchmarks/fixtures/composition/ce4d/${path}`),
            )
            .digest("hex"),
      });
      const doc = depthToComposition(fixture.scene, {
        requestedPreset: fixture.requestedPreset,
        source: asset("source", fixture.source, 1600, 900),
        depth: asset(
          "depth",
          fixture.depth!,
          fixture.depthWidth ?? 1600,
          fixture.depthHeight ?? 900,
        ),
      });
      expect(doc.layers[0]).toMatchObject({
        type: "depth-image",
        alphaMode: "opaque",
        depth: {
          width: fixture.depthWidth ?? 1600,
          height: fixture.depthHeight ?? 900,
        },
      });
      for (let frame = 0; frame < doc.frameCount; frame++) {
        const expected = evaluateFrame(fixture.scene, frame);
        expect(evaluateComp(doc, frame).layers[0]!.depthMotion).toEqual({
          scale: expected.scale,
          strength: expected.depthStrength,
          offset: [expected.translationX, expected.translationY],
          roll: expected.rollDegrees,
        });
      }
    }
  });
  it("rejects unsupported image-plane combinations and Canvas before drawing", () => {
    const scene = depthReferenceFixtures().find(
      (fixture) => fixture.scene.motion.preset === "panel_reveal",
    )!.scene;
    const doc = depthToComposition(scene, { source }),
      image = doc.layers[0]!;
    for (const fields of [
      { sampling: undefined },
      { fit: "contain" },
      { sources: [{ asset: "source", crop: [0, 0, 50, 50] }] },
      { sources: [{ asset: "source" }, { asset: "source" }] },
      { stateMix: 1, stateFrom: 0 },
    ])
      expect(
        CompositionSchema.safeParse({
          ...doc,
          layers: [{ ...image, ...fields }],
        }).success,
      ).toBe(false);
    const graph = buildRenderGraph(doc, evaluateComp(doc, 10));
    expect(() =>
      requireSpatialCapabilities(graph.root, { projective: false }),
    ).toThrow(/Linear-light image planes require/);
    const curve = ownCurve(
      image,
      [{ name: "plane" }, { name: "reveal" }, { name: "progress" }],
      30,
    )!;
    expect(curve.sample(8)).toBe(evaluateFrame(scene, 8).revealProgress);
  });
  it("matches all 17 preset/fallback state timelines in layer-local native data", () => {
    for (const fixture of depthReferenceFixtures()) {
      const doc = depthToComposition(fixture.scene, { source, depth });
      expect(CompositionSchema.safeParse(doc).success).toBe(true);
      expect(doc.layers[0]!.type).toBe(
        fixture.scene.motion.mode === "depth" ? "depth-image" : "image",
      );
      if (fixture.scene.motion.mode !== "depth")
        expect(doc.assets.map((asset) => asset.id)).toEqual(["source"]);
      for (let frame = 0; frame < fixture.scene.timeline.frameCount; frame++) {
        const expected = evaluateFrame(fixture.scene, frame),
          state = evaluateComp(doc, frame).layers[0]!;
        const native = state.depthMotion ?? state.imagePlane!;
        expect(native.scale).toBe(expected.scale);
        expect(native.offset).toEqual([
          expected.translationX,
          expected.translationY,
        ]);
        expect(native.roll).toBe(expected.rollDegrees);
        if (state.depthMotion)
          expect(state.depthMotion.strength).toBe(expected.depthStrength);
        if (state.imagePlane)
          expect(state.imagePlane.revealProgress).toBe(expected.revealProgress);
      }
      const saved = JSON.parse(JSON.stringify(doc));
      const reloaded = evaluateComp(saved, 17).layers[0]!,
        original = evaluateComp(doc, 17).layers[0]!;
      expect(reloaded.depthMotion ?? reloaded.imagePlane).toEqual(
        original.depthMotion ?? original.imagePlane,
      );
    }
  });
  it("resolves all three auto choices deterministically from real source hash/seed", () => {
    const selected = new Set<string>();
    for (let seed = 0; seed < 64; seed++) {
      const result = resolveDepthPreviewPreset(
        "auto",
        seed,
        1920,
        1080,
        source.sha256,
      );
      selected.add(result);
      expect(
        resolveDepthPreviewPreset("auto", seed, 1920, 1080, source.sha256),
      ).toBe(result);
      expect(
        resolveDepthPreviewPreset("auto", seed, 1080, 1920, source.sha256),
      ).toBe("horizontal_drift");
    }
    expect([...selected].sort()).toEqual([
      "cinematic_float",
      "horizontal_drift",
      "slow_push",
    ]);
    expect(() =>
      resolveDepthPreviewPreset("auto", -1, 1920, 1080, source.sha256),
    ).toThrow(/verified normalized/);
    expect(() =>
      resolveDepthPreviewPreset("auto", 1, 1920, 1080, "source-id"),
    ).toThrow(/verified normalized/);
  });
  it("rejects silent flattening, unavailable depth, forged source dimensions and unqualified fallbacks", () => {
    const scene = depthReferenceFixtures()[0]!.scene;
    expect(() => depthToComposition(scene, { source })).toThrow(
      /prepared depth asset/,
    );
    expect(() =>
      depthToComposition(
        { ...scene, motion: { ...scene.motion, mode: "flat_2d" } },
        { source },
      ),
    ).toThrow(/silently become/);
    expect(() =>
      depthToComposition(
        { ...scene, motion: { ...scene.motion, mode: "fallback_2d" } },
        { source },
      ),
    ).toThrow(/explicit preparation/);
    expect(() =>
      depthToComposition(scene, { source: { ...source, width: 1 }, depth }),
    ).toThrow(/actual normalized/);
    expect(() =>
      depthToComposition(
        { ...scene, timeline: { ...scene.timeline, frameCount: 10_000_000 } },
        { source, depth },
      ),
    ).toThrow(/bounded integer-key/);
  });
  it("keeps image-plane paths, expressions, own stage vectors and inspector keys native", () => {
    const fixture = depthReferenceFixtures().find(
      (fixture) => fixture.scene.motion.preset === "panel_reveal",
    )!;
    const adapted = depthToComposition(fixture.scene, { source });
    const doc = CompositionSchema.parse({
      ...adapted,
      expressions: {
        "photo.plane.motion.offset.x": { source: "0.01" },
        "photo.plane.reveal.progress": { source: "value * 0.5" },
      },
    });
    expect(evaluateComp(doc, 16).layers[0]!.imagePlane).toEqual({
      scale: 1,
      offset: [0.01, 0],
      roll: 0,
      revealProgress: 0.5,
    });
    expect(evaluateComp(adapted, 16).layers[0]!.imagePlane!.offset).toEqual([
      0, 0,
    ]);
    expect(compositionTracks(doc).map((track) => track.property)).toContain(
      "plane.reveal.progress",
    );
  });
  it("records requested/resolved presets, asset identity and preparation safety", () => {
    const scene = depthReferenceFixtures().find(
      (fixture) => fixture.scene.motion.mode === "fallback_2d",
    )!.scene;
    const doc = depthToComposition(scene, {
      source,
      requestedIntensity: "strong",
    });
    expect(doc.metadata).toMatchObject({
      requestedPreset: "slow_push",
      resolvedPreset: "slow_push",
      requestedIntensity: "strong",
      sourceHash: source.sha256,
      depthHash: null,
      quality: scene.quality,
      warnings: scene.warnings,
    });
    expect(doc.metadata!.shader).toBeDefined();
  });
});
