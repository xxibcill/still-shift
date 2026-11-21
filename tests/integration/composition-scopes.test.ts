/**
 * CG3: `comp scopes`, `comp probe` and `comp grade diff` on the CG0 fixtures.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import {
  ColorScopesReportSchema,
  measureColorScopes,
} from "../../packages/animation-engine/src/composition-color-scopes.ts";
import { decodeCompositionRgbaPng } from "../../packages/animation-engine/src/composition-media-color.ts";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import {
  floatGradeBytes,
  floatGradeOp,
} from "../../packages/renderer-core/src/composition/render/float-grade.ts";

const fixtures = join(
  import.meta.dirname,
  "../../benchmarks/fixtures/color/cg0",
);
const clip = join(fixtures, "media/moving-disc.mp4");
let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cg3-scopes-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
async function run(args: string[]) {
  let stdout = "",
    stderr = "";
  const code = await runCli(["comp", ...args], {
    stdout: (value) => void (stdout += value),
    stderr: (value) => void (stderr += value),
  });
  return { code, stdout, stderr };
}
const failure = (stderr: string) =>
  JSON.parse(stderr.trim().split("\n").at(-1)!) as {
    diagnostics: { code: string }[];
  };

describe("comp scopes", () => {
  it("embeds color-stats' statistics unchanged and validates against its schema", async () => {
    const scopes = await run(["scopes", "--input", clip]);
    expect(scopes.code, scopes.stderr).toBe(0);
    const report = JSON.parse(scopes.stdout);
    expect(ColorScopesReportSchema.safeParse(report).success).toBe(true);
    const stats = await run(["color-stats", "--input", clip]);
    expect(report.statistics).toEqual(JSON.parse(stats.stdout).statistics);
    expect(report.selection.ordinals).toEqual(
      JSON.parse(stats.stdout).sampledOrdinals,
    );
  });
  it("is byte-stable across reruns, including the scope images", async () => {
    const reports: string[] = [];
    const images: string[] = [];
    for (const n of [1, 2]) {
      const dir = join(root, `images-${n}`);
      const result = await run([
        "scopes",
        "--input",
        clip,
        "--frame-range",
        "10:14",
        "--images",
        dir,
      ]);
      expect(result.code, result.stderr).toBe(0);
      reports.push(result.stdout);
      const hashes = [];
      for (const name of [
        "waveform.png",
        "parade.png",
        "vectorscope.png",
        "cie1931.png",
      ])
        hashes.push(
          createHash("sha256")
            .update(await readFile(join(dir, name)))
            .digest("hex"),
        );
      images.push(hashes.join(","));
    }
    expect(reports[1]).toBe(reports[0]);
    expect(images[1]).toBe(images[0]);
    expect(JSON.parse(reports[0]!).selection.ordinals).toEqual([
      10, 11, 12, 13,
    ]);
  });
  it("measures a region: background only has no skin and a green-grey hue", async () => {
    // Top-left corner: the disc never enters it.
    const result = await run([
      "scopes",
      "--input",
      clip,
      "--region",
      "0,0,40,40",
    ]);
    expect(result.code, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.selection.region).toEqual({
      x: 0,
      y: 0,
      width: 40,
      height: 40,
    });
    expect(report.statistics.pixels).toBe(12 * 20 * 20);
    const shares: number[] = report.measurement.hue.shares;
    // Background encoded (0.42, 0.45, 0.36): HSV hue exactly 80°, the edge
    // between bins 7 and 8, so noise splits it: the two hold most pixels.
    expect(shares[7]! + shares[8]!).toBeGreaterThan(0.6);
    expect(report.measurement.skin.pixels).toBe(0);
  });
  it("batches frames within the media limit with identical results", async () => {
    const whole = await measureColorScopes(clip, { range: [0, 8] });
    const frameBytes = 640 * 360 * 4;
    const batched = await measureColorScopes(
      clip,
      { range: [0, 8] },
      { limits: { decodedFrameBytes: frameBytes * 3 } },
    );
    expect(batched.selection.batchFrames).toBe(3);
    expect({
      ...batched,
      selection: { ...batched.selection, batchFrames: 0 },
    }).toEqual({
      ...whole,
      selection: { ...whole.selection, batchFrames: 0 },
    });
  });
  it("fails clearly when one frame is over the media limit, or the request is out of range", async () => {
    await expect(
      measureColorScopes(clip, {}, { limits: { decodedFrameBytes: 1024 } }),
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "comp-scope-limit" })],
    });
    const range = await run([
      "scopes",
      "--input",
      clip,
      "--frame-range",
      "40:60",
    ]);
    expect(range.code).toBe(1);
    expect(failure(range.stderr).diagnostics[0]!.code).toBe("comp-scope-range");
    const region = await run([
      "scopes",
      "--input",
      clip,
      "--region",
      "600,0,80,10",
    ]);
    expect(region.code).toBe(1);
  });
});

describe("comp probe", () => {
  it("reports a graded pixel before and after each stage, matching the float64 reference", async () => {
    const chart = join(root, "chart-24.png");
    await copyFile(join(fixtures, "stills/chart-24.png"), chart);
    const bytes = await readFile(chart);
    const primary = { gainMaster: 1.3, saturation: 1.4, hue: 15, shadows: 0.2 };
    const cdl = { slopeR: 1.1, powerB: 0.85, saturation: 0.9, clamp: 1 };
    const composition = {
      schemaVersion: "composition-1",
      id: "cg3-probe",
      width: 384,
      height: 256,
      fps: 24,
      frameCount: 1,
      background: "#000000",
      assets: [
        {
          id: "chart",
          type: "image",
          path: "chart-24.png",
          sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
          width: 384,
          height: 256,
        },
      ],
      layers: [
        {
          id: "chart",
          type: "image",
          sources: [{ asset: "chart" }],
          size: [384, 256],
          fit: "stretch",
          transform: { anchor: [0, 0] },
          effects: [
            { id: "primary", effect: "grade.primary", params: primary },
            { id: "cdl", effect: "grade.cdl", params: cdl },
          ],
        },
      ],
    };
    const input = join(root, "probe.json");
    await writeFile(input, JSON.stringify(composition));
    // Patch 7 (row 1, column 0) centre.
    const result = await run([
      "probe",
      "--input",
      input,
      "--layer",
      "chart",
      "--at",
      "32,96",
      "--backend",
      "canvas2d",
    ]);
    expect(result.code, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.stages.map((s: { stage: string }) => s.stage)).toEqual([
      "input",
      "effects[primary]",
      "effects[cdl]",
    ]);
    const { rgba } = decodeCompositionRgbaPng(bytes);
    const at = (96 * 384 + 32) * 4;
    const source = [rgba[at]!, rgba[at + 1]!, rgba[at + 2]!];
    const defaults = (id: string) =>
      Object.fromEntries(
        Object.entries(compositionEffectDefinition(id)!.properties).map(
          ([k, p]) => [k, p.default as number],
        ),
      );
    const ops = [
      floatGradeOp("grade.primary", {
        ...defaults("grade.primary"),
        ...primary,
      })!,
      floatGradeOp("grade.cdl", { ...defaults("grade.cdl"), ...cdl })!,
    ];
    const unit = source.map((v) => v / 255) as [number, number, number];
    expect(report.stages[0].bytes).toEqual(source);
    expect(report.stages[1].bytes).toEqual(
      floatGradeBytes(ops.slice(0, 1), unit),
    );
    expect(report.stages[2].bytes).toEqual(floatGradeBytes(ops, unit));
    for (const stage of report.stages)
      expect(Object.keys(stage.coordinates)).toEqual([
        "encoded",
        "linear",
        "hsl",
        "lab",
        "oklab",
      ]);
    expect(report.qualifier.hue).not.toBeNull();
  });
});

describe("comp grade diff", () => {
  it("reports zero change for a clip against itself and writes the still and the sheet", async () => {
    const still = join(root, "split.png");
    const sheet = join(root, "sheet.png");
    const result = await run([
      "grade",
      "diff",
      "--before",
      clip,
      "--after",
      clip,
      "--frames",
      "4",
      "--still",
      still,
      "--sheet",
      sheet,
    ]);
    expect(result.code, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(Object.values(report.changes).every((v) => v === 0)).toBe(true);
    const split = decodeCompositionRgbaPng(await readFile(still));
    expect([split.width, split.height]).toEqual([640, 360]);
    const contact = decodeCompositionRgbaPng(await readFile(sheet));
    expect([contact.width, contact.height]).toEqual([
      320 * 2 + 4,
      4 * (180 + 4) - 4,
    ]);
  });
});
