import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runEpisodeCli } from "../../tools/still-shift-cli/src/episode.ts";
import { MechanismCommandReceiptSchema } from "../../packages/animation-engine/src/mechanism/protocol.ts";
async function run(args: string[]) {
  let output = "";
  const code = await runEpisodeCli(args, {
    stdout: (value) => {
      output += value;
    },
    stderr: () => {},
  });
  return {
    code,
    output,
    receipt: MechanismCommandReceiptSchema.parse(JSON.parse(output)),
  };
}
describe("family registry CLI", () => {
  it("exposes family discovery with small examples and complete unabridged asset metadata", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "mechanism-family-registry-"),
    );
    const report = join(directory, "registry.json");
    const result = await run([
      "discover",
      "--family",
      "all",
      "--report",
      report,
    ]);
    expect(result.code).toBe(0);
    expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(32768);
    expect(result.receipt.summary.supportedPacks).toBe(0);
    expect(
      result.receipt.items.filter((item) => item.kind === "example"),
    ).toHaveLength(3);
    const complete = JSON.parse(await readFile(report, "utf8"));
    expect(complete.entries).toHaveLength(3);
    expect(complete.entries[2].metadata.pack.teachingShapes).toHaveLength(1);
    expect(
      result.receipt.artifacts.some((artifact) => artifact.path === report),
    ).toBe(true);
  });
  it("pages deterministic rows without losing the complete selected metadata", async () => {
    const result = await run([
      "discover",
      "--family",
      "clothespeg",
      "--offset",
      "1",
      "--limit",
      "1",
    ]);
    expect(result.code).toBe(0);
    expect(result.receipt.items).toHaveLength(1);
    expect(result.receipt.truncated).toBe(true);
    const artifact = result.receipt.artifacts.find(
      (artifact) => artifact.kind === "full-report",
    )!;
    expect(artifact).toBeDefined();
    const complete = JSON.parse(await readFile(artifact.path, "utf8"));
    expect(complete.entries.map((entry: { id: string }) => entry.id)).toEqual([
      "clothespeg",
    ]);
    expect(complete.entries[0].parameters).toHaveLength(3);
  });
  it("exports strict expanded schemas from the same registry and retains the complete schema report", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "mechanism-family-schemas-"),
    );
    for (const kind of [
      "tape-hook-input",
      "cable-tie-parameters",
      "clothespeg-input",
      "narrated-cycle",
      "pack-timeline",
      "scene-3",
      "family-registry-selection",
    ]) {
      const output = join(directory, `${kind}.json`);
      const result = await run(["schema", "--kind", kind, "--output", output]);
      expect(result.code).toBe(0);
      expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(32768);
      const schema = JSON.parse(await readFile(output, "utf8"));
      expect(schema.additionalProperties).toBe(false);
      if (kind === "narrated-cycle")
        expect(schema.properties.schemaVersion.const).toBe(
          "mechanism-narrated-cycle-1",
        );
    }
  });
  it("returns a located complete diagnostic report for unsupported family selectors", async () => {
    const result = await run(["discover", "--family", "gears"]);
    expect(result.code).toBe(2);
    expect(result.receipt.summary.path).toBe("family");
    const artifact = result.receipt.artifacts.find(
      (artifact) => artifact.kind === "full-report",
    )!;
    expect(
      JSON.parse(await readFile(artifact.path, "utf8")).diagnostics[0].path,
    ).toEqual(["family"]);
  });
});
