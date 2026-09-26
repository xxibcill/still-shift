import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import {
  storyContactSheet,
  storyGallery,
  type GalleryEntry,
} from "./story-motion/gallery.ts";

const { values } = parseArgs({
  options: {
    gallery: {
      type: "string",
      default: "benchmarks/results/story-motion-v013",
    },
    previous: {
      type: "string",
      default: "benchmarks/results/story-motion-v012",
    },
    comparison: {
      type: "string",
      default: "benchmarks/results/story-motion-s01e01-proof-v010",
    },
    resources: {
      type: "string",
      default: "benchmarks/results/story-motion-s01e01-resources-v003",
    },
    output: { type: "string", default: "docs/review/story-motion-v013" },
  },
  strict: true,
});

const output = resolve(values.output);
const gallery = resolve(values.gallery);
const previous = resolve(values.previous);
const comparison = resolve(values.comparison);
const resources = resolve(values.resources);
const run = promisify(execFile);
const entries: GalleryEntry[] = JSON.parse(
  await readFile("benchmarks/fixtures/story-motion/catalog.json", "utf8"),
);
await mkdir(join(output, "prior"), { recursive: true });
await mkdir(join(output, "proofs"), { recursive: true });
for (const entry of entries) {
  for (const suffix of [".mp4", ".png", "-motion.jpg", ".handoff.json"])
    await copyFile(
      join(gallery, `${entry.id}${suffix}`),
      join(output, `${entry.id}${suffix}`),
    );
}
for (const name of ["dated-system-reset.png", "quality-report.json"])
  await copyFile(join(gallery, name), join(output, name));
await copyFile(
  join(previous, "evidence-boundary.mp4"),
  join(output, "prior/evidence-boundary.mp4"),
);
await run("ffmpeg", [
  "-v",
  "error",
  "-y",
  "-i",
  join(previous, "evidence-boundary.mp4"),
  "-vf",
  "select=eq(n\\,166),scale=350:197:flags=lanczos",
  "-frames:v",
  "1",
  join(output, "prior/evidence-phone.png"),
]);
for (const [frame, name] of [
  [44, "supported"],
  [84, "unknown"],
  [166, "composite"],
] as const)
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    join(gallery, "evidence-boundary.mp4"),
    "-vf",
    `select=eq(n\\,${frame}),scale=350:197:flags=lanczos`,
    "-frames:v",
    "1",
    join(output, `evidence-phone-${name}.png`),
  ]);

const proofSources = [
  {
    id: "comparison-access",
    source: comparison,
    video: "s01e01-comparison-access.mp4",
  },
  { id: "resources", source: resources, video: "s01e01-resource-passage.mp4" },
] as const;
for (const proof of proofSources) {
  await copyFile(
    join(proof.source, proof.video),
    join(output, "proofs", proof.video),
  );
  await copyFile(
    join(proof.source, "proof-motion.jpg"),
    join(output, "proofs", `${proof.id}-motion.jpg`),
  );
  const handoff = JSON.parse(
    await readFile(join(proof.source, "handoff.json"), "utf8"),
  );
  await writeFile(
    join(output, "proofs", `${proof.id}.json`),
    JSON.stringify(
      {
        status: handoff.status,
        episode: handoff.episode,
        startFrame: handoff.startFrame,
        endFrameExclusive: handoff.endFrameExclusive,
        frameCount: handoff.frameCount,
        fps: handoff.fps,
        narration: {
          sha256: handoff.narration.sha256,
          startSeconds: handoff.narration.startSeconds,
          endSeconds: handoff.narration.endSeconds,
        },
        videoSha256: handoff.video.sha256,
        limitations: handoff.limitations,
      },
      null,
      2,
    ) + "\n",
  );
}

await writeFile(
  join(output, "contact-sheet.html"),
  storyContactSheet(output, entries),
);
const galleryPage = storyGallery(output, entries).replace(
  "<footer>",
  `<section class="motion"><div><h2>Review the changes</h2><p>Compare the earlier Evidence Boundary with its staged revision, then watch two narrated episode candidates.</p></div><div><p><a href="comparison.html">Evidence Boundary before and after</a></p><p><a href="proofs/s01e01-comparison-access.mp4">Comparison and access proof · 646 frames</a> · <a href="proofs/comparison-access-motion.jpg">contact sheet</a></p><p><a href="proofs/s01e01-resource-passage.mp4">Resource passage proof · 1507 frames</a> · <a href="proofs/resources-motion.jpg">contact sheet</a></p><p><a href="quality-report.json">Quality measurements</a> · <a href="README.md">Review notes and provenance</a></p></div></section><footer>`,
);
await writeFile(join(output, "index.html"), galleryPage);
await writeFile(
  join(output, "comparison.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evidence Boundary · before and after</title><style>body{margin:0;background:#e8dfc9;color:#211f1b;font:17px/1.5 Georgia,serif}main{max-width:1200px;margin:auto;padding:32px}a{color:#8b3f36}section{display:grid;grid-template-columns:1fr 1fr;gap:24px}video{width:100%;aspect-ratio:16/9}.phones{display:flex;gap:16px;flex-wrap:wrap}.phones img{width:350px;max-width:100%}@media(max-width:720px){section{grid-template-columns:1fr}}</style><main><p><a href="index.html">All seven studies</a></p><h1>Evidence Boundary · before and after</h1><section><div><h2>v012 · simultaneous columns</h2><video controls muted playsinline src="prior/evidence-boundary.mp4"></video><img width="350" height="197" src="prior/evidence-phone.png" alt="Earlier layout at 350 px"></div><div><h2>v013 · held stages</h2><video controls muted playsinline src="evidence-boundary.mp4"></video><div class="phones"><img src="evidence-phone-supported.png" alt="Supported categories at 350 px"><img src="evidence-phone-unknown.png" alt="Unknown details at 350 px"><img src="evidence-phone-composite.png" alt="Composite household at 350 px"></div></div></section><p>The final render measures 14.22 px minimum essential text at 350 px and holds the settled composite for 2.33 seconds. These samples do not establish continuous audiovisual acceptance.</p></main></html>`,
);
await writeFile(
  join(output, "README.md"),
  `# Story motion PR review · v013\n\n` +
    `This directory is tracked so the [seven silent studies](index.html), [Evidence Boundary comparison](comparison.html), [quality report](quality-report.json), and narrated proofs below open in a fresh checkout. Open the HTML files locally for the galleries; GitHub can display the linked media directly.\n\n` +
    `- [Comparison and access proof](proofs/s01e01-comparison-access.mp4) · [motion sheet](proofs/comparison-access-motion.jpg) · [timing and checksums](proofs/comparison-access.json)\n` +
    `- [Resource passage proof](proofs/s01e01-resource-passage.mp4) · [motion sheet](proofs/resources-motion.jpg) · [timing and checksums](proofs/resources.json)\n\n` +
    `The proof videos contain the existing narration. The recorded source path is omitted from the published provenance; its checksum and source interval are retained. These are local graphic candidates, not edits to the selected episode timeline. The story studies are silent.\n\n` +
    `Rebuild the gallery with \`pnpm story:prepare\` and \`pnpm story:render --output-dir benchmarks/results/story-motion-v013\`. Then run \`pnpm story:review\` with the four local render directories present. The publishing script accepts \`--gallery\`, \`--previous\`, \`--comparison\`, \`--resources\`, and \`--output\` overrides. Narrated proofs require the episode's local narration source and are not regenerated by the gallery command.\n\n` +
    `The advisory report retains phone-width warnings for the other six studies. The Evidence Boundary comparison shows its three staged claims at 350 px. Continuous normal-speed viewing, listening and episode integration remain open review decisions.\n`,
);
await run("pnpm", [
  "exec",
  "prettier",
  "--write",
  ...[
    "README.md",
    "index.html",
    "comparison.html",
    "contact-sheet.html",
    "quality-report.json",
    "proofs/comparison-access.json",
    "proofs/resources.json",
    ...entries.map((entry) => `${entry.id}.handoff.json`),
  ].map((name) => join(output, name)),
]);
console.log(`Published review bundle: ${output}`);
