import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  CorpusManifestSchema,
  ENGINE_VERSION,
  findCorpusFreezeBlockers,
} from "@still-shift/scene-contract";
import { imageSize } from "image-size";
import { EVALUATION_PRESETS, evaluationClipId } from "./presets.ts";

const arg = (name: string): string => {
  const index = process.argv.indexOf(name);
  const value = process.argv[index + 1];
  if (index < 0 || !value || value.startsWith("--"))
    throw new Error(`Missing ${name}`);
  return value;
};

const corpusPath = resolve(arg("--corpus"));
const outputPath = resolve(arg("--output"));
const allowCandidate = process.argv.includes("--allow-candidate");
const corpusBytes = await readFile(corpusPath);
const corpus = CorpusManifestSchema.parse(
  JSON.parse(corpusBytes.toString("utf8")),
);
if (
  (corpus.status !== "frozen" ||
    corpus.review.status !== "approved" ||
    corpus.frozenAt === null) &&
  !allowCandidate
)
  throw new Error(
    "Corpus is not approved and frozen; pass --allow-candidate for a private technical run",
  );
if (corpus.entries.length === 0) throw new Error("Corpus has no source images");
if (corpus.status === "frozen") {
  const blockers = findCorpusFreezeBlockers(corpus);
  if (blockers.length)
    throw new Error(`Frozen corpus has ${blockers.length} integrity blockers`);
}

const items: Array<Record<string, unknown>> = [];
for (const entry of corpus.entries) {
  const path = resolve(dirname(corpusPath), entry.source.path);
  const bytes = await readFile(path);
  const hash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (entry.source.sha256 !== hash)
    throw new Error(`Source checksum mismatch: ${entry.id}`);
  const dimensions = imageSize(bytes);
  if (
    dimensions.width !== entry.dimensions.width ||
    dimensions.height !== entry.dimensions.height
  )
    throw new Error(`Source dimensions mismatch: ${entry.id}`);
  for (const preset of EVALUATION_PRESETS)
    items.push({
      id: evaluationClipId(entry.id, preset),
      inputPath: path,
      durationMs: entry.expectedShotDurationMs,
      preset,
      intensity: "standard",
      seed: 1842,
    });
}
await writeFile(
  outputPath,
  `${items.map((item) => JSON.stringify(item)).join("\n")}\n`,
  {
    flag: "wx",
  },
);
const metadata = {
  corpusPath,
  corpusId: corpus.corpusId,
  corpusStatus: corpus.status,
  corpusSha256: `sha256:${createHash("sha256").update(corpusBytes).digest("hex")}`,
  engineVersion: ENGINE_VERSION,
  entryCount: corpus.entries.length,
  requestCount: items.length,
  presets: EVALUATION_PRESETS,
  intensity: "standard",
};
await writeFile(
  `${outputPath}.metadata.json`,
  `${JSON.stringify(metadata, null, 2)}\n`,
  {
    flag: "wx",
  },
);
process.stdout.write(`${JSON.stringify(metadata)}\n`);
