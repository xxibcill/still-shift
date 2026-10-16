import { describe, it, expect } from "vitest";
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  open,
  access,
} from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  cuePlateFile,
  readCuePlateJson,
} from "../../packages/animation-engine/src/mechanism/cue-plate-files.ts";
const hash = (body: Uint8Array) =>
  "sha256:" + createHash("sha256").update(body).digest("hex");
describe("native cue plate file ownership", () => {
  it("streams real multi-chunk pins and exclusive copies, retires transient storage and removes only failed owned copies", async () => {
    const root = await mkdtemp("/private/tmp/still-shift-plate-files-");
    const owner = new CompositionNodeMemory();
    try {
      const body = Buffer.alloc(256 * 1024 + 17);
      for (let i = 0; i < body.length; i++) body[i] = i % 251;
      const source = join(root, "source"),
        destination = join(root, "copy");
      await writeFile(source, body);
      const initial = owner.statistics.current.metadata;
      const proof = await cuePlateFile(source, owner, {
        destination,
        sha256: hash(body),
      });
      expect(proof.bytes).toBe(body.length);
      expect(await readFile(destination)).toEqual(body);
      expect(owner.statistics.current.metadata).toBe(initial);
      await expect(
        cuePlateFile(source, owner, { destination }),
      ).rejects.toThrow(/exist/i);
      expect(await readFile(destination)).toEqual(body);
      const wrong = join(root, "wrong");
      await expect(
        cuePlateFile(source, owner, {
          destination: wrong,
          sha256: "sha256:" + "0".repeat(64),
        }),
      ).rejects.toThrow(/hash/);
      await expect(access(wrong)).rejects.toThrow();
      const controller = new AbortController();
      const reason = Error("owned plate abort");
      controller.abort(reason);
      await expect(
        cuePlateFile(source, owner, {
          signal: controller.signal,
          destination: wrong,
        }),
      ).rejects.toBe(reason);
      expect(owner.statistics.current.metadata).toBe(initial);
    } finally {
      owner.dispose();
      await rm(root, { force: true, recursive: true });
    }
  });
  it("rejects real FIFOs and sparse oversized sources before allocating their contents; bounds retained JSON in the shared owner", async () => {
    const root = await mkdtemp("/private/tmp/still-shift-plate-file-bounds-");
    const owner = new CompositionNodeMemory();
    try {
      const fifo = join(root, "fifo");
      execFileSync("mkfifo", [fifo]);
      await expect(cuePlateFile(fifo, owner)).rejects.toThrow(/regular/);
      await expect(readCuePlateJson(fifo, owner)).rejects.toThrow(
        /regular-file/,
      );
      const sparse = join(root, "sparse"),
        handle = await open(sparse, "wx");
      await handle.truncate(32 * 1024 * 1024 + 1);
      await handle.close();
      await expect(
        cuePlateFile(sparse, owner, { maximumBytes: 32 * 1024 * 1024 }),
      ).rejects.toThrow(/size/);
      await expect(readCuePlateJson(sparse, owner)).rejects.toThrow(/size/);
      const source = join(root, "valid.json");
      await writeFile(source, JSON.stringify({ frames: [0, 1], text: "Pin" }));
      expect(await readCuePlateJson(source, owner)).toEqual({
        frames: [0, 1],
        text: "Pin",
      });
      await expect(
        readCuePlateJson(
          source,
          owner,
          undefined,
          undefined,
          "sha256:" + "0".repeat(64),
        ),
      ).rejects.toThrow(/JSON hash/);
      expect(owner.statistics.current.metadata).toBeGreaterThan(0);
    } finally {
      owner.dispose();
      await rm(root, { force: true, recursive: true });
    }
  });
});
