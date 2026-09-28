import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { relative, resolve } from "node:path";
import { format } from "prettier";
import { accessArtwork, pressureArtwork } from "./illustrated-sequence/art.ts";
import {
  accessStory,
  detailReveal,
  actionStateChange,
  reactionConsequence,
} from "./illustrated-sequence/templates.ts";
import type { StoryScene } from "../packages/scene-contract/src/story.ts";

const directory = resolve("benchmarks/fixtures/illustrated-sequence");
const artDirectory = resolve("assets/illustrated-sequence");
await mkdir(directory, { recursive: true });
await mkdir(artDirectory, { recursive: true });
const assets: StoryScene["assets"] = [];
for (const [id, width, height] of [
  ["house", 600, 440],
  ["store", 600, 520],
] as const) {
  const path = resolve("assets/story-motion/art", id + ".svg");
  const bytes = await readFile(path);
  assets.push({
    id,
    width,
    height,
    path: relative(directory, path),
    sha256: "sha256:" + createHash("sha256").update(bytes).digest("hex"),
  });
}
for (const [id, body, width, height] of [
  ["access-open", accessArtwork(false), 800, 240],
  ["access-restricted", accessArtwork(true), 800, 240],
  ["pressure", pressureArtwork(), 240, 160],
] as const) {
  const path = resolve(artDirectory, id + ".svg");
  await writeFile(path, body);
  assets.push({
    id,
    path: relative(directory, path),
    sha256: "sha256:" + createHash("sha256").update(body).digest("hex"),
    width,
    height,
  });
}
const fontPath = resolve(
  "assets/story-motion/fonts/source-serif-4-semibold.otf",
);
const dependencies: Pick<StoryScene, "assets" | "fonts"> = {
  assets,
  fonts: [
    {
      id: "display",
      path: relative(directory, fontPath),
      weight: "600",
      sha256:
        "sha256:" +
        createHash("sha256")
          .update(await readFile(fontPath))
          .digest("hex"),
    },
  ],
};
for (const build of [detailReveal, actionStateChange, reactionConsequence]) {
  const template = build(dependencies);
  await writeFile(
    resolve(directory, template.id + ".json"),
    await format(JSON.stringify(template), { parser: "json" }),
  );
}
await writeFile(
  resolve(directory, "access-story.json"),
  await format(JSON.stringify(accessStory()), { parser: "json" }),
);
console.log({
  templates: 3,
  frames: 720,
  plan: relative(process.cwd(), resolve(directory, "access-story.json")),
});
