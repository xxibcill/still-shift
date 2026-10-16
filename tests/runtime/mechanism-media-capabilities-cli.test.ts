import { readFile, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { CompositionNative3DAssetVersionsSchema } from "@still-shift/scene-contract";
import { COMPOSITION_OUTPUT_FORMATS } from "@still-shift/execution-runtime/export";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { MechanismCommandReceiptSchema } from "../../packages/animation-engine/src/mechanism/protocol.ts";

describe("scoped media discovery", () => {
  it("keeps import, render and batch scope consistent between both real CLI reports and generated docs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "media-capabilities-"));
    const reports = [];
    for (const route of ["episode", "production"]) {
      const report = join(directory, route + ".json");
      let stdout = "",
        stderr = "";
      const code = await runCli([route, "discover", "--report", report], {
        stdout: (v) => {
          stdout += v;
        },
        stderr: (v) => {
          stderr += v;
        },
      });
      expect(code, stderr).toBe(0);
      expect(Buffer.byteLength(stdout)).toBeLessThanOrEqual(32768);
      const receipt = MechanismCommandReceiptSchema.parse(JSON.parse(stdout));
      expect(
        receipt.items.some((row) => row.kind === "import-capability"),
      ).toBe(true);
      expect(
        receipt.items.filter((row) => row.kind === "render-capability"),
      ).toHaveLength(3);
      reports.push(JSON.parse(await readFile(report, "utf8")));
    }
    expect(reports[0].summary.nativeSourceVersions).toBe(
      "mechanism-scene-1 solid-scene-1",
    );
    expect(reports[0].media).toEqual(reports[1].media);
    const media = reports[0].media;
    const native = media.routes.find(
      (row: { id: string }) => row.id === "composition-native",
    );
    expect(native.sources).toEqual(
      CompositionNative3DAssetVersionsSchema.shape.format.options,
    );
    expect(native.formats).toEqual(COMPOSITION_OUTPUT_FORMATS);
    expect(native.workers).toEqual([1]);
    expect(
      media.routes.find((row: { id: string }) => row.id === "episode-legacy")
        .nativeSources,
    ).not.toContain("mechanism-scene-3");
    expect(media.imports.rigidGltf.cliImport).toBe(false);
    expect(media.imports.rigidGltf.limits.sourceBytes).toBe(32 * 1024 ** 2);
    expect(media.batch.image.concurrency).toEqual([1, 2]);
    expect(media.batch.mechanism).toMatchObject({ items: 300, workers: 1 });
    const generated = await readFile(
      "docs/mechanism-production-capabilities.md",
      "utf8",
    );
    for (const source of native.sources) expect(generated).toContain(source);
    for (const format of native.formats) expect(generated).toContain(format);
    expect(generated).toContain("without a glTF import CLI");
    expect(generated).toContain("not an episode composition queue");
  });
});
