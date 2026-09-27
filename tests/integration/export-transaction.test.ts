import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import type * as FileSystem from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreparedAnimationEngine } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { StoryAnimationResultSchema } from "../../packages/scene-contract/src/story.ts";
import { writeExportScene } from "../fixtures/export-scene.ts";

const injection = vi.hoisted(() => ({
  writeError: undefined as Error | undefined,
  competingResult: undefined as string | undefined,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return {
    ...actual,
    writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
      if (String(args[0]).endsWith(".result.tmp.json")) {
        if (injection.writeError) throw injection.writeError;
        if (injection.competingResult) {
          await actual.writeFile(
            injection.competingResult,
            "another job's result",
            { flag: "wx" },
          );
          injection.competingResult = undefined;
        }
      }
      return actual.writeFile(...args);
    },
  };
});

let directory: string;
let scenePath: string;
let outputPath: string;
const engine = new PreparedAnimationEngine();
const render = () => engine.animate({ scenePath, outputPath });

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "still-shift-export-transaction-"));
  scenePath = await writeExportScene(directory);
  outputPath = join(directory, "output.mp4");
});

afterEach(async () => {
  injection.writeError = undefined;
  injection.competingResult = undefined;
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

async function expectNoOutput() {
  expect((await readdir(directory)).sort()).toEqual([
    "scene.json",
    "source.svg",
  ]);
}

async function expectSuccessfulRetry() {
  const parse = vi.spyOn(StoryAnimationResultSchema, "parse");
  const result = await render();
  expect(parse).toHaveBeenCalledTimes(1);
  parse.mockRestore();
  expect(result.frameCount).toBe(3);
  expect(await readFile(outputPath)).not.toHaveLength(0);
  expect(
    JSON.parse(await readFile(`${outputPath}.result.json`, "utf8")),
  ).toEqual(result);
  expect((await readdir(directory)).some((name) => name.startsWith("."))).toBe(
    false,
  );
}

describe("prepared export transaction", () => {
  it("rolls back result-validation failure and permits retry", async () => {
    const failure = new Error("Injected result validation failure");
    const parse = vi
      .spyOn(StoryAnimationResultSchema, "parse")
      .mockImplementationOnce(() => {
        throw failure;
      });
    await expect(render()).rejects.toBe(failure);
    expect(parse).toHaveBeenCalled();
    parse.mockRestore();
    await expectNoOutput();
    await expectSuccessfulRetry();
  }, 30_000);

  it("rolls back result-write failure and permits retry", async () => {
    const failure = Object.assign(new Error("Injected result write failure"), {
      code: "ENOSPC",
    });
    injection.writeError = failure;
    await expect(render()).rejects.toBe(failure);
    await expectNoOutput();
    injection.writeError = undefined;
    await expectSuccessfulRetry();
  }, 30_000);

  it("preserves a concurrently published result while rolling back its own manifest", async () => {
    injection.competingResult = `${outputPath}.result.json`;
    await expect(render()).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(`${outputPath}.result.json`, "utf8")).toBe(
      "another job's result",
    );
    expect((await readdir(directory)).sort()).toEqual([
      "output.mp4.result.json",
      "scene.json",
      "source.svg",
    ]);
    await rm(`${outputPath}.result.json`);
    await expectSuccessfulRetry();
  }, 30_000);

  it("rejects pre-existing artifacts and invalid preparation before publication", async () => {
    await writeFile(`${outputPath}.result.json`, "existing result");
    await expect(render()).rejects.toThrow("Output already exists");
    expect(await readFile(`${outputPath}.result.json`, "utf8")).toBe(
      "existing result",
    );
    await rm(`${outputPath}.result.json`);
    const scene = JSON.parse(await readFile(scenePath, "utf8"));
    scene.assets[0].sha256 = "sha256:" + "0".repeat(64);
    await writeFile(scenePath, JSON.stringify(scene));
    await expect(render()).rejects.toMatchObject({ code: "SCENE_INVALID" });
    await expectNoOutput();
    await writeExportScene(directory);
    await expectSuccessfulRetry();
  }, 30_000);
});
