import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { runMechanismProductionQueue } from "@still-shift/animation-engine";
import {
  fixture,
  executor,
  product,
} from "../fixtures/mechanism-production-queue-support.ts";
import { mechanismPackHash } from "../../packages/animation-engine/src/mechanism/pack-support.ts";
import { MechanismCommandReceiptSchema } from "../../packages/animation-engine/src/mechanism/protocol.ts";
describe("targeted retry CLI on fixture journal", () => {
  it("publishes one bounded CAS authorization without executing or editing the journal, then rejects the stale request", async () => {
    const f = await fixture();
    try {
      await runMechanismProductionQueue(
        f.path,
        f.output,
        executor(async (item, context) => {
          if (item.id === "E02") throw Error("fixture failure");
          return product(item, context);
        }),
      );
      const request = join(f.root, "retry.json");
      await writeFile(
        request,
        JSON.stringify({
          schemaVersion: "mechanism-production-retry-1",
          baseRevision: 0,
          baseHash: mechanismPackHash(f.manifest),
          episodes: ["E02"],
        }),
      );
      const journal = await readFile(join(f.output, "queue-state.json"));
      const invoke = async (report: string) => {
        let stdout = "",
          stderr = "";
        const code = await runCli(
          [
            "production",
            "retry",
            "--manifest",
            f.path,
            "--output-dir",
            f.output,
            "--request",
            request,
            "--report",
            report,
          ],
          {
            stdout: (v) => {
              stdout += v;
            },
            stderr: (v) => {
              stderr += v;
            },
          },
        );
        return { code, stdout, stderr };
      };
      const result = await invoke(join(f.root, "result.json"));
      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
      const receipt = MechanismCommandReceiptSchema.parse(
        JSON.parse(result.stdout),
      );
      expect(receipt.command).toBe("patch");
      expect(receipt.summary).toMatchObject({
        revision: 1,
        retries: 1,
        execution: "not-started",
      });
      expect(receipt.items.map((i) => i.id)).toEqual(["E02"]);
      expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(32768);
      expect(await readFile(join(f.output, "queue-state.json"))).toEqual(
        journal,
      );
      expect((await invoke(join(f.root, "stale.json"))).code).toBe(2);
      expect(await readFile(join(f.output, "queue-state.json"))).toEqual(
        journal,
      );
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
});
