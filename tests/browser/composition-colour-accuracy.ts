// Colour accuracy across decode, canvas and export (owner decision D-colour,
// 2026-11-16: "Match players"). BT.709-tagged SDR video is treated as
// equivalent to sRGB: no transfer conversion on the way in or out. See
// docs/composition-colour-accuracy-results.json.
//
// Three checks, each failing on `main` 9d69a4f7 before the change:
//   1. Authored colours survive every export path (default MP4 and each
//      `--format` profile) within codec tolerance.
//   2. BT.709 footage round-trips through a composition unchanged, within
//      codec tolerance, on every export path.
//   3. The canvas holds footage at the values a player shows: pixel lint's
//      legibility contrast over solid footage equals the WCAG contrast
//      computed from the footage as a player decodes it.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { comp, solid, text, video } from "@still-shift/motion";
import type { Composition } from "@still-shift/scene-contract";
import {
  COMPOSITION_OUTPUT_FORMATS,
  compositionOutputProfile,
  type CompositionOutputFormat,
} from "../../packages/execution-runtime/src/composition-output.ts";
import { contrastRatio } from "../../packages/renderer-core/src/typography-quality.ts";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { latin } from "../../research/editorial-titles-et7a/fonts.ts";

const run = promisify(execFile);

/** Swatches: dark teal (the ET6a case), near black, mid grey, paper, red. */
export const SWATCHES = [
  "#2F6F6A",
  "#111111",
  "#808080",
  "#F4EFE2",
  "#B3261E",
] as const;
const SIZE = 64;
const width = SIZE * SWATCHES.length,
  height = SIZE;

type Path = CompositionOutputFormat | "mp4";
const PATHS: Path[] = ["mp4", ...COMPOSITION_OUTPUT_FORMATS];
/**
 * Largest per-channel difference allowed for a swatch centre (8×8 mean). PNG
 * is lossless; 10-bit and 4:4:4 paths round through limited-range YUV once;
 * 8-bit 4:2:0 paths round more coarsely.
 */
export const CODEC_TOLERANCE: Record<Path, number> = {
  png8: 0,
  png16: 0,
  prores4444: 2,
  vp9alpha: 2,
  hevc10: 2,
  prores422hq: 2,
  h264: 3,
  mp4: 3,
};
/**
 * Footage is decoded twice (the engine's decode and the reference player
 * decode use different YUV→RGB rounding), so footage checks allow one level
 * more than CODEC_TOLERANCE.
 */
export const DECODE_ROUNDING = 1;
/**
 * Transfer tag each path must carry: sRGB for PNG, BT.709 for video (players
 * show both like sRGB). A PNG tagged BT.709 would be read through the camera
 * curve again, the mismatch D-colour removes.
 */
export const EXPECTED_TRANSFER = (path: Path) =>
  path.startsWith("png") ? "iec61966-2-1" : "bt709";
/** Legibility contrast agrees with the player-value contrast within this. */
export const CONTRAST_TOLERANCE = 0.05;

type Rgb = [number, number, number];
const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

let directory = "";
let count = 0;

async function cli(args: string[]) {
  let stdout = "",
    stderr = "";
  const code = await runCli(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
  });
  return { code, stdout, stderr };
}

/** Decode frame 0 to full-range RGB24 using the output's own matrix and range. */
async function decode(path: string, yuv: boolean, sixteen = false) {
  const { stdout } = await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-frames:v",
      "1",
      "-vf",
      yuv
        ? "scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=rgb24"
        : sixteen
          ? "format=rgb48le"
          : "format=rgb24",
      "-f",
      "rawvideo",
      "-",
    ],
    { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
  );
  if (!sixteen) {
    assert.equal(stdout.length, width * height * 3, path);
    return stdout;
  }
  // 16-bit PNG samples are bytes × 257; read them back exactly.
  assert.equal(stdout.length, width * height * 6, path);
  const bytes = Buffer.alloc(width * height * 3);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = Math.round(stdout.readUInt16LE(i * 2) / 257);
  return bytes;
}

/** Mean of the 8×8 centre of each swatch. */
function centres(pixels: Buffer): Rgb[] {
  return SWATCHES.map((_, s) => {
    const sum = [0, 0, 0];
    for (let y = SIZE / 2 - 4; y < SIZE / 2 + 4; y++)
      for (let x = s * SIZE + SIZE / 2 - 4; x < s * SIZE + SIZE / 2 + 4; x++)
        for (let c = 0; c < 3; c++) sum[c]! += pixels[(y * width + x) * 3 + c]!;
    return sum.map((v) => Math.round(v / 64)) as Rgb;
  });
}

/** Render through one export path; return its tags and swatch centres. */
async function exported(composition: Composition, path: Path) {
  const input = join(directory, `${composition.id}-${count++}.json`);
  await writeFile(input, JSON.stringify(composition));
  const output =
    path === "mp4"
      ? join(directory, `out-${count}.mp4`)
      : path.startsWith("png")
        ? join(directory, `out-${count}-%06d.png`)
        : join(
            directory,
            `out-${count}.${compositionOutputProfile(path).container}`,
          );
  const result = await cli([
    "comp",
    "render",
    "--input",
    input,
    "--output",
    output,
    ...(path === "mp4" ? [] : ["--format", path]),
  ]);
  assert.equal(result.code, 0, `${path}: ${result.stderr}`);
  const file = output.replace("%06d", "000000");
  const yuv =
    path === "mp4" || compositionOutputProfile(path).matrix === "bt709";
  const { stdout: probe } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=color_transfer",
    "-of",
    "csv=p=0",
    file,
  ]);
  return {
    transfer: probe.trim(),
    centres: centres(await decode(file, yuv, path === "png16")),
  };
}

const worst = (a: Rgb[], b: Rgb[]) =>
  Math.max(...a.flatMap((v, i) => v.map((c, k) => Math.abs(c - b[i]![k]!))));

/** A lossless BT.709 limited-range clip of the swatches, tagged as phones and AI tools tag video. */
async function footage() {
  const at = (c: 0 | 1 | 2) => {
    let expression = String(rgb(SWATCHES.at(-1)!)[c]);
    for (let s = SWATCHES.length - 2; s >= 0; s--)
      expression = `if(lt(X,${(s + 1) * SIZE}),${rgb(SWATCHES[s]!)[c]},${expression})`;
    return expression;
  };
  const path = join(directory, "swatches-bt709.mp4");
  await run("ffmpeg", [
    "-v",
    "error",
    "-nostdin",
    "-f",
    "lavfi",
    "-i",
    `color=c=black:s=${width}x${height}:r=24:d=1,format=gbrp,geq=r='${at(0)}':g='${at(1)}':b='${at(2)}',scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd,format=yuv444p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=limited`,
    "-c:v",
    "libx264",
    "-qp",
    "0",
    "-threads",
    "1",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-colorspace",
    "bt709",
    "-color_range",
    "tv",
    "-map_metadata",
    "-1",
    "-fflags",
    "+bitexact",
    "-flags:v",
    "+bitexact",
    "-an",
    "-y",
    path,
  ]);
  const sha = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
  return {
    asset: {
      id: "swatches",
      type: "video" as const,
      path,
      sha256: `sha256:${sha}` as const,
      width,
      height,
      frameCount: 24,
      frameRate: { numerator: 24, denominator: 1 },
      color: {
        primaries: "bt709" as const,
        transfer: "bt709" as const,
        matrix: "bt709" as const,
        range: "tv" as const,
      },
    },
    /** What a player shows: the clip decoded with its own matrix and range. */
    player: centres(await decode(path, true)),
  };
}
type Clip = Awaited<ReturnType<typeof footage>>;

const base = (id: string, assets: Composition["assets"] = []) => ({
  id,
  width,
  height,
  fps: 24,
  frames: 1,
  background: "#000000",
  assets,
});
const swatchComposition = () =>
  comp(base("colour-swatches"), (c) => {
    SWATCHES.forEach((color, s) =>
      c.add(solid(`s${s}`, { color, size: [SIZE, SIZE] }).at(s * SIZE, 0)),
    );
  }) as Composition;
const footageComposition = (clip: Clip) =>
  comp(base("colour-footage", [clip.asset]), (c) => {
    c.add(video("v", clip.asset, { size: [width, height], fit: "stretch" }));
  }) as Composition;

/**
 * White heading text over the teal swatch of the footage, linted with
 * `--legibility true`: the worst contrast must equal the WCAG contrast of
 * white against the teal a player shows.
 */
async function legibilityOver(clip: Clip) {
  const composition = comp(
    { ...base("colour-legibility", [latin.anton, clip.asset]), frames: 24 },
    (c) => {
      c.add(
        text("HI", {
          id: "title",
          fontAsset: "anton",
          fontSize: 44,
          color: "#FFFFFF",
        })
          .at(32, 8)
          .with({ align: "center", anchor: "top", textRole: "heading" }),
      );
      c.add(video("v", clip.asset, { size: [width, height], fit: "stretch" }));
    },
  ) as Composition;
  const input = join(directory, "legibility.json");
  await writeFile(input, JSON.stringify(composition));
  const result = await cli([
    "comp",
    "lint",
    "--input",
    input,
    "--pixels",
    "true",
    "--legibility",
    "true",
  ]);
  assert.equal(result.stderr, "", result.stderr);
  const report = JSON.parse(result.stdout) as {
    textLegibility: {
      layers: { layer: string; worst?: { contrast: number } }[];
    };
  };
  const measured = report.textLegibility.layers.find(
    (l) => l.layer === "title",
  )!.worst!.contrast;
  const hex = (c: Rgb) =>
    "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  const player =
    Math.round(contrastRatio("#FFFFFF", hex(clip.player[0]!)) * 100) / 100;
  return { measured, player };
}

export async function verifyColourAccuracy() {
  directory = await mkdtemp(join(tmpdir(), "colour-accuracy-"));
  try {
    const authored = SWATCHES.map(rgb);
    const clip = await footage();
    const authoredRuns: Record<string, { transfer: string; error: number }> =
      {};
    const footageRuns: Record<string, { transfer: string; error: number }> = {};
    for (const path of PATHS) {
      const a = await exported(swatchComposition(), path);
      authoredRuns[path] = {
        transfer: a.transfer,
        error: worst(a.centres, authored),
      };
      const f = await exported(footageComposition(clip), path);
      footageRuns[path] = {
        transfer: f.transfer,
        error: worst(f.centres, clip.player),
      };
    }
    const legibility = await legibilityOver(clip);
    const results = {
      authored: authoredRuns,
      footage: { player: clip.player, runs: footageRuns },
      legibility,
      tolerance: {
        codec: CODEC_TOLERANCE,
        decodeRounding: DECODE_ROUNDING,
        contrast: CONTRAST_TOLERANCE,
      },
    };
    console.log(`Colour accuracy: ${JSON.stringify(results)}`);
    const failures = [
      ...PATHS.flatMap((p) =>
        [
          ["authored", authoredRuns[p]!.transfer],
          ["footage", footageRuns[p]!.transfer],
        ]
          .filter(([, transfer]) => transfer !== EXPECTED_TRANSFER(p))
          .map(
            ([run, transfer]) =>
              `${run} ${p} transfer tag ${transfer}, expected ${EXPECTED_TRANSFER(p)}`,
          ),
      ),
      ...PATHS.filter((p) => authoredRuns[p]!.error > CODEC_TOLERANCE[p]).map(
        (p) =>
          `authored ${p}: ${authoredRuns[p]!.error} > ${CODEC_TOLERANCE[p]}`,
      ),
      ...PATHS.filter(
        (p) => footageRuns[p]!.error > CODEC_TOLERANCE[p] + DECODE_ROUNDING,
      ).map(
        (p) =>
          `footage ${p}: ${footageRuns[p]!.error} > ${CODEC_TOLERANCE[p] + DECODE_ROUNDING}`,
      ),
      ...(Math.abs(legibility.measured - legibility.player) > CONTRAST_TOLERANCE
        ? [
            `legibility contrast ${legibility.measured} vs ${legibility.player} from the player's values`,
          ]
        : []),
    ];
    assert.deepEqual(failures, [], failures.join("\n"));
    return results;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  await verifyColourAccuracy();
