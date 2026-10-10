import { describe, expect, it } from "vitest";
import {
  CompositionAssetSchema,
  CompositionNative3DAssetSchema,
  CompositionPreparedNative3DSchema,
  CompositionPreparedNative3DVersionsSchema,
  CompositionSchema,
  Native3DLayerVersionsSchema,
  type Composition,
  type CompositionPreparedNative3DV2,
} from "@still-shift/scene-contract";
import * as native from "../../packages/renderer-core/src/native3d/index.ts";
import { mechanismV2Fixture } from "../helpers/mechanism-v2-fixture.ts";
import {
  nativeSolidFixture,
  nativeFixtureHash,
} from "../helpers/native3d-fixture.ts";

function fixture() {
  const source = mechanismV2Fixture();
  const composition = CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "mixed",
    width: 320,
    height: 180,
    fps: 30,
    frameCount: 100,
    assets: [
      {
        id: "solid",
        type: "native3d",
        path: "solid.json",
        sha256: nativeFixtureHash,
        format: "solid-scene-1",
      },
      {
        id: "mechanism",
        type: "native3d",
        path: "mechanism.json",
        sha256: nativeFixtureHash,
        format: "mechanism-scene-2",
      },
    ],
    layers: [
      {
        id: "old",
        inPoint: 0,
        outPoint: 50,
        type: "native3d",
        asset: "solid",
        sourceStartFrame: 0,
        sourceFps: 30,
      },
      {
        id: "new",
        inPoint: 50,
        outPoint: 100,
        type: "native3d",
        asset: "mechanism",
        sourceStartFrame: 0.25,
        sourceFps: 30,
        rigControls: { slide: { type: "slider", value: 2 } },
      },
    ],
  });
  // Raw fixture hashes model the caller's separate original-byte verification boundary.
  const transport: CompositionPreparedNative3DV2 = {
    version: "composition-prepared-native3d-2",
    assets: {
      solid: { sourceSha256: nativeFixtureHash, source: nativeSolidFixture() },
      mechanism: { sourceSha256: nativeFixtureHash, source },
    },
  };
  return { source, composition, transport };
}
const sample = {
  scope: "mixed",
  scopeFrame: 50.5,
  owningScopeFps: 30,
  layerTime: 0.5,
  width: 320,
  height: 180,
};
function replaceController(comp: Composition, patch: object) {
  const copy = structuredClone(comp);
  copy.layers[1] = Native3DLayerVersionsSchema.parse({
    ...copy.layers[1],
    ...patch,
  });
  return copy;
}

describe("versioned native composition catalogues", () => {
  it("admits explicit scene2 assets while preserving the original v1 asset parser", () => {
    const asset = fixture().composition.assets[1]!;
    expect(CompositionAssetSchema.safeParse(asset).success).toBe(true);
    expect(CompositionNative3DAssetSchema.safeParse(asset).success).toBe(false);
    expect(
      CompositionAssetSchema.safeParse({
        ...asset,
        format: "mechanism-scene-3",
      }).success,
    ).toBe(false);
  });
  it("exposes an explicit versioned preparation boundary and prepares both actual source protocols", async () => {
    const f = fixture();
    const catalogue = await native.prepareCompositionNative3DVersions(
      f.composition,
      f.transport,
    );
    expect(catalogue.solid!.version).toBe("prepared-native3d-scene-1");
    expect(catalogue.mechanism!.version).toBe("prepared-native3d-scene-2");
    const mechanism = catalogue.mechanism!;
    if (mechanism.version !== "prepared-native3d-scene-2")
      throw Error("Expected scene2");
    const controller = Native3DLayerVersionsSchema.parse(
      f.composition.layers[1],
    );
    const snapshot = native.sampleNativeFrameV2(mechanism, controller, sample);
    expect(snapshot.sourceFrame).toBe(0.75);
    expect(snapshot.frame.rigs.slide).toMatchObject({
      type: "slider",
      position: 2,
    });
    expect(Object.isFrozen(catalogue)).toBe(true);
    expect(
      Object.isFrozen(
        mechanism.variants[mechanism.baseSourceKey]!.shapeAssociations,
      ),
    ).toBe(true);
    expect(
      CompositionPreparedNative3DSchema.safeParse(f.transport).success,
    ).toBe(false);
  });
  it("selects transport2 from an unused declared scene2 asset and rejects downgrade or missing source", async () => {
    const f = fixture();
    f.composition.layers = [];
    await expect(
      native.prepareCompositionNative3DVersions(f.composition, {
        ...f.transport,
        version: "composition-prepared-native3d-1",
        assets: { solid: f.transport.assets.solid },
      }),
    ).rejects.toMatchObject({
      diagnostics: [{ path: "preparedNative3D.version" }],
    });
    await expect(
      native.prepareCompositionNative3DVersions(f.composition, {
        ...f.transport,
        assets: { solid: f.transport.assets.solid },
      }),
    ).rejects.toMatchObject({
      diagnostics: [{ code: "comp-native3d-not-ready", path: "assets.1" }],
    });
    expect(
      Object.keys(
        await native.prepareCompositionNative3DVersions(
          f.composition,
          f.transport,
        ),
      ),
    ).toEqual(["mechanism", "solid"]);
  });
  it("keeps original v1 catalogue identity and frame serialization unchanged", async () => {
    const f = fixture();
    f.composition.assets.splice(1);
    f.composition.layers.splice(1);
    const transport = CompositionPreparedNative3DSchema.parse({
      version: "composition-prepared-native3d-1",
      assets: { solid: f.transport.assets.solid },
    });
    const original = await native.prepareCompositionNative3D(
      f.composition,
      transport,
    );
    const versioned = await native.prepareCompositionNative3DVersions(
      f.composition,
      transport,
    );
    const prepared = versioned.solid!;
    if (prepared.version !== "prepared-native3d-scene-1")
      throw Error("Expected legacy source");
    expect(JSON.stringify(versioned)).toBe(JSON.stringify(original));
    const controller = Native3DLayerVersionsSchema.parse(
      f.composition.layers[0],
    );
    expect(
      JSON.stringify(native.sampleNativeFrame(prepared, controller, sample)),
    ).toBe(
      JSON.stringify(
        native.sampleNativeFrame(original.solid!, controller, sample),
      ),
    );
    await expect(
      native.prepareCompositionNative3DVersions(f.composition, {
        ...transport,
        version: "composition-prepared-native3d-2",
      }),
    ).rejects.toMatchObject({
      diagnostics: [{ path: "preparedNative3D.version" }],
    });
  });
  it("rejects undeclared transports, raw identity changes and declared format mismatch with located errors", async () => {
    const f = fixture();
    for (const [transport, path] of [
      [
        {
          ...f.transport,
          assets: { ...f.transport.assets, extra: f.transport.assets.solid },
        },
        "preparedNative3D.assets.extra",
      ],
      [
        {
          ...f.transport,
          assets: {
            ...f.transport.assets,
            mechanism: {
              ...f.transport.assets.mechanism,
              sourceSha256: "sha256:" + "b".repeat(64),
            },
          },
        },
        "assets.1.sha256",
      ],
      [
        {
          ...f.transport,
          assets: {
            ...f.transport.assets,
            mechanism: f.transport.assets.solid,
          },
        },
        "assets.1.format",
      ],
    ] as const)
      await expect(
        native.prepareCompositionNative3DVersions(f.composition, transport),
      ).rejects.toMatchObject({ diagnostics: [{ path }] });
    const corrupt = structuredClone(f.transport);
    corrupt.assets.mechanism!.source.geometry.materials[0]!.color = "#ffffff";
    await expect(
      native.prepareCompositionNative3DVersions(f.composition, corrupt),
    ).rejects.toMatchObject({
      diagnostics: [
        { code: "comp-native3d-checksum", path: "assets.1.geometrySha256" },
      ],
    });
  });
  it("rejects even empty controls from the wrong source protocol", async () => {
    const f = fixture();
    const wrong = structuredClone(f.composition);
    wrong.layers[1] = Native3DLayerVersionsSchema.parse({
      ...wrong.layers[1],
      rigControls: undefined,
      controls: {},
    });
    await expect(
      native.prepareCompositionNative3DVersions(wrong, f.transport),
    ).rejects.toMatchObject({ diagnostics: [{ path: "layers.1.controls" }] });
    wrong.layers[1] = f.composition.layers[1]!;
    wrong.layers[0] = Native3DLayerVersionsSchema.parse({
      ...wrong.layers[0],
      rigControls: {},
    });
    await expect(
      native.prepareCompositionNative3DVersions(wrong, f.transport),
    ).rejects.toMatchObject({
      diagnostics: [{ path: "layers.0.rigControls" }],
    });
  });
  it("rejects the first illegal ratchet interval before any frame is rendered", async () => {
    const f = fixture();
    const composition = replaceController(f.composition, {
      rigControls: {
        latch: {
          type: "ratchet",
          position: {
            keys: [
              { frame: 0, value: 3 },
              { frame: 6, value: 0 },
            ],
          },
          latchKeys: [
            { frame: 0, state: "released" },
            { frame: 4, state: "engaged" },
          ],
        },
      },
    });
    await expect(
      native.prepareCompositionNative3DVersions(composition, f.transport),
    ).rejects.toMatchObject({
      diagnostics: [
        {
          code: "mechanism-ratchet-reverse",
          node: "new",
          path: "layers.1.rigControls.latch.position.keys.1.value",
          frame: 4,
          interval: { startFrame: 4, endFrameExclusive: 6 },
        },
      ],
    });
  });
  it("locates invalid precomp writers and unknown static edits at their authored controller", async () => {
    const f = fixture();
    const nested = CompositionSchema.parse({
      ...f.composition,
      layers: [],
      precomps: [
        {
          id: "nested",
          width: 320,
          height: 180,
          frameCount: 100,
          layers: [
            {
              ...f.composition.layers[1],
              rigControls: { slide: { type: "slider", value: 11 } },
            },
          ],
        },
      ],
    });
    await expect(
      native.prepareCompositionNative3DVersions(nested, f.transport),
    ).rejects.toMatchObject({
      diagnostics: [
        { node: "new", path: "precomps.0.layers.0.rigControls.slide.value" },
      ],
    });
    await expect(
      native.prepareCompositionNative3DVersions(
        replaceController(f.composition, {
          partOverrides: { absent: { visible: false } },
        }),
        f.transport,
      ),
    ).rejects.toMatchObject({
      diagnostics: [{ node: "new", path: "layers.1.partOverrides.absent" }],
    });
  });
  it("supports declared constructor part IDs through static override preparation and absolute sampling", async () => {
    const f = fixture();
    f.source.parts.find((p) => p.id === "child")!.id = "constructor";
    const slider = f.source.rigs.find((r) => r.id === "slide")!;
    if (slider.type !== "slider") throw Error("Expected slider");
    slider.movingPart = "constructor";
    for (const anchor of f.source.anchors)
      if (anchor.source.kind === "part-local" && anchor.source.part === "child")
        anchor.source.part = "constructor";
    const composition = replaceController(f.composition, {
      partOverrides: { constructor: { visible: false } },
    });
    const catalogue = await native.prepareCompositionNative3DVersions(
      composition,
      f.transport,
    );
    const prepared = catalogue.mechanism!;
    if (prepared.version !== "prepared-native3d-scene-2")
      throw Error("Expected scene2");
    const snapshot = native.sampleNativeFrameV2(
      prepared,
      Native3DLayerVersionsSchema.parse(composition.layers[1]),
      sample,
    );
    expect(Object.hasOwn(snapshot.localVisibility, "constructor")).toBe(true);
    expect(snapshot.localVisibility.constructor).toBe(false);
    expect(
      Object.entries(snapshot.frame.parts).find(
        ([id]) => id === "constructor",
      )![1].visible,
    ).toBe(false);
  });
  it("admits exactly 64 distinct mixed variants and rejects the next one under shared admission", async () => {
    const f = fixture();
    f.composition.layers = ["solid", "mechanism"].flatMap((asset, group) =>
      Array.from({ length: 31 }, (_, index) =>
        Native3DLayerVersionsSchema.parse({
          id: `g${group}n${index}`,
          inPoint: group * 31 + index,
          outPoint: group * 31 + index + 1,
          type: "native3d",
          asset,
          sourceStartFrame: 0,
          sourceFps: 30,
          materialOverrides: {
            paint: { color: "#" + (index + 1).toString(16).padStart(6, "0") },
          },
        }),
      ),
    );
    f.composition = CompositionSchema.parse(f.composition);
    const catalogue = await native.prepareCompositionNative3DVersions(
      f.composition,
      f.transport,
    );
    expect(
      Object.values(catalogue).reduce(
        (sum, scene) => sum + Object.keys(scene.variants).length,
        0,
      ),
    ).toBe(64);
    f.composition.layers.push(
      Native3DLayerVersionsSchema.parse({
        id: "overflow",
        inPoint: 62,
        outPoint: 63,
        type: "native3d",
        asset: "mechanism",
        sourceStartFrame: 0,
        sourceFps: 30,
        materialOverrides: { paint: { color: "#fffffe" } },
      }),
    );
    await expect(
      native.prepareCompositionNative3DVersions(f.composition, f.transport),
    ).rejects.toMatchObject({ diagnostics: [{ code: "comp-native3d-limit" }] });
    expect(CompositionSchema.safeParse(f.composition).success).toBe(true);
  });
  it("folds no-op and duplicate override requests without charging extra live variants", async () => {
    const f = fixture();
    f.composition.layers = Array.from({ length: 10 }, (_, i) =>
      Native3DLayerVersionsSchema.parse({
        ...f.composition.layers[1],
        id: `copy${i}`,
        inPoint: i,
        outPoint: i + 1,
        materialOverrides: { paint: { color: "#123456" } },
      }),
    );
    const catalogue = await native.prepareCompositionNative3DVersions(
      f.composition,
      f.transport,
    );
    expect(CompositionSchema.safeParse(f.composition).success).toBe(true);
    expect(Object.keys(catalogue.mechanism!.variants)).toHaveLength(1);
    for (const limit of [0, 65, 0.5, NaN])
      await expect(
        native.prepareNative3DSceneV2(f.source, nativeFixtureHash, {
          variantLimit: limit,
        }),
      ).rejects.toThrow("between 1 and 64");
  });
  it("retains strict versioned transport dictionaries and rejects unknown versions or fields", async () => {
    const f = fixture();
    for (const patch of [
      { version: "composition-prepared-native3d-3" },
      { trusted: true },
    ]) {
      expect(
        CompositionPreparedNative3DVersionsSchema.safeParse({
          ...f.transport,
          ...patch,
        }).success,
      ).toBe(false);
      await expect(
        native.prepareCompositionNative3DVersions(f.composition, {
          ...f.transport,
          ...patch,
        }),
      ).rejects.toMatchObject({ diagnostics: [{ path: "preparedNative3D" }] });
    }
  });
});
