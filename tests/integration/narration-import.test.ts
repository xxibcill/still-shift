import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { readStoryPassage } from "../../packages/animation-engine/src/story-passage-io.ts";
import { writeStoryWorkspace } from "../../packages/animation-engine/src/story-workspace.ts";
let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "narration-import-"));
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
it("imports through the CLI into a new loadable plan with sound links and source metadata", async () => {
  const timing = join(directory, "timing.srt"),
    output = join(directory, "plan.json");
  await writeFile(
    timing,
    "1\n00:00:04,800 --> 00:00:05,600\nWatch the connection.\n",
  );
  const io = { stdout: vi.fn(), stderr: vi.fn() };
  const args = [
    "passage",
    "import-narration",
    "--plan",
    "benchmarks/fixtures/illustrated-sequence/sound/access-story.json",
    "--narration",
    "assets/illustrated-sequence/narration-v001/narration.wav",
    "--timing",
    timing,
    "--mode",
    "add",
    "--output",
    output,
  ];
  expect(await runCli(args, io)).toBe(0);
  const plan = JSON.parse(await readFile(output, "utf8"));
  expect(plan.narration.timing.granularity).toBe("subtitle");
  expect(plan.beats[0].cues.at(-1)).toMatchObject({
    phrase: "Watch the connection.",
    frame: 115,
    events: [],
  });
  expect(plan.beats[0].template.startsWith("/")).toBe(true);
  const reloaded = await readStoryPassage(output);
  expect(reloaded.audio!.sounds[0]!.start).toBe(115);
  expect(reloaded.plan.narration?.reference).toBe(
    resolve("assets/illustrated-sequence/narration-v001/narration.wav"),
  );
  const before = await readFile(output);
  expect(await runCli(args, io)).not.toBe(0);
  expect(await readFile(output)).toEqual(before);
  const packaged = join(directory, "packaged"),
    moved = join(directory, "moved");
  await writeStoryWorkspace(
    packaged,
    reloaded,
    resolve("assets/illustrated-sequence/narration-v001/narration.wav"),
  );
  await rename(packaged, moved);
  const restored = await readStoryPassage(join(moved, "workspace.json"));
  expect(restored.plan.narration).toHaveProperty(
    "timing",
    plan.narration.timing,
  );
  expect(restored.audio!.sounds[0]!.start).toBe(115);
}, 30_000);
