import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  readStoryPassage,
  writePreparedPassage,
} from "./story-motion/passage-files.ts";
import { passageGallery } from "./story-motion/passage-gallery.ts";
import {
  renderStoryPassage,
  verifyPassageNarration,
} from "./story-motion/passage-render.ts";

const { values } = parseArgs({
  options: {
    plan: { type: "string" },
    "output-dir": { type: "string" },
    narration: { type: "string" },
    silent: { type: "boolean", default: false },
    "prepare-only": { type: "boolean", default: false },
  },
  strict: true,
});
if (!values.plan || !values["output-dir"])
  throw new Error(
    "Pass --plan <beat plan.json> --output-dir <new directory>, plus --narration <WAV>, --silent, or --prepare-only",
  );
const choices = [
  Boolean(values.narration),
  values.silent,
  values["prepare-only"],
].filter(Boolean).length;
if (choices !== 1)
  throw new Error(
    "Choose exactly one of --narration, --silent or --prepare-only",
  );
const passage = await readStoryPassage(values.plan);
const output = resolve(values["output-dir"]);
const narration = values.narration ? resolve(values.narration) : undefined;
if (narration) await verifyPassageNarration(passage, narration);
await writePreparedPassage(output, passage);
if (!values["prepare-only"])
  await renderStoryPassage(output, passage, narration);
const mode = values["prepare-only"]
  ? "prepared"
  : narration
    ? "narrated"
    : "silent";
await writeFile(
  join(output, "index.html"),
  passageGallery(output, passage, mode),
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    status: mode,
    plan: passage.plan.id,
    frameCount: passage.frameCount,
    review: join(output, "index.html"),
  }),
);
