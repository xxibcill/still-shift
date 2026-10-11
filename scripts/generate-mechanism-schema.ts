import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { z } from "zod";
import {
  MechanismNarratedCycleSchema,
  MechanismPackTimelineSchema,
  SolidGeometryV2Schema,
  NativeFrameSnapshotV3Schema,
  CompositionPreparedNative3DV3Schema,
  MechanismGeometrySchema,
  MechanismSceneSchema,
  MechanismEpisodeSchema,
  MechanismFrameResultSchema,
  MechanismSidecarSchema,
  MechanismPackDocumentSchema,
  MechanismSceneV2Schema,
  MechanismSceneV3Schema,
  MechanismFrameResultV2Schema,
  MechanismRigV2Schema,
  MechanismTeachingShapeSchema,
} from "@still-shift/scene-contract";
import {
  MechanismPatchRequestSchema,
  MechanismCommandReceiptSchema,
} from "../packages/animation-engine/src/mechanism/protocol.ts";
import {
  MechanismPrimitiveInputSchema,
  MechanismPrimitiveGeometryInputSchema,
} from "../packages/animation-engine/src/mechanism/primitive-contract.ts";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemas = {
  "narrated-cycle": MechanismNarratedCycleSchema,
  "pack-timeline": MechanismPackTimelineSchema,
  "solid-geometry-2": SolidGeometryV2Schema,
  "native-frame-3": NativeFrameSnapshotV3Schema,
  "prepared-native3d-3": CompositionPreparedNative3DV3Schema,
  geometry: MechanismGeometrySchema,
  scene: MechanismSceneSchema,
  episode: MechanismEpisodeSchema,
  frame: MechanismFrameResultSchema,
  sidecar: MechanismSidecarSchema,
  patch: MechanismPatchRequestSchema,
  receipt: MechanismCommandReceiptSchema,
  pack: MechanismPackDocumentSchema,
  primitive: MechanismPrimitiveInputSchema,
  "primitive-catalogue": MechanismPrimitiveGeometryInputSchema,
  "scene-2": MechanismSceneV2Schema,
  "scene-3": MechanismSceneV3Schema,
  "frame-2": MechanismFrameResultV2Schema,
  "rig-2": MechanismRigV2Schema,
  "teaching-shape": MechanismTeachingShapeSchema,
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
