import { mkdtemp, writeFile, open, rm, symlink, mkdir } from "node:fs/promises";
import type * as FsPromises from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, expect, it, vi } from "vitest";
import {
  readNativeSourceBytes,
  NATIVE_SOURCE_FILE_BYTES,
} from "../../packages/animation-engine/src/native-source-read.ts";
const monitor = vi.hoisted(() => ({
  buffers: [] as number[],
  closed: 0,
  afterRead: undefined as undefined | (() => Promise<void>),
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args),
        read = handle.read.bind(handle),
        close = handle.close.bind(handle);
      vi.spyOn(handle, "read").mockImplementation(async (...args) => {
        if (ArrayBuffer.isView(args[0]))
          monitor.buffers.push(args[0].byteLength);
        const result = await read(...args);
        const after = monitor.afterRead;
        monitor.afterRead = undefined;
        if (after) await after();
        return result;
      });
      vi.spyOn(handle, "close").mockImplementation(async () => {
        monitor.closed++;
        await close();
      });
      return handle;
    },
  };
});
const roots: string[] = [];
afterEach(async () => {
  monitor.buffers = [];
  monitor.closed = 0;
  monitor.afterRead = undefined;
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function root() {
  const value = await mkdtemp("/private/tmp/native-source-bounded-");
  roots.push(value);
  return value;
}
it("reads exact original bytes through a canonical alias and closes the admitted descriptor", async () => {
  const dir = await root(),
    path = join(dir, "source.json"),
    alias = join(dir, "alias.json"),
    bytes = Buffer.from('{"id":"source", "value":3}\n');
  await writeFile(path, bytes);
  await symlink(path, alias);
  expect(await readNativeSourceBytes(alias, "assets.alias")).toEqual(bytes);
  expect(monitor.buffers).toEqual([bytes.length + 1, bytes.length + 1]);
  expect(monitor.closed).toBe(1);
});
it("rejects a sparse source above the original 32 MiB ceiling before reading or allocating its body", async () => {
  const dir = await root(),
    path = join(dir, "large.json"),
    handle = await open(path, "wx");
  await handle.truncate(NATIVE_SOURCE_FILE_BYTES + 1);
  await handle.close();
  monitor.closed = 0;
  await expect(
    readNativeSourceBytes(path, "assets.large"),
  ).rejects.toMatchObject({
    diagnostics: [{ code: "comp-native3d-limit", path: "assets.large" }],
  });
  expect(monitor.buffers).toEqual([]);
  expect(monitor.closed).toBe(1);
});
it("rejects actual growth during a read within the originally admitted backing store", async () => {
  const dir = await root(),
    path = join(dir, "changing.json"),
    bytes = Buffer.from('{"id":"source"}');
  await writeFile(path, bytes);
  monitor.afterRead = async () => {
    await writeFile(path, Buffer.concat([bytes, Buffer.from("x")]));
  };
  await expect(readNativeSourceBytes(path, "assets.changing")).rejects.toThrow(
    /changed during bounded read/,
  );
  expect(Math.max(...monitor.buffers)).toBe(bytes.length + 1);
  expect(monitor.closed).toBe(1);
});
it("preserves cancellation during a real read and closes its descriptor", async () => {
  const dir = await root(),
    path = join(dir, "cancelled.json");
  await writeFile(path, '{"id":"source"}');
  const controller = new AbortController(),
    reason = Error("cancel bounded source");
  monitor.afterRead = async () => controller.abort(reason);
  await expect(
    readNativeSourceBytes(path, "assets.cancelled", controller.signal),
  ).rejects.toBe(reason);
  expect(monitor.closed).toBe(1);
});
it.skipIf(process.platform === "win32")(
  "rejects directories and FIFO sources without waiting for a writer",
  async () => {
    const dir = await root(),
      directory = join(dir, "directory"),
      fifo = join(dir, "fifo");
    await mkdir(directory);
    await promisify(execFile)("mkfifo", [fifo]);
    for (const path of [directory, fifo])
      await expect(
        readNativeSourceBytes(path, "assets.nonfile"),
      ).rejects.toThrow(/regular file/);
    expect(monitor.buffers).toEqual([]);
    expect(monitor.closed).toBe(2);
  },
  2000,
);
