import { describe, expect, it } from "vitest";
import {
  NativeObservedFrameSchema,
  NativeObservedFrameV2Schema,
  NativeObservedFrameV3Schema,
  NativeObservedOutputFrameSchema,
  NativeObservedOutputFrameV2Schema,
  NativeObservedOutputFrameV3Schema,
  NATIVE3D_FRAME_FINALIZER_VERSION,
  NATIVE3D_SHAPE_PRECISION_POLICY,
  NATIVE3D_PBR_FRAME_FINALIZER_VERSION,
  NATIVE3D_PBR_PRECISION_POLICY,
  NATIVE3D_USED_STREAM_VERSION,
  type NativeObservedFrameV3,
} from "@still-shift/scene-contract";
import { createNativeObservationCollectorV2 } from "../../packages/renderer-core/src/native3d/observations-v2.ts";
import { createNativeObservationCollectorV3 } from "../../packages/renderer-core/src/native3d/observations-v3.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";

const digest = "sha256:" + "a".repeat(64);
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
// Synthetic protocol/lifecycle fixtures, without a GPU draw or export claim.
const common = {
  controller: "world",
  scope: "synthetic",
  scopeFrame: 0.5,
  sourceFrame: 0.5,
  sourceSha256: digest,
  effectiveSceneSha256: digest,
  geometrySha256: digest,
  appearanceCodeSha256: digest,
  viewport: [0, 0, 320, 180],
  camera: {
    worldMatrix: identity,
    viewMatrix: identity,
    projectionMatrix: identity,
    near: 0.1,
    far: 100,
    aspect: 320 / 180,
    fovDegrees: 40,
  },
  parts: {
    root: {
      localMatrix: identity,
      worldMatrix: identity,
      localVisible: true,
      inheritedVisible: true,
    },
  },
  anchors: {},
  pass: { completed: true, calls: 0, triangles: 0 },
};
const source1 = () =>
  NativeObservedFrameSchema.parse({
    ...common,
    version: "native3d-observed-frame-1",
    frameKey: "synthetic-frame",
  });
const source2 = () =>
  NativeObservedFrameV2Schema.parse({
    ...common,
    version: "native3d-observed-frame-2",
    sourceVersion: "mechanism-scene-2",
    sourceKey: `native3d-source-1:${digest.slice(7)}:${digest.slice(7)}`,
    frameKeySha256: digest,
    usedStreamVersion: NATIVE3D_USED_STREAM_VERSION,
    digestPacking: "float32-uint16-little-endian-1",
    finalizerVersion: NATIVE3D_FRAME_FINALIZER_VERSION,
    precisionPolicy: NATIVE3D_SHAPE_PRECISION_POLICY,
    shapes: {},
  });
const source3 = () =>
  NativeObservedFrameV3Schema.parse({
    ...common,
    version: "native3d-observed-frame-3",
    sourceVersion: "mechanism-scene-3",
    sourceKey: `native3d-source-3:${digest.slice(7)}:${digest.slice(7)}`,
    frameKeySha256: digest,
    finalizerVersion: NATIVE3D_PBR_FRAME_FINALIZER_VERSION,
    precisionPolicy: NATIVE3D_PBR_PRECISION_POLICY,
    meshes: {},
  });
const packet = (passes: unknown[]) => ({
  version: "native3d-observed-output-frame-3",
  outputFrame: 0,
  executionSha256: digest,
  passes,
});

describe("explicit mixed-native output3 collector admission", () => {
  it("retains invocation order across reversed mixed-source completion and freezes parsed results", async () => {
    const collector = createNativeObservationCollectorV3();
    let resolveFirst!: (value: NativeObservedFrameV3) => void;
    const original = source3();
    try {
      collector.begin();
      collector.observe(
        new Promise<NativeObservedFrameV3>((resolve) => {
          resolveFirst = resolve;
        }),
        0.25,
      );
      collector.observe(source1(), 0.5);
      collector.observe(Promise.resolve(source2()), 0.75);
      const completing = collector.finish();
      resolveFirst(original);
      const passes = await completing;
      expect(
        passes.map((pass) => [
          pass.sampleIndex,
          pass.sampleFrame,
          pass.observed.version,
        ]),
      ).toEqual([
        [0, 0.25, "native3d-observed-frame-3"],
        [1, 0.5, "native3d-observed-frame-1"],
        [2, 0.75, "native3d-observed-frame-2"],
      ]);
      expect(
        NativeObservedOutputFrameV3Schema.safeParse(packet([...passes]))
          .success,
      ).toBe(true);
      expect(Object.isFrozen(passes)).toBe(true);
      expect(Object.isFrozen(passes[0]!.observed.parts.root!.worldMatrix)).toBe(
        true,
      );
      // The matrix validator retains validated arrays; collection seals those
      // borrowed arrays while parsing private object fields, as output2 does.
      expect(() => {
        Object.defineProperty(original.parts.root!.worldMatrix, "12", {
          value: 99,
        });
      }).toThrow(TypeError);
      original.controller = "changed-input-object";
      expect(passes[0]!.observed.controller).toBe("world");
      expect(passes[0]!.observed.parts.root!.worldMatrix[12]).toBe(0);
    } finally {
      collector.dispose();
    }
  });

  it("keeps output1/output2 and collector2 rejection boundaries, and rejects discontinuous or extra output3 fields", async () => {
    const pass = { sampleIndex: 0, sampleFrame: 0.5, observed: source3() };
    const value = packet([pass]);
    for (const [schema, version] of [
      [NativeObservedOutputFrameSchema, "native3d-observed-output-frame-1"],
      [NativeObservedOutputFrameV2Schema, "native3d-observed-output-frame-2"],
    ] as const)
      expect(schema.safeParse({ ...value, version }).success).toBe(false);
    for (const changed of [
      { ...value, extra: true },
      packet([{ ...pass, sampleIndex: 1 }]),
      packet([{ ...pass, sampleFrame: NaN }]),
      packet([{ ...pass, extra: true }]),
      packet([{ ...pass, observed: { ...pass.observed, frameKey: "legacy" } }]),
    ])
      expect(NativeObservedOutputFrameV3Schema.safeParse(changed).success).toBe(
        false,
      );
    const previous = createNativeObservationCollectorV2();
    try {
      previous.begin();
      previous.observe(pass.observed as never, 0.5);
      await expect(previous.finish()).rejects.toThrow("invalid measurements");
    } finally {
      previous.dispose();
    }
  });

  it("enforces the exact encoded-byte admission and the original 64-pass and 1MiB limits", async () => {
    const collector = createNativeObservationCollectorV3(),
      observed = source3();
    const sample = { sampleIndex: 0, sampleFrame: 0.5, observed };
    const capacity =
      256 + new TextEncoder().encode(JSON.stringify(sample)).byteLength + 1;
    try {
      collector.begin(capacity - 1);
      collector.observe(observed, 0.5);
      await expect(collector.finish()).rejects.toThrow("admitted capacity");
      collector.begin(capacity);
      collector.observe(observed, 0.5);
      expect(await collector.finish()).toHaveLength(1);
      collector.begin();
      const passes = Array.from({ length: 64 }, (_, sampleIndex) => ({
        ...sample,
        sampleIndex,
      }));
      for (const pass of passes) collector.observe(observed, pass.sampleFrame);
      expect(() => collector.observe(observed, 1)).toThrow("pass");
      expect(
        NativeObservedOutputFrameV3Schema.safeParse(packet(passes)).success,
      ).toBe(true);
      expect(
        NativeObservedOutputFrameV3Schema.safeParse(
          packet([...passes, { ...sample, sampleIndex: 64 }]),
        ).success,
      ).toBe(false);
      collector.abort();
      for (const bound of [0, -1, NaN, Infinity, 1048577])
        expect(() => collector.begin(bound)).toThrow("capacity");
      collector.begin(1048576);
      for (const frame of [-1, NaN, Infinity, 108001])
        expect(() => collector.observe(observed, frame)).toThrow();
    } finally {
      collector.dispose();
    }
  });

  it("preserves first assigned rejection and invalidates pending completion on abort, restart or disposal", async () => {
    const collector = createNativeObservationCollectorV3();
    try {
      collector.begin();
      collector.observe(Promise.reject(Error("first assigned")), 0);
      collector.observe(Promise.reject(Error("later assigned")), 0.5);
      await expect(collector.finish()).rejects.toThrow("first assigned");
      for (const action of [
        () => collector.abort(),
        () => collector.begin(),
        () => collector.dispose(),
      ]) {
        collector.begin();
        let resolve!: (value: NativeObservedFrameV3) => void;
        collector.observe(
          new Promise<NativeObservedFrameV3>((done) => {
            resolve = done;
          }),
          0,
        );
        const pending = collector.finish();
        action();
        resolve(source3());
        await expect(pending).rejects.toThrow("aborted or disposed");
      }
      expect(() => collector.begin()).toThrow("disposed");
      await expect(collector.finish()).rejects.toThrow("No active");
    } finally {
      collector.dispose();
    }
  });

  it("reserves metadata before collection and releases owners after capacity failure, restart and disposal", async () => {
    const memory = new ManagedMemory({ pixels: 1, metadata: 9000000 });
    try {
      await withManagedMemory(memory, async () => {
        const collector = createNativeObservationCollectorV3();
        try {
          collector.begin();
          expect(memory.statistics.current.metadata).toBe(1048576 * 8 + 262144);
          collector.observe(source3(), 0);
          await collector.finish();
          collector.begin(300);
          expect(memory.statistics.current.metadata).toBe(300 * 8 + 262144);
          collector.observe(source3(), 0);
          await expect(collector.finish()).rejects.toThrow("admitted capacity");
          collector.abort();
          expect(memory.statistics.current.metadata).toBe(0);
          collector.begin();
        } finally {
          collector.dispose();
        }
        expect(memory.statistics.current.metadata).toBe(0);
        expect(memory.statistics.reservations).toBe(0);
      });
    } finally {
      memory.dispose();
    }
    const insufficient = new ManagedMemory({ pixels: 1, metadata: 200000 });
    try {
      await withManagedMemory(insufficient, async () => {
        const collector = createNativeObservationCollectorV3();
        try {
          expect(() => collector.begin()).toThrow();
          await expect(collector.finish()).rejects.toThrow("No active");
        } finally {
          collector.dispose();
        }
        expect(insufficient.statistics.current.metadata).toBe(0);
        expect(insufficient.statistics.reservations).toBe(0);
      });
    } finally {
      insufficient.dispose();
    }
  });
});
