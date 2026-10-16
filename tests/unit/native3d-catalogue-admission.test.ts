import { prepareRenderResources } from "../../packages/renderer-core/src/managed-resources.ts";
import { mechanismV2Fixture } from "../helpers/mechanism-v2-fixture.ts";
import { nativePbrSceneFixture } from "../helpers/native-pbr-scene-fixture.ts";
import { expect, it, vi } from "vitest";
import {
  CompositionSchema,
  CompositionPreparedNative3DVersionsSchema,
} from "@still-shift/scene-contract";
import { prepareCompositionNative3DVersions } from "../../packages/renderer-core/src/native3d/prepare.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import {
  nativeSolidFixture,
  nativeFixtureHash,
} from "../helpers/native3d-fixture.ts";

function fixture(
  format:
    | "solid-scene-1"
    | "mechanism-scene-2"
    | "mechanism-scene-3" = "solid-scene-1",
) {
  const source =
    format === "mechanism-scene-2"
      ? mechanismV2Fixture()
      : format === "mechanism-scene-3"
        ? nativePbrSceneFixture()
        : nativeSolidFixture();
  const composition = CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "catalogue-admission",
    width: 32,
    height: 32,
    fps: 30,
    frameCount: 1,
    assets: [
      {
        id: "solid",
        type: "native3d",
        path: "solid.json",
        sha256: nativeFixtureHash,
        format,
      },
    ],
    layers: [
      {
        id: "native",
        type: "native3d",
        asset: "solid",
        sourceStartFrame: 0,
        sourceFps: 30,
        inPoint: 0,
        outPoint: 1,
      },
    ],
  });
  return {
    composition,
    transport: {
      version:
        format === "mechanism-scene-3"
          ? "composition-prepared-native3d-3"
          : format === "mechanism-scene-2"
            ? "composition-prepared-native3d-2"
            : "composition-prepared-native3d-1",
      assets: {
        solid: {
          sourceSha256: nativeFixtureHash,
          source,
          ...(format === "mechanism-scene-3" ? { binaryResources: [] } : {}),
        },
      },
    },
  };
}

it("rejects catalogue payload before schema clones while preserving a foreign lease", async () => {
  const { composition, transport } = fixture();
  const memory = new ManagedMemory({ pixels: 1, metadata: 128 * 1024 ** 2 });
  const foreign = memory.reserve("metadata", 1024);
  const parse = vi.spyOn(
    CompositionPreparedNative3DVersionsSchema,
    "safeParse",
  );
  try {
    await withManagedMemory(memory, async () => {
      await expect(
        prepareCompositionNative3DVersions(composition, transport),
      ).rejects.toThrow(/quota/);
      expect(parse).not.toHaveBeenCalled();
      expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1024 });
      expect(foreign.active).toBe(true);
    });
  } finally {
    parse.mockRestore();
    memory.dispose();
  }
});

it("rejects metadata pressure before parsing and leaves unrelated capacity intact", async () => {
  const { composition, transport } = fixture();
  const memory = new ManagedMemory({
    pixels: 64 * 1024 ** 2,
    metadata: 65536 + 2048,
  });
  const foreign = memory.reserve("metadata", 1024);
  const parse = vi.spyOn(
    CompositionPreparedNative3DVersionsSchema,
    "safeParse",
  );
  try {
    await withManagedMemory(memory, async () => {
      await expect(
        prepareCompositionNative3DVersions(composition, transport),
      ).rejects.toThrow(/quota/);
      expect(parse).not.toHaveBeenCalled();
      expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1024 });
      expect(foreign.active).toBe(true);
    });
  } finally {
    parse.mockRestore();
    memory.dispose();
  }
});

for (const format of [
  "solid-scene-1",
  "mechanism-scene-2",
  "mechanism-scene-3",
] as const) {
  it(`retains admitted ${format} catalogue storage with exact unmanaged output`, async () => {
    const { composition, transport } = fixture(format);
    const expected = await prepareCompositionNative3DVersions(
      composition,
      transport,
    );
    const memory = new ManagedMemory({
      pixels: 256 * 1024 ** 2,
      metadata: 16 * 1024 ** 2,
    });
    const foreign = memory.reserve("metadata", 1024);
    try {
      await withManagedMemory(memory, async () => {
        const result = await prepareCompositionNative3DVersions(
          composition,
          transport,
        );
        expect(result).toEqual(expected);
        expect(memory.statistics.current.pixels).toBeGreaterThan(0);
        expect(memory.statistics.current.metadata).toBeGreaterThan(1024);
        expect(foreign.active).toBe(true);
      });
    } finally {
      memory.dispose();
    }
    expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
    expect(memory.statistics.reservations).toBe(0);
  });
}

it("retires only failed catalogue copies after a real geometry-identity rejection", async () => {
  const { composition, transport } = fixture();
  transport.assets.solid.source.geometrySha256 = "sha256:" + "0".repeat(64);
  const memory = new ManagedMemory({
    pixels: 64 * 1024 ** 2,
    metadata: 16 * 1024 ** 2,
  });
  const foreign = memory.reserve("metadata", 1024);
  try {
    await withManagedMemory(memory, async () => {
      await expect(
        prepareCompositionNative3DVersions(composition, transport),
      ).rejects.toThrow(/geometry differs/);
      expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1024 });
      expect(foreign.active).toBe(true);
    });
  } finally {
    memory.dispose();
  }
});

it("rejects source accessors without invoking them or reaching a schema clone", async () => {
  const { composition, transport } = fixture();
  const mesh = transport.assets.solid.source.geometry.meshes[0]!;
  let reads = 0;
  Object.defineProperty(mesh.positions, "0", {
    enumerable: true,
    get() {
      reads++;
      return 0;
    },
  });
  const memory = new ManagedMemory({
    pixels: 64 * 1024 ** 2,
    metadata: 16 * 1024 ** 2,
  });
  const parse = vi.spyOn(
    CompositionPreparedNative3DVersionsSchema,
    "safeParse",
  );
  try {
    await withManagedMemory(memory, async () => {
      await expect(
        prepareCompositionNative3DVersions(composition, transport),
      ).rejects.toThrow(/accessors/);
      expect(reads).toBe(0);
      expect(parse).not.toHaveBeenCalled();
      expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
    });
  } finally {
    parse.mockRestore();
    memory.dispose();
  }
});

it("rejects cyclic transport before parsing and retires the scanner", async () => {
  const { composition, transport } = fixture();
  const cyclic = { ...transport, cycle: {} as object };
  cyclic.cycle = cyclic;
  const memory = new ManagedMemory({
    pixels: 64 * 1024 ** 2,
    metadata: 16 * 1024 ** 2,
  });
  try {
    await withManagedMemory(memory, async () => {
      await expect(
        prepareCompositionNative3DVersions(composition, cyclic),
      ).rejects.toThrow(/cyclic/);
      expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
    });
  } finally {
    memory.dispose();
  }
});

it("rolls a successful catalogue back when a later resource in the same load fails", async () => {
  const { composition, transport } = fixture();
  const memory = new ManagedMemory({
    pixels: 64 * 1024 ** 2,
    metadata: 16 * 1024 ** 2,
  });
  const foreign = memory.reserve("metadata", 1024);
  const failure = Error("later font/resource failure");
  try {
    await withManagedMemory(memory, async () => {
      await expect(
        prepareRenderResources(async () => {
          await prepareCompositionNative3DVersions(composition, transport);
          expect(memory.statistics.current.pixels).toBeGreaterThan(0);
          throw failure;
        }),
      ).rejects.toBe(failure);
      expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 1024 });
      expect(memory.statistics.reservations).toBe(1);
      expect(foreign.active).toBe(true);
    });
  } finally {
    memory.dispose();
  }
});

it("commits successful catalogue resource preparation so a later frame scratch cannot retire it", async () => {
  const { composition, transport } = fixture();
  const memory = new ManagedMemory({
    pixels: 64 * 1024 ** 2,
    metadata: 16 * 1024 ** 2,
  });
  try {
    await withManagedMemory(memory, async () => {
      const result = await prepareRenderResources(() =>
        prepareCompositionNative3DVersions(composition, transport),
      );
      const retained = memory.statistics.current;
      expect(retained.pixels).toBeGreaterThan(0);
      memory.beginScratch();
      memory.reserve("metadata", 128);
      memory.endScratch();
      expect(memory.statistics.current).toEqual(retained);
      expect(Object.keys(result)).toEqual(["solid"]);
    });
  } finally {
    memory.dispose();
  }
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
});
