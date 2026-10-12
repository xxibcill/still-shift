import { createHash } from "node:crypto";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NativeObservationSinkV3,
  NativeObservationExecutionV3Schema,
  verifyNativeObservationClosureV3,
} from "../../packages/execution-runtime/src/export-worker.ts";
import { canonicalMechanismJson } from "../../packages/renderer-core/src/mechanism/canonical.ts";

const hash = (value: string | Uint8Array) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
const sha = `sha256:${"a".repeat(64)}`;
/** Contract-only binding; no GPU, real source, movie or product acceptance claim. */
const identity = {
  runtimeFormat: "source-ts",
  modules: [{ name: "renderer.ts", sha256: sha }],
  threeRuntime: {
    version: "0.186.0",
    sources: [{ name: "three.module.js", sha256: sha }],
  },
};
const execution = {
  version: "native-observation-execution-3",
  compositionSourceSha256: sha,
  compositionSha256: sha,
  preparedNativeSha256: sha,
  appearanceCodeSha256: hash(canonicalMechanismJson(identity)),
  appearanceCodeIdentity: identity,
  backend: "webgl2",
  profile: "native-three-aces-hdr-msaa4-1",
  sources: [
    {
      asset: "unused3",
      sourceVersion: "mechanism-scene-3",
      sourceKey: `native3d-source-3:${"a".repeat(64)}:${"a".repeat(64)}`,
      sourceSha256: sha,
      originalGeometrySha256: sha,
      effectiveSceneSha256: sha,
      geometrySha256: sha,
      meshDataSha256: sha,
    },
  ],
};
function create(
  outputPath: string,
  reserve: (bytes: number) => { release(): void },
  override: unknown = execution,
  signal?: AbortSignal,
): NativeObservationSinkV3 {
  return new NativeObservationSinkV3({
    outputPath,
    exportId: "contract-unit3",
    frameCount: 1,
    maximumPacketBytes: 4096,
    execution: NativeObservationExecutionV3Schema.parse(override),
    expectedPasses: () => [],
    reserve,
    signal,
  });
}
const packet = (
  sink: NativeObservationSinkV3,
  version = "native3d-observed-output-frame-3",
  outputFrame = 0,
) =>
  new TextEncoder().encode(
    JSON.stringify({
      version,
      outputFrame,
      executionSha256: sink.executionSha256,
      passes: [],
    }),
  );

describe("explicit version3 native journal boundary", () => {
  it("keeps declared unused source3 outputs version3 and awaits validation before pixels", async () => {
    const directory = await mkdtemp(
      "/private/tmp/still-shift-ms2-journal3-unit-",
    );
    let reserved = 0;
    const reserve = (bytes: number) => {
      reserved += bytes;
      let active = true;
      return {
        release() {
          if (active) {
            active = false;
            reserved -= bytes;
          }
        },
      };
    };
    const sink = create(join(directory, "empty.rgba"), reserve);
    try {
      const pending = sink.acceptPacket(0, packet(sink));
      expect(() => sink.requirePacket(0, 0)).toThrow("matching assigned");
      await pending;
      sink.requirePacket(0, 0);
      const pixels = Buffer.alloc(16 * 16 * 4);
      await sink.commitPixel(0, 0, {
        transport: "raw_rgba",
        byteLength: pixels.length,
        transportBytesSha256: hash(pixels),
      });
      const output = {
        sha256: hash(pixels),
        frameCount: 1,
        width: 16,
        height: 16,
        transport: "raw_rgba" as const,
      };
      const closure = await sink.finalize(
        { outputFrames: 1, passCount: 0 },
        output,
      );
      expect(closure.version).toBe("native-observation-closure-3");
      await writeFile(join(directory, "empty.rgba"), pixels);
      for (const value of sink.publications)
        await rename(value.staged, value.destination);
      const result = await verifyNativeObservationClosureV3({
        closure,
        execution: NativeObservationExecutionV3Schema.parse(execution),
        expectedPasses: () => [],
        output,
      });
      expect(result).toMatchObject({ outputFrames: 1, passCount: 0 });
    } finally {
      await sink.dispose();
      await rm(directory, { recursive: true, force: true });
    }
    expect(reserved).toBe(0);
  });
  it("rejects wrong workers, protocol downgrades and noncontiguous output frames", async () => {
    const directory = await mkdtemp(
      "/private/tmp/still-shift-ms2-journal3-negative-",
    );
    try {
      for (const [worker, version, frame] of [
        [1, "native3d-observed-output-frame-3", 0],
        [0, "native3d-observed-output-frame-1", 0],
        [0, "native3d-observed-output-frame-3", 1],
      ] as const) {
        const sink = create(
          join(directory, `bad-${worker}-${version}-${frame}.rgba`),
          () => ({ release() {} }),
        );
        try {
          await expect(
            sink.acceptPacket(worker, packet(sink, version, frame)),
          ).rejects.toThrow();
        } finally {
          await sink.dispose();
        }
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("rejects a version1 execution or a version3 execution without a declared source3", async () => {
    const directory = await mkdtemp(
      "/private/tmp/still-shift-ms2-journal3-binding-",
    );
    try {
      expect(() =>
        create(join(directory, "downgraded.rgba"), () => ({ release() {} }), {
          ...execution,
          version: "native-observation-execution-1",
        }),
      ).toThrow();
      expect(() =>
        create(join(directory, "wrong-source.rgba"), () => ({ release() {} }), {
          ...execution,
          sources: [],
        }),
      ).toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("version3 pending-proof lifecycle", () => {
  it.each(["dispose", "concurrent", "abort", "finalize"] as const)(
    "retires a pending packet after %s without publishing pixels",
    async (mode) => {
      const directory = await mkdtemp(
        "/private/tmp/still-shift-ms2-journal3-race-",
      );
      let reserved = 0;
      const controller = new AbortController();
      const sink = create(
        join(directory, "pending.rgba"),
        (bytes) => {
          reserved += bytes;
          let active = true;
          return {
            release() {
              if (active) {
                active = false;
                reserved -= bytes;
              }
            },
          };
        },
        execution,
        controller.signal,
      );
      try {
        const pending = sink.acceptPacket(0, packet(sink));
        const rejection = expect(pending).rejects.toThrow();
        if (mode === "dispose") await sink.dispose();
        else if (mode === "concurrent")
          await expect(sink.acceptPacket(0, packet(sink))).rejects.toThrow(
            "Concurrent",
          );
        else if (mode === "abort")
          controller.abort(Error("cancelled-journal3"));
        else
          await expect(
            sink.finalize(
              { outputFrames: 1, passCount: 0 },
              {
                sha256: sha,
                frameCount: 1,
                width: 16,
                height: 16,
                transport: "raw_rgba",
              },
            ),
          ).rejects.toThrow();
        await rejection;
        expect(() => sink.requirePacket(0, 0)).toThrow();
        expect(() => sink.publications).toThrow("not complete");
      } finally {
        await sink.dispose();
        await rm(directory, { recursive: true, force: true });
      }
      expect(reserved).toBe(0);
    },
  );
  it("rejects unbound appearance identities, duplicate variants and extra source fields", () => {
    expect(() =>
      NativeObservationExecutionV3Schema.parse({
        ...execution,
        appearanceCodeSha256: sha,
      }),
    ).toThrow();
    expect(() =>
      NativeObservationExecutionV3Schema.parse({
        ...execution,
        sources: [...execution.sources, ...execution.sources],
      }),
    ).toThrow();
    expect(() =>
      NativeObservationExecutionV3Schema.parse({
        ...execution,
        sources: [{ ...execution.sources[0], unbound: true }],
      }),
    ).toThrow();
  });
});

it("retires an admitted packet immediately when its signal aborts", async () => {
  const directory = await mkdtemp(
    "/private/tmp/still-shift-ms2-journal3-admitted-abort-",
  );
  const controller = new AbortController();
  let retained = 0;
  const sink = create(
    join(directory, "cancelled.rgba"),
    (bytes) => {
      retained += bytes;
      let active = true;
      return {
        release() {
          if (active) {
            active = false;
            retained -= bytes;
          }
        },
      };
    },
    execution,
    controller.signal,
  );
  try {
    await sink.acceptPacket(0, packet(sink));
    expect(retained).toBeGreaterThan(0);
    controller.abort(Error("cancelled-after-admission"));
    expect(() => sink.requirePacket(0, 0)).toThrow("cancelled-after-admission");
    expect(retained).toBe(0);
    await expect(
      sink.commitPixel(0, 0, {
        transport: "raw_rgba",
        byteLength: 1024,
        transportBytesSha256: sha,
      }),
    ).rejects.toThrow("cancelled-after-admission");
    expect(() => sink.publications).toThrow("not complete");
  } finally {
    await sink.dispose();
    await rm(directory, { recursive: true, force: true });
  }
  expect(retained).toBe(0);
});

describe("execution3 source and appearance admission", () => {
  it("rejects extra fields, duplicate variants, foreign appearance and source downgrades", () => {
    const source = execution.sources[0]!;
    for (const value of [
      { ...execution, injected: true },
      {
        ...execution,
        sources: [
          {
            ...source,
            sourceKey: source.sourceKey.replace("source-3:", "source-1:"),
          },
        ],
      },
      { ...execution, sources: [{ ...source, shapeAssociations: [] }] },
      { ...execution, sources: [source, source] },
      { ...execution, appearanceCodeSha256: sha },
      {
        ...execution,
        sources: [{ ...source, sourceVersion: "mechanism-scene-1" }],
      },
    ])
      expect(NativeObservationExecutionV3Schema.safeParse(value).success).toBe(
        false,
      );
  });
  it("keeps the original execution2 schema closed to source3", async () => {
    const { NativeObservationExecutionV2Schema } = await import(
      "../../packages/execution-runtime/src/native-observation-v2.ts"
    );
    expect(
      NativeObservationExecutionV2Schema.safeParse({
        ...execution,
        version: "native-observation-execution-2",
      }).success,
    ).toBe(false);
  });
});
