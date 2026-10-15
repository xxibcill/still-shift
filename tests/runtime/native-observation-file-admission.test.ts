import { createHash } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rename, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  NativeObservationSink,
  type NativeObservationExecutionBinding,
  verifyNativeObservationClosure,
} from "../../packages/execution-runtime/src/export-worker.ts";
import { canonicalMechanismJson } from "../../packages/renderer-core/src/mechanism/canonical.ts";

const hash = (bytes: Uint8Array | string) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
const sha = "sha256:" + "a".repeat(64);
const identity = {
  runtimeFormat: "source-ts" as const,
  modules: [{ name: "renderer.ts", sha256: sha }],
  threeRuntime: {
    version: "0.186.0" as const,
    sources: [{ name: "three.module.js", sha256: sha }],
  },
};
const execution: NativeObservationExecutionBinding = {
  version: "native-observation-execution-1",
  compositionSourceSha256: sha,
  compositionSha256: sha,
  preparedNativeSha256: sha,
  appearanceCodeSha256: hash(canonicalMechanismJson(identity)),
  appearanceCodeIdentity: identity,
  backend: "webgl2",
  profile: "native-three-aces-hdr-msaa4-1",
  sources: [],
};
const roots: string[] = [];
afterEach(async () => {
  for (const directory of roots.splice(0))
    await rm(directory, { force: true, recursive: true });
});
async function journal() {
  const directory = await mkdtemp("/private/tmp/native-journal-admission-");
  roots.push(directory);
  const sink = new NativeObservationSink({
    outputPath: join(directory, "empty.rgba"),
    exportId: "admission-regression",
    frameCount: 1,
    maximumPacketBytes: 4096,
    execution,
    expectedPasses: () => [],
    reserve: () => ({ release() {} }),
  });
  try {
    await sink.acceptPacket(
      0,
      new TextEncoder().encode(
        JSON.stringify({
          version: "native3d-observed-output-frame-1",
          outputFrame: 0,
          executionSha256: sink.executionSha256,
          passes: [],
        }),
      ),
    );
    const pixels = Buffer.alloc(1024);
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
    for (const publication of sink.publications)
      await rename(publication.staged, publication.destination);
    const input = { closure, execution, output };
    expect(
      await verifyNativeObservationClosure({
        ...input,
        expectedPasses: () => [],
      }),
    ).toMatchObject({ outputFrames: 1, passCount: 0 });
    const manifest = JSON.parse(
      await readFile(closure.manifestPath, "utf8"),
    ) as {
      artifacts: { path: string }[];
    };
    return {
      input,
      paths: {
        manifest: closure.manifestPath,
        shard: join(directory, manifest.artifacts[0]!.path),
      },
    };
  } finally {
    await sink.dispose();
  }
}

describe("retained native observation files", () => {
  it.each(["manifest", "shard"] as const)(
    "retains regular-file symlink compatibility for the %s locator",
    async (kind) => {
      const fixture = await journal();
      const path = fixture.paths[kind],
        target = path + ".regular";
      await rename(path, target);
      await symlink(target, path);
      expect(
        await verifyNativeObservationClosure({
          ...fixture.input,
          expectedPasses: () => [],
        }),
      ).toMatchObject({ outputFrames: 1, passCount: 0 });
    },
  );
  it.skipIf(process.platform === "win32").each([
    ["manifest", false],
    ["shard", false],
    ["manifest", true],
    ["shard", true],
  ] as const)(
    "rejects a %s FIFO (symlink: %s) before waiting for a writer and releases verification capacity",
    async (kind, alias) => {
      const fixture = await journal();
      const path = fixture.paths[kind];
      await rm(path);
      const fifo = alias ? path + ".fifo" : path;
      execFileSync("mkfifo", [fifo]);
      if (alias) await symlink(fifo, path);
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "--eval",
          `import assert from "node:assert/strict";
         import { verifyNativeObservationClosure } from "./packages/execution-runtime/src/export-worker.ts";
         const input = JSON.parse(process.argv[1]);
         let reserved = 0;
         await assert.rejects(verifyNativeObservationClosure({
           ...input, expectedPasses: () => [],
           reserve(bytes) { reserved += bytes; return { release() { reserved -= bytes; } }; },
         }), /regular file/);
         assert.equal(reserved, 0);
         console.log("FIFO rejected; capacity released");`,
          JSON.stringify(fixture.input),
        ],
        { timeout: 4000, killSignal: "SIGKILL", maxBuffer: 65536 },
      );
      expect(stdout.trim()).toBe("FIFO rejected; capacity released");
    },
    10000,
  );
});
