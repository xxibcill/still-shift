import { describe, expect, it } from "vitest";
import {
  CompositionSchema,
  CompositionPreparedNative3DVersionsSchema,
  NativeFrameSnapshotV2Schema,
  NativeFrameSnapshotV3Schema,
} from "@still-shift/scene-contract";
import { prepareCompositionNative3DVersions } from "../../packages/renderer-core/src/native3d/prepare.ts";
import { compositionNativePasses } from "../../packages/renderer-core/src/composition/render/graphs.ts";
import { gltfJsonHash } from "../../packages/animation-engine/src/mechanism/gltf-identity.ts";
import { native3DOverridesKeyV3 } from "../../packages/renderer-core/src/native3d/override-keys.ts";
import { resolveNative3DVariantVersions } from "../../packages/renderer-core/src/native3d/catalogue-versions.ts";
import { nativePbrSceneFixture } from "../helpers/native-pbr-scene-fixture.ts";
function fixture() {
  const source = nativePbrSceneFixture(),
    sourceSha256 = gltfJsonHash(source);
  const composition = CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "imported-composition",
    width: 320,
    height: 180,
    fps: 30,
    frameCount: 11,
    assets: [
      {
        id: "lever",
        type: "native3d",
        format: "mechanism-scene-3",
        path: "lever.json",
        sha256: sourceSha256,
      },
    ],
    layers: [
      {
        id: "lever-world",
        type: "native3d",
        asset: "lever",
        sourceStartFrame: 0,
        sourceFps: 30,
        rigControls: {
          "lever.hinge": {
            type: "hinge",
            keys: [
              { frame: 0, value: 0 },
              { frame: 10, value: Math.PI / 2 },
            ],
          },
        },
      },
    ],
  });
  return {
    source,
    sourceSha256,
    composition,
    transport: {
      version: "composition-prepared-native3d-3",
      assets: { lever: { source, sourceSha256, binaryResources: [] } },
    },
  };
}
describe("PBR source3 production composition dispatch", () => {
  it("prepares an explicit source3 catalogue and samples the real composition graph under reverse seeks", async () => {
    const { composition, transport } = fixture();
    const parsed = CompositionPreparedNative3DVersionsSchema.parse(transport);
    const catalogue = await prepareCompositionNative3DVersions(
      composition,
      parsed,
    );
    const sample = (frame: number) =>
      [
        ...compositionNativePasses(composition, frame, {
          preparedNative3D: catalogue,
        }),
      ][0]!.frame;
    const neutral = sample(0),
      rotated = sample(10),
      midpoint = sample(5);
    expect(neutral.version).toBe("native3d-frame-3");
    expect(neutral.frame.anchors["lever.tip"]!.world).toEqual([5, 4, 0]);
    expect(rotated.frame.anchors["lever.tip"]!.world[0]).toBeCloseTo(3, 12);
    for (const frame of [10, 0, 5, 0, 10])
      expect(sample(frame)).toEqual(
        frame === 0 ? neutral : frame === 10 ? rotated : midpoint,
      );
  });
});

describe("PBR composition version and static variant boundaries", () => {
  it("retains submitted meshes while admitting explicit linear PBR style variants", async () => {
    const { composition, transport, source } = fixture(),
      controller = composition.layers[0]!;
    if (controller.type !== "native3d") throw Error("fixture controller");
    controller.pbrMaterialOverrides = {
      [source.geometry.materials[0]!.id]: {
        baseColorFactor: [0.9, 0.1, 0.3, 1],
        metallicFactor: 0.6,
        roughnessFactor: 0.4,
      },
    };
    const catalogue = await prepareCompositionNative3DVersions(
        composition,
        CompositionPreparedNative3DVersionsSchema.parse(transport),
      ),
      prepared = catalogue.lever!;
    if (prepared.version !== "prepared-native3d-scene-3")
      throw Error("fixture protocol");
    const base = prepared.variants[prepared.baseSourceKey]!,
      styled =
        prepared.variants[
          prepared.variantKeysByOverrides[
            native3DOverridesKeyV3({
              pbrMaterialOverrides: controller.pbrMaterialOverrides,
            })
          ]!
        ]!;
    expect(styled.source.geometry.meshes).toBe(base.source.geometry.meshes);
    expect(styled.meshDataSha256).toBe(base.meshDataSha256);
    expect(styled.sourceKey).not.toBe(base.sourceKey);
    const frame = [
      ...compositionNativePasses(composition, 5, {
        preparedNative3D: catalogue,
      }),
    ][0]!.frame;
    expect(frame.sourceKey).toBe(styled.sourceKey);
    expect(frame.frame.anchors["lever.tip"]!.world[0]).toBeCloseTo(
      5 - Math.SQRT2,
      12,
    );
    expect(NativeFrameSnapshotV3Schema.safeParse(frame).success).toBe(true);
    expect(NativeFrameSnapshotV2Schema.safeParse(frame).success).toBe(false);
    expect(() =>
      resolveNative3DVariantVersions(catalogue, {
        ...frame,
        geometrySha256: "sha256:" + "0".repeat(64),
      }),
    ).toThrow(/identity|differ/);
  });
  it("locates unknown style IDs at their introducing controller", async () => {
    const { composition, transport } = fixture(),
      controller = composition.layers[0]!;
    if (controller.type !== "native3d") throw Error("fixture controller");
    controller.pbrMaterialOverrides = { missing: { roughnessFactor: 0.5 } };
    await expect(
      prepareCompositionNative3DVersions(
        composition,
        CompositionPreparedNative3DVersionsSchema.parse(transport),
      ),
    ).rejects.toMatchObject({
      diagnostics: [
        { node: "lever-world", path: "layers.0.pbrMaterialOverrides.missing" },
      ],
    });
  });
  it("rejects legacy material/driver fields and transport downgrade", async () => {
    for (const field of ["materialOverrides", "controls"] as const) {
      const { composition, transport } = fixture(),
        controller = composition.layers[0]!;
      if (controller.type !== "native3d") throw Error("fixture controller");
      Object.assign(controller, { [field]: {} });
      await expect(
        prepareCompositionNative3DVersions(
          composition,
          CompositionPreparedNative3DVersionsSchema.parse(transport),
        ),
      ).rejects.toMatchObject({
        diagnostics: [{ node: "lever-world", path: `layers.0.${field}` }],
      });
    }
    const { transport } = fixture();
    expect(
      CompositionPreparedNative3DVersionsSchema.safeParse({
        ...transport,
        version: "composition-prepared-native3d-2",
      }).success,
    ).toBe(false);
    expect(
      CompositionPreparedNative3DVersionsSchema.safeParse({
        ...transport,
        assets: { lever: { ...transport.assets.lever, rgba: [0] } },
      }).success,
    ).toBe(false);
  });
});
