// CG0 media baseline: what the current engine does with the CG0 fixtures,
// recorded before the color grading upgrade changes it.
//
//   pnpm color:cg0-baseline [--write]
//
// Records into benchmarks/fixtures/color/cg0/cg0-baseline.json:
// - the media probe result (accepted, or the diagnostic) for every CG0 video
//   and the PNG inspection result for every 16-bit ramp still (CG7 inputs);
// - the moving clip decoded through the media path against its stated
//   picture (codec error) and the disc trajectory measured from pixels;
// - `comp lint --pixels true` on a graded native-video composition;
// - the export -> import round trip of a 16-step grey ramp (the CGA finding
//   that a re-imported render came out about 5% brighter);
// - the number of distinct levels in a 10-bit HEVC export of an 8-bit ramp
//   (the CG8 starting point).
//
// Without --write it recomputes everything and fails if any recorded value
// differs. Outputs go to a temporary directory; nothing else is written.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { format } from "prettier";
import { probeCompositionVideo } from "../../packages/animation-engine/src/composition-media-probe.ts";
import { inspectCompositionPng } from "../../packages/animation-engine/src/composition-media-color.ts";
import {
  openColorClip,
  readColorFrames,
} from "../../packages/animation-engine/src/composition-color-frames.ts";
import {
  CG0_DIRECTORY,
  discCentre,
  movingFrame,
  MOVING_CLIP,
} from "./cg0-fixtures.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const baselinePath = join(CG0_DIRECTORY, "cg0-baseline.json");
type ManifestFile = { path: string; kind: string; id: string; sha256: string };
const manifest = JSON.parse(
  readFileSync(join(CG0_DIRECTORY, "manifest.json"), "utf8"),
) as { files: ManifestFile[] };

const round = (value: number, digits = 4) =>
  Math.round(value * 10 ** digits) / 10 ** digits;
const sha256 = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function failure(error: unknown) {
  const e = error as {
    diagnostics?: { code: string; message: string }[];
    message?: string;
  };
  const diagnostic = e.diagnostics?.[0];
  return {
    accepted: false,
    code: diagnostic?.code ?? "error",
    message: String(diagnostic?.message ?? e.message ?? error).replaceAll(
      root,
      "",
    ),
  };
}

type TransferVectors = {
  functions: { id: string; encode: { code: number[] } }[];
};

/** Accepted 10-bit ramps: what the 8-bit media path keeps of them. */
async function decodedRamp(path: string, transfer: string, cache: string) {
  const vectors = JSON.parse(
    readFileSync(
      join(CG0_DIRECTORY, "vectors/transfer-functions.json"),
      "utf8",
    ),
  ) as TransferVectors;
  const codes = vectors.functions
    .find((fn) => fn.id === transfer)!
    .encode.code.map((v) => Math.max(0, Math.min(1, v)));
  const clip = await openColorClip(path);
  const [frame] = await readColorFrames(clip, [0], { cacheDirectory: cache });
  const width = frame!.width;
  const out = codes.map(
    (_, i) => frame!.rgba[(8 * width + i * 8 + 4) * 4 + 1]!,
  );
  const errors = out.map((v, i) => Math.abs(v - 255 * codes[i]!));
  return {
    decodedTo: "RGBA8 (composition-media-decoder-3)",
    distinctLevels: new Set(out).size,
    sourceSamples: codes.length,
    maxErrorIn8BitCodes: round(Math.max(...errors), 3),
  };
}

async function probes(cache: string) {
  const out: Record<string, unknown> = {};
  for (const file of manifest.files) {
    const path = join(CG0_DIRECTORY, file.path);
    if (file.kind === "video" || file.kind === "ramp-video") {
      try {
        const probe = await probeCompositionVideo(path);
        out[file.path] = {
          accepted: true,
          frameCount: probe.frameCount,
          frameRate: probe.frameRate,
          color: probe.color,
          ...(file.kind === "ramp-video"
            ? {
                decoded: await decodedRamp(
                  path,
                  (file as ManifestFile & { transfer: string }).transfer,
                  cache,
                ),
              }
            : {}),
        };
      } catch (error) {
        out[file.path] = failure(error);
      }
    } else if (file.kind === "ramp-still") {
      try {
        const info = inspectCompositionPng(readFileSync(path));
        out[file.path] = { accepted: true, ...info };
      } catch (error) {
        out[file.path] = failure(error);
      }
    }
  }
  return out;
}

/** Decode the moving clip through the media path and compare. */
async function movingClip(cache: string) {
  const clip = await openColorClip(
    join(CG0_DIRECTORY, "media/moving-disc.mp4"),
  );
  const ordinals = [0, 12, 24, 36, 47];
  const frames = await readColorFrames(clip, ordinals, {
    cacheDirectory: cache,
  });
  const { width, height } = MOVING_CLIP;
  const rows = frames.map((frame) => {
    const expected = movingFrame(frame.ordinal);
    const deltas: number[] = [];
    let sx = 0,
      sy = 0,
      n = 0;
    for (let i = 0; i < width * height; i++) {
      for (let c = 0; c < 3; c++)
        deltas.push(Math.abs(frame.rgba[i * 4 + c]! - expected[i * 3 + c]!));
      // Disc pixels: strongly red-dominant (background is green-grey).
      const r = frame.rgba[i * 4]!,
        g = frame.rgba[i * 4 + 1]!,
        b = frame.rgba[i * 4 + 2]!;
      if (r > 170 && r - g > 80 && r - b > 120) {
        sx += (i % width) + 0.5;
        sy += Math.floor(i / width) + 0.5;
        n++;
      }
    }
    deltas.sort((a, b) => a - b);
    const [cx, cy] = discCentre(frame.ordinal);
    return {
      ordinal: frame.ordinal,
      meanAbs: round(deltas.reduce((a, b) => a + b, 0) / deltas.length),
      p99: deltas[Math.floor(0.99 * (deltas.length - 1))]!,
      max: deltas[deltas.length - 1]!,
      discPixels: n,
      centroidError: round(Math.hypot(sx / n - cx, sy / n - cy), 3),
    };
  });
  return {
    path: "media/moving-disc.mp4",
    method:
      "openColorClip + readColorFrames (the renderer's media path, composition-media-decoder-3) against the generator's exact RGB frames; disc centroid from red-dominant pixels",
    frames: rows,
  };
}

function cli(args: string[], cwd: string) {
  const result = spawnSync("pnpm", ["--silent", "still-shift", ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      STILL_SHIFT_COMPOSITION_MEDIA_CACHE: join(cwd, "cache"),
    },
  });
  return {
    status: result.status,
    stdout: result.stdout.replaceAll(cwd, "<tmp>"),
    stderr: result.stderr.replaceAll(cwd, "<tmp>"),
  };
}

function imageAsset(id: string, path: string, width: number, height: number) {
  return {
    id,
    type: "image",
    path,
    sha256: sha256(readFileSync(join(CG0_DIRECTORY, "stills", path))),
    width,
    height,
  };
}

async function pixelLint(dir: string) {
  copyFileSync(
    join(CG0_DIRECTORY, "media/moving-disc.mp4"),
    join(dir, "moving-disc.mp4"),
  );
  const probe = await probeCompositionVideo(join(dir, "moving-disc.mp4"));
  const composition = {
    schemaVersion: "composition-1",
    id: "cg0-video-pixel-lint",
    width: MOVING_CLIP.width,
    height: MOVING_CLIP.height,
    fps: MOVING_CLIP.fps,
    frameCount: MOVING_CLIP.frames,
    background: "#000000",
    assets: [
      {
        id: "clip",
        type: "video",
        path: "moving-disc.mp4",
        sha256: probe.sourceHash,
        width: probe.width,
        height: probe.height,
        frameCount: probe.frameCount,
        frameRate: probe.frameRate,
        color: probe.color,
      },
    ],
    layers: [
      {
        id: "clip",
        type: "video",
        asset: "clip",
        effects: [
          {
            id: "grade",
            effect: "color.levels",
            params: { inputBlack: 0.05, inputWhite: 0.92, gamma: 1.2 },
          },
        ],
      },
    ],
  };
  writeFileSync(join(dir, "lint.json"), JSON.stringify(composition, null, 2));
  const args = [
    "comp",
    "lint",
    "--input",
    join(dir, "lint.json"),
    "--pixels",
    "true",
  ];
  const run = cli(args, dir);
  let report: unknown = null;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    report = { unparsedStdout: run.stdout.slice(0, 2000) };
  }
  return {
    command: `pnpm --silent still-shift ${args.join(" ").replaceAll(dir, "<tmp>")}`,
    composition:
      "one native video layer (CG0 moving-disc.mp4) with a color.levels grade",
    exitCode: run.status,
    report,
    stderr: run.stderr.trim().slice(0, 2000),
  };
}

async function renderThenImport(dir: string) {
  copyFileSync(
    join(CG0_DIRECTORY, "stills/gray-steps-16.png"),
    join(dir, "gray-steps-16.png"),
  );
  const composition = {
    schemaVersion: "composition-1",
    id: "cg0-round-trip",
    width: 512,
    height: 32,
    fps: 24,
    frameCount: 2,
    background: "#000000",
    assets: [{ ...imageAsset("steps", "gray-steps-16.png", 512, 32) }],
    layers: [
      {
        id: "steps",
        type: "image",
        sources: [{ asset: "steps" }],
        size: [512, 32],
        fit: "stretch",
        transform: { anchor: [0, 0] },
      },
    ],
  };
  writeFileSync(
    join(dir, "round-trip.json"),
    JSON.stringify(composition, null, 2),
  );
  const output = join(dir, "round-trip.mp4");
  const render = cli(
    [
      "comp",
      "render",
      "--input",
      join(dir, "round-trip.json"),
      "--output",
      output,
    ],
    dir,
  );
  assert.equal(render.status, 0, `round-trip render failed: ${render.stderr}`);
  const tags = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=pix_fmt,color_range,color_space,color_transfer,color_primaries",
        "-of",
        "json",
        output,
      ],
      { encoding: "utf8" },
    ),
  ).streams[0];
  const clip = await openColorClip(output);
  const [frame] = await readColorFrames(clip, [0], {
    cacheDirectory: join(dir, "cache"),
  });
  const steps = Array.from({ length: 16 }, (_, i) => {
    const source = Math.round((i * 255) / 15);
    let sum = 0,
      n = 0;
    for (let y = 8; y < 24; y++)
      for (let x = i * 32 + 8; x < i * 32 + 24; x++) {
        sum += frame!.rgba[(y * 512 + x) * 4 + 1]!;
        n++;
      }
    return {
      source,
      imported: round(sum / n, 2),
      delta: round(sum / n - source, 2),
    };
  });
  const deltas = steps.map((s) => s.delta);
  return {
    composition:
      "stills/gray-steps-16.png as one image layer, rendered with the default MP4 profile, then probed and decoded as a video through the media path (green channel, central 16x16 of each step)",
    exportTags: tags,
    steps,
    maxAbsDelta: Math.max(...deltas.map(Math.abs)),
    meanDelta: round(deltas.reduce((a, b) => a + b, 0) / deltas.length, 3),
    note: "Before D-colour (decoder 2), BT.709-tagged footage was lifted on import (code 16 -> 31, 128 -> 140; CGA measured about +5% median on the owner's re-imported edit). Decoder 3 and output 2 treat BT.709 SDR as display-equivalent to sRGB.",
  };
}

async function tenBitExport(dir: string) {
  copyFileSync(
    join(CG0_DIRECTORY, "stills/gray-ramp-256.png"),
    join(dir, "gray-ramp-256.png"),
  );
  const composition = {
    schemaVersion: "composition-1",
    id: "cg0-hevc10",
    width: 256,
    height: 32,
    fps: 24,
    frameCount: 2,
    background: "#000000",
    assets: [imageAsset("ramp", "gray-ramp-256.png", 256, 32)],
    layers: [
      {
        id: "ramp",
        type: "image",
        sources: [{ asset: "ramp" }],
        size: [256, 32],
        fit: "stretch",
        transform: { anchor: [0, 0] },
      },
    ],
  };
  writeFileSync(join(dir, "hevc10.json"), JSON.stringify(composition, null, 2));
  const output = join(dir, "ramp-hevc10.mp4");
  const render = cli(
    [
      "comp",
      "render",
      "--input",
      join(dir, "hevc10.json"),
      "--output",
      output,
      "--format",
      "hevc10",
    ],
    dir,
  );
  assert.equal(render.status, 0, `hevc10 render failed: ${render.stderr}`);
  const pix = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name,pix_fmt,color_range,color_transfer",
        "-of",
        "json",
        output,
      ],
      { encoding: "utf8" },
    ),
  ).streams[0];
  const raw = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      output,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "yuv420p10le",
      "-",
    ],
    { maxBuffer: 1 << 26 },
  );
  const row = 16;
  const luma = Array.from({ length: 256 }, (_, x) =>
    raw.readUInt16LE((row * 256 + x) * 2),
  );
  const levels = [...new Set(luma)].sort((a, b) => a - b);
  const steps = levels.slice(1).map((v, i) => v - levels[i]!);
  return {
    composition:
      "stills/gray-ramp-256.png (256 distinct 8-bit codes) rendered with --format hevc10",
    stream: pix,
    distinctLumaLevels: levels.length,
    lumaRange: [levels[0], levels[levels.length - 1]],
    medianStep: steps.sort((a, b) => a - b)[Math.floor(steps.length / 2)],
    note: "The 10-bit profile carries the renderer's 8-bit pixels: at most 256 levels, about 3.4 10-bit codes apart. CG8 must raise this, not only the container depth.",
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes("--write");
  const dir = mkdtempSync(join(tmpdir(), "cg0-baseline-"));
  try {
    const record = {
      schema: "still-shift-color-cg0-baseline-1",
      generator: "scripts/color/cg0-baseline.ts",
      platform: `${process.platform}-${process.arch}`,
      fixtures: Object.fromEntries(
        manifest.files.map((f) => [f.path, f.sha256]),
      ),
      probes: await probes(join(dir, "cache")),
      movingClip: await movingClip(join(dir, "cache")),
      videoPixelLint: await pixelLint(dir),
      exportImportRoundTrip: await renderThenImport(dir),
      tenBitExport: await tenBitExport(dir),
    };
    const text = await format(JSON.stringify(record), { parser: "json" });
    if (write) {
      writeFileSync(baselinePath, text);
      console.log("Wrote", baselinePath.replace(root, ""));
    } else {
      const stored = JSON.parse(readFileSync(baselinePath, "utf8"));
      const fresh = JSON.parse(text);
      const changed = Object.keys(fresh).filter(
        (key) => !isDeepStrictEqual(stored[key], fresh[key]),
      );
      if (changed.length) {
        console.error(`CG0 baseline differs in: ${changed.join(", ")}`);
        writeFileSync(
          join(root, "benchmarks/results/cg0-baseline-fresh.json"),
          text,
        );
        process.exitCode = 1;
      } else console.log("CG0 baseline unchanged");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
