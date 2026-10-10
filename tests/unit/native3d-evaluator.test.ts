import { describe, expect, it } from "vitest";
import {
  prepareNative3DScene,
  resolveNative3DVariant,
  prepareCompositionNative3D,
} from "../../packages/renderer-core/src/native3d/prepare.ts";
import { sampleNativeFrame } from "../../packages/renderer-core/src/native3d/evaluate.ts";
import { resolveNativeScreenAnchor } from "../../packages/renderer-core/src/native3d/bindings.ts";
import { Native3DLayerSchema } from "../../packages/scene-contract/src/composition/layers.ts";
import { CompositionSchema } from "../../packages/scene-contract/src/composition/composition.ts";
import {
  nativeSolidFixture,
  nativeFixtureHash,
} from "../helpers/native3d-fixture.ts";
const controller = Native3DLayerSchema.parse({
  id: "world",
  type: "native3d",
  asset: "solid",
  sourceStartFrame: 78,
  sourceFps: 30,
});
const scope = {
  scope: "comp",
  scopeFrame: 78.25,
  layerTime: 0.25,
  owningScopeFps: 30,
  width: 320,
  height: 180,
};
describe("native immutable catalogue and fractional physical snapshots", () => {
  it("binds raw/effective/geometry identities independently and shares immutable mesh arrays", async () => {
    const prepared = await prepareNative3DScene(
      nativeSolidFixture(),
      nativeFixtureHash,
      {
        variants: [
          {},
          { partOverrides: {} },
          { partOverrides: { child: { visible: false } } },
          { materialOverrides: { paint: { color: "#ffffff" } } },
        ],
      },
    );
    const variants = Object.values(prepared.variants),
      base = prepared.variants[prepared.baseSourceKey]!;
    expect(variants).toHaveLength(3);
    const part = variants.find(
      (variant) => variant.source.parts[1]!.visible === false,
    )!;
    const style = variants.find(
      (variant) => variant.source.geometry.materials[0]!.color === "#ffffff",
    )!;
    expect(part.geometrySha256).toBe(base.geometrySha256);
    expect(part.effectiveSceneSha256).not.toBe(base.effectiveSceneSha256);
    expect(style.geometrySha256).not.toBe(base.geometrySha256);
    expect(style.meshDataSha256).toBe(base.meshDataSha256);
    for (const variant of variants) {
      expect(variant.source.geometry.meshes).toBe(base.source.geometry.meshes);
      expect(
        Object.isFrozen(variant.source.geometry.meshes[0]!.positions),
      ).toBe(true);
    }
    expect(Object.isFrozen(prepared.variants)).toBe(true);
  });
  it("is independent of static request order and rejects stale/unknown prepared lookup", async () => {
    const requests = [
      { partOverrides: { child: { visible: false } } },
      { materialOverrides: { paint: { color: "#ffffff" } } },
    ];
    const a = await prepareNative3DScene(
      nativeSolidFixture(),
      nativeFixtureHash,
      { variants: requests },
    );
    const b = await prepareNative3DScene(
      nativeSolidFixture(),
      nativeFixtureHash,
      { variants: [...requests].reverse() },
    );
    expect(Object.keys(a.variants)).toEqual(Object.keys(b.variants));
    const frame = sampleNativeFrame(a, controller, scope);
    expect(resolveNative3DVariant({ solid: a }, frame).sourceKey).toBe(
      frame.sourceKey,
    );
    expect(() =>
      resolveNative3DVariant(
        { solid: a },
        { ...frame, geometrySha256: "sha256:" + "b".repeat(64) },
      ),
    ).toThrow("identity");
    expect(() =>
      resolveNative3DVariant({ solid: a }, { ...frame, asset: "other" }),
    ).toThrow("Missing");
  });
  it("keeps exact fractional time and viewport identity across random seeks", async () => {
    const prepared = await prepareNative3DScene(
      nativeSolidFixture(),
      nativeFixtureHash,
    );
    const a = sampleNativeFrame(prepared, controller, scope);
    sampleNativeFrame(prepared, controller, {
      ...scope,
      layerTime: 5.5,
      scopeFrame: 83.5,
    });
    const b = sampleNativeFrame(prepared, controller, scope);
    expect(a.sourceFrame).toBe(78.25);
    expect(a).toEqual(b);
    expect(a.frame.version).toBe("solid-evaluator-1");
    expect(a.frame).not.toHaveProperty("rigs");
    expect(
      sampleNativeFrame(prepared, controller, {
        ...scope,
        scope: "instance2",
        width: 640,
      }).frameKey,
    ).not.toBe(a.frameKey);
    expect(
      sampleNativeFrame(prepared, { ...controller, seed: 11 }, scope).frame
        .seed,
    ).toBe(11);
    expect(() =>
      sampleNativeFrame(
        prepared,
        { ...controller, partOverrides: { child: { visible: false } } },
        scope,
      ),
    ).toThrow("newly prepared");
  });
  it("measures physical triangle occlusion, endpoint tolerance and inherited visibility", async () => {
    const prepared = await prepareNative3DScene(
      nativeSolidFixture(),
      nativeFixtureHash,
    );
    const frame = sampleNativeFrame(prepared, controller, scope);
    expect(frame.anchors.behind!.visibility).toBe("occluded");
    expect(frame.anchors.behind!.occluderMesh).toBe("floor");
    expect(frame.anchors.face!.visibility).toBe("visible");
    const hidden = sampleNativeFrame(
      prepared,
      { ...controller, hiddenParts: ["root"] },
      scope,
    );
    expect(hidden.anchors.behind!.visibility).toBe("hidden-part");
    expect(hidden.localVisibility).toEqual({ root: false, child: true });
    expect(hidden.frame.parts.child!.visible).toBe(false);
  });
  it("honors uniform mask survival and camera-axis near clipping in physical visibility", async () => {
    const source = nativeSolidFixture();
    const prepared = await prepareNative3DScene(source, nativeFixtureHash, {
      variants: [
        {
          materialOverrides: {
            paint: { alphaMode: "mask", opacity: 0.2, alphaCutoff: 0.5 },
          },
        },
      ],
    });
    expect(
      sampleNativeFrame(
        prepared,
        {
          ...controller,
          materialOverrides: {
            paint: { alphaMode: "mask", opacity: 0.2, alphaCutoff: 0.5 },
          },
        },
        scope,
      ).anchors.behind!.visibility,
    ).toBe("visible");
    expect(
      sampleNativeFrame(
        prepared,
        { ...controller, camera: { ...source.camera, near: 10.5 } },
        scope,
      ).anchors.behind!.visibility,
    ).toBe("visible");
  });
  it("classifies offscreen indicators before offset, then clamps the offset candidate", async () => {
    const prepared = await prepareNative3DScene(
      nativeSolidFixture(),
      nativeFixtureHash,
    );
    const frame = sampleNativeFrame(prepared, controller, scope);
    const binding = {
      role: "screen-anchor" as const,
      sceneLayer: "world",
      anchor: "outside",
      visibilityPolicy: "offscreen-indicator" as const,
      offsetPixels: [1000, -1000] as [number, number],
      insetPixels: 12,
      target: { kind: "position" as const },
    };
    expect(resolveNativeScreenAnchor(frame, binding)).toMatchObject({
      shown: true,
      indicator: true,
      visibility: "outside-frame",
      pixel: [308, 12],
    });
    expect(
      resolveNativeScreenAnchor(frame, {
        ...binding,
        visibilityPolicy: "hide-occluded",
      }).shown,
    ).toBe(false);
    expect(
      resolveNativeScreenAnchor(frame, { ...binding, anchor: "behind" }),
    ).toMatchObject({ shown: false, indicator: false, pixel: null });
  });
  it("enforces the composition-wide cap before publishing any lookup", async () => {
    const requests = Array.from({ length: 64 }, (_, index) => ({
      id: `world${index}`,
      type: "native3d",
      asset: index < 32 ? "solid" : "second",
      sourceStartFrame: index,
      sourceFps: 30,
      inPoint: index,
      outPoint: index + 1,
      partOverrides: { child: { transform: { position: [index + 1, 0, 0] } } },
    }));
    const comp = CompositionSchema.parse({
      schemaVersion: "composition-1",
      id: "comp",
      width: 320,
      height: 180,
      fps: 30,
      frameCount: 100,
      assets: ["solid", "second"].map((id) => ({
        id,
        type: "native3d",
        path: `${id}.json`,
        sha256: nativeFixtureHash,
        format: "solid-scene-1",
      })),
      layers: requests,
    });
    await expect(
      prepareCompositionNative3D(comp, {
        version: "composition-prepared-native3d-1",
        assets: {
          solid: {
            sourceSha256: nativeFixtureHash,
            source: nativeSolidFixture(),
          },
          second: {
            sourceSha256: nativeFixtureHash,
            source: nativeSolidFixture(),
          },
        },
      }),
    ).rejects.toThrow("64");
  });
});
