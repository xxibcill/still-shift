import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import {
  cachedPassageBeat,
  passageBeatKey,
} from "../../packages/animation-engine/src/passage-cache.ts";
import { acquirePassageJob } from "../../packages/animation-engine/src/passage-job.ts";

describe("passage render recovery", () => {
  it("recovers a render-job lock left by an abruptly terminated process", async () => {
    const root = await mkdtemp(join(tmpdir(), "passage-stale-lock-"));
    const module = new URL(
      "../../packages/animation-engine/src/passage-job.ts",
      import.meta.url,
    ).href;
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `import {acquirePassageJob} from ${JSON.stringify(module)}; await acquirePassageJob(${JSON.stringify(root)}, {plan:"same"}, false); process.stdout.write("locked"); setInterval(()=>{},1000);`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    try {
      await new Promise<void>((resolve, reject) => {
        child.stdout.once("data", () => resolve());
        child.once("error", reject);
        child.once("exit", (code) =>
          reject(new Error("Lock owner exited early: " + code)),
        );
      });
      const closed = new Promise<void>((resolve) =>
        child.once("close", () => resolve()),
      );
      child.kill("SIGKILL");
      await closed;
      const resumed = await acquirePassageJob(root, { plan: "same" }, true);
      await resumed.finish("complete");
      expect(
        JSON.parse(await readFile(join(root, "render-job.json"), "utf8"))
          .status,
      ).toBe("complete");
    } finally {
      child.kill("SIGKILL");
      await rm(root, { recursive: true, force: true });
    }
  });
  it("reuses verified artifacts and rebuilds corrupt cache entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "passage-cache-test-"));
    let renders = 0;
    const run = (output: string) =>
      cachedPassageBeat({
        cacheDirectory: join(root, "cache"),
        key: "test",
        output: join(root, output),
        render: async (path) => {
          renders++;
          await writeFile(path, "verified-video");
        },
        verify: async (path) => {
          if ((await readFile(path, "utf8")) !== "verified-video")
            throw new Error("Invalid video");
        },
      });
    try {
      expect((await run("one.mp4")).reused).toBe(false);
      expect((await run("two.mp4")).reused).toBe(true);
      expect(renders).toBe(1);
      await writeFile(join(root, "cache/test/beat.mp4"), "corrupt");
      expect((await run("three.mp4")).reused).toBe(false);
      expect(renders).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("does not mark cancelled work reusable and resumes only the same request", async () => {
    const root = await mkdtemp(join(tmpdir(), "passage-job-test-"));
    const controller = new AbortController();
    try {
      const job = await acquirePassageJob(root, { plan: "first" }, false);
      await expect(
        cachedPassageBeat({
          cacheDirectory: join(root, "cache"),
          key: "cancelled",
          output: join(root, "clip.mp4"),
          signal: controller.signal,
          render: async (path) => {
            await writeFile(path, "partial");
            controller.abort();
          },
          verify: async () => undefined,
        }),
      ).rejects.toThrow();
      await job.finish("cancelled");
      await expect(
        acquirePassageJob(root, { plan: "changed" }, true),
      ).rejects.toThrow(/different job/);
      const resumed = await acquirePassageJob(root, { plan: "first" }, true);
      await resumed.finish("complete");
      expect(
        JSON.parse(await readFile(join(root, "render-job.json"), "utf8"))
          .status,
      ).toBe("complete");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("invalidates content and incoming state while ignoring source placement and filesystem location", () => {
    const scene = StorySceneSchema.parse(
      JSON.parse(
        readFileSync(
          "benchmarks/fixtures/story-motion/unequal-margins.json",
          "utf8",
        ),
      ),
    );
    const key = passageBeatKey(scene, "runtime-one");
    scene.episodeStartFrame = 2000;
    scene.assets[0]!.path = "/another/location.svg";
    expect(passageBeatKey(scene, "runtime-one")).toBe(key);
    expect(passageBeatKey(scene, "runtime-two")).not.toBe(key);
    scene.authoringVersion = "1";
    scene.initialState = { "house-a": { opacity: 0.5 } };
    expect(passageBeatKey(scene, "runtime-one")).not.toBe(key);
  });
});
