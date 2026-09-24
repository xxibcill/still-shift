import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CorpusManifestSchema } from "@still-shift/scene-contract";
import { format } from "prettier";
import { z } from "zod";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = resolve(
  repositoryRoot,
  "benchmarks/corpus-manifest.schema.json",
);

const generatedContract = z.toJSONSchema(CorpusManifestSchema, {
  target: "draft-2020-12",
});
const { $schema, ...contract } = generatedContract;
const generatedSchema = {
  $schema,
  $id: "https://still-shift.local/schemas/corpus-manifest-0.1.json",
  title: "Still Shift Phase 0 corpus manifest",
  ...contract,
};
const serializedSchema = await format(JSON.stringify(generatedSchema), {
  parser: "json",
});

if (process.argv.includes("--check")) {
  const checkedInSchema = await readFile(schemaPath, "utf8");
  if (checkedInSchema !== serializedSchema) {
    throw new Error(
      "Corpus JSON Schema is stale. Run pnpm schema:generate and commit the result.",
    );
  }
} else {
  await writeFile(schemaPath, serializedSchema, "utf8");
  process.stdout.write(`Generated ${schemaPath}\n`);
}
