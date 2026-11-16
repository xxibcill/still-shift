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
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyColorEffects,
  autoColorClip,
  colorSampleOrdinals,
  compareClipAudio,
  colorSolverFrames,
  fitColorLook,
  measureColorFrames,
  openColorClip,
  readColorFrames,
  solveColorCorrection,
  type ColorFrame,
} from "@still-shift/animation-engine";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import {
  CGA_SYNTHETIC,
  cgaDegrade,
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
  return solveColorCorrection(small.frames, small.width);
};

describe("CGA measurement", () => {
  it("reads the lossless fixture exactly and reports deterministic statistics", async () => {
    const { read, path } = await clipFrames("reference", reference);
    read.forEach((frame) =>
      expect(frame.rgba).toEqual(reference[frame.ordinal]),
    );
    const first = JSON.stringify(measureColorFrames(read, W));
    // A second, cold preparation cache gives byte-identical statistics.
    const clip = await openColorClip(path);
    const again = await readColorFrames(clip, colorSampleOrdinals(12, 12), {
      cacheDirectory: join(root, "second-cache"),
    });
    expect(JSON.stringify(measureColorFrames(again, W))).toBe(first);
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
      const source = measureColorFrames(read, W);
      const result = measureColorFrames(
        fixed.map((rgba, ordinal) => ({ ordinal, rgba })),
        W,
      );
      expect(result.clippedFraction - source.clippedFraction).toBeLessThan(
        0.004,
      );
      expect(result.crushedFraction - source.crushedFraction).toBeLessThan(
        0.004,
      );
      const ramp = Array.from({ length: 256 }, (_, v) => [v, v, v, 255]).flat();
      const mapped = applyColorEffects(solution.effects, new Uint8Array(ramp));
      for (let v = 1; v < 256; v++)
        expect(mapped[v * 4]! - mapped[(v - 1) * 4]!).toBeLessThanOrEqual(2);
    },
  );
  it("lifts a desaturated clip to the saturation targets, protecting skin", async () => {
    const degraded = cgaDegrade(reference, { kind: "saturation", scale: 0.4 });
    const { read } = await clipFrames("desaturated", degraded);
    const solution = solve(read);
    const vibrance = solution.effects.find(
      (effect) => effect.effect === "color.vibrance",
    );
    expect(vibrance?.params.vibrance).toBeGreaterThan(30);
    const before = measureColorFrames(read, W).saturation.p50;
    expect(before).toBeLessThan(0.15);
    expect(solution.predicted.saturation.p50).toBeGreaterThanOrEqual(0.15);
    const fixed = read.map((frame) =>
      applyColorEffects(solution.effects, frame.rgba),
    );
    const original = read.map((frame) => reference[frame.ordinal]!);
    expect(rms(fixed, original)).toBeLessThan(
      0.85 *
        rms(
          read.map((frame) => frame.rgba),
          original,
        ),
    );
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
    const before = measureColorFrames(read, W);
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
    const none = solveColorCorrection(small.frames, small.width, {
      strength: 0,
    });
    expect(none.effects).toEqual([]);
    const off = solveColorCorrection(small.frames, small.width, {
      exposure: false,
      contrast: false,
    });
    expect(off.effects.some((effect) => effect.effect === "color.levels")).toBe(
      false,
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
    expect(fitted.fit.heldOut.rmsMax).toBeLessThan(1);
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
