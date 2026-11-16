/**
 * CGA evaluation on locally supplied footage (never committed).
 *
 *   node --import tsx scripts/color/cga-owner-evaluation.ts \
 *     --raw <folder of raw clips> --graded <graded edit> --held-out <clip name> \
 *     --output dist/cga-owner
 *
 * Writes, under --output (git-ignored dist/): the fitted look, per-clip look
 * and adaptive renders with their reports, BT.601 decode checks, before/after
 * contact sheets (raw | look | adaptive at 25/50/75%) and summary.json. It
 * records software measurements only; it is not visual acceptance.
 */
import { spawnSync } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import {
  autoColorClip,
  fitColorLook,
  openColorClip,
  readColorFrames,
  type AutoColorReport,
} from "@still-shift/animation-engine";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i]!.replace(/^--/, ""), process.argv[i + 1]!);
const need = (name: string) => {
  const value = args.get(name);
  if (!value) throw Error(`--${name} is required`);
  return value;
};
const rawDirectory = resolve(need("raw")),
  graded = resolve(need("graded")),
  heldOut = need("held-out"),
  output = resolve(args.get("output") ?? "dist/cga-owner");
const cacheDirectory = join(output, "media-cache");
const log = (message: string) =>
  console.error(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
await mkdir(output, { recursive: true });
const clips = (await readdir(rawDirectory))
  .filter((name) => /\.(mp4|mov|m4v|mkv)$/i.test(name))
  .sort()
  .map((name) => join(rawDirectory, name));

/** BT.601 decode check on one raw clip: media path vs FFmpeg and a JS reference. */
async function decodeCheck(path: string) {
  const clip = await openColorClip(path, { cacheDirectory });
  const ordinal = Math.floor(clip.probe.frameCount / 2);
  const [frame] = await readColorFrames(clip, [ordinal], { cacheDirectory });
  const { width, height } = clip.probe;
  const ffmpeg = (filters: string, format: string) =>
    spawnSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        path,
        "-vf",
        `select=eq(n\\,${ordinal}),${filters}`,
        "-frames:v",
        "1",
        "-pix_fmt",
        format,
        "-f",
        "rawvideo",
        "pipe:1",
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    ).stdout;
  // FFmpeg's own conversion with default swscale flags and the tagged matrix.
  const reference = ffmpeg(
    "scale=in_range=tv:out_range=pc:in_color_matrix=bt601",
    "rgb24",
  );
  // Chroma upsampled by FFmpeg, matrix in float64 here.
  const yuv = ffmpeg(
    "scale=flags=accurate_rnd+bitexact:in_range=tv:out_range=tv",
    "yuv444p",
  );
  const size = width * height;
  const compare = (expected: (i: number, c: number) => number) => {
    const histogram = new Float64Array(256);
    for (let i = 0; i < size; i++)
      for (let c = 0; c < 3; c++)
        histogram[Math.abs(frame!.rgba[i * 4 + c]! - expected(i, c))]!++;
    let seen = 0,
      p99 = 0,
      max = 0,
      withinOne = 0;
    for (let e = 0; e < 256; e++) {
      if (histogram[e]) max = e;
      seen += histogram[e]!;
      if (seen < 0.99 * size * 3) p99 = e + 1;
      if (e <= 1) withinOne += histogram[e]!;
    }
    return { max, p99, withinOneShare: withinOne / (size * 3) };
  };
  const bt601 = (i: number, c: number) => {
    const y = (yuv[i]! - 16) / 219,
      u = (yuv[size + i]! - 128) / 224,
      v = (yuv[2 * size + i]! - 128) / 224;
    const r = y + 1.402 * v,
      b = y + 1.772 * u,
      g = (y - 0.299 * r - 0.114 * b) / 0.587;
    return Math.round(Math.min(1, Math.max(0, [r, g, b][c]!)) * 255);
  };
  return {
    clip: clip.name,
    ordinal,
    color: clip.probe.color,
    ffmpegDefaultSwscale: compare((i, c) => reference[i * 3 + c]!),
    float64Bt601OnFfmpegChroma: compare(bt601),
  };
}

/** One contact sheet per clip: rows 25/50/75%, columns raw | look | adaptive. */
function contactSheet(
  raw: string,
  look: string,
  adaptive: string,
  out: string,
) {
  const probe = spawnSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=nb_frames",
    "-of",
    "csv=p=0",
    raw,
  ]).stdout.toString();
  const frames = Number(probe.trim()) || 72;
  const picks = [0.25, 0.5, 0.75].map((q) => Math.floor(q * frames));
  const inputs: string[] = [];
  const filters: string[] = [];
  let index = 0;
  for (const [row, ordinal] of picks.entries())
    for (const [column, path] of [raw, look, adaptive].entries()) {
      inputs.push("-i", path);
      // Code values, as players show them: range/matrix only, no transfer.
      const matrix = column === 0 ? "bt601" : "bt709";
      filters.push(
        `[${index}:v]select=eq(n\\,${ordinal}),scale=360:640:in_range=tv:out_range=pc:in_color_matrix=${matrix}:flags=area,format=rgb24,setpts=PTS-STARTPTS[c${row}${column}]`,
      );
      index++;
    }
  for (const row of [0, 1, 2])
    filters.push(`[c${row}0][c${row}1][c${row}2]hstack=inputs=3[r${row}]`);
  filters.push("[r0][r1][r2]vstack=inputs=3[sheet]");
  const result = spawnSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[sheet]",
    "-frames:v",
    "1",
    out,
  ]);
  if (result.status !== 0) throw Error(result.stderr.toString());
}

log(`fitting the look from ${clips.length} clips and ${basename(graded)}`);
const look = await fitColorLook(clips, graded, {
  cacheDirectory,
  progress: log,
});
await writeFile(join(output, "owner.look.json"), JSON.stringify(look, null, 2));
const decode = await decodeCheck(
  clips.find((path) => basename(path) === heldOut) ?? clips[0]!,
);
log(`decode check: ${JSON.stringify(decode)}`);
const rows: unknown[] = [];
for (const path of clips) {
  const stem = basename(path, extname(path));
  const reports: Record<string, AutoColorReport> = {};
  for (const mode of ["look", "adaptive"] as const) {
    const out = join(output, mode, `${stem}.mp4`);
    log(`${mode}: ${stem}`);
    reports[mode] = await autoColorClip({
      input: path,
      output: out,
      look: mode === "look" ? look : undefined,
      adaptive: mode === "adaptive",
      cacheDirectory,
    });
  }
  await mkdir(join(output, "sheets"), { recursive: true });
  contactSheet(
    path,
    join(output, "look", `${stem}.mp4`),
    join(output, "adaptive", `${stem}.mp4`),
    join(output, "sheets", `${stem}.png`),
  );
  const summarize = (report: AutoColorReport) => ({
    effects: report.effects.map((effect) => ({
      effect: effect.effect,
      params: effect.params,
    })),
    medianLuma: [report.before.luma.p50, report.predicted.luma.p50],
    medianLumaChange: report.change.medianLuma,
    saturation: [
      [report.before.saturation.p50, report.before.saturation.p90],
      [report.predicted.saturation.p50, report.predicted.saturation.p90],
    ],
    clipped: [report.before.clippedFraction, report.predicted.clippedFraction],
    crushed: [report.before.crushedFraction, report.predicted.crushedFraction],
    neutralTemperature: [
      report.before.neutral.temperature,
      report.predicted.neutral.temperature,
    ],
    output: {
      frameCount: report.output!.frameCount,
      sourceFrameCount: report.input.frameCount,
      durationSeconds: report.output!.durationSeconds,
      predictedRms: report.output!.predictedRms,
      measuredMedianLuma: report.output!.measured.luma.p50,
      continuity: [
        report.before.medianLumaContinuity,
        report.output!.measured.medianLumaContinuity,
      ],
      audio: report.output!.audio,
    },
  });
  rows.push({
    clip: basename(path),
    inGradedEdit: look.sources.before.some(
      (source) =>
        source.name === basename(path) &&
        look.fit.shots.some((shot) => shot.before === source.name),
    ),
    look: summarize(reports.look!),
    adaptive: summarize(reports.adaptive!),
  });
}
const summary = {
  look: {
    params: look.params,
    summary: look.summary,
    residual: look.fit.residual,
    heldOut: look.fit.heldOut,
    shots: look.fit.shots.map((shot) => ({
      after: shot.after,
      before: shot.before,
      correlation: shot.correlation,
      residual: shot.residual,
      heldOut: shot.heldOut,
    })),
    unmatchedShots: look.fit.unmatchedShots,
    afterInterpretation: look.fit.afterInterpretation,
  },
  decode,
  clips: rows,
};
await writeFile(
  join(output, "summary.json"),
  JSON.stringify(summary, null, 2) + "\n",
);
log(`done: ${join(output, "summary.json")}`);
