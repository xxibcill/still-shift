// Deterministic, license-free synthetic vertical clip for the editorial title
// fixtures (ET0 in docs/editorial-typography-improvement-plan.md).
//
//   pnpm exec tsx scripts/editorial-titles/generate-fixture-clip.ts [--check]
//
// The picture is pure FFmpeg arithmetic: no camera, footage or font. Rows
// 0–899 are a flat bright field (8-bit RGB 232), rows 900–1919 a mid-tone
// sinusoidal texture that drifts sideways (128 ± 40), and a dark band
// (RGB 24, 220 px tall) moves down the frame at 285 px/s, centred on
// y = 285·t − 120. Text set in the bright field is crossed by the band on
// known frames (see `bandRows`), which is what the O6 contrast fixture uses.
//
// Without flags the script writes the clip and its descriptor. With --check
// it regenerates into a temporary file and fails unless the bytes, hash and
// probed descriptor are identical to the committed ones.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { isDeepStrictEqual } from "node:util";
import { probeCompositionVideo } from "../../packages/animation-engine/src/composition-media-probe.ts";

export const clip = {
  width: 1080,
  height: 1920,
  fps: 24,
  seconds: 4,
  brightRows: 900,
  bright: 232,
  band: { value: 24, halfHeight: 110, speed: 285, start: -120 },
  texture: { mean: 128, amplitude: 40 },
} as const;

/** Rows covered by the dark band on a frame (inclusive), before encoding. */
export function bandRows(frame: number): [number, number] {
  const centre = clip.band.speed * (frame / clip.fps) + clip.band.start;
  return [centre - clip.band.halfHeight, centre + clip.band.halfHeight];
}

const root = fileURLToPath(new URL("../../", import.meta.url));
const relative =
  "benchmarks/fixtures/editorial-titles/media/editorial-bands.mp4";
const descriptorPath = join(
  root,
  "benchmarks/fixtures/editorial-titles/media/editorial-bands.descriptor.json",
);

const expression = [
  `if(lt(abs(Y-(${clip.band.speed}*T${clip.band.start})),${clip.band.halfHeight}),${clip.band.value},`,
  `if(lt(Y,${clip.brightRows}),${clip.bright},`,
  `${clip.texture.mean}+${clip.texture.amplitude}*sin(X/18+2.4*T)*sin(Y/26)))`,
].join("");

function ffmpegVersion() {
  const first = execFileSync("ffmpeg", ["-version"], { encoding: "utf8" })
    .split("\n")[0]!
    .trim();
  if (!/^ffmpeg version 8\.0\.1\b/u.test(first))
    throw new Error(
      `The fixture clip is pinned to FFmpeg 8.0.1; found: ${first}`,
    );
  return first;
}

function generate(output: string) {
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-nostdin",
      "-f",
      "lavfi",
      "-i",
      `color=c=black:s=${clip.width}x${clip.height}:r=${clip.fps}:d=${clip.seconds},format=gbrp,geq=r='${expression}':g='${expression}':b='${expression}',scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=limited`,
      "-c:v",
      "libx264",
      "-threads",
      "1",
      "-preset",
      "medium",
      "-crf",
      "30",
      "-g",
      String(clip.fps * clip.seconds),
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
      output,
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
}

async function describe(path: string) {
  const probe = await probeCompositionVideo(path);
  return {
    schema: "still-shift-fixture-media-1",
    id: "editorial-bands",
    description:
      "Synthetic license-free vertical clip: bright field (rows 0-899, RGB 232), drifting mid-tone sinusoidal texture (rows 900-1919), dark band (RGB 24, 220 px) moving down at 285 px/s centred on y = 285t - 120.",
    license:
      "Generated arithmetic test pattern; no third-party content. Same terms as the repository.",
    generator: "scripts/editorial-titles/generate-fixture-clip.ts",
    ffmpeg: ffmpegVersion(),
    filter: expression,
    bytes: readFileSync(path).byteLength,
    asset: {
      id: "editorial-bands",
      type: "video",
      path: "editorial-bands.mp4",
      sha256: probe.sourceHash,
      width: clip.width,
      height: clip.height,
      frameCount: probe.frameCount,
      frameRate: probe.frameRate,
      color: probe.color,
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  ffmpegVersion();
  if (check) {
    const dir = mkdtempSync(join(tmpdir(), "editorial-bands-"));
    try {
      const fresh = join(dir, "editorial-bands.mp4");
      generate(fresh);
      const committed = readFileSync(join(root, relative));
      const regenerated = readFileSync(fresh);
      const hash = (bytes: Buffer) =>
        createHash("sha256").update(bytes).digest("hex");
      if (!committed.equals(regenerated))
        throw new Error(
          `Regenerated clip differs: committed ${hash(committed)}, regenerated ${hash(regenerated)}`,
        );
      const descriptor = await describe(fresh);
      if (
        !isDeepStrictEqual(
          descriptor,
          JSON.parse(readFileSync(descriptorPath, "utf8")),
        )
      )
        throw new Error(
          "Regenerated descriptor differs from the committed one",
        );
      console.log(`byte-identical: sha256 ${hash(regenerated)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } else {
    generate(join(root, relative));
    const descriptor = await describe(join(root, relative));
    writeFileSync(
      descriptorPath,
      await format(JSON.stringify(descriptor), { parser: "json" }),
    );
    console.log(JSON.stringify(descriptor, null, 2));
  }
}
