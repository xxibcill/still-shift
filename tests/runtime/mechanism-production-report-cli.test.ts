import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import {
  inspectMechanismProductionCapabilities,
  mechanismProductionCapabilityMarkdown,
  MechanismProductionReportBundleSchema,
} from "@still-shift/animation-engine";
import { MechanismCommandReceiptSchema } from "../../packages/animation-engine/src/mechanism/protocol.ts";
async function run(args: string[]) {
  let stdout = "",
    stderr = "";
  const code = await runCli(["production", ...args], {
    stdout: (v) => {
      stdout += v;
    },
    stderr: (v) => {
      stderr += v;
    },
  });
  return { code, stdout, stderr };
}
describe("production discovery and schema CLI", () => {
  it("shares actual machine limits with the generated reference and returns one complete bounded report", async () => {
    const dir = await mkdtemp(join(tmpdir(), "production-cli-")),
      path = join(dir, "caps.json");
    const result = await run(["discover", "--report", path]);
    expect(result.code).toBe(0);
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(32768);
    const receipt = MechanismCommandReceiptSchema.parse(
      JSON.parse(result.stdout),
    );
    expect(receipt.artifacts).toHaveLength(1);
    const caps = JSON.parse(await readFile(path, "utf8"));
    expect(caps).toEqual(inspectMechanismProductionCapabilities());
    expect(caps.queue.items).toBe(300);
    expect(caps.nativeExecutor.profile.workers).toBe(1);
    const generated = await readFile(
      "docs/mechanism-production-capabilities.md",
      "utf8",
    );
    expect(generated).toContain("300");
    expect(mechanismProductionCapabilityMarkdown()).toContain(
      String(caps.reports.completeBytes),
    );
  });
  it("exports the current strict episode, cohort, complete bundle, queue and semantic schemas", async () => {
    const dir = await mkdtemp(join(tmpdir(), "production-cli-schema-"));
    for (const kind of [
      "production-episode-report",
      "production-cohort-report",
      "production-report-bundle",
      "production-queue",
      "semantic-registration",
      "production-evidence",
      "production-handoff",
      "production-qa-plan",
      "production-qa-program",
      "production-qa-facts",
    ]) {
      const path = join(dir, kind + ".json"),
        result = await run(["schema", "--kind", kind, "--output", path]);
      expect(result.code).toBe(0);
      const schema = JSON.parse(await readFile(path, "utf8"));
      expect(schema.additionalProperties).toBe(false);
      expect(schema.properties.schemaVersion.const).toContain("mechanism-");
    }
    expect(
      MechanismProductionReportBundleSchema.safeParse({
        schemaVersion: "unknown",
      }).success,
    ).toBe(false);
  });
  it("rejects unsupported/ambiguous flags and invalid pagination before attempting input reads or overwriting a report", async () => {
    const dir = await mkdtemp(join(tmpdir(), "production-cli-negative-")),
      path = join(dir, "owned.json");
    await writeFile(path, "owned");
    for (const args of [
      ["schema", "--kind", "unknown", "--output", path],
      [
        "report",
        "--manifest",
        "/missing",
        "--output-dir",
        "/missing",
        "--limit",
        "101",
      ],
      ["report", "--manifest", "/missing", "--manifest", "/missing"],
      ["discover", "--unknown", "value"],
    ]) {
      expect((await run(args)).code).toBe(2);
    }
    expect((await run(["discover", "--report", path])).code).toBe(2);
    expect(await readFile(path, "utf8")).toBe("owned");
  });
});
