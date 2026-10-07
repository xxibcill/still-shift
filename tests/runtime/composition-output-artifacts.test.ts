import type * as FileSystem from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publishArtifacts } from "@still-shift/execution-runtime/publication";
import { prepareCompositionOutputArtifacts } from "../../packages/execution-runtime/src/composition-output-artifacts.ts";
import {
  compositionOutputArguments,
  compositionOutputProfile,
  createCompositionOutputConversion,
} from "../../packages/execution-runtime/src/composition-output.ts";
import { mediaFloat32Wave } from "../helpers/composition-media-audio.ts";

const injection = vi.hoisted(() => ({
  afterLink: undefined as ((destination: string) => Promise<void>) | undefined,
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return {
    ...actual,
    link: async (source: string, destination: string) => {
      await actual.link(source, destination);
      await injection.afterLink?.(destination);
    },
  };
});
const hash = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
let root: string | undefined;
afterEach(async () => {
  injection.afterLink = undefined;
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

async function encodedSequence(signal?: AbortSignal) {
  root = await mkdtemp(join(tmpdir(), "composition-output-artifacts-"));
  const output = join(root, "output.%06d.png");
  const profile = compositionOutputProfile("png16");
  const pcm = mediaFloat32Wave(1600, 2, (sample, channel) =>
    sample === 1599 ? (channel ? -0.125 : 0.0625) : 0,
  );
  const audio = join(root, "source.wav");
  await writeFile(audio, pcm.wav);
  const artifacts = await prepareCompositionOutputArtifacts(
    profile,
    output,
    { width: 16, height: 16, fps: 60, frameCount: 2, durationMs: 2000 / 60 },
    { path: audio, sha256: hash(pcm.wav) },
    signal,
  );
  const rgba = Buffer.alloc(16 * 16 * 4);
  for (let pixel = 0; pixel < 256; pixel++)
    rgba.set([203, 102, 52, pixel], pixel * 4);
  const frame = createCompositionOutputConversion(profile).convert(rgba);
  const result = spawnSync(
    "ffmpeg",
    compositionOutputArguments(profile, {
      width: 16,
      height: 16,
      fps: 60,
      frameCount: 2,
      outputPath: artifacts.temporaryPath,
    }),
    { input: Buffer.concat([frame, frame]), maxBuffer: 1024 * 1024 },
  );
  if (result.error) throw result.error;
  expect(result.status, result.stderr.toString()).toBe(0);
  await artifacts.verify();
  const summary = await artifacts.summarize();
  const stagedMetadata = join(dirname(artifacts.temporaryPath), "result.json");
  await writeFile(stagedMetadata, "{}\n");
  const publications = artifacts.publications([
    { staged: stagedMetadata, destination: output + ".result.json" },
  ]);
  return { output, pcm, artifacts, summary, publications };
}

describe("composition PNG output transaction", () => {
  it("publishes every native-depth frame and exact PCM before the completion manifest", async () => {
    const { output, pcm, artifacts, summary, publications } =
      await encodedSequence();
    const linked: string[] = [];
    injection.afterLink = async (destination) => {
      linked.push(destination);
      if (destination !== artifacts.manifestPath)
        await expect(readFile(artifacts.manifestPath)).rejects.toMatchObject({
          code: "ENOENT",
        });
    };
    await publishArtifacts(publications);
    expect(linked.at(-1)).toBe(artifacts.manifestPath);
    expect(linked).toEqual(publications.map(({ destination }) => destination));
    expect(await readFile(output + ".audio.wav")).toEqual(pcm.wav);
    expect(hash(await readFile(artifacts.manifestPath))).toBe(
      summary.outputChecksum,
    );
    await artifacts.dispose();
    expect((await readdir(root!)).some((name) => name.endsWith(".stage"))).toBe(
      false,
    );
  });
  it.each(["first-frame", "manifest"] as const)(
    "rolls back cancellation after %s publication with the original reason",
    async (point) => {
      const controller = new AbortController();
      const reason = Error(`Cancel after ${point}`);
      const { artifacts, publications } = await encodedSequence(
        controller.signal,
      );
      const cancelAt =
        point === "manifest"
          ? artifacts.manifestPath
          : publications[0]!.destination;
      injection.afterLink = async (destination) => {
        if (destination === cancelAt) controller.abort(reason);
      };
      await expect(
        publishArtifacts(publications, controller.signal),
      ).rejects.toBe(reason);
      for (const { destination } of publications)
        await expect(readFile(destination)).rejects.toMatchObject({
          code: "ENOENT",
        });
      await artifacts.dispose();
      expect(await readdir(root!)).toEqual(["source.wav"]);
    },
  );
  it("preserves a foreign frame created after the first frame was published", async () => {
    const { artifacts, publications } = await encodedSequence();
    const foreign = publications[1]!.destination;
    injection.afterLink = async (destination) => {
      if (destination === publications[0]!.destination) {
        injection.afterLink = undefined;
        await writeFile(foreign, "foreign job", { flag: "wx" });
      }
    };
    await expect(publishArtifacts(publications)).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect(await readFile(foreign, "utf8")).toBe("foreign job");
    for (const { destination } of publications.filter(
      (item) => item.destination !== foreign,
    ))
      await expect(readFile(destination)).rejects.toMatchObject({
        code: "ENOENT",
      });
    await artifacts.dispose();
    expect((await readdir(root!)).sort()).toEqual([
      "output.000001.png",
      "source.wav",
    ]);
  });
  it("rejects an existing sequence frame before creating a stage", async () => {
    root = await mkdtemp(join(tmpdir(), "composition-output-artifacts-"));
    const foreign = join(root, "output.000001.png");
    await writeFile(foreign, "foreign job");
    await expect(
      prepareCompositionOutputArtifacts(
        compositionOutputProfile("png8"),
        join(root, "output.%06d.png"),
        {
          width: 16,
          height: 16,
          fps: 60,
          frameCount: 2,
          durationMs: 2000 / 60,
        },
      ),
    ).rejects.toThrow("Output already exists");
    expect(await readdir(root)).toEqual(["output.000001.png"]);
    expect(await readFile(foreign, "utf8")).toBe("foreign job");
  });
  it("rejects a corrupted native-depth frame before publishing anything", async () => {
    const { artifacts, publications } = await encodedSequence();
    await writeFile(
      artifacts.temporaryPath.replace("%06d", "000001"),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    await expect(artifacts.verify()).rejects.toThrow("missing its header");
    for (const { destination } of publications)
      await expect(readFile(destination)).rejects.toMatchObject({
        code: "ENOENT",
      });
    await artifacts.dispose();
    expect(await readdir(root!)).toEqual(["source.wav"]);
  });
});
