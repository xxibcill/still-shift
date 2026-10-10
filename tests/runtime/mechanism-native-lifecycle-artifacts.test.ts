import type * as FileSystem from "node:fs/promises";
import {
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTapeHookProject } from "../../packages/animation-engine/src/mechanism/tape-hook.ts";
import {
  mechanismHash,
  readMechanismEpisode,
} from "../../packages/animation-engine/src/mechanism/io.ts";
import {
  assertNativeMechanismSourceEdges,
  hashNativeMechanismArtifact,
  publishNativePreparedEpisode,
  type NativePreparedMechanismEpisode,
} from "../../packages/animation-engine/src/mechanism/native-lifecycle.ts";

const roots: string[] = [];
const injection = vi.hoisted(() => ({
  afterRead: undefined as (() => Promise<void>) | undefined,
  afterLink: undefined as ((destination: string) => void) | undefined,
  readLengths: [] as number[],
  opens: 0,
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      injection.opens++;
      const handle = await actual.open(...args),
        read = handle.read.bind(handle);
      handle.read = (async (...readArgs: unknown[]) => {
        if (typeof readArgs[2] === "number")
          injection.readLengths.push(readArgs[2]);
        const result = await Reflect.apply(read, handle, readArgs);
        await injection.afterRead?.();
        return result;
      }) as typeof handle.read;
      return handle;
    },
    link: async (source: string, destination: string) => {
      await actual.link(source, destination);
      injection.afterLink?.(destination);
    },
  };
});
afterEach(async () => {
  injection.afterRead = undefined;
  injection.afterLink = undefined;
  injection.readLengths = [];
  injection.opens = 0;
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function folder() {
  const root = await mkdtemp(join(tmpdir(), "native-lifecycle-artifacts-"));
  roots.push(root);
  return await realpath(root);
}
async function publicationFixture() {
  const root = await folder(),
    candidate = join(root, "candidate.json"),
    composition = join(root, "composition.json"),
    receiptPath = join(root, "prepared.receipt.json");
  const bytes = Buffer.from('{"actual":"prepared-recipe"}\n');
  await writeFile(candidate, bytes);
  await writeFile(composition, "prior recipe");
  await writeFile(receiptPath, "prior receipt");
  const hash = "sha256:" + "a".repeat(64);
  const receipt: NativePreparedMechanismEpisode = {
    schemaVersion: "mechanism-prepared-native-episode-1",
    projectHash: hash,
    sourcePath: join(root, "episode.json"),
    outputDirectory: root,
    compositionPath: composition,
    compositionSourceSha256: mechanismHash(bytes),
    compositionSha256: hash,
    preparedNativeSha256: hash,
    appearanceCodeSha256: hash,
    appearanceCodeIdentity: {
      runtimeFormat: "source-ts",
      modules: [{ name: "renderer/world", sha256: hash }],
      threeRuntime: {
        version: "0.186.0",
        sources: [{ name: "three.module.js", sha256: hash }],
      },
    },
    episodeSha256: hash,
    geometrySha256: hash,
    rigSha256: hash,
    routeSelection: {
      sourceRoute: null,
      effectiveRoute: "native3d",
      selectionOrigin: "cli-override",
    },
    backend: "webgl2",
    profile: "native-three-aces-hdr-msaa4-1",
    wallSeconds: 0,
    receiptPath,
  };
  return { root, candidate, composition, receiptPath, bytes, receipt };
}
async function retainedAttempt(root: string) {
  const attempts = (await readdir(root)).filter((name) =>
    name.startsWith(".native-prepare-attempt-"),
  );
  expect(attempts).toHaveLength(1);
  return join(root, attempts[0]!);
}

describe("bounded native lifecycle artifacts", () => {
  it("hashes a multi-chunk movie with a bounded read allocation", async () => {
    const root = await folder(),
      path = join(root, "movie.mp4"),
      bytes = Buffer.alloc(2 * 1024 * 1024 + 17, 0x75);
    await writeFile(path, bytes);
    expect(await hashNativeMechanismArtifact(path)).toBe(mechanismHash(bytes));
    expect(injection.readLengths.length).toBeGreaterThan(8);
    expect(Math.max(...injection.readLengths)).toBeLessThanOrEqual(256 * 1024);
  });
  it("rejects symlink bytes and an already aborted read before opening", async () => {
    const root = await folder(),
      path = join(root, "movie.mp4"),
      alias = join(root, "alias.mp4");
    await writeFile(path, "movie");
    await symlink(path, alias);
    await expect(hashNativeMechanismArtifact(alias)).rejects.toThrow(
      /regular file/,
    );
    const controller = new AbortController();
    controller.abort(Error("stop native hashing"));
    await expect(
      hashNativeMechanismArtifact(path, controller.signal),
    ).rejects.toThrow("stop native hashing");
    expect(injection.opens).toBe(0);
  });
  it("rejects a real in-place source mutation during streamed hashing", async () => {
    const root = await folder(),
      path = join(root, "movie.mp4");
    await writeFile(path, Buffer.alloc(1024 * 1024, 0x21));
    injection.afterRead = async () => {
      injection.afterRead = undefined;
      await writeFile(path, Buffer.alloc(1024 * 1024, 0x22));
    };
    await expect(hashNativeMechanismArtifact(path)).rejects.toThrow(
      /changed during byte verification/,
    );
  });
  it("revalidates declared raw bytes and the current saved revision", async () => {
    const root = await folder(),
      source = join(root, "source");
    await createTapeHookProject({
      outputDirectory: source,
      fontPath: resolve("assets/story-motion/fonts/plex-sans-semibold.ttf"),
    });
    const loaded = await readMechanismEpisode(join(source, "episode.json"));
    await expect(
      assertNativeMechanismSourceEdges(loaded),
    ).resolves.toBeUndefined();
    const scenePath = loaded.dependencyPaths[loaded.episode.scene]!,
      scene = await readFile(scenePath);
    await writeFile(scenePath, Buffer.concat([scene, Buffer.from(" ")]));
    await expect(assertNativeMechanismSourceEdges(loaded)).rejects.toThrow(
      /source bytes changed/,
    );
    await writeFile(scenePath, scene);
    await writeFile(
      loaded.sourcePath,
      JSON.stringify({
        ...loaded.episode,
        revision: loaded.episode.revision + 1,
      }),
    );
    await expect(assertNativeMechanismSourceEdges(loaded)).rejects.toThrow(
      /Saved episode changed after loading/,
    );
  });
  it("publishes the verified recipe and receipt together", async () => {
    const f = await publicationFixture();
    await publishNativePreparedEpisode(f.candidate, f.receipt);
    expect(await readFile(f.composition)).toEqual(f.bytes);
    expect(JSON.parse(await readFile(f.receiptPath, "utf8"))).toEqual(
      f.receipt,
    );
    expect(
      (await readdir(f.root)).some((name) =>
        name.startsWith(".native-prepare-attempt-"),
      ),
    ).toBe(false);
  });
  it("rolls back a cancellation after the first publication and retains the staged pair", async () => {
    const f = await publicationFixture(),
      controller = new AbortController();
    injection.afterLink = (destination) => {
      if (destination === f.composition) {
        injection.afterLink = undefined;
        controller.abort(Error("cancel between recipe and receipt"));
      }
    };
    await expect(
      publishNativePreparedEpisode(f.candidate, f.receipt, controller.signal),
    ).rejects.toThrow("cancel between recipe and receipt");
    expect(await readFile(f.composition, "utf8")).toBe("prior recipe");
    expect(await readFile(f.receiptPath, "utf8")).toBe("prior receipt");
    const attempt = await retainedAttempt(f.root);
    expect(await readFile(join(attempt, "composition.json"))).toEqual(f.bytes);
    expect(
      JSON.parse(
        await readFile(join(attempt, "prepared.receipt.json"), "utf8"),
      ),
    ).toEqual(f.receipt);
    expect(
      JSON.parse(await readFile(join(attempt, "failure.json"), "utf8")),
    ).toMatchObject({ status: "failed", aborted: true });
  });
  it("retains a rejected candidate checksum without replacing the prior pair", async () => {
    const f = await publicationFixture();
    await writeFile(f.candidate, "wrong candidate bytes");
    await expect(
      publishNativePreparedEpisode(f.candidate, f.receipt),
    ).rejects.toThrow(/candidate bytes differ/);
    const attempt = await retainedAttempt(f.root);
    expect(await readFile(join(attempt, "composition.json"), "utf8")).toBe(
      "wrong candidate bytes",
    );
    expect(await readFile(f.composition, "utf8")).toBe("prior recipe");
    expect(await readFile(f.receiptPath, "utf8")).toBe("prior receipt");
  });
});
