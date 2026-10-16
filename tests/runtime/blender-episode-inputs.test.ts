import { mkdtemp, writeFile, rm, readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { readBlenderEpisode } from "@still-shift/animation-engine";
import {
  blenderEpisodeSource,
  blenderEpisodePlan,
  blenderHash,
} from "../fixtures/blender-episode-support.ts";
async function inputFixture() {
  const root = await mkdtemp(join(tmpdir(), "blender-episode-inputs-")),
    wave = Buffer.alloc(44 + 88200 * 2);
  wave.write("RIFF", 0);
  wave.writeUInt32LE(wave.length - 8, 4);
  wave.write("WAVEfmt ", 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(44100, 24);
  wave.writeUInt32LE(88200, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36);
  wave.writeUInt32LE(wave.length - 44, 40);
  await writeFile(join(root, "voice.wav"), wave);
  await writeFile(join(root, "native.blend"), "{}");
  await writeFile(join(root, "font.ttf"), "font");
  const source = blenderEpisodeSource(),
    plan = blenderEpisodePlan();
  plan.narration.sha256 = blenderHash(wave);
  const familyPath = join(root, "source.json"),
    cuePath = join(root, "plan.json");
  await writeFile(familyPath, JSON.stringify(source));
  await writeFile(cuePath, JSON.stringify(plan));
  return {
    root,
    source,
    plan,
    project: {
      id: "EU-004",
      question: "How does a zipper join its teeth?",
      familyPath,
      cuePath,
    },
  };
}
describe("native episode complete input admission", () => {
  it("pins source, plan, asset, font and whole original 44.1kHz recording with a truthful 48kHz decode clock", async () => {
    const f = await inputFixture(),
      parent = new CompositionNodeMemory(),
      foreign = parent.reserve(1024),
      owner = new CompositionNodeMemory(parent);
    try {
      const result = await readBlenderEpisode(f.project, f.root, owner);
      expect(result.item.clock).toEqual({
        outputFrames: 60,
        sourceSamples: 96000,
      });
      expect(result.item.inputs.map((f) => f.path)).toEqual([
        "font.ttf",
        "native.blend",
        "plan.json",
        "source.json",
        "voice.wav",
      ]);
      expect(result.compiled.plan.originalNarrationClock).toEqual({
        sampleRate: 44100,
        samples: 88200,
      });
    } finally {
      owner.dispose();
      await rm(f.root, { recursive: true, force: true });
    }
    expect(foreign.active).toBe(true);
    expect(parent.statistics.current.metadata).toBe(1024);
    parent.dispose();
  });
  it("pins external resources relative to the canonical manifest directory so an alias-opened queue reopens through its real path", async () => {
    const f = await inputFixture(),
      owner = new CompositionNodeMemory();
    try {
      const font = new URL(
        "../../assets/story-motion/fonts/plex-sans-medium.ttf",
        import.meta.url,
      ).pathname;
      f.plan.font.path = font;
      f.plan.font.sha256 = blenderHash(await readFile(font));
      await writeFile(f.project.cuePath, JSON.stringify(f.plan));
      const result = await readBlenderEpisode(f.project, f.root, owner);
      const pin = result.item.inputs.find((p) =>
        p.path.endsWith("plex-sans-medium.ttf"),
      )!;
      expect(await realpath(resolve(await realpath(f.root), pin.path))).toBe(
        await realpath(font),
      );
      expect(result.item.familyPath).toBe("source.json");
    } finally {
      owner.dispose();
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("rejects a self-consistent declared duration that differs from the actual original audio", async () => {
    const f = await inputFixture(),
      owner = new CompositionNodeMemory();
    try {
      f.plan.originalNarrationClock.samples = 88641;
      f.plan.narration.sampleCount = 96480;
      f.plan.shots[1]!.endExclusive = 61;
      f.plan.speech[1]!.endSampleExclusive = 96480;
      await writeFile(f.project.cuePath, JSON.stringify(f.plan));
      await expect(
        readBlenderEpisode(f.project, f.root, owner),
      ).rejects.toThrow(/Original narration metadata/);
    } finally {
      owner.dispose();
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("pins an optional native QA plan and rejects intervals outside the whole episode", async () => {
    const f = await inputFixture(),
      owner = new CompositionNodeMemory();
    const qaPath = join(f.root, "qa.json"),
      plan = {
        schemaVersion: "blender-production-qa-plan-1",
        measurements: [
          {
            kind: "actual-control",
            measurement: "travel",
            control: "slider.travel",
          },
        ],
        programs: [
          {
            id: "whole",
            interval: { start: 0, endExclusive: 60 },
            registrations: [
              {
                schemaVersion: "mechanism-semantic-registration-1",
                id: "range",
                description: "Original control bounds",
                domain: "mechanical",
                method: "sampled-numeric-range",
                requireEveryOutputFrame: true,
                rules: [
                  {
                    measurement: "travel",
                    range: [0.34, 3.65],
                    unit: "control-value",
                    rig: "controls",
                    parts: [],
                    relationship: null,
                  },
                ],
              },
            ],
          },
        ],
      };
    try {
      await writeFile(qaPath, JSON.stringify(plan));
      const result = await readBlenderEpisode(
        { ...f.project, qaPath },
        f.root,
        owner,
      );
      expect(result.item.qaPath).toBe("qa.json");
      expect(result.item.inputs.some((p) => p.path === "qa.json")).toBe(true);
      plan.programs[0]!.interval.endExclusive = 61;
      await writeFile(qaPath, JSON.stringify(plan));
      await expect(
        readBlenderEpisode({ ...f.project, qaPath }, f.root, owner),
      ).rejects.toThrow(/actual episode clock/);
    } finally {
      owner.dispose();
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("rejects changed source pins before accepting a native episode input set", async () => {
    const f = await inputFixture(),
      owner = new CompositionNodeMemory();
    try {
      await writeFile(join(f.root, "native.blend"), "changed");
      await expect(
        readBlenderEpisode(f.project, f.root, owner),
      ).rejects.toThrow();
    } finally {
      owner.dispose();
      await rm(f.root, { recursive: true, force: true });
    }
  });
});
