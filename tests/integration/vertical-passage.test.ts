import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import {
  prepareStoryPassageInput,
  writePreparedPassage,
} from "../../packages/animation-engine/src/story-passage-io.ts";
import { renderStoryPassage } from "../../packages/animation-engine/src/story-passage-render.ts";

const run = promisify(execFile);

it("exports a vertical passage and transition at the resolved size", async () => {
  const directory = await mkdtemp(join(tmpdir(), "vertical-passage-"));
  try {
    const asset = JSON.parse(
      await readFile(
        "benchmarks/fixtures/story-motion/relationship-build.json",
        "utf8",
      ),
    ).assets[0];
    asset.path = resolve("benchmarks/fixtures/story-motion", asset.path);
    for (const name of ["first", "second"]) {
      const scene = {
        schemaVersion: "story-scene-1",
        title: name,
        fps: 24,
        frameCount: 8,
        width: 1920,
        height: 1080,
        background: "#000000",
        assets: [asset],
        motionModel: "curves-1",
        formats: {
          vertical: {
            nodes: { box: { x: 100, y: 400, width: 300, height: 300 } },
          },
        },
        nodes: [
          {
            id: "box",
            type: "rect",
            x: 100,
            y: 400,
            width: 300,
            height: 300,
            fill: name === "first" ? "#ffffff" : "#0000ff",
          },
        ],
        recipe: {
          preset: "generic",
          moves: [
            {
              node: "box",
              window: { start: 1, end: 7, cue: "mark" },
              to: { x: 500 },
            },
          ],
          emphasis: [],
        },
      };
      await writeFile(join(directory, `${name}.json`), JSON.stringify(scene));
    }
    const passage = await prepareStoryPassageInput(
      {
        schemaVersion: "story-passage-2",
        id: "vertical-export",
        title: "Vertical export acceptance",
        fps: 24,
        sourceStartFrame: 0,
        transitionModel: "joins-1",
        contentPolicy: "general",
        styleProfile: { schemaVersion: "story-style-1", id: "test" },
        beats: ["first", "second"].map((name, index) => ({
          id: name,
          template: `${name}.json`,
          purpose: "compare",
          takeaway: "The size stays vertical",
          focus: ["box"],
          intensity: "develop",
          frameCount: 8,
          cues: [
            { id: "voice", phrase: "Vertical", frame: 3, events: ["mark"] },
          ],
          ...(index ? { handoff: { mode: "push", frames: 3 } } : {}),
        })),
      },
      join(directory, "plan.json"),
      undefined,
      undefined,
      { format: "vertical" },
    );
    const output = join(directory, "output");
    await writePreparedPassage(output, passage);
    const report = await renderStoryPassage(output, passage, undefined, {
      cacheDirectory: join(directory, "cache"),
    });
    expect(report.frameCount).toBe(16);
    const { stdout } = await run("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,nb_read_frames,codec_name,profile,level",
      "-of",
      "json",
      join(output, "passage.mp4"),
    ]);
    const video = JSON.parse(stdout).streams[0];
    expect([video.width, video.height, Number(video.nb_read_frames)]).toEqual([
      1080, 1920, 16,
    ]);
    expect(video.codec_name).toBe("h264");
    expect(["Baseline", "Main", "High"]).toContain(video.profile);
    expect(video.level).toBeLessThanOrEqual(42);
    const capture = process.env.STILL_SHIFT_VERTICAL_PASSAGE_CAPTURE;
    if (capture) {
      const destination = resolve(capture);
      await mkdir(dirname(destination), { recursive: true });
      await run("ffmpeg", [
        "-v",
        "error",
        "-i",
        join(output, "passage.mp4"),
        "-vf",
        "select=eq(n\\,8)",
        "-frames:v",
        "1",
        "-y",
        destination,
      ]);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 120000);
