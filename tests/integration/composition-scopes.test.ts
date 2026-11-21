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
import {
  NEUTRAL_KEY_QUALIFIER,
  qualify,
} from "../../packages/color-science/src/index.ts";

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
    // CG6: the suggestions are ready grade.key parameters that select the
    // probed (uniform) patch.
    expect(report.schema).toBe("still-shift-color-probe-2");
    const key = compositionEffectDefinition("grade.key")!;
    for (const suggestion of [report.gradeKey, report.gradeKeySampled])
      expect(key.params.safeParse(suggestion).success).toBe(true);
    expect(report.gradeKeySampled.sampleCount).toBe(1);
    const graded = report.stages[2].bytes.map((v: number) => v / 255);
    expect(
      qualify(graded, { ...NEUTRAL_KEY_QUALIFIER, ...report.gradeKey }),
    ).toBeGreaterThan(0.9999); // ranges are rounded to 6 decimals
  });
  it("keeps a group's content when isolating, and drops unrelated layers", async () => {
    const primary = { gainMaster: 1.2 };
    const solid = (id: string, color: string, parent?: string) => ({
      id,
      type: "solid",
      ...(parent ? { parent } : {}),
      size: [64, 64],
      color,
      transform: { anchor: [0, 0], position: [0, 0] },
    });
    const composition = {
      schemaVersion: "composition-1",
      id: "cg3-probe-group",
      width: 64,
      height: 64,
      fps: 24,
      frameCount: 1,
      background: "#000000",
      assets: [],
      layers: [
        solid("under", "#ffffff"),
        {
          id: "cell",
          type: "group",
          size: [64, 64],
          transform: { anchor: [0, 0], position: [0, 0] },
          effects: [
            { id: "primary", effect: "grade.primary", params: primary },
          ],
        },
        {
          id: "inner",
          type: "group",
          parent: "cell",
          size: [64, 64],
          transform: { anchor: [0, 0], position: [0, 0] },
        },
        // Half the frame, inside a nested group: content two levels down.
        { ...solid("paint", "#c08040", "inner"), size: [32, 64] },
        { ...solid("over", "#ffffff"), size: [16, 64] },
      ],
    };
    const input = join(root, "probe-group.json");
    await writeFile(input, JSON.stringify(composition));
    const probe = async (at: string) => {
      const result = await run([
        "probe",
        "--input",
        input,
        "--layer",
        "cell",
        "--at",
        at,
      ]);
      expect(result.code, result.stderr).toBe(0);
      return (
        JSON.parse(result.stdout) as { stages: { bytes: number[] }[] }
      ).stages.map((stage) => stage.bytes);
    };
    const op = floatGradeOp("grade.primary", {
      ...Object.fromEntries(
        Object.entries(
          compositionEffectDefinition("grade.primary")!.properties,
        ).map(([k, p]) => [k, p.default as number]),
      ),
      ...primary,
    })!;
    const paint = [192, 128, 64];
    const graded = floatGradeBytes(
      [op],
      paint.map((v) => v / 255) as [number, number, number],
    );
    // The group's own pixels, though "over" and "under" cover this point.
    expect(await probe("8,32")).toEqual([paint, graded]);
    expect(await probe("24,32")).toEqual([paint, graded]);
    // Outside the paint: the background, not the unrelated white layers.
    expect(await probe("48,32")).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });
  it("averages a whole region, and refuses one over the pixel limit", async () => {
    const composition = (width: number, height: number) => ({
      schemaVersion: "composition-1",
      id: "cg3-probe-region",
      width,
      height,
      fps: 24,
      frameCount: 1,
      background: "#000000",
      assets: [],
      layers: [
        {
          id: "paint",
          type: "solid",
          // The left half of the frame.
          size: [width / 2, height],
          color: "#c08040",
          transform: { anchor: [0, 0], position: [0, 0] },
          effects: [
            { id: "cdl", effect: "grade.cdl", params: { slopeR: 0.5 } },
          ],
        },
      ],
    });
    const small = join(root, "probe-region.json");
    await writeFile(small, JSON.stringify(composition(64, 48)));
    const result = await run([
      "probe",
      "--input",
      small,
      "--layer",
      "paint",
      "--region",
      "0,0,64,48",
    ]);
    expect(result.code, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.pixels).toBe(64 * 48);
    // Half paint, half black background: the mean of every pixel.
    expect(report.stages.map((s: { bytes: number[] }) => s.bytes)).toEqual([
      [96, 64, 32],
      [48, 64, 32],
    ]);
    // The qualifier reads the last stage's pixels: #608040 and black.
    expect(report.qualifier.samples).toBe(64 * 48);
    expect(report.qualifier.luminance.min).toBe(0);
    expect(report.qualifier.hue.center).toBeCloseTo(90, 0);

    const large = join(root, "probe-region-large.json");
    await writeFile(large, JSON.stringify(composition(4096, 2304)));
    const refused = await run([
      "probe",
      "--input",
      large,
      "--layer",
      "paint",
      "--region",
      "0,0,4096,2304",
    ]);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toMatch(
      /comp-probe-region.*9437184 pixels; the limit is 8294400/,
    );
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

describe("comp grade key (CG6)", () => {
  it("reports the key per frame with its flicker and writes a matte view", async () => {
    const chart = join(root, "chart-24.png");
    await copyFile(join(fixtures, "stills/chart-24.png"), chart).catch(
      () => undefined,
    );
    const bytes = await readFile(chart);
    const composition = {
      schemaVersion: "composition-1",
      id: "cg6-key",
      width: 384,
      height: 256,
      fps: 24,
      frameCount: 4,
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
          transform: { anchor: [0, 0], position: [0, 0] },
          effects: [
            {
              id: "key",
              effect: "grade.key",
              params: {
                qualifier: 3,
                luminanceMin: 0.4,
                luminanceSoftness: 0.1,
                window: 1,
                windowSize: [200, 160],
                windowCenter: {
                  keys: [
                    { frame: 0, value: [120, 128], easing: "linear" },
                    { frame: 3, value: [180, 128], easing: "linear" },
                  ],
                },
              },
            },
            { id: "warm", effect: "grade.primary", params: { gainR: 1.3 } },
          ],
        },
      ],
    };
    const input = join(root, "key.json");
    await writeFile(input, JSON.stringify(composition));
    const still = join(root, "key-highlight.png");
    const result = await run([
      "grade",
      "key",
      "--input",
      input,
      "--layer",
      "chart",
      "--effect",
      "key",
      "--frame-range",
      "0:4",
      "--view",
      "highlight",
      "--still",
      still,
    ]);
    expect(result.code, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.schema).toBe("still-shift-grade-key-1");
    expect(report.frames.map((f: { frame: number }) => f.frame)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(report.frames[0].flicker).toBeNull();
    // The window moves, so the key changes every frame.
    for (const frame of report.frames.slice(1))
      expect(frame.flicker.meanChange).toBeGreaterThan(0);
    expect(report.frames[0].keyedFraction).toBeGreaterThan(0);
    expect(report.frames[0].keyedFraction).toBeLessThan(1);
    expect(report.stability.meanChange).toBeGreaterThan(0);
    const png = decodeCompositionRgbaPng(await readFile(still));
    expect([png.width, png.height]).toEqual([384, 256]);

    // A static key does not flicker; a missing or wrong effect is located.
    const fixed = structuredClone(composition);
    fixed.layers[0]!.effects[0]!.params.windowCenter = [150, 128] as never;
    await writeFile(join(root, "key-fixed.json"), JSON.stringify(fixed));
    const steady = await run([
      "grade",
      "key",
      "--input",
      join(root, "key-fixed.json"),
      "--layer",
      "chart",
      "--effect",
      "key",
      "--frame-range",
      "0:3",
      "--backend",
      "webgl2",
    ]);
    expect(steady.code, steady.stderr).toBe(0);
    expect(JSON.parse(steady.stdout).stability.meanChange).toBe(0);
    const wrong = await run([
      "grade",
      "key",
      "--input",
      input,
      "--layer",
      "chart",
      "--effect",
      "warm",
    ]);
    expect(wrong.code).not.toBe(0);
    expect(failure(wrong.stderr).diagnostics[0]!.code).toBe(
      "comp-grade-key-effect",
    );
  });
});
