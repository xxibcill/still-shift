import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  CorpusManifestSchema,
  findCorpusFreezeBlockers,
} from "@still-shift/scene-contract";

const manifestPath = "benchmarks/corpus-manifest.json";
const manifest = CorpusManifestSchema.parse(
  JSON.parse(await readFile(manifestPath, "utf8")),
);
const blockers = findCorpusFreezeBlockers(manifest, {
  sourceRoot: dirname(resolve(manifestPath)),
});

if (blockers.length > 0) {
  process.stderr.write(
    `${manifestPath} is not ready to freeze:\n${blockers.map((blocker) => `- ${blocker}`).join("\n")}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${manifestPath} is frozen with ${manifest.entries.length} reviewed images.\n`,
  );
}
