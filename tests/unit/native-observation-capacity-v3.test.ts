import { describe, expect, it } from "vitest";
import {
  CompositionSchema,
  CompositionPreparedNative3DVersionsSchema,
  type MechanismSceneV3,
} from "@still-shift/scene-contract";
import { prepareCompositionNative3DVersions } from "../../packages/renderer-core/src/native3d/prepare.ts";
import { nativeCompositionObservationCapacityV2 } from "../../packages/renderer-core/src/native3d/observation-capacity-v2.ts";
import { nativeCompositionObservationCapacityV3 } from "../../packages/renderer-core/src/native3d/observation-capacity-v3.ts";
import { compositionNativePasses } from "../../packages/renderer-core/src/composition/render/graphs.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { gltfJsonHash } from "../../packages/animation-engine/src/mechanism/gltf-identity.ts";
import { gltfBytesHash } from "../../packages/animation-engine/src/mechanism/gltf-resources.ts";
import { nativePbrSceneFixture } from "../helpers/native-pbr-scene-fixture.ts";
import { nativeSolidFixture } from "../helpers/native3d-fixture.ts";
import { mechanismV2Fixture } from "../helpers/mechanism-v2-fixture.ts";
import { MechanismSceneV3Schema } from "@still-shift/scene-contract";

async function fixture(
  source: MechanismSceneV3 = MechanismSceneV3Schema.parse(
    nativePbrSceneFixture(),
  ),
  mixed = false,
) {
  const sources = {
    pbr: source,
    ...(mixed
      ? { solid: nativeSolidFixture(), shape: mechanismV2Fixture() }
      : {}),
  };
  const composition = CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "capacity-admission",
    width: 320,
    height: 180,
    fps: 30,
    frameCount: 11,
    assets: Object.entries(sources).map(([id, source]) => ({
      id,
      type: "native3d",
      path: id + ".json",
      format: source.schemaVersion,
      sha256: gltfJsonHash(source),
    })),
    precomps: Object.keys(sources)
      .filter((asset) => asset !== "pbr")
      .map((asset) => ({
        id: asset + "-scope",
        width: 320,
        height: 180,
        frameCount: 11,
        layers: [
          {
            id: asset + "-controller",
            type: "native3d",
            asset,
            sourceStartFrame: 0,
            sourceFps: 30,
          },
        ],
      })),
    layers: [
      {
        id: "pbr-world",
        type: "native3d",
        asset: "pbr",
        sourceStartFrame: 0,
        sourceFps: 30,
      },
      ...Object.keys(sources)
        .filter((asset) => asset !== "pbr")
        .map((asset) => ({
          id: asset + "-world",
          type: "precomp",
          comp: asset + "-scope",
        })),
    ],
  });
  const transport = CompositionPreparedNative3DVersionsSchema.parse({
    version: "composition-prepared-native3d-3",
    assets: Object.fromEntries(
      Object.entries(sources).map(([id, source]) => [
        id,
        {
          source,
          sourceSha256: gltfJsonHash(source),
          binaryResources:
            source.schemaVersion === "mechanism-scene-3"
              ? source.resources.map((resource) => ({
                  image: resource.image,
                  asset: "native-pbr/" + resource.sha256.slice(7),
                  bytes: resource.bytes,
                  sha256: resource.sha256,
                }))
              : [],
        },
      ]),
    ),
  });
  const catalogue = await prepareCompositionNative3DVersions(
    composition,
    transport,
  );
  return { composition, options: { preparedNative3D: catalogue } };
}
function textured(width: number, height: number, groups = 1) {
  const source = MechanismSceneV3Schema.parse(nativePbrSceneFixture());
  const pixels = new Uint8Array(width * height * 4).fill(128),
    sha256 = gltfBytesHash(pixels);
  source.geometry.images = [
    {
      id: "image",
      sourceSha256: sha256,
      pixelSha256: sha256,
      width,
      height,
      encoding: "rgba8-straight-top-left-1",
    },
  ];
  source.resources = [
    { image: "image", path: "surface.rgba", bytes: pixels.length, sha256 },
  ];
  const material = source.geometry.materials[0]!;
  material.baseColorTexture = {
    image: "image",
    texCoord: 0,
    colorSpace: "srgb",
    sampler: { magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 },
  };
  for (const mesh of source.geometry.meshes) {
    mesh.uvs = Array.from(
      { length: (mesh.positions.length / 3) * 2 },
      (_, index) => index % 2,
    );
    const indices = mesh.indices;
    mesh.indices = Array.from({ length: groups }, () => indices).flat();
    mesh.groups = Array.from({ length: groups }, (_, index) => ({
      start: index * indices.length,
      count: indices.length,
      materialIndex: 0,
    }));
  }
  source.geometrySha256 = gltfJsonHash(source.geometry);
  return MechanismSceneV3Schema.parse(source);
}

describe("conservative incremental output3 capacity admission", () => {
  it("sizes source3 and mixed source1/source2/source3 passes while the output2 API remains strict", async () => {
    const single = await fixture(),
      mixed = await fixture(undefined, true);
    const capacity = nativeCompositionObservationCapacityV3(
      single.composition,
      5,
      single.options,
    );
    expect(capacity).toBeGreaterThan(256);
    expect(capacity).toBeLessThan(1048576);
    expect(
      nativeCompositionObservationCapacityV3(
        mixed.composition,
        5,
        mixed.options,
      ),
    ).toBeGreaterThan(capacity);
    expect(() =>
      nativeCompositionObservationCapacityV2(
        single.composition,
        5,
        single.options,
      ),
    ).toThrow("protocols differ");
    const legacy = structuredClone(mixed.composition);
    legacy.assets = legacy.assets.filter((asset) => asset.id !== "pbr");
    legacy.layers = legacy.layers.filter((layer) => layer.id !== "pbr-world");
    expect(
      nativeCompositionObservationCapacityV3(legacy, 5, mixed.options),
    ).toBe(nativeCompositionObservationCapacityV2(legacy, 5, mixed.options));
  });
  it("counts used mip inventory and each material group, and ignores unbound images", async () => {
    const small = await fixture(textured(1, 1)),
      larger = await fixture(textured(4, 2)),
      grouped = await fixture(textured(4, 2, 3));
    const size = (f: Awaited<ReturnType<typeof fixture>>) =>
      nativeCompositionObservationCapacityV3(f.composition, 0, f.options);
    expect(size(larger)).toBeGreaterThan(size(small));
    expect(size(grouped)).toBeGreaterThan(size(larger));
    const unused = textured(4, 2);
    delete unused.geometry.materials[0]!.baseColorTexture;
    unused.geometrySha256 = gltfJsonHash(unused.geometry);
    const unbound = await fixture(unused),
      plain = await fixture();
    // Both fixtures already have UV streams; unbound images add no receipt fields.
    expect(size(unbound)).toBeLessThan(size(larger));
    expect(size(unbound)).toBe(size(plain));
  });
  it("rejects an oversize multi-group mip pass before collection and enforces pass admission across exposures", async () => {
    const f = await fixture(textured(4096, 1, 32));
    const repeated = structuredClone(f.composition);
    repeated.precomps = [
      {
        id: "pbr-scope",
        width: 320,
        height: 180,
        frameCount: 11,
        layers: [repeated.layers[0]!],
      },
    ];
    repeated.layers = Array.from({ length: 8 }, (_, index) => ({
      id: "pbr-instance-" + index,
      type: "precomp" as const,
      comp: "pbr-scope",
    }));
    expect([...compositionNativePasses(repeated, 0, f.options)]).toHaveLength(
      8,
    );
    expect(() =>
      nativeCompositionObservationCapacityV3(repeated, 0, f.options),
    ).toThrow("byte admission");
    const plain = await fixture();
    const many = structuredClone(plain.composition);
    many.precomps = [
      {
        id: "plain-scope",
        width: 320,
        height: 180,
        frameCount: 11,
        layers: [many.layers[0]!],
      },
    ];
    many.layers = Array.from({ length: 65 }, (_, index) => ({
      id: "world-instance-" + index,
      type: "precomp" as const,
      comp: "plain-scope",
    }));
    expect([...compositionNativePasses(many, 0, plain.options)]).toHaveLength(
      65,
    );
    expect(() =>
      nativeCompositionObservationCapacityV3(many, 0, plain.options),
    ).toThrow("pass admission");
    const exposure = structuredClone(plain.composition);
    exposure.layers[0]!.motionBlur = true;
    exposure.motionBlur = {
      enabled: true,
      samples: 8,
      shutterAngle: 360,
      shutterPhase: 0,
    };
    expect(
      nativeCompositionObservationCapacityV3(exposure, 5, plain.options),
    ).toBeGreaterThan(
      nativeCompositionObservationCapacityV3(
        plain.composition,
        5,
        plain.options,
      ),
    );
  });
  it("owns sizing scratch before graph evaluation and releases it on success or rejection", async () => {
    const f = await fixture(),
      memory = new ManagedMemory({ pixels: 1, metadata: 9000000 });
    try {
      await withManagedMemory(memory, async () => {
        nativeCompositionObservationCapacityV3(f.composition, 0, f.options);
        expect(memory.statistics.current.metadata).toBe(0);
        expect(memory.statistics.reservations).toBe(0);
        expect(() =>
          nativeCompositionObservationCapacityV2(f.composition, 0, f.options),
        ).toThrow();
        expect(memory.statistics.current.metadata).toBe(0);
        expect(memory.statistics.reservations).toBe(0);
      });
    } finally {
      memory.dispose();
    }
    const insufficient = new ManagedMemory({ pixels: 1, metadata: 200000 });
    let sampled = false;
    try {
      await withManagedMemory(insufficient, async () => {
        expect(() =>
          nativeCompositionObservationCapacityV3(f.composition, 0, {
            get preparedNative3D() {
              sampled = true;
              return f.options.preparedNative3D;
            },
          }),
        ).toThrow();
        expect(sampled).toBe(false);
        expect(insufficient.statistics.current.metadata).toBe(0);
        expect(insufficient.statistics.reservations).toBe(0);
      });
    } finally {
      insufficient.dispose();
    }
  });
});
