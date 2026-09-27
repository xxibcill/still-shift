import type * as PassageCache from "../../packages/animation-engine/src/passage-cache.ts";
import type * as FileSystem from "node:fs/promises";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderStoryPassage } from "../../packages/animation-engine/src/story-passage-render.ts";
import type { PreparedPassage } from "../../packages/animation-engine/src/story-passage-io.ts";

const injection = vi.hoisted(() => ({
  abortAfterReport: undefined as AbortController | undefined,
  failCompletion: false,
  failCleanup: false,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return {
    ...actual,
    writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
      if (injection.failCleanup && String(args[0]).includes("render-job.json."))
        throw new Error("Checkpoint unavailable");
      await actual.writeFile(...args);
      if (String(args[0]).endsWith("final-report.json")) {
        injection.abortAfterReport?.abort(
          new Error("Cancelled after staged report"),
        );
      }
    },
    link: async (source: string, destination: string) => {
      if (injection.failCompletion && source.endsWith("complete-job.json"))
        throw new Error("Completion publication failed");
      await actual.link(source, destination);
    },
    rm: async (...args: Parameters<typeof actual.rm>) => {
      if (
        injection.failCleanup &&
        basename(String(args[0])).startsWith(".assembly-")
      )
        throw new Error("Assembly cleanup unavailable");
      return actual.rm(...args);
    },
  };
});

vi.mock("@still-shift/execution-runtime/subprocess", () => ({
  runProcess: async (
    command: string,
    args: string[],
    options: { signal?: AbortSignal } = {},
  ) => {
    options.signal?.throwIfAborted();
    if (command === "ffprobe")
      return {
        stdout: JSON.stringify({
          streams: [
            {
              codec_type: "video",
              nb_read_frames: "3",
              r_frame_rate: "30/1",
              width: 1920,
              height: 1080,
            },
          ],
        }),
        stderr: "",
      };
    const destination = args.at(-1)!;
    if (destination !== "-") await writeFile(destination, "rendered media");
    return { stdout: "", stderr: "" };
  },
}));

vi.mock(
  "../../packages/animation-engine/src/passage-cache.ts",
  async (importOriginal) => {
    const actual = await importOriginal<typeof PassageCache>();
    return {
      ...actual,
      passageRuntimeIdentity: async () => "fixed-runtime",
      passageJobRuntimeIdentity: async () => "fixed-job-runtime",
      passageBeatKey: () => "fixed-beat",
      cachedPassageBeat: async ({ output }: { output: string }) => {
        await writeFile(output, "cached beat");
        return {
          outputPath: output,
          key: "fixed-beat",
          reused: false,
          sha256: "checksum",
        };
      },
    };
  },
);

vi.mock(
  "../../packages/animation-engine/src/prepared-animation-engine.ts",
  () => ({
    validatePreparedAssets: async () => ({}),
    PreparedAnimationEngine: class {},
  }),
);

let root: string;
let passage: PreparedPassage;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "still-shift-passage-publication-"));
  await mkdir(join(root, "scenes"));
  await mkdir(join(root, "delivery"));
  const scene = { episodeStartFrame: 0, assets: [] };
  await writeFile(join(root, "scenes/beat.json"), JSON.stringify(scene));
  passage = {
    plan: {
      fps: 30,
      sourceStartFrame: 0,
      delivery: [{ id: "shot", start: 0, end: 3 }],
    },
    frameCount: 3,
    endFrameExclusive: 3,
    beats: [{ id: "beat", start: 0, end: 3, frameCount: 3, scene }],
    inputs: { plan: { sha256: "plan" } },
    preparationMs: 0,
  } as unknown as PreparedPassage;
});

afterEach(async () => {
  injection.abortAfterReport = undefined;
  injection.failCompletion = false;
  injection.failCleanup = false;
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

const state = async () =>
  JSON.parse(await readFile(join(root, "render-job.json"), "utf8"));
const products = [
  "passage.mp4",
  "passage.png",
  "passage-motion.jpg",
  "delivery/shot.mp4",
  "render-report.json",
];

describe("passage publication transaction", () => {
  it("cancels after report staging without publishing completion and can resume", async () => {
    const controller = new AbortController();
    injection.abortAfterReport = controller;
    await expect(
      renderStoryPassage(root, passage, undefined, {
        signal: controller.signal,
      }),
    ).rejects.toThrow("Cancelled after staged report");
    expect((await state()).status).toBe("cancelled");
    for (const path of products)
      await expect(readFile(join(root, path))).rejects.toMatchObject({
        code: "ENOENT",
      });
    await expect(
      readFile(join(root, ".render-job.lock")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    injection.abortAfterReport = undefined;
    await renderStoryPassage(root, passage, undefined, { resume: true });
    expect((await state()).status).toBe("complete");
    expect(
      (await readdir(root)).some(
        (name) => name.startsWith(".assembly-") || name.endsWith(".backup"),
      ),
    ).toBe(false);
  });

  it("restores all previous resumed products when completion publication fails", async () => {
    await renderStoryPassage(root, passage);
    const previous = await Promise.all(
      products.map((path) => readFile(join(root, path))),
    );
    injection.failCompletion = true;
    await expect(
      renderStoryPassage(root, passage, undefined, { resume: true }),
    ).rejects.toThrow("Completion publication failed");
    expect(
      await Promise.all(products.map((path) => readFile(join(root, path)))),
    ).toEqual(previous);
    expect((await state()).status).toBe("failed");
    await expect(
      readFile(join(root, ".render-job.lock")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    injection.failCompletion = false;
    await renderStoryPassage(root, passage, undefined, { resume: true });
    expect((await state()).status).toBe("complete");
  });

  it("retains the cancellation reason when checkpoint and assembly cleanup fail", async () => {
    const controller = new AbortController();
    injection.abortAfterReport = controller;
    controller.signal.addEventListener("abort", () => {
      injection.failCleanup = true;
    });
    const diagnostic = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await expect(
      renderStoryPassage(root, passage, undefined, {
        signal: controller.signal,
      }),
    ).rejects.toThrow("Cancelled after staged report");
    await expect(
      readFile(join(root, ".render-job.lock")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(diagnostic).toHaveBeenCalledWith(
      expect.stringContaining("Passage job cleanup failed"),
    );
    expect(diagnostic).toHaveBeenCalledWith(
      expect.stringContaining("Passage cleanup failed"),
    );
  });
});
