import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findCorpusFreezeBlockers,
  type CorpusEntry,
  type CorpusManifest,
} from "@still-shift/scene-contract";
import { imageSize } from "image-size";

type CorpusIntegrityOptions = {
  sourceRoot?: string;
};

const sha256 = (source: Uint8Array): string =>
  `sha256:${createHash("sha256").update(source).digest("hex")}`;

const findSourceBlockers = (
  entry: CorpusEntry,
  sourceRoot: string,
): string[] => {
  let source: Buffer;
  try {
    source = readFileSync(resolve(sourceRoot, entry.source.path));
  } catch {
    return [`corpus source is unreadable: ${entry.id}`];
  }

  const blockers: string[] = [];
  if (entry.source.sha256 !== null && sha256(source) !== entry.source.sha256) {
    blockers.push(`corpus source checksum does not match: ${entry.id}`);
  }

  try {
    const dimensions = imageSize(source);
    if (
      dimensions.width !== entry.dimensions.width ||
      dimensions.height !== entry.dimensions.height
    ) {
      blockers.push(`corpus source dimensions do not match: ${entry.id}`);
    }
  } catch {
    blockers.push(`corpus source dimensions are unreadable: ${entry.id}`);
  }

  return blockers;
};

export const findCorpusIntegrityBlockers = (
  manifest: CorpusManifest,
  options: CorpusIntegrityOptions = {},
): string[] => {
  const sourceRoot = options.sourceRoot ?? ".";

  return [
    ...findCorpusFreezeBlockers(manifest),
    ...manifest.entries.flatMap((entry) =>
      findSourceBlockers(entry, sourceRoot),
    ),
  ];
};
