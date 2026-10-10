import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  NativeObservationSink,
  nativeObservationOwner,
  verifyNativeObservationClosure,
  type NativeObservationExecutionBinding,
  type NativeObservationExpectedPass,
} from "../../packages/execution-runtime/src/native-observation-sink.ts";
import type {
  NativeObservedOutputFrame,
  NativeObservedFrame,
} from "../../packages/scene-contract/src/native3d/observation.ts";

const sha = `sha256:${"a".repeat(64)}`;
const execution: NativeObservationExecutionBinding = {
  version: "native-observation-execution-1",
  compositionSourceSha256: sha,
  compositionSha256: sha,
  preparedNativeSha256: sha,
  appearanceCodeSha256: sha,
  backend: "webgl2",
  profile: "native-three-aces-hdr-msaa4-1",
  sources: [],
  appearanceCodeIdentity: {
    runtimeFormat: "source-ts",
    modules: [{ name: "renderer.ts", sha256: sha }],
    threeRuntime: {
      version: "0.186.0",
      sources: [{ name: "three.module.js", sha256: sha }],
    },
  },
};
const matrix = (x = 0): NativeObservedFrame["camera"]["worldMatrix"] => [
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  x,
  0,
  0,
  1,
];
function expected(frame: number): NativeObservationExpectedPass[] {
  return [
    {
      frameKey: `frame-${frame}`,
      controller: "world",
      scope: "root",
      scopeFrame: frame,
      sourceFrame: frame,
      sampleFrame: frame,
      sourceSha256: sha,
      effectiveSceneSha256: sha,
      geometrySha256: sha,
      appearanceCodeSha256: sha,
      viewport: [0, 0, 16, 16],
      parts: { root: {}, child: { parent: "root" } },
      anchors: { face: { part: "child" } },
    },
  ];
}
function packet(
  sink: NativeObservationSink,
  frame = 0,
): NativeObservedOutputFrame {
  const { sampleFrame, ...identity } = expected(frame)[0]!;
  return {
    version: "native3d-observed-output-frame-1",
    outputFrame: frame,
    executionSha256: sink.executionSha256,
    passes: [
      {
        sampleIndex: 0,
        sampleFrame,
        observed: {
          version: "native3d-observed-frame-1",
          ...identity,
          camera: {
            worldMatrix: matrix(),
            viewMatrix: matrix(),
            projectionMatrix: matrix(),
            near: 0.1,
            far: 100,
            aspect: 1,
            fovDegrees: 60,
          },
          parts: {
            root: {
              localMatrix: matrix(),
              worldMatrix: matrix(),
              localVisible: true,
              inheritedVisible: true,
            },
            child: {
              parent: "root",
              localMatrix: matrix(),
              worldMatrix: matrix(2),
              localVisible: true,
              inheritedVisible: true,
            },
          },
          anchors: {
            face: {
              part: "child",
              world: [2, 0, 0],
              pixel: [12, 8],
              depth: 0.5,
              visibility: "visible",
              visibilityMethod: "three-physical-mesh-segment",
            },
          },
          pass: { completed: true, calls: 1, triangles: 1 },
        },
      },
    ],
  };
}
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0))
    await rm(path, { recursive: true, force: true });
});
async function fixture(frames = 2) {
  const directory = await mkdtemp(join(tmpdir(), "native-observations-"));
  directories.push(directory);
  let retained = 0;
  const sink = new NativeObservationSink({
    outputPath: join(directory, "output.mp4"),
    exportId: "owned",
    frameCount: frames,
    maximumPacketBytes: 16384,
    execution,
    expectedPasses: expected,
    reserve: (bytes) => {
      retained += bytes;
      let released = false;
      return {
        release() {
          if (released) throw Error("double release");
          released = true;
          retained -= bytes;
        },
      };
    },
  });
  return { sink, directory, retained: () => retained };
}
describe("accepted native pixel/observation closure", () => {
  it("pairs complete accepted bodies, streams exact coverage, and preserves measured matrices", async () => {
    const { sink, retained } = await fixture();
    for (let frame = 0; frame < 2; frame++) {
      sink.acceptPacket(0, encode(packet(sink, frame)));
      expect(retained()).toBeGreaterThan(0);
      const pixels = Buffer.alloc(16 * 16 * 4, frame);
      await sink.commitPixel(0, frame, {
        transport: "raw_rgba",
        byteLength: pixels.length,
        transportBytesSha256: `sha256:${createHash("sha256").update(pixels).digest("hex")}`,
      });
      expect(retained()).toBe(0);
    }
    const output = {
      sha256: sha,
      frameCount: 2,
      width: 16,
      height: 16,
      transport: "raw_rgba" as const,
    };
    const closure = await sink.finalize(
      { outputFrames: 2, passCount: 2 },
      output,
    );
    const staged = new Map(
      sink.publications.map((entry) => [
        basename(entry.destination),
        entry.staged,
      ]),
    );
    const observed: number[] = [];
    const checked = await verifyNativeObservationClosure({
      closure: {
        ...closure,
        manifestPath: staged.get(basename(closure.manifestPath))!,
      },
      execution,
      expectedPasses: expected,
      output,
      resolveArtifactPath: (name) => staged.get(name)!,
      onFrame: (frame) => {
        observed.push(frame.passes[0]!.observed.parts.child!.worldMatrix[12]!);
      },
    });
    expect(checked.outputFrames).toBe(2);
    expect(checked.passCount).toBe(2);
    expect(observed).toEqual([2, 2]);
    await appendFile(staged.get(checked.artifacts[0]!.path)!, "\n");
    await expect(
      verifyNativeObservationClosure({
        closure: {
          ...closure,
          manifestPath: staged.get(basename(closure.manifestPath))!,
        },
        execution,
        expectedPasses: expected,
        output,
        resolveArtifactPath: (name) => staged.get(name)!,
      }),
    ).rejects.toThrow();
    await sink.dispose();
  });
  it("rejects duplicated packets and returns its sole pending reservation exactly once", async () => {
    const { sink, retained, directory } = await fixture(1);
    sink.acceptPacket(0, encode(packet(sink)));
    expect(() => sink.acceptPacket(0, encode(packet(sink)))).toThrow(
      /Duplicate/,
    );
    expect(retained()).toBe(0);
    await expect(
      sink.finalize(
        { outputFrames: 1, passCount: 1 },
        {
          sha256: sha,
          frameCount: 1,
          width: 16,
          height: 16,
          transport: "raw_rgba",
        },
      ),
    ).rejects.toThrow();
    await sink.dispose();
    expect(await readdir(directory)).toEqual([]);
  });
  it("rejects output omissions and changed physical references before durable writes", async () => {
    for (const alter of [
      (value: NativeObservedOutputFrame) => {
        value.outputFrame = 1;
      },
      (value: NativeObservedOutputFrame) => {
        value.passes[0]!.sampleFrame = 0.5;
      },
      (value: NativeObservedOutputFrame) => {
        value.passes[0]!.observed.anchors.face!.part = "root";
      },
      (value: NativeObservedOutputFrame) => {
        value.passes[0]!.observed.geometrySha256 = `sha256:${"b".repeat(64)}`;
      },
    ]) {
      const { sink, retained, directory } = await fixture(1),
        value = packet(sink);
      alter(value);
      expect(() => sink.acceptPacket(0, encode(value))).toThrow();
      expect(retained()).toBe(0);
      await sink.dispose();
      expect(await readdir(directory)).toEqual([]);
    }
  });
  it("retains no published artifacts when pixels truncate, encoding fails or export cancels", async () => {
    for (const reason of [
      "truncated pixel body",
      "encoder failed",
      "export cancelled",
    ]) {
      const { sink, retained, directory } = await fixture(1);
      sink.acceptPacket(0, encode(packet(sink)));
      sink.fail(Error(reason));
      await sink.dispose();
      expect(retained()).toBe(0);
      expect(await readdir(directory)).toEqual([]);
    }
  });
  it("rejects unknown credentials without admitting a packet or poisoning its owner", async () => {
    const { sink } = await fixture(1);
    expect(
      nativeObservationOwner(
        {
          "x-export-id": "owned",
          "x-export-worker": "0",
          "x-export-credential": "foreign",
        },
        "owned",
        "secret",
      ),
    ).toBe(false);
    expect(
      nativeObservationOwner(
        {
          "x-export-id": "owned",
          "x-export-worker": "0",
          "x-export-credential": "secret",
        },
        "owned",
        "secret",
      ),
    ).toBe(true);
    sink.acceptPacket(0, encode(packet(sink)));
    sink.requirePacket(0, 0);
    await sink.dispose();
  });
});
