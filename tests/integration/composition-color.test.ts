/**
 * CGA: measurement, look fit, adaptive solver and one-command correction on
 * the tracked synthetic fixtures (benchmarks/fixtures/color/cga-synthetic.ts),
 * read back through the engine's own media path.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  applyColorEffects,
  autoColorClip,
  autoColorDiffPaths,
  AutoColorReportSchema,
  CGA2_EQUIVALENCE_BOUND,
  colorGradeDiffImages,
  diffColorGrade,
  measureColorScopeFrames,
  measureColorScopes,
  colorSampleOrdinals,
  compareClipAudio,
  COLOR_SOLVER_LIMITS,
  colorSolverFrames,
  fitColorLook,
  measureColorFrames,
  openColorClip,
  parseColorLook,
  readColorFrames,
  solveColorCorrection,
  solverEquivalence,
  type AutoColorReport,
  type ColorFrame,
} from "@still-shift/animation-engine";
import { validateComposition } from "@still-shift/scene-contract";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import {
  CGA_SYNTHETIC,
  CGA_FLAT_COMBINED,
  cgaDegrade,
  cgaDegradeAll,
  cgaLookDocument,
  cgaReferenceFrames,
  writeCgaClip,
  type CgaDegradation,
} from "../../benchmarks/fixtures/color/cga-synthetic.ts";

let root: string;
const W = CGA_SYNTHETIC.width;
const reference = cgaReferenceFrames();
const cache = () => join(root, "media-cache");
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cga-color-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
async function clipFrames(name: string, frames: Uint8Array[], audio = false) {
  const path = join(root, `${name}.mkv`);
  await writeCgaClip(path, frames, { audio });
  const clip = await openColorClip(path, { cacheDirectory: cache() });
  const read = await readColorFrames(
    clip,
    colorSampleOrdinals(clip.probe.frameCount, 12),
    { cacheDirectory: cache() },
  );
  return { path, clip, read };
}
const rms = (a: readonly Uint8Array[], b: readonly Uint8Array[]) => {
  let squares = 0,
    count = 0;
  a.forEach((frame, k) => {
    for (let i = 0; i < frame.length; i += 4)
      for (let c = 0; c < 3; c++) {
        squares += (frame[i + c]! - b[k]![i + c]!) ** 2;
        count++;
      }
  });
  return Math.sqrt(squares / count);
};
const solve = (frames: ColorFrame[]) => {
  const small = colorSolverFrames(frames);
  return solveColorCorrection(small);
};

describe("CGA measurement", () => {
  it("reads the lossless fixture exactly and reports deterministic statistics", async () => {
    const { read, path } = await clipFrames("reference", reference);
    read.forEach((frame) =>
      expect(frame.rgba).toEqual(reference[frame.ordinal]),
    );
    const first = JSON.stringify(
      measureColorFrames({ frames: read, width: W }),
    );
    // A second, cold preparation cache gives byte-identical statistics.
    const clip = await openColorClip(path);
    const again = await readColorFrames(clip, colorSampleOrdinals(12, 12), {
      cacheDirectory: join(root, "second-cache"),
    });
    expect(
      JSON.stringify(measureColorFrames({ frames: again, width: W })),
    ).toBe(first);
    const stats = JSON.parse(first);
    expect(stats.neutral.temperature).toBe(0);
    expect(stats.neutral.tint).toBe(0);
    expect(stats.luma.p005).toBeLessThan(0.02);
    expect(stats.luma.p995).toBeGreaterThan(0.95);
  });
});

describe("CGA adaptive solver", () => {
  it("leaves the well-balanced fixture unchanged", async () => {
    const { read } = await clipFrames("balanced", reference);
    const solution = solve(read);
    expect(solution.effects).toEqual([]);
    expect(solution.decisions.every((decision) => !decision.applied)).toBe(
      true,
    );
  });
  // Stated residuals (RMS of 255 against the reference, all sampled pixels).
  const cases: [string, CgaDegradation, number, number][] = [
    ["exposure", { kind: "exposure", stops: -0.6 }, 20, 3],
    ["contrast", { kind: "contrast", black: 0.1, white: 0.88 }, 12, 2.5],
    [
      "white balance",
      { kind: "white-balance", temperature: 30, tint: -12 },
      5,
      1,
    ],
  ];
  it.each(cases)(
    "restores a known %s change within the stated residual",
    async (name, change, before, after) => {
      const degraded = cgaDegrade(reference, change);
      const { read } = await clipFrames(name.replace(" ", "-"), degraded);
      const solution = solve(read);
      const fixed = read.map((frame) =>
        applyColorEffects(solution.effects, frame.rgba),
      );
      const original = read.map((frame) => reference[frame.ordinal]!);
      expect(
        rms(
          read.map((frame) => frame.rgba),
          original,
        ),
      ).toBeGreaterThan(before);
      expect(rms(fixed, original)).toBeLessThan(after);
      // Clipping budget and the banding bound on the neutral ramp.
      const source = measureColorFrames({ frames: read, width: W });
      const result = measureColorFrames({
        frames: fixed.map((rgba, ordinal) => ({ ordinal, rgba })),
        width: W,
      });
      expect(
        result.clippedFraction - source.clippedFraction,
      ).toBeLessThanOrEqual(COLOR_SOLVER_LIMITS.clippedBudget);
      expect(result.crushedFraction - source.crushedFraction).toBeLessThan(
        0.004,
      );
      const ramp = Array.from({ length: 256 }, (_, v) => [v, v, v, 255]).flat();
      const mapped = applyColorEffects(solution.effects, new Uint8Array(ramp));
      for (let v = 1; v < 256; v++)
        expect(mapped[v * 4]! - mapped[(v - 1) * 4]!).toBeLessThanOrEqual(2);
    },
  );
  it("places the midtones: darkens an over-exposed clip, lifts dark midtones", async () => {
    const levels = (solution: ReturnType<typeof solve>) =>
      solution.effects.find((effect) => effect.effect === "color.levels")
        ?.params as Record<string, number> | undefined;
    // +0.5 stops: median 0.57 (not high key), highlights clipped.
    const bright = cgaDegrade(reference, { kind: "exposure", stops: 0.5 });
    const over = await clipFrames("over-exposed", bright);
    const darkened = solve(over.read);
    expect(levels(darkened)!.gamma).toBeLessThan(1);
    const before = measureColorFrames({ frames: over.read, width: W }).luma.p50;
    expect(darkened.predicted.luma.p50).toBeLessThan(before - 0.03);
    expect(before - darkened.predicted.luma.p50).toBeLessThanOrEqual(
      COLOR_SOLVER_LIMITS.medianDropMax + 0.005,
    );
    const original = over.read.map((frame) => reference[frame.ordinal]!);
    expect(
      rms(
        over.read.map((frame) =>
          applyColorEffects(darkened.effects, frame.rgba),
        ),
        original,
      ),
    ).toBeLessThan(
      rms(
        over.read.map((frame) => frame.rgba),
        original,
      ),
    );
    // Dark midtones under full highlights: the white point stays, gamma lifts.
    const dim = reference.map((frame) =>
      applyColorEffects(
        [{ id: "dim", effect: "color.levels", params: { gamma: 0.7 } }],
        frame,
      ),
    );
    const low = await clipFrames("dark-midtones", dim);
    const lifted = solve(low.read);
    expect(levels(lifted)!.inputWhite).toBe(1);
    expect(levels(lifted)!.gamma).toBeGreaterThan(1);
    const lowBefore = measureColorFrames({ frames: low.read, width: W }).luma;
    expect(lowBefore.p50).toBeLessThan(COLOR_SOLVER_LIMITS.midtoneRange[0]);
    expect(lifted.predicted.luma.p50).toBeGreaterThan(lowBefore.p50 + 0.03);
    expect(lifted.predicted.luma.p50 - lowBefore.p50).toBeLessThanOrEqual(
      COLOR_SOLVER_LIMITS.medianRiseMax + 0.005,
    );
    // +0.8 stops is high key (median ≥ 0.6): its exposure is left alone.
    const key = await clipFrames(
      "high-key-exposure",
      cgaDegrade(reference, { kind: "exposure", stops: 0.8 }),
    );
    expect(levels(solve(key.read))?.gamma).toBeUndefined();
  });
  it("lifts a desaturated clip to the saturation targets, protecting skin", async () => {
    const degraded = cgaDegrade(reference, { kind: "saturation", scale: 0.4 });
    const { read } = await clipFrames("desaturated", degraded);
    const solution = solve(read);
    const vibrance = solution.effects.find(
      (effect) => effect.effect === "color.vibrance",
    );
    expect(vibrance?.params.vibrance).toBeGreaterThan(30);
    const before = measureColorFrames({ frames: read, width: W }).saturation
      .p50;
    expect(before).toBeLessThan(0.15);
    expect(solution.predicted.saturation.p50).toBeGreaterThanOrEqual(0.15);
    const fixed = read.map((frame) =>
      applyColorEffects(solution.effects, frame.rgba),
    );
    const original = read.map((frame) => reference[frame.ordinal]!);
    // A regression guard set from the recorded result, not a restoration
    // residual: the solver lifts toward its targets, not to the reference.
    expect(rms(fixed, original)).toBeLessThan(
      0.85 *
        rms(
          read.map((frame) => frame.rgba),
          original,
        ),
    );
  });
  it("scales tone back within the clipping budget, or says it could not", () => {
    // Bright warm pixels: lifting the dim white point clips their red channel.
    const frame = (red: number) => {
      const rgba = new Uint8Array(32 * 32 * 4);
      for (let i = 0; i < rgba.length; i += 4)
        rgba.set((i >> 2) % 2 ? [red, 200, 180, 255] : [70, 75, 80, 255], i);
      return [{ ordinal: 0, rgba }];
    };
    const options = { whiteBalance: false, saturation: false };
    const fits = solveColorCorrection(
      { frames: frame(240), width: 32 },
      options,
    );
    const added = (solution: typeof fits) =>
      solution.predicted.clippedFraction -
      solveColorCorrection(
        { frames: frame(240), width: 32 },
        {
          ...options,
          exposure: false,
          contrast: false,
        },
      ).predicted.clippedFraction;
    expect(added(fits)).toBeLessThanOrEqual(COLOR_SOLVER_LIMITS.clippedBudget);
    expect(fits.effects.map((effect) => effect.effect)).toContain(
      "color.levels",
    );
    expect(
      fits.decisions.filter((decision) => decision.correction === "clipping")
        .length,
    ).toBeGreaterThan(0);
    const over = solveColorCorrection(
      { frames: frame(252), width: 32 },
      options,
    );
    expect(over.decisions.at(-1)).toMatchObject({
      correction: "clipping",
      applied: false,
    });
  });
  it("reports a finite vibrance when the median pixel is fully saturated", () => {
    const rgba = new Uint8Array(16 * 16 * 4);
    for (let i = 0; i < rgba.length; i += 4) rgba.set([200, 0, 0, 255], i);
    const solution = solveColorCorrection({
      frames: [{ ordinal: 0, rgba }],
      width: 16,
    });
    const saturation = solution.decisions.find(
      (decision) => decision.correction === "saturation",
    )!;
    expect(saturation.values!.vibrance).toBe(0);
    expect(JSON.stringify(solution)).not.toContain("null");
  });
  it("keeps a high-key clip's median luma and never brightens it", async () => {
    // Lift the reference into high key: median ≈ 0.72, whites reach.
    const highKey = cgaDegrade(reference, {
      kind: "contrast",
      black: 0.1,
      white: 0.995,
    }).map(
      (frame) => cgaDegrade([frame], { kind: "exposure", stops: 0.9 })[0]!,
    );
    const { read } = await clipFrames("high-key", highKey);
    const before = measureColorFrames({ frames: read, width: W });
    expect(before.luma.p50).toBeGreaterThan(0.6);
    const solution = solve(read);
    expect(
      solution.effects.some(
        (effect) =>
          effect.effect === "color.levels" &&
          (effect.params.inputWhite as number) < 1,
      ),
    ).toBe(false);
    expect(
      Math.abs(solution.predicted.luma.p50 - before.luma.p50),
    ).toBeLessThan(0.02);
  });
  it("gives byte-identical solutions on rerun and scales with strength", async () => {
    const degraded = cgaDegrade(reference, { kind: "exposure", stops: -0.6 });
    const { read } = await clipFrames("rerun", degraded);
    expect(JSON.stringify(solve(read))).toBe(JSON.stringify(solve(read)));
    const small = colorSolverFrames(read);
    const none = solveColorCorrection(small, {
      strength: 0,
    });
    expect(none.effects).toEqual([]);
    const off = solveColorCorrection(small, {
      exposure: false,
      contrast: false,
    });
    expect(off.effects.some((effect) => effect.effect === "color.levels")).toBe(
      false,
    );
  });
  it("scales each correction on its own", async () => {
    const degraded = cgaDegrade(
      cgaDegrade(reference, { kind: "contrast", black: 0.1, white: 0.88 }),
      { kind: "saturation", scale: 0.5 },
    );
    const { read } = await clipFrames("per-correction", degraded);
    const small = colorSolverFrames(read);
    const params = (
      options: Parameters<typeof solveColorCorrection>[1],
      effect: string,
    ) =>
      solveColorCorrection(small, options).effects.find(
        (candidate) => candidate.effect === effect,
      )!.params as Record<string, number>;
    const value = (
      options: Parameters<typeof solveColorCorrection>[1],
      effect: string,
      name: string,
    ) => params(options, effect)[name]!;
    const full = { whiteBalance: false } as const;
    const half = { ...full, contrast: 0.5, saturation: 0.5 };
    expect(value(half, "color.levels", "inputBlack")).toBeCloseTo(
      value(full, "color.levels", "inputBlack") / 2,
      3,
    );
    expect(value(half, "color.levels", "inputWhite")).toBe(
      value(full, "color.levels", "inputWhite"),
    );
    expect(value(half, "color.vibrance", "vibrance")).toBeLessThan(
      value(full, "color.vibrance", "vibrance"),
    );
    // 0 is the same as false; 1 the same as true.
    expect(solveColorCorrection(small, { saturation: 0 })).toEqual(
      solveColorCorrection(small, { saturation: false }),
    );
    expect(solveColorCorrection(small, { contrast: 1 })).toEqual(
      solveColorCorrection(small, {}),
    );
  });
});

describe("CGA look from an example", () => {
  const look = {
    rr: 1.18,
    rg: -0.1,
    rb: -0.05,
    gr: -0.06,
    gg: 1.12,
    gb: -0.04,
    br: -0.07,
    bg: -0.16,
    bb: 1.3,
    ro: -0.01,
    go: 0.005,
    bo: 0.02,
  };
  it("detects cuts, matches shots to their sources and recovers the transform", async () => {
    const second = cgaReferenceFrames(1);
    const before = [
      join(root, "look-before-a.mkv"),
      join(root, "look-before-b.mkv"),
    ];
    await writeCgaClip(before[0]!, reference);
    await writeCgaClip(before[1]!, second);
    // The graded edit: a later part of clip b, then the start of clip a.
    const graded = cgaDegrade(
      [...second.slice(5, 12), ...reference.slice(0, 8)],
      { kind: "matrix", params: look },
    );
    const after = join(root, "look-after.mkv");
    await writeCgaClip(after, graded);
    const fitted = await fitColorLook(before, after, {
      cacheDirectory: cache(),
      step: 4,
    });
    expect(fitted.fit.shots.map((shot) => [shot.after, shot.before])).toEqual([
      [[0, 7], "look-before-b.mkv"],
      [[7, 15], "look-before-a.mkv"],
    ]);
    expect(fitted.fit.shots[0]!.pairs.map((pair) => pair[1] - pair[0])).toEqual(
      fitted.fit.shots[0]!.pairs.map(() => 5),
    );
    for (const [name, value] of Object.entries(look))
      expect(Math.abs(fitted.params[name]! - value)).toBeLessThan(0.01);
    expect(fitted.fit.residual.rms).toBeLessThan(0.6);
    expect(fitted.fit.heldOut!.rmsMax).toBeLessThan(1);
    expect(fitted.fit.afterInterpretation).toBe("media-path");
    // Applied looks default to 0.6 (the owner's pick); full strength stays available.
    for (const [lookStrength, expected] of [
      [undefined, 0.6],
      [1, 1],
    ] as const) {
      const report = await autoColorClip({
        input: before[0]!,
        look: fitted,
        ...(lookStrength === undefined ? {} : { lookStrength }),
        writeComposition: join(root, `look-${expected}`, "clip.json"),
        cacheDirectory: cache(),
      });
      expect(report.effects).toHaveLength(1);
      expect(report.effects[0]!.params.strength).toBe(expected);
      expect(report.look!.strength).toBe(expected);
    }
  });
});

describe("CGA look held-out residuals", () => {
  it("reports no held-out figure when only one shot matches", async () => {
    const before = join(root, "single-before.mkv");
    await writeCgaClip(before, reference);
    const after = join(root, "single-after.mkv");
    await writeCgaClip(
      after,
      cgaDegrade(reference, {
        kind: "matrix",
        params: {
          rr: 1.1,
          rg: 0,
          rb: 0,
          gr: 0,
          gg: 1.05,
          gb: 0,
          br: 0,
          bg: 0,
          bb: 0.95,
          ro: 0,
          go: 0,
          bo: 0,
        },
      }),
    );
    const fitted = await fitColorLook([before], after, {
      cacheDirectory: cache(),
      step: 4,
    });
    expect(fitted.fit.shots).toHaveLength(1);
    expect(fitted.fit.shots[0]!.heldOut).toBeNull();
    expect(fitted.fit.heldOut).toBeNull();
    expect(fitted.fit.residual.rms).toBeLessThan(1);
  });
  it("rejects look files outside the contract's color.matrix bounds", async () => {
    const fitted = await fitColorLook(
      [join(root, "single-before.mkv")],
      join(root, "single-after.mkv"),
      { cacheDirectory: cache(), step: 4 },
    );
    expect(parseColorLook(JSON.parse(JSON.stringify(fitted)))).toEqual(fitted);
    for (const [name, value] of [
      ["rr", 4.5],
      ["bo", -1.5],
    ] as const)
      try {
        parseColorLook({
          ...fitted,
          params: { ...fitted.params, [name]: value },
        });
        expect.fail("must reject");
      } catch (error) {
        expect(passageDiagnostics(error)[0]).toMatchObject({
          code: "comp-look-format",
          path: `params.${name}`,
        });
      }
  });
});

describe("CGA look targets", () => {
  it("a fitted look records the graded edit's targets and the solver uses them", async () => {
    const before = join(root, "targets-before.mkv"),
      after = join(root, "targets-after.mkv");
    await writeCgaClip(before, reference);
    // A darker, more saturated grade.
    const graded = cgaDegrade(
      cgaDegrade(reference, { kind: "exposure", stops: -0.5 }),
      { kind: "saturation", scale: 1.4 },
    );
    await writeCgaClip(after, graded);
    const look = await fitColorLook([before], after, {
      cacheDirectory: cache(),
      step: 4,
    });
    const edit = measureColorFrames({
      frames: graded.map((rgba, ordinal) => ({ ordinal, rgba })),
      width: W,
    });
    expect(look.targets!.medianLuma).toBeCloseTo(edit.luma.p50, 1);
    expect(look.targets!.saturation).toBeCloseTo(edit.saturation.p50, 1);
    expect(look.targets!.strongSaturation).toBeCloseTo(edit.saturation.p90, 1);
    // Looks written before targets existed still load.
    const older: Record<string, unknown> = { ...look };
    delete older.targets;
    expect(parseColorLook(older).targets).toBeUndefined();
    // On the raw clip, the look's targets darken and saturate more than the
    // defaults do (the look itself is not applied here).
    const { read } = await clipFrames("targets-raw", reference);
    const small = colorSolverFrames(read);
    const defaults = solveColorCorrection(small);
    const supplied = solveColorCorrection(small, {
      targets: look.targets,
    });
    expect(supplied.predicted.luma.p50).toBeLessThan(
      defaults.predicted.luma.p50,
    );
    expect(supplied.predicted.saturation.p50).toBeGreaterThan(
      defaults.predicted.saturation.p50,
    );
    expect(
      supplied.decisions.some((decision) =>
        decision.reason.includes("supplied"),
      ),
    ).toBe(true);
    // auto-color with the look (at strength 0) and adaptive on uses them.
    const report = await autoColorClip({
      input: before,
      look,
      lookStrength: 0,
      adaptive: true,
      writeComposition: join(root, "targets", "clip.json"),
      cacheDirectory: cache(),
    });
    expect(
      report.decisions.some((decision) => decision.reason.includes("supplied")),
    ).toBe(true);
  });
});

describe("CGA one-command correction", () => {
  it("renders the corrected clip with the source frame count, duration and audio", async () => {
    const degraded = cgaDegrade(reference, { kind: "exposure", stops: -0.6 });
    const input = join(root, "auto-input.mkv");
    await writeCgaClip(input, degraded, { audio: true });
    const output = join(root, "auto-output.mp4");
    const report = await autoColorClip({
      input,
      output,
      cacheDirectory: cache(),
    });
    expect(report.effects.map((effect) => effect.effect)).toEqual([
      "color.levels",
    ]);
    expect(report.output!.frameCount).toBe(CGA_SYNTHETIC.frameCount);
    expect(report.output!.durationSeconds).toBe(
      CGA_SYNTHETIC.frameCount / CGA_SYNTHETIC.fps,
    );
    expect(report.output!.audio!.correlation).toBeGreaterThan(0.999);
    expect(report.output!.audio!.outputDurationSeconds).toBe(
      CGA_SYNTHETIC.frameCount / CGA_SYNTHETIC.fps,
    );
    // Static parameters: continuity matches the source's within codec noise.
    expect(
      Math.abs(
        report.output!.measured.medianLumaContinuity -
          report.predicted.medianLumaContinuity,
      ),
    ).toBeLessThan(0.01);
    const written = JSON.parse(
      await readFile(join(root, "auto-output.auto-color.json"), "utf8"),
    );
    expect(written.effects).toEqual(report.effects);
    // Only the output and its report are published (no staged sidecars).
    expect(
      (await readdir(root)).filter((name) => name.includes("auto-output")),
    ).toEqual(["auto-output.auto-color.json", "auto-output.mp4"]);
  }, 120_000);
  it("writes the editable composition and a byte-identical report on rerun", async () => {
    const degraded = cgaDegrade(reference, {
      kind: "white-balance",
      temperature: 30,
      tint: 0,
    });
    const input = join(root, "compose-input.mkv");
    await writeCgaClip(input, degraded);
    const reports: string[] = [],
      compositions: string[] = [];
    for (const run of [0, 1]) {
      const path = join(root, `compose-${run}`, "clip.composition.json");
      await autoColorClip({
        input,
        writeComposition: path,
        cacheDirectory: join(root, `compose-cache-${run}`),
      });
      const report = JSON.parse(
        await readFile(path.replace(/\.json$/, ".auto-color.json"), "utf8"),
      );
      delete report.composition;
      reports.push(JSON.stringify(report));
      compositions.push(await readFile(path, "utf8"));
    }
    expect(reports[1]).toBe(reports[0]);
    expect(compositions[1]).toBe(compositions[0]);
    const composition = JSON.parse(compositions[0]!);
    expect(composition.assets[0].path).toBe("../compose-input.mkv");
    expect(composition.layers[0].effects[0].effect).toBe("color.white-balance");
    // Existing outputs are never overwritten.
    try {
      await autoColorClip({
        input,
        writeComposition: join(root, "compose-0", "clip.composition.json"),
        cacheDirectory: cache(),
      });
      expect.fail("must reject");
    } catch (error) {
      expect(passageDiagnostics(error)[0]!.code).toBe("comp-auto-color-output");
    }
  });
  it("publishes nothing when a run fails after rendering, so it can be retried", async () => {
    const input = join(root, "retry-input.mkv");
    await writeCgaClip(
      input,
      cgaDegrade(reference.slice(0, 4), { kind: "exposure", stops: -0.6 }),
    );
    const folder = join(root, "retry");
    const request = {
      input,
      output: join(folder, "fixed.mp4"),
      writeComposition: join(folder, "fixed.composition.json"),
      cacheDirectory: cache(),
    };
    // Cancel once the render is done, during verification.
    const controller = new AbortController();
    await expect(
      autoColorClip({
        ...request,
        signal: controller.signal,
        progress: (message) => {
          if (message.startsWith("verifying")) controller.abort();
        },
      }),
    ).rejects.toThrow();
    expect(await readdir(folder)).toEqual([]);
    const report = await autoColorClip(request);
    expect(report.output!.frameCount).toBe(4);
    expect((await readdir(folder)).sort()).toEqual([
      "fixed.auto-color.json",
      "fixed.composition.json",
      "fixed.mp4",
    ]);
  }, 120_000);
  it("decodes audio even when FFmpeg floods stderr", async () => {
    const input = join(root, "noisy-audio.mkv");
    await writeCgaClip(input, reference.slice(0, 3), { audio: true });
    // A wrapper that writes 1 MB to stderr first: an unread stderr pipe
    // (64 KB) would block FFmpeg and hang the decode.
    const bin = join(root, "noisy-bin");
    await mkdir(bin, { recursive: true });
    const real = execFileSync("sh", ["-c", "command -v ffmpeg"], {
      encoding: "utf8",
    }).trim();
    await writeFile(
      join(bin, "ffmpeg"),
      `#!/bin/sh\nhead -c 1000000 /dev/zero | tr '\\0' e >&2\nexec "${real}" "$@"\n`,
    );
    await chmod(join(bin, "ffmpeg"), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${bin}:${path}`;
    try {
      const audio = await compareClipAudio(input, input);
      expect(audio!.correlation).toBe(1);
    } finally {
      process.env.PATH = path;
    }
  }, 30_000);
  it("rejects a non-integer source rate with a located diagnostic", async () => {
    const path = join(root, "ntsc.mkv");
    await writeCgaClip(path, reference.slice(0, 3), {
      frameRate: "30000/1001",
    });
    try {
      await autoColorClip({
        input: path,
        writeComposition: join(root, "ntsc.json"),
        cacheDirectory: cache(),
      });
      expect.fail("must reject");
    } catch (error) {
      expect(passageDiagnostics(error)[0]!.code).toBe("comp-auto-color-rate");
    }
  });
});

describe("CGA2 solver 2 (grade engine)", () => {
  const solve2 = (frames: ColorFrame[]) =>
    solveColorCorrection(colorSolverFrames(frames), { engine: "grade" });
  const flat = CGA_FLAT_COMBINED;
  const cases: [string, readonly CgaDegradation[], number][] = [
    ["balanced", [], 1e-9],
    ["exposure", [{ kind: "exposure", stops: -0.6 }], 3],
    ["contrast", [{ kind: "contrast", black: 0.1, white: 0.88 }], 2.5],
    [
      "white balance",
      [{ kind: "white-balance", temperature: 30, tint: -12 }],
      1,
    ],
    ["desaturation", [{ kind: "saturation", scale: 0.4 }], Infinity],
    ["flat combined", flat, Infinity],
  ];
  it.each(cases)(
    "%s: matches solver 1 within the A0 bound and keeps CGA's residuals",
    async (name, changes, residual) => {
      const frames = cgaDegradeAll(reference, changes);
      const { read } = await clipFrames(
        `cga2-${name.replace(" ", "-")}`,
        frames,
      );
      const set = { width: W, frames: read };
      const result = solverEquivalence(colorSolverFrames(read), set);
      expect(result.grade.version).toBe("still-shift-color-solver-2");
      expect(result.difference.blockRms).toBeLessThanOrEqual(
        CGA2_EQUIVALENCE_BOUND.blockRms,
      );
      expect(result.difference.p99).toBeLessThanOrEqual(
        CGA2_EQUIVALENCE_BOUND.p99,
      );
      // Only float grade operators, in one run.
      for (const effect of result.grade.effects)
        expect(effect.effect.startsWith("grade.")).toBe(true);
      if (!changes.length) expect(result.grade.effects).toEqual([]);
      const fixed = read.map((frame) =>
        applyColorEffects(result.grade.effects, frame.rgba),
      );
      const original = read.map((frame) => reference[frame.ordinal]!);
      if (Number.isFinite(residual))
        expect(rms(fixed, original)).toBeLessThan(residual);
      // Clipping budget and the banding bound, as solver 1.
      const source = measureColorFrames({ frames: read, width: W });
      expect(
        result.grade.predicted.clippedFraction - source.clippedFraction,
      ).toBeLessThanOrEqual(COLOR_SOLVER_LIMITS.clippedBudget);
      const ramp = Array.from({ length: 256 }, (_, v) => [v, v, v, 255]).flat();
      const mapped = applyColorEffects(
        result.grade.effects,
        new Uint8Array(ramp),
      );
      for (let v = 1; v < 256; v++)
        expect(mapped[v * 4]! - mapped[(v - 1) * 4]!).toBeLessThanOrEqual(2);
    },
    60_000,
  );
  it("is byte-identical on rerun and protects skin with a pointwise key", async () => {
    const degraded = cgaDegrade(reference, { kind: "saturation", scale: 0.4 });
    const { read } = await clipFrames("cga2-rerun", degraded);
    const first = solve2(read);
    expect(JSON.stringify(solve2(read))).toBe(JSON.stringify(first));
    expect(first.effects.map((effect) => effect.effect)).toEqual([
      "grade.key",
      "grade.primary",
    ]);
  });
  it("auto-color --engine grade writes a valid grade.* composition and says so", async () => {
    const frames = cgaDegradeAll(reference, flat);
    const input = join(root, "cga2-compose-input.mkv");
    await writeCgaClip(input, frames);
    const path = join(root, "cga2-compose", "clip.composition.json");
    const report = await autoColorClip({
      input,
      writeComposition: path,
      engine: "grade",
      cacheDirectory: cache(),
    });
    expect(report.engine).toBe("grade");
    expect(report.solver).toBe("still-shift-color-solver-2");
    // look apply runs no solver, so the report names none.
    const applied = await autoColorClip({
      input,
      look: parseColorLook(cgaLookDocument()),
      writeComposition: join(root, "cga2-look", "clip.composition.json"),
      engine: "grade",
      cacheDirectory: cache(),
    });
    expect(applied.adaptive).toBe(false);
    expect(applied.engine).toBe("grade");
    expect(applied.solver).toBeUndefined();
    const composition = JSON.parse(await readFile(path, "utf8"));
    const effects = composition.layers[0].effects.map(
      (effect: { effect: string }) => effect.effect,
    );
    expect(effects.length).toBeGreaterThan(2);
    for (const effect of effects) expect(effect).toMatch(/^grade\./);
    const validation = validateComposition(composition);
    expect(
      validation.diagnostics.filter((d) => d.severity === "error"),
    ).toEqual([]);
    expect(validation.ok).toBe(true);
    // The legacy default keeps CGA's report shape (no engine fields).
    const legacy = await autoColorClip({
      input,
      writeComposition: join(root, "cga2-legacy", "clip.composition.json"),
      cacheDirectory: cache(),
    });
    expect("engine" in legacy).toBe(false);
    expect(legacy.effects.every((e) => e.effect.startsWith("color."))).toBe(
      true,
    );
  });
  it("renders the grade engine's correction close to its prediction", async () => {
    const frames = cgaDegradeAll(reference, flat);
    const input = join(root, "cga2-render-input.mkv");
    await writeCgaClip(input, frames);
    const report = await autoColorClip({
      input,
      output: join(root, "cga2-render.mp4"),
      engine: "grade",
      cacheDirectory: cache(),
    });
    expect(report.output!.frameCount).toBe(CGA_SYNTHETIC.frameCount);
    // H.264 loss only; the same bound the CGA effects' renders meet.
    expect(report.output!.predictedRms).toBeLessThan(3);
  }, 120_000);
});

describe("CGA2 A2 reports on scopes and --diff", () => {
  const flat: CgaDegradation[] = [
    { kind: "contrast", black: 0.12, white: 0.8 },
    { kind: "saturation", scale: 0.5 },
    { kind: "white-balance", temperature: 20, tint: 6 },
  ];
  let input: string;
  beforeAll(async () => {
    let frames = reference;
    for (const change of flat) frames = cgaDegrade(frames, change);
    input = join(root, "a2-flat.mkv");
    await writeCgaClip(input, frames);
  });
  const run = (name: string, extra: Parameters<typeof autoColorClip>[0]) =>
    autoColorClip({
      writeComposition: join(root, "a2", `${name}.composition.json`),
      cacheDirectory: cache(),
      ...extra,
    });
  /** A copy without the named keys (order kept). */
  const omit = (value: object, ...keys: string[]) =>
    Object.fromEntries(
      Object.entries(value).filter(([key]) => !keys.includes(key)),
    );
  const withoutPaths = (text: string) =>
    JSON.stringify(omit(JSON.parse(text), "composition"));

  it("grade reports are report 2: validated, comp scopes' numbers before and predicted after, rerun byte-identical", async () => {
    const report = await run("grade", { input, engine: "grade" });
    expect(report.schemaVersion).toBe("still-shift-auto-color-report-2");
    expect(report.engine).toBe("grade");
    expect(report.solver).toBe("still-shift-color-solver-2");
    const written = await readFile(
      join(root, "a2", "grade.composition.auto-color.json"),
      "utf8",
    );
    expect(AutoColorReportSchema.safeParse(JSON.parse(written)).success).toBe(
      true,
    );
    // The embedded scope measurement is `comp scopes`' for the same frames,
    // and the statistics stay `color-stats`' (unchanged fields).
    const scopes = await measureColorScopes(
      input,
      { frames: 12 },
      { cacheDirectory: cache() },
    );
    expect(report.scopes!.schema).toBe("still-shift-color-scopes-1");
    expect(report.scopes!.before).toEqual(scopes.measurement);
    expect(report.before).toEqual(scopes.statistics);
    expect(report.sampledOrdinals).toEqual(scopes.selection.ordinals);
    // Predicted: the measurement of the exact prediction.
    const clip = await openColorClip(input, { cacheDirectory: cache() });
    const frames = await readColorFrames(clip, report.sampledOrdinals, {
      cacheDirectory: cache(),
    });
    const predicted = frames.map((frame) => ({
      ...frame,
      rgba: applyColorEffects(report.effects, frame.rgba),
    }));
    expect(report.scopes!.predicted).toEqual(
      measureColorScopeFrames(predicted),
    );
    expect(report.predicted).toEqual(
      measureColorFrames({ frames: predicted, width: W }),
    );
    // Skin-line deviation and the hue histogram are present on both sides.
    for (const side of [report.scopes!.before, report.scopes!.predicted]) {
      expect(side.skin.deviation).not.toBeNull();
      expect(side.hue.shares).toHaveLength(36);
    }
    const { before, predicted: after } = report.scopes!;
    expect(report.scopes!.change.absoluteSkinDeviation).toBeCloseTo(
      Math.abs(after.skin.deviation!) - Math.abs(before.skin.deviation!),
      3,
    );
    const again = await run("grade-again", { input, engine: "grade" });
    expect(JSON.stringify(again)).not.toBe(JSON.stringify(report));
    expect(withoutPaths(JSON.stringify(again))).toBe(
      withoutPaths(JSON.stringify(report)),
    );
  });

  it("legacy reports stay report 1 unless --scopes asks for report 2", async () => {
    const legacy = await run("legacy", { input });
    expect(legacy.schemaVersion).toBe("still-shift-auto-color-report-1");
    for (const key of ["engine", "solver", "scopes"])
      expect(key in legacy).toBe(false);
    expect(AutoColorReportSchema.safeParse(legacy).success).toBe(true);
    const scoped = await run("legacy-scoped", { input, scopes: true });
    expect(scoped.schemaVersion).toBe("still-shift-auto-color-report-2");
    expect(scoped.engine).toBe("legacy");
    expect(scoped.solver).toBe("still-shift-color-solver-1");
    expect(AutoColorReportSchema.safeParse(scoped).success).toBe(true);
    // Report 2 only adds fields: every report-1 field is the same.
    const rest = omit(
      scoped,
      "schemaVersion",
      "engine",
      "solver",
      "scopes",
      "composition",
    );
    const base = omit(legacy, "schemaVersion", "composition");
    expect(rest).toEqual(base);
    // A report 1 with a scopes block (or report 2 without) is rejected.
    expect(
      AutoColorReportSchema.safeParse({ ...legacy, scopes: scoped.scopes })
        .success,
    ).toBe(false);
    expect(
      AutoColorReportSchema.safeParse(omit(scoped, "scopes")).success,
    ).toBe(false);
    // The exported type agrees with the schema: report 1 has no scopes.
    // @ts-expect-error report 1 cannot carry a scopes block
    const mixed: AutoColorReport = {
      ...legacy,
      schemaVersion: "still-shift-auto-color-report-1",
      scopes: scoped.scopes,
    };
    expect(AutoColorReportSchema.safeParse(mixed).success).toBe(false);
    try {
      await run("grade-unscoped", { input, engine: "grade", scopes: false });
      expect.fail("must reject");
    } catch (error) {
      expect(passageDiagnostics(error)[0]!.code).toBe("comp-auto-color-scopes");
    }
  });

  it("--diff writes the split still and contact sheet of the prediction without a render", async () => {
    const diff = join(root, "a2-diff");
    const report = await run("diff", { input, engine: "grade", diff });
    const paths = autoColorDiffPaths(diff, input);
    expect(paths.still).toBe(join(diff, "a2-flat.still.png"));
    expect(paths.sheet).toBe(join(diff, "a2-flat.sheet.png"));
    const clip = await openColorClip(input, { cacheDirectory: cache() });
    const frames = await readColorFrames(clip, report.sampledOrdinals, {
      cacheDirectory: cache(),
    });
    const expected = colorGradeDiffImages(
      frames,
      frames.map((frame) => ({
        ...frame,
        rgba: applyColorEffects(report.effects, frame.rgba),
      })),
    );
    expect(await readFile(paths.still)).toEqual(expected.still);
    expect(await readFile(paths.sheet)).toEqual(expected.sheet);
  });

  it("--diff refuses existing files before any work and writes nothing", async () => {
    const diff = join(root, "a2-diff-taken");
    await mkdir(diff, { recursive: true });
    const { sheet } = autoColorDiffPaths(diff, input);
    await writeFile(sheet, "keep\n");
    const composition = join(root, "a2-taken", "clip.composition.json");
    try {
      await autoColorClip({
        input,
        writeComposition: composition,
        diff,
        cacheDirectory: cache(),
      });
      expect.fail("must reject");
    } catch (error) {
      const [diagnostic] = passageDiagnostics(error);
      expect(diagnostic!.code).toBe("comp-auto-color-output");
      expect(diagnostic!.path).toBe("diff");
    }
    expect(await readFile(sheet, "utf8")).toBe("keep\n");
    expect(await readdir(diff)).toEqual(["a2-flat.sheet.png"]);
    await expect(readdir(join(root, "a2-taken"))).rejects.toThrow();
  });

  it("--diff naming a file is refused before any work, so nothing is published", async () => {
    // Before the fix the existence check read ENOTDIR as "absent", the render
    // was published, and only then did the diff folder fail: no report, and
    // a retry refused because the output existed.
    const diff = join(root, "a2-diff-file");
    await writeFile(diff, "keep\n");
    const output = join(root, "a2-diff-file-out", "clip.mp4");
    try {
      await autoColorClip({
        input,
        output,
        diff,
        cacheDirectory: cache(),
      });
      expect.fail("must reject");
    } catch (error) {
      const [diagnostic] = passageDiagnostics(error);
      expect(diagnostic!.code).toBe("comp-auto-color-output");
      expect(diagnostic!.path).toBe("diff");
    }
    expect(await readFile(diff, "utf8")).toBe("keep\n");
    await expect(readdir(join(root, "a2-diff-file-out"))).rejects.toThrow();
  });

  it("a --diff file that appears during the run is refused and nothing is published", async () => {
    // Before the fix the images were written after the output was linked: the
    // run failed with the output published and no report, and a retry was
    // refused because the output existed.
    const diff = join(root, "a2-diff-late");
    const output = join(root, "a2-diff-late-out", "clip.mp4");
    const { still, sheet } = autoColorDiffPaths(diff, input);
    try {
      await autoColorClip({
        input,
        output,
        diff,
        cacheDirectory: cache(),
        // After the existence check at the start: another run's sheet lands.
        progress: (message) => {
          if (message.startsWith("rendering"))
            writeFileSync(sheet, "keep\n", { flag: "wx" });
        },
      });
      expect.fail("must reject");
    } catch (error) {
      const [diagnostic] = passageDiagnostics(error);
      expect(diagnostic!.code).toBe("comp-auto-color-output");
      expect(diagnostic!.path).toBe("diff");
    }
    expect(await readFile(sheet, "utf8")).toBe("keep\n");
    expect(await readdir(diff)).toEqual([basename(sheet)]);
    expect(existsSync(still)).toBe(false);
    expect(await readdir(dirname(output))).toEqual([]);
  }, 120_000);

  it("with a render, --diff shows the output: the same images as comp grade diff", async () => {
    const diff = join(root, "a2-diff-render");
    const output = join(root, "a2-render.mp4");
    await autoColorClip({
      input,
      output,
      engine: "grade",
      diff,
      cacheDirectory: cache(),
    });
    const paths = autoColorDiffPaths(diff, input);
    const still = join(root, "a2-grade-diff-still.png"),
      sheet = join(root, "a2-grade-diff-sheet.png");
    await diffColorGrade(input, output, {
      still,
      sheet,
      cacheDirectory: cache(),
    });
    expect(await readFile(paths.still)).toEqual(await readFile(still));
    expect(await readFile(paths.sheet)).toEqual(await readFile(sheet));
  }, 120_000);
});
