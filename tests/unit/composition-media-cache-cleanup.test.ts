import { afterEach, expect, it, vi } from "vitest";
import { lstat, mkdtemp, readdir, rm } from "node:fs/promises";
import type * as FileSystem from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { CompositionVisualMediaAsset } from "@still-shift/scene-contract";
import { prepareCompositionVisualMedia } from "../../packages/animation-engine/src/composition-media-cache.ts";
import { compositionMediaCacheLock } from "../../packages/animation-engine/src/composition-media-cache-storage.ts";

const faults = vi.hoisted(() => ({
  cleanupFails: false,
  cleanupError: Object.assign(new Error("Staging cleanup denied"), {
    code: "EACCES",
  }),
  stageCleanupPaths: [] as string[],
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof FileSystem>();
  return {
    ...fs,
    async rm(...args: Parameters<typeof fs.rm>) {
      const path = String(args[0]);
      if (basename(path).startsWith(".prepare-")) {
        faults.stageCleanupPaths.push(path);
        if (faults.cleanupFails) throw faults.cleanupError;
      }
      return fs.rm(...args);
    },
  };
});
vi.mock("@still-shift/execution-runtime/subprocess", () => ({
  runProcess: vi.fn(async (_command: string, args: string[]) => {
    if (args[0] === "-version")
      return { stdout: "pinned test decoder", stderr: "" };
    throw Error("Decoder failed after staging was created");
  }),
}));
vi.mock(
  "../../packages/animation-engine/src/composition-media-probe.ts",
  () => ({
    probeCompositionVideo: vi.fn(async () => ({ presentationPts: [0] })),
    compositionMediaChecksum: vi.fn(async () => "sha256:" + "0".repeat(64)),
  }),
);
const asset: CompositionVisualMediaAsset = {
  id: "cleanup",
  type: "video",
  path: "cleanup.mkv",
  sha256: "sha256:" + "0".repeat(64),
  width: 16,
  height: 16,
  frameCount: 1,
  frameRate: { numerator: 24, denominator: 1 },
  color: {
    primaries: "bt709",
    transfer: "iec61966-2-1",
    matrix: "gbr",
    range: "pc",
  },
};
afterEach(() => {
  faults.cleanupFails = false;
  faults.stageCleanupPaths.length = 0;
});

it.each([false, true])(
  "releases the actual cache lock after a failed visual decode (staging cleanup fails: %s)",
  async (cleanupFails) => {
    const directory = await mkdtemp(
      join(tmpdir(), "composition-cache-cleanup-"),
    );
    faults.cleanupFails = cleanupFails;
    try {
      const preparation = prepareCompositionVisualMedia({
        asset,
        sourceDirectory: directory,
        cacheDirectory: directory,
        ordinals: [0],
      });
      if (cleanupFails)
        await expect(preparation).rejects.toBe(faults.cleanupError);
      else
        await expect(preparation).rejects.toThrow(
          "Pinned decoder could not prepare",
        );
      expect(faults.stageCleanupPaths).toHaveLength(1);
      const lock = await lstat(join(directory, ".media.lock")).catch(
        (error) => {
          if (error.code === "ENOENT") return undefined;
          throw error;
        },
      );
      expect(
        lock,
        "the failed job must release its cache lock",
      ).toBeUndefined();
      const entries = await readdir(directory);
      expect(
        entries.filter((entry) => entry.startsWith(".prepare-")),
      ).toHaveLength(cleanupFails ? 1 : 0);
      expect(entries.filter((entry) => /^[a-f0-9]{64}$/.test(entry))).toEqual(
        [],
      );
      const release = await compositionMediaCacheLock(directory);
      await release();
    } finally {
      faults.cleanupFails = false;
      await rm(directory, { recursive: true, force: true });
    }
  },
);
