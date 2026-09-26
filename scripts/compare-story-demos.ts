import { access, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { storyComparison, type GalleryEntry } from "./story-motion/gallery.ts";

const { values } = parseArgs({
  options: { before: { type: "string" }, after: { type: "string" } },
  strict: true,
});
if (!values.before || !values.after)
  throw new Error("Pass --before <existing gallery> --after <new gallery>");
const before = resolve(values.before),
  after = resolve(values.after);
const entries: GalleryEntry[] = JSON.parse(
  await readFile("benchmarks/fixtures/story-motion/catalog.json", "utf8"),
);
for (const directory of [before, after])
  for (const entry of entries) await access(join(directory, `${entry.id}.mp4`));
await writeFile(
  join(after, "comparison.html"),
  storyComparison(after, before, entries),
  { flag: "wx" },
);
console.log(`Motion comparison: ${after}/comparison.html`);
