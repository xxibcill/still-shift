import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { it, expect } from "vitest";
import { cachedStoryTransition } from "../../packages/animation-engine/src/story-transition-render.ts";
import {
  prepareStoryPassageInput,
  writePreparedPassage,
} from "../../packages/animation-engine/src/story-passage-io.ts";
import { renderStoryPassage } from "../../packages/animation-engine/src/story-passage-render.ts";
const run = promisify(execFile);
it("keeps passage source and cue boundaries unchanged through cached joins and range export", async () => {
  const directory = await mkdtemp(join(tmpdir(), "motion-craft-passage-"));
  try {
    const asset = JSON.parse(
      await readFile(
        "benchmarks/fixtures/story-motion/relationship-build.json",
        "utf8",
      ),
    ).assets[0];
    asset.path = resolve("benchmarks/fixtures/story-motion", asset.path);
    for (const [name, color] of [
      ["first", "#ff0000"],
      ["second", "#0000ff"],
    ]) {
      const scene = {
        schemaVersion: "story-scene-1",
        title: name,
        fps: 24,
        frameCount: 12,
        width: 1920,
        height: 1080,
        background: color,
        assets: [asset],
        motionModel: "curves-1",
        nodes: [
          {
            id: "box",
            type: "rect",
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            fill: color,
          },
        ],
        recipe: {
          preset: "generic",
          moves: [
            {
              node: "box",
              window: { start: 6, end: 11, cue: "mark" },
              to: { x: 0 },
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
        id: "joins",
        title: "Join acceptance",
        fps: 24,
        sourceStartFrame: 48,
        transitionModel: "joins-1",
        contentPolicy: "general",
        styleProfile: { schemaVersion: "story-style-1", id: "test" },
        beats: ["first", "second"].map((name, i) => ({
          id: name,
          template: `${name}.json`,
          purpose: "compare",
          takeaway: "Boundary stays fixed",
          focus: ["box"],
          intensity: "develop",
          frameCount: 12,
          cues: [
            { id: "voice", phrase: "Fixed cue", frame: 6, events: ["mark"] },
          ],
          ...(i ? { handoff: { mode: "crossfade", frames: 6 } } : {}),
        })),
      },
      join(directory, "plan.json"),
    );
    expect(passage.frameCount).toBe(24);
    expect(
      passage.beats.map((b) => [b.start, b.end, b.cues[0]!.masterFrame]),
    ).toEqual([
      [0, 12, 54],
      [12, 24, 66],
    ]);
    const cacheDirectory = join(directory, "cache");
    const exportOne = async (
      name: string,
      range?: { start: number; end: number },
    ) => {
      const output = join(directory, name);
      await writePreparedPassage(output, passage);
      return renderStoryPassage(output, passage, undefined, {
        cacheDirectory,
        ...(range ? { range } : {}),
      });
    };
    const fresh = await exportOne("fresh"),
      cached = await exportOne("cached"),
      ranged = await exportOne("range", { start: 12, end: 18 });
    expect(fresh.frameCount).toBe(24);
    expect(cached.cache.every((c) => c.reused)).toBe(true);
    expect(ranged.frameCount).toBe(6);
    expect(ranged.sourceStartFrame).toBe(60);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);
it("caches join segments without changing their decoded frames and preserves both endpoints", async () => {
  const directory = await mkdtemp(join(tmpdir(), "motion-craft-joins-"));
  try {
    const outgoing = join(directory, "out.mp4"),
      incoming = join(directory, "in.mp4");
    for (const [path, color] of [
      [outgoing, "red"],
      [incoming, "blue"],
    ])
      await run("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        `color=c=${color}:s=1920x1080:r=24:d=0.5`,
        "-frames:v",
        "12",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        path!,
      ]);
    const verify = async (path: string) => {
      const { stdout } = await run("ffprobe", [
        "-v",
        "error",
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=nb_read_frames",
        "-of",
        "csv=p=0",
        path,
      ]);
      expect(Number(stdout.trim())).toBe(6);
    };
    for (const mode of ["overlap", "crossfade", "push", "match"] as const) {
      const options = {
        outgoing: { outputPath: outgoing, key: "out", frameCount: 12 },
        incoming: { outputPath: incoming, key: "in" },
        handoff: { mode, frames: 6, camera: "reset" as const, subjects: [] },
        fps: 24,
        cacheDirectory: join(directory, "cache"),
        verify,
      };
      const fresh = await cachedStoryTransition({
          ...options,
          output: join(directory, `${mode}-fresh.mp4`),
        }),
        cached = await cachedStoryTransition({
          ...options,
          output: join(directory, `${mode}-cached.mp4`),
        });
      expect(fresh.reused).toBe(false);
      expect(cached.reused).toBe(true);
      expect(await readFile(fresh.outputPath)).toEqual(
        await readFile(cached.outputPath),
      );
      const { stdout } = await run(
        "ffmpeg",
        [
          "-v",
          "error",
          "-i",
          fresh.outputPath,
          "-vf",
          "scale=1:1",
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgb24",
          "pipe:1",
        ],
        { encoding: "buffer" },
      );
      expect(stdout[0]).toBeGreaterThan(240);
      expect(stdout[2]).toBeLessThan(10);
      expect(stdout.at(-1)).toBeGreaterThan(240);
      expect(stdout.at(-3)).toBeLessThan(10);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
