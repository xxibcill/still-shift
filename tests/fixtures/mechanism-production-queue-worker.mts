import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runMechanismProductionQueue } from "../../packages/animation-engine/src/mechanism/production-queue.ts";
import { executor } from "./mechanism-production-queue-support.ts";
const [manifest, output] = process.argv.slice(2);
if (!manifest || !output) throw Error("Worker requires manifest/output paths");
await runMechanismProductionQueue(
  manifest,
  output,
  executor(async (_item, context) => {
    await context.progress("blocked-export-fixture");
    await writeFile(
      join(context.attemptDirectory, "partial-frame.bin"),
      "retained-interrupted-fixture",
    );
    process.send?.("running");
    setInterval(() => {}, 1000);
    return await new Promise<never>(() => {});
  }),
);
