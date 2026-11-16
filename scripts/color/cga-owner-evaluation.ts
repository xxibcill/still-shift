/**
 * CGA evaluation on locally supplied footage (never committed).
 *
 *   node --import tsx scripts/color/cga-owner-evaluation.ts \
 *     --raw <folder of raw clips> --graded <graded edit> --held-out <clip name> \
 *     --output dist/cga-owner [--look <existing look.json>]
 *
 * Writes under --output (git-ignored dist/): the fitted look, renders per clip
 * (look at the default 60% and auto with the current defaults; look 50%, 65%
 * and 75% for the held-out clip), their reports, BT.601 decode checks,
 * labelled contact sheets (Raw | Look 60% | Auto at 25/50/75% of each clip), a
 * strength ladder for the held-out clip and summary.json. Existing renders are
 * reused. Software measurements only; not visual acceptance.
 */
import { spawnSync } from "node:child_process";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import {
  autoColorClip,
  colorSampleOrdinals,
  fitColorLook,
  measureColorFrames,
  openColorClip,
  parseColorLook,
  readColorCodeValueFrames,
  readColorFrames,
  type ColorStatistics,
} from "@still-shift/animation-engine";
import { launchRenderBrowser } from "@still-shift/execution-runtime";

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
const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );
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
  const reference = ffmpeg(
    "scale=in_range=tv:out_range=pc:in_color_matrix=bt601",
    "rgb24",
  );
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

const browser = await launchRenderBrowser();
/** One cell: a frame in display code values (range/matrix only), 360×640 PNG. */
function cell(path: string, ordinal: number) {
  const matrix = path.startsWith(rawDirectory) ? "bt601" : "bt709";
  const result = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-vf",
      `select=eq(n\\,${ordinal}),scale=360:640:in_range=tv:out_range=pc:in_color_matrix=${matrix}:flags=area,format=rgb24`,
      "-frames:v",
      "1",
      "-f",
      "image2pipe",
      "-vcodec",
      "png",
      "pipe:1",
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0) throw Error(result.stderr.toString());
  return result.stdout.toString("base64");
}
/** A labelled grid: one column per source, rows at 25/50/75% of the clip. */
async function sheet(
  title: string,
  columns: { label: string; detail: string; path: string }[],
  frameCount: number,
  out: string,
) {
  const picks = [0.25, 0.5, 0.75].map((q) => Math.floor(q * frameCount));
  const header = columns
    .map(
      (column) =>
        `<div class="label"><b>${column.label}</b><span>${column.detail}</span></div>`,
    )
    .join("");
  const rows = picks
    .map((ordinal) =>
      columns
        .map(
          (column) =>
            `<img src="data:image/png;base64,${cell(column.path, ordinal)}">`,
        )
        .join(""),
    )
    .join("");
  const page = await browser.newPage({
    viewport: { width: columns.length * 368 + 8, height: 400 },
  });
  try {
    await page.setContent(`<!doctype html><style>
      body{margin:0;background:#111;color:#eee;font:15px -apple-system,Helvetica,Arial,sans-serif}
      h1{font-size:17px;margin:10px 8px 4px;font-weight:600}
      .grid{display:grid;grid-template-columns:repeat(${columns.length},360px);gap:8px;padding:8px}
      .label{display:flex;flex-direction:column;gap:2px}
      .label b{font-size:20px}.label span{color:#aaa;font-size:13px}
      img{width:360px;height:640px;display:block}
    </style><h1>${title}</h1><div class="grid">${header}${rows}</div>`);
    await page.screenshot({ path: out, fullPage: true });
  } finally {
    await page.close();
  }
}

const lookPath = args.get("look") ?? join(output, "owner.look.json");
let look;
if (await exists(lookPath))
  look = parseColorLook(JSON.parse(await readFile(lookPath, "utf8")));
else {
  log(`fitting the look from ${clips.length} clips and ${basename(graded)}`);
  look = await fitColorLook(clips, graded, { cacheDirectory, progress: log });
  await writeFile(lookPath, JSON.stringify(look, null, 2));
}
const decode = await decodeCheck(
  clips.find((path) => basename(path) === heldOut) ?? clips[0]!,
);
log(`decode check: ${JSON.stringify(decode)}`);

type Mode = { folder: string; lookStrength?: number };
const modes: Mode[] = [
  { folder: "look-60", lookStrength: 0.6 },
  { folder: "auto" },
];
const ladderStrengths = [50, 60, 65, 75];
const ladder: Mode[] = ladderStrengths.map((percent) => ({
  folder: `look-${percent}`,
  lookStrength: percent / 100,
}));
const render = async (path: string, mode: Mode) => {
  const out = join(output, mode.folder, `${basename(path, extname(path))}.mp4`);
  if (await exists(out)) return out;
  log(`${mode.folder}: ${basename(path)}`);
  await autoColorClip({
    input: path,
    output: out,
    ...(mode.lookStrength === undefined
      ? {}
      : { look, lookStrength: mode.lookStrength, adaptive: false }),
    cacheDirectory,
  });
  return out;
};
/** Statistics of a rendered output in code values, or of the raw clip. */
async function stats(path: string, raw: boolean): Promise<ColorStatistics> {
  const clip = await openColorClip(path, { cacheDirectory });
  const ordinals = colorSampleOrdinals(clip.probe.frameCount, 12);
  const frames = raw
    ? await readColorFrames(clip, ordinals, { cacheDirectory })
    : [...(await readColorCodeValueFrames(clip, ordinals))].map(
        ([ordinal, rgba]) => ({ ordinal, rgba }),
      );
  return measureColorFrames({ frames: frames, width: clip.probe.width });
}
const summarize = (s: ColorStatistics) => ({
  medianLuma: s.luma.p50,
  spread595: Math.round((s.luma.p95 - s.luma.p05) * 1e4) / 1e4,
  saturationP50: s.saturation.p50,
  saturationP90: s.saturation.p90,
  clipped: s.clippedFraction,
  crushed: s.crushedFraction,
});

await mkdir(join(output, "sheets"), { recursive: true });
const rows: unknown[] = [];
for (const path of clips) {
  const stem = basename(path, extname(path));
  const outputs: Record<string, string> = {};
  for (const mode of modes) outputs[mode.folder] = await render(path, mode);
  const frameCount = (await openColorClip(path, { cacheDirectory })).probe
    .frameCount;
  await sheet(
    stem,
    [
      { label: "Raw", detail: "the Flow clip as delivered", path },
      {
        label: "Look 60%",
        detail: "your grade at 60% (new default)",
        path: outputs["look-60"]!,
      },
      {
        label: "Auto",
        detail: "automatic correction, new defaults",
        path: outputs.auto!,
      },
    ],
    frameCount,
    join(output, "sheets", `${stem}.png`),
  );
  const report = JSON.parse(
    await readFile(outputs.auto!.replace(/\.mp4$/, ".auto-color.json"), "utf8"),
  );
  rows.push({
    clip: basename(path),
    inGradedEdit: look.fit.shots.some((shot) => shot.before === basename(path)),
    raw: summarize(await stats(path, true)),
    look60: summarize(await stats(outputs["look-60"]!, false)),
    auto: {
      ...summarize(await stats(outputs.auto!, false)),
      effects: report.effects.map(
        (effect: { effect: string; params: unknown }) => ({
          effect: effect.effect,
          params: effect.params,
        }),
      ),
      frameCount: report.output.frameCount,
      sourceFrameCount: report.input.frameCount,
      durationSeconds: report.output.durationSeconds,
      predictedRms: report.output.predictedRms,
      continuity: [
        report.before.medianLumaContinuity,
        report.output.measured.medianLumaContinuity,
      ],
      audio: report.output.audio,
    },
  });
}
const held = clips.find((path) => basename(path) === heldOut)!;
const heldStem = basename(held, extname(held));
for (const mode of ladder) await render(held, mode);
await sheet(
  `${heldStem}: look strength ladder`,
  [
    { label: "Raw", detail: "as delivered", path: held },
    ...ladderStrengths.map((percent) => ({
      label: `Look ${percent}%`,
      detail: percent === 60 ? "new default" : "your grade",
      path: join(output, `look-${percent}`, `${heldStem}.mp4`),
    })),
    {
      label: "Auto",
      detail: "new defaults",
      path: join(output, "auto", `${heldStem}.mp4`),
    },
  ],
  (await openColorClip(held, { cacheDirectory })).probe.frameCount,
  join(output, "sheets", `${heldStem}-strength-ladder.png`),
);
await browser.close();
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
