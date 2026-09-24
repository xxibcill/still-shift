import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  findCorpusFreezeBlockers,
  type CorpusEntry,
  type CorpusFreezeBlocker,
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
): CorpusFreezeBlocker[] => {
  let source: Buffer;
  try {
    source = readFileSync(resolve(sourceRoot, entry.source.path));
  } catch {
    return [
      {
        code: "SOURCE_UNREADABLE",
        message: `corpus source is unreadable: ${entry.id}`,
        entryId: entry.id,
      },
    ];
  }

  const blockers: CorpusFreezeBlocker[] = [];
  if (entry.source.sha256 !== null && sha256(source) !== entry.source.sha256) {
    blockers.push({
      code: "SOURCE_CHECKSUM_MISMATCH",
      message: `corpus source checksum does not match: ${entry.id}`,
      entryId: entry.id,
    });
  }

  try {
    const dimensions = imageSize(source);
    if (
      dimensions.width !== entry.dimensions.width ||
      dimensions.height !== entry.dimensions.height
    ) {
      blockers.push({
        code: "SOURCE_DIMENSIONS_MISMATCH",
        message: `corpus source dimensions do not match: ${entry.id}`,
        entryId: entry.id,
      });
    }
  } catch {
    blockers.push({
      code: "SOURCE_DIMENSIONS_UNREADABLE",
      message: `corpus source dimensions are unreadable: ${entry.id}`,
      entryId: entry.id,
    });
  }

  return blockers;
};

export const findCorpusIntegrityBlockers = (
  manifest: CorpusManifest,
  options: CorpusIntegrityOptions = {},
): CorpusFreezeBlocker[] => {
  const sourceRoot = options.sourceRoot ?? ".";

  return [
    ...findCorpusFreezeBlockers(manifest),
    ...manifest.entries.flatMap((entry) =>
      findSourceBlockers(entry, sourceRoot),
    ),
  ];
};
