import { readFile, mkdir } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import {
  readStoryPassage,
  prepareStoryPassageInput,
  writePassageJson,
} from "./story-passage-io.ts";
import { inspectPassageAudioAsset } from "./passage-audio.ts";
import { parseNarrationTiming } from "../../renderer-core/src/narration-timing.ts";
import { importNarrationTiming } from "../../renderer-core/src/narration-timing-import.ts";

export async function importNarrationFile(options: {
  plan: string;
  narration: string;
  timing: string;
  mode: "add" | "match";
  output: string;
}) {
  const source = await readStoryPassage(options.plan);
  const narration = await inspectPassageAudioAsset(resolve(options.narration));
  const extension = extname(options.timing).toLowerCase();
  if (extension !== ".json" && extension !== ".srt")
    throw new Error("Timing must be a .json or .srt file");
  const timing = parseNarrationTiming(
    await readFile(options.timing, "utf8"),
    extension === ".srt" ? "srt" : "json",
  );
  const result = importNarrationTiming(source.plan, timing, {
    mode: options.mode,
    reference: narration.path,
    sha256: narration.sha256.slice(7),
    durationSeconds: narration.duration,
  });
  for (const beat of result.plan.beats)
    beat.template = resolve(dirname(source.inputs.plan.path), beat.template);
  const output = resolve(options.output);
  await prepareStoryPassageInput(result.plan, output);
  await mkdir(dirname(output), { recursive: true });
  await writePassageJson(output, result.plan);
  return {
    output,
    changes: result.changes,
    granularity: result.granularity,
    narration: result.plan.narration,
  };
}
