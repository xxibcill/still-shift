import { generateCompositionReference } from "./generate-composition-reference.ts";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CompositionSchema,
  SoundtrackProjectSchema,
  CorpusManifestSchema,
} from "@still-shift/scene-contract";
import { format } from "prettier";
import { z } from "zod";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** JSON Schemas generated from contracts, for editors and AI agents. */
const targets = [
  {
    schema: SoundtrackProjectSchema,
    path: "packages/scene-contract/schemas/soundtrack-project-1.schema.json",
    id: "https://still-shift.local/schemas/soundtrack-project-1.json",
    title:
      "Soundtrack project (structure; validateSoundtrackProject checks semantics)",
    reused: "ref" as const,
  },
  {
    schema: CorpusManifestSchema,
    path: "benchmarks/corpus-manifest.schema.json",
    id: "https://still-shift.local/schemas/corpus-manifest-0.1.json",
    title: "Still Shift Phase 0 corpus manifest",
  },
  {
    schema: CompositionSchema,
    path: "packages/scene-contract/schemas/composition-1.schema.json",
    id: "https://still-shift.local/schemas/composition-1.json",
    title:
      "Still Shift composition-1 (structure only; run validateComposition for semantic rules)",
    reused: "ref" as const,
  },
];

const stale: string[] = [];
for (const target of targets) {
  const schemaPath = resolve(repositoryRoot, target.path);
  const { $schema, ...contract } = z.toJSONSchema(target.schema, {
    target: "draft-2020-12",
    ...("reused" in target ? { reused: target.reused } : {}),
  });
  const serializedSchema = await format(
    JSON.stringify({
      $schema,
      $id: target.id,
      title: target.title,
      ...contract,
    }),
    { parser: "json" },
  );
  if (process.argv.includes("--check")) {
    const checkedIn = await readFile(schemaPath, "utf8").catch(() => "");
    if (checkedIn !== serializedSchema) stale.push(target.path);
  } else {
    await writeFile(schemaPath, serializedSchema, "utf8");
    process.stdout.write(`Generated ${schemaPath}\n`);
  }
}
if (stale.length)
  throw new Error(
    `JSON Schema is stale: ${stale.join(", ")}. Run pnpm schema:generate and commit the result.`,
  );

await generateCompositionReference(
  repositoryRoot,
  process.argv.includes("--check"),
);
