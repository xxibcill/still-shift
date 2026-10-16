import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { z } from "zod";
import {
  MechanismGeometrySchema,
  MechanismSceneSchema,
  MechanismEpisodeSchema,
  MechanismFrameResultSchema,
  MechanismSidecarSchema,
} from "@still-shift/scene-contract";
import {
  MechanismPatchRequestSchema,
  MechanismCommandReceiptSchema,
} from "../packages/animation-engine/src/mechanism/protocol.ts";
import { mechanismFamilySchemas } from "../packages/animation-engine/src/mechanism/family-registry.ts";
import {
  mechanismProductionSchemas,
  mechanismProductionCapabilityMarkdown,
} from "../packages/animation-engine/src/mechanism/production-registry.ts";
import { mediaCapabilityMarkdown } from "../tools/still-shift-cli/src/media-capabilities.ts";
import { NativeCoverageBoardSchema } from "./mechanism/native-coverage-board.ts";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemas = {
  ...mechanismFamilySchemas,
  ...mechanismProductionSchemas,
  "native-coverage-board": NativeCoverageBoardSchema,
  geometry: MechanismGeometrySchema,
  scene: MechanismSceneSchema,
  episode: MechanismEpisodeSchema,
  frame: MechanismFrameResultSchema,
  sidecar: MechanismSidecarSchema,
  patch: MechanismPatchRequestSchema,
  receipt: MechanismCommandReceiptSchema,
};
const stale: string[] = [];
for (const [kind, schema] of Object.entries(schemas)) {
  const path = resolve(root, `docs/schemas/mechanism/${kind}.schema.json`);
  const content = await format(
    JSON.stringify(z.toJSONSchema(schema, { unrepresentable: "any" })),
    { parser: "json" },
  );
  if (process.argv.includes("--check")) {
    if ((await readFile(path, "utf8").catch(() => "")) !== content)
      stale.push(kind);
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
}
if (stale.length)
  throw new Error(
    `Stale mechanism schemas: ${stale.join(", ")}. Run pnpm schema:generate.`,
  );

const capabilityPath = resolve(
  root,
  "docs/mechanism-production-capabilities.md",
);
const capabilities = await format(
  mechanismProductionCapabilityMarkdown() + mediaCapabilityMarkdown(),
  {
    parser: "markdown",
  },
);
if (process.argv.includes("--check")) {
  if ((await readFile(capabilityPath, "utf8").catch(() => "")) !== capabilities)
    throw Error(
      "Stale production capability reference. Run pnpm schema:generate.",
    );
} else await writeFile(capabilityPath, capabilities);
