import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { hashRenderMetadata } from "../../packages/renderer-core/src/managed-metadata-hash.ts";

it("preserves complete native UTF8/SHA256 output while owning only retained text after native buffers release", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 65536 });
  await withManagedMemory(memory, async () => {
    for (const value of [
      "",
      "ไทย\n\ud800\ud83d\ude00",
      '{"a":1,"b":[null,true]}',
    ]) {
      memory.beginScratch();
      const text = await hashRenderMetadata(value);
      expect(text.value).toBe(
        "sha256:" + createHash("sha256").update(value).digest("hex"),
      );
      expect(memory.statistics.current.metadata).toBe(270);
      expect(memory.statistics.current.pixels).toBe(0);
      expect(memory.statistics.reservations).toBe(1);
      text.retain();
      memory.endScratch();
      expect(text.value?.length).toBe(71);
      text.release();
      expect(text.value).toBe(undefined);
      expect(memory.statistics.reservations).toBe(0);
    }
    memory.dispose();
  });
});
it("denies combined UTF8/hash capacity before the original encoder or native digest is invoked", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 2048 });
  const encode = vi.spyOn(TextEncoder.prototype, "encode");
  const digest = vi.spyOn(crypto.subtle, "digest");
  try {
    await withManagedMemory(memory, async () => {
      await expect(hashRenderMetadata("metadata")).rejects.toThrow(
        "aggregate worker quota",
      );
      expect(encode).not.toHaveBeenCalled();
      expect(digest).not.toHaveBeenCalled();
      expect(memory.statistics.current.metadata).toBe(0);
      expect(memory.statistics.reservations).toBe(0);
      memory.dispose();
    });
  } finally {
    encode.mockRestore();
    digest.mockRestore();
  }
});
it("detaches original admitted UTF8 input and late fresh digest storage after disposal", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 8192 });
  let accept!: (value: ArrayBuffer) => void;
  let input: ArrayBuffer | undefined;
  const digest = vi
    .spyOn(crypto.subtle, "digest")
    .mockImplementation((_algorithm, bytes) => {
      input = bytes as ArrayBuffer;
      return new Promise<ArrayBuffer>((resolve) => {
        accept = resolve;
      });
    });
  try {
    await withManagedMemory(memory, async () => {
      const pending = hashRenderMetadata("ไทย");
      expect(input?.byteLength).toBe(9);
      memory.dispose();
      expect(input?.byteLength).toBe(0);
      const late = new ArrayBuffer(32);
      accept(late);
      await expect(pending).rejects.toThrow("no active owner");
      expect(late.byteLength).toBe(0);
      expect(memory.statistics.current.metadata).toBe(0);
      expect(memory.statistics.reservations).toBe(0);
    });
  } finally {
    digest.mockRestore();
  }
});
it("preserves the original null native digest failure and releases every started owner", async () => {
  const memory = new ManagedMemory({ pixels: 1, metadata: 8192 });
  let input: ArrayBuffer | undefined;
  const digest = vi
    .spyOn(crypto.subtle, "digest")
    .mockImplementation((_algorithm, bytes) => {
      input = bytes as ArrayBuffer;
      return Promise.reject(null);
    });
  try {
    await withManagedMemory(memory, async () => {
      await expect(hashRenderMetadata("original")).rejects.toBe(null);
      expect(input?.byteLength).toBe(0);
      expect(memory.statistics.current.metadata).toBe(0);
      expect(memory.statistics.reservations).toBe(0);
      memory.dispose();
    });
  } finally {
    digest.mockRestore();
  }
});
