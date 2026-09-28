import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { format } from "prettier";
import { z } from "zod";
import {
  StoryAuthoringPlanSchema,
  StoryTemplateSchema,
  TimingBindingSchema,
} from "../packages/scene-contract/src/story-authoring.ts";
import type { StoryScene } from "../packages/scene-contract/src/story.ts";

const sourceDirectory = resolve("benchmarks/fixtures/illustrated-sequence");
const outputDirectory = resolve(sourceDirectory, "narrated");
const audioDirectory = resolve("assets/illustrated-sequence/narration-v001");
const fps = 24;
const alignment = z
  .object({
    segments: z.array(
      z.object({
        words: z.array(
          z.object({ word: z.string(), start: z.number(), end: z.number() }),
        ),
      }),
    ),
  })
  .parse(
    JSON.parse(
      await readFile(resolve(audioDirectory, "alignment.json"), "utf8"),
    ),
  );
const words = alignment.segments.flatMap((segment) => segment.words);
const normalize = (word: string) => word.toLowerCase().replace(/[^a-z']/g, "");
// The British pronunciation of "route" was transcribed as its homophone "root".
const tokens = words.map((word) =>
  normalize(word.word) === "root" ? "route" : normalize(word.word),
);
const script = (
  await readFile(resolve(audioDirectory, "script.txt"), "utf8")
).trim();
assert.deepEqual(
  tokens,
  script.split(/\s+/).map(normalize),
  "Alignment must match every spoken word",
);

function phrase(text: string) {
  const wanted = text.split(/\s+/).map(normalize);
  const matches = tokens.flatMap((_, index) =>
    wanted.every((word, offset) => tokens[index + offset] === word)
      ? [index]
      : [],
  );
  assert.equal(matches.length, 1, "Expected one aligned phrase: " + text);
  const index = matches[0]!;
  return {
    text,
    start: words[index]!.start,
    end: words[index + wanted.length - 1]!.end,
  };
}
const start = (text: string) => Math.round(phrase(text).start * fps);
const end = (text: string) => Math.round(phrase(text).end * fps);
const audioPath = resolve(audioDirectory, "narration.wav");
const duration = Number(
  execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      audioPath,
    ],
    { encoding: "utf8" },
  ).trim(),
);
const frameCount = Math.round(duration * fps);
assert.ok(
  Math.abs(duration - frameCount / fps) < 0.00001,
  "Narration must end on a video frame",
);
const actionStart = start("As pressure builds") - 5;
const consequenceStart = start("The basket is still full") - 4;

async function readTemplate(file: string, length: number) {
  const template = StoryTemplateSchema.parse(
    JSON.parse(await readFile(resolve(sourceDirectory, file), "utf8")),
  );
  for (const asset of [
    ...template.scene.assets,
    ...(template.scene.fonts ?? []),
  ])
    asset.path = relative(
      outputDirectory,
      resolve(sourceDirectory, asset.path),
    );
  template.scene.frameCount = length;
  template.scene.camera!.keys.at(-1)!.frame = length - 1;
  template.scene.provenance +=
    " Narration-driven version: assets/illustrated-sequence/narration-v001/README.md.";
  return template;
}
function window(scene: StoryScene, cue: string, start: number, end: number) {
  const event = [...scene.recipe.moves, ...(scene.recipe.entrances ?? [])].find(
    (item) => item.window?.cue === cue,
  );
  assert.ok(event?.window, "Missing event: " + cue);
  event.window.start = start;
  event.window.end = end;
  return event.window;
}
function caption(scene: StoryScene) {
  const node = scene.nodes.find((node) => node.id === "caption");
  assert.ok(node?.type === "text");
  return node;
}
const detail = await readTemplate("detail-reveal.json", actionStart);
caption(detail.scene).text = "Can they reach it?";
detail.scene.recipe.entrances!.push({
  node: "caption",
  verb: "fade",
  window: {
    start: start("But can this household reach it"),
    end: start("But can this household reach it") + 8,
    cue: "question-appears",
  },
});
window(
  detail.scene,
  "route-reveals",
  start("Watch the connection"),
  end("Watch the connection"),
).easing = "in-out-cubic";
window(
  detail.scene,
  "route-visible",
  start("Watch the connection"),
  start("connection"),
);

const action = await readTemplate(
  "action-state-change.json",
  consequenceStart - actionStart,
);
const pressure = start("pressure builds") - actionStart;
const restriction = start("narrows") - actionStart;
for (const cue of ["pressure-visible", "opposition-visible"])
  window(
    action.scene,
    cue,
    start("As pressure builds") - actionStart,
    pressure,
  );
for (const cue of ["pressure-arrives", "opposition-arrives"])
  window(action.scene, cue, pressure, restriction);
window(action.scene, "consequence-appears", restriction, restriction + 10);
assert.ok(action.scene.componentData && "states" in action.scene.componentData);
action.scene.componentData.states[0]!.cuts[0]!.frame = restriction;

const consequence = await readTemplate(
  "reaction-consequence.json",
  frameCount - consequenceStart,
);
const finalCaption = caption(consequence.scene);
finalCaption.text = "The grain remains.";
finalCaption.textLayout!.height = 100;
const response = {
  ...structuredClone(finalCaption),
  id: "response",
  text: "Access has changed.",
  y: finalCaption.y + 85,
};
consequence.scene.nodes.push(response);
consequence.slots.response = {
  kind: "text",
  node: "response",
  required: false,
};
consequence.scene.camera!.depth.response = 0;
window(
  consequence.scene,
  "consequence-appears",
  start("basket") - consequenceStart,
  start("basket") - consequenceStart + 8,
);
consequence.scene.recipe.entrances!.push({
  node: "response",
  verb: "fade",
  window: {
    start: start("access") - consequenceStart,
    end: start("access") - consequenceStart + 12,
    cue: "access-response",
    role: "response",
  },
});
consequence.scene.camera!.keys = [
  { frame: 0, x: 1180, y: 590, zoom: 1.18 },
  {
    frame: start("What changed") - consequenceStart,
    x: 1150,
    y: 590,
    zoom: 1.16,
  },
  {
    frame: start("And for the household") - consequenceStart,
    x: 1030,
    y: 580,
    zoom: 1.1,
  },
  {
    frame: end("the household that changes") - consequenceStart,
    x: 940,
    y: 568,
    zoom: 1.045,
  },
  { frame: consequence.scene.frameCount - 1, x: 910, y: 565, zoom: 1.02 },
];

const plan = StoryAuthoringPlanSchema.parse(
  JSON.parse(
    await readFile(resolve(sourceDirectory, "access-story.json"), "utf8"),
  ),
);
plan.id = "illustrated-access-narrated";
plan.title = "Access changes · paced to narration";
plan.narration = {
  reference: "Wry Archivist · narration-v001/narration.wav",
  sha256: createHash("sha256")
    .update(await readFile(audioPath))
    .digest("hex"),
};
const templates = [detail, action, consequence];
const starts = [0, actionStart, consequenceStart];
const cue = (id: string, text: string, beat: number, events: string[]) => ({
  id,
  phrase: text,
  frame: start(text) - starts[beat]!,
  events,
});
plan.beats[0]!.cues = [
  cue("question", "But can this household reach it", 0, ["question-appears"]),
  cue("connection", "Watch the connection", 0, ["route-reveals"]),
];
plan.beats[1]!.cues = [
  cue("pressure", "As pressure builds", 1, ["pressure-visible"]),
  cue("restriction", "narrows", 1, ["access-changes"]),
];
plan.beats[2]!.cues = [
  cue("grain", "basket", 2, ["consequence-appears"]),
  cue("consequence", "access", 2, ["access-response"]),
];
for (const [index, beat] of plan.beats.entries()) {
  beat.frameCount = templates[index]!.scene.frameCount;
  beat.bindings = {};
}
const bindings = z.record(z.string(), TimingBindingSchema);
plan.beats[0]!.bindings = bindings.parse({
  "question-appears": { anchor: { type: "cue", id: "question" }, duration: 8 },
  "route-reveals": {
    anchor: { type: "cue", id: "connection" },
    duration: end("Watch the connection") - start("Watch the connection"),
  },
  "route-visible": {
    anchor: { type: "event", id: "route-reveals", edge: "start" },
    duration: start("connection") - start("Watch the connection"),
  },
});
plan.beats[1]!.bindings = bindings.parse({
  "access-changes": { anchor: { type: "cue", id: "restriction" }, duration: 0 },
  "pressure-arrives": {
    anchor: { type: "cue", id: "restriction" },
    offset: pressure - restriction,
    duration: restriction - pressure,
  },
  "opposition-arrives": {
    anchor: { type: "event", id: "pressure-arrives", edge: "start" },
    duration: restriction - pressure,
  },
  "pressure-visible": {
    anchor: { type: "event", id: "pressure-arrives", edge: "start" },
    offset: start("As pressure builds") - start("pressure builds"),
    duration: start("pressure builds") - start("As pressure builds"),
  },
  "opposition-visible": {
    anchor: { type: "event", id: "pressure-visible", edge: "start" },
    duration: start("pressure builds") - start("As pressure builds"),
  },
  "consequence-appears": {
    anchor: { type: "event", id: "access-changes", edge: "start" },
    duration: 10,
  },
});
plan.beats[2]!.bindings = bindings.parse({
  "consequence-appears": { anchor: { type: "cue", id: "grain" }, duration: 8 },
  "access-response": {
    anchor: { type: "cue", id: "consequence" },
    duration: 12,
  },
});

await mkdir(outputDirectory, { recursive: true });
const writeJson = async (file: string, data: unknown) =>
  writeFile(file, await format(JSON.stringify(data), { parser: "json" }));
for (const template of templates)
  await writeJson(
    resolve(outputDirectory, template.id + ".json"),
    StoryTemplateSchema.parse(template),
  );
await writeJson(
  resolve(outputDirectory, "access-story.json"),
  StoryAuthoringPlanSchema.parse(plan),
);
const sentences = script
  .match(/[^.!?]+[.!?]/g)!
  .map((sentence) => phrase(sentence.trim()));
const stamp = (seconds: number) =>
  new Date(Math.round(seconds * 1000))
    .toISOString()
    .slice(11, 23)
    .replace(".", ",");
await writeFile(
  resolve(audioDirectory, "captions.srt"),
  sentences
    .map(
      (sentence, index) =>
        `${index + 1}\n${stamp(sentence.start)} --> ${stamp(sentence.end)}\n${sentence.text}\n`,
    )
    .join("\n"),
);
await writeJson(resolve(audioDirectory, "timing.json"), {
  fps,
  frameCount,
  durationSeconds: duration,
  alignmentMethod:
    "Local mlx-whisper small.en word timestamps; rounded to nearest 24 fps frame",
  spokenEndSeconds: words.at(-1)!.end,
  shots: plan.beats.map((beat, index) => ({
    id: beat.id,
    start: starts[index],
    end: starts[index]! + beat.frameCount,
    cues: beat.cues.map((cue) => ({
      ...cue,
      globalFrame: starts[index]! + cue.frame,
    })),
  })),
  captions: sentences,
});
console.log({
  plan: relative(process.cwd(), resolve(outputDirectory, "access-story.json")),
  frameCount,
  duration,
  actionStart,
  consequenceStart,
});
