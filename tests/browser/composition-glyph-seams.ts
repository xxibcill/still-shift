// ET5b: serif glyph seams under per-glyph motion
// (docs/editorial-typography-improvement-plan.md#et5b--serif-seam-fix).
//
// Finding O11: in the proof's T1 headline ("Olive", Source Serif 4 Semibold,
// tracking −35), thin fragments of one glyph travel with its neighbour during
// the per-glyph entrance and stay through the tracking hold. The oracle here
// uses only static renders: when one glyph of "ve" is displaced, the frame
// must equal the "v" rendered alone plus the "e"'s own pixels (from the
// static "ve" minus the lone "v") moved by the same offset. Renders are PNG,
// so the comparison is lossless.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Composition } from "@still-shift/scene-contract";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { fonts } from "../../benchmarks/fixtures/editorial-titles/shared.ts";

const run = promisify(execFile);
const W = 640,
  H = 640,
  PAPER = [0xf4, 0xef, 0xe2] as const;

type Motion = {
  /** Displacement of the moving part; the first glyph stays at rest. */
  offset?: [number, number];
  opacity?: number;
  /** Characters that move, [start, end); default the second glyph. */
  span?: [number, number];
};

/** One serif line as in proof T1, with an optional pose for the second glyph. */
export function serifPair(
  text: string,
  motion?: Motion,
  /** Chromium drops optional ligatures under letter-spacing; T1 uses −35. */
  style: { ligatures?: 0 | 1; tracking?: number } = {},
): Composition {
  return {
    schemaVersion: "composition-1",
    id: "et5b-serif-pair",
    width: W,
    height: H,
    fps: 24,
    frameCount: 2,
    background: "#F4EFE2",
    assets: [fonts.serif],
    textStyles: {
      headline: {
        fontAsset: "serif",
        size: 250,
        tracking: style.tracking ?? -35,
        features: { kern: 1, liga: style.ligatures ?? 1 },
      },
    },
    layers: [
      {
        id: "headline",
        type: "text",
        text,
        fontSize: 250,
        color: "#4A5A23",
        style: "headline",
        anchor: "baseline",
        transform: { position: [60, 260] },
        ...(motion
          ? {
              spans: [
                {
                  id: "second",
                  start: motion.span?.[0] ?? 1,
                  end: motion.span?.[1] ?? 2,
                },
              ],
            }
          : {}),
      },
    ],
    ...(motion
      ? {
          textAnimators: [
            {
              node: "headline",
              unit: "glyph" as const,
              span: "second",
              start: 0,
              end: 2,
              stagger: 0,
              selector: { start: 0, end: 1 },
              from: {
                ...(motion.offset ? { offset: motion.offset } : {}),
                ...(motion.opacity !== undefined
                  ? { opacity: motion.opacity }
                  : {}),
              },
              layer: "action",
            },
          ],
        }
      : {}),
  } as Composition;
}

async function cli(args: string[]) {
  let stdout = "",
    stderr = "";
  const code = await runCli(args, {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

/** Render frame 0 losslessly and return its RGB bytes. */
async function frame0(directory: string, name: string, comp: Composition) {
  const input = join(directory, `${name}.composition.json`);
  await writeFile(input, JSON.stringify(comp));
  const pattern = join(directory, `${name}-%06d.png`);
  const result = await cli([
    "comp",
    "render",
    "--input",
    input,
    "--output",
    pattern,
    "--format",
    "png8",
  ]);
  assert.equal(result.code, 0, `${name}: ${result.stderr.slice(0, 2000)}`);
  const { stdout } = await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      join(directory, `${name}-000000.png`),
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(stdout.length, W * H * 3);
  return stdout;
}

const isPaper = (rgb: Buffer, i: number) =>
  rgb[i] === PAPER[0] && rgb[i + 1] === PAPER[1] && rgb[i + 2] === PAPER[2];

/**
 * Expected frame for "ve" with the "e" displaced by `offset`: the lone "v",
 * plus every pixel where the static "ve" differs from the lone "v" (the
 * "e"'s own ink), moved by `offset`. The glyphs do not touch in this pair.
 */
function expectedFrame(
  lone: Buffer,
  pair: Buffer,
  offset: [number, number],
): Buffer {
  const out = Buffer.from(lone);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      if (
        pair[i] === lone[i] &&
        pair[i + 1] === lone[i + 1] &&
        pair[i + 2] === lone[i + 2]
      )
        continue;
      const tx = x + offset[0],
        ty = y + offset[1];
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const j = (ty * W + tx) * 3;
      out[j] = pair[i]!;
      out[j + 1] = pair[i + 1]!;
      out[j + 2] = pair[i + 2]!;
    }
  return out;
}

/** Pixels whose largest channel difference exceeds `tolerance`. */
function differing(a: Buffer, b: Buffer, tolerance = 24) {
  let count = 0;
  for (let i = 0; i < a.length; i += 3)
    if (
      Math.max(
        Math.abs(a[i]! - b[i]!),
        Math.abs(a[i + 1]! - b[i + 1]!),
        Math.abs(a[i + 2]! - b[i + 2]!),
      ) > tolerance
    )
      count++;
  return count;
}

export async function verifyGlyphSeams() {
  const directory = await mkdtemp(join(tmpdir(), "et5b-seams-"));
  try {
    const lone = await frame0(directory, "v", serifPair("v"));
    const pair = await frame0(directory, "ve", serifPair("ve"));
    let pairInk = 0;
    for (let i = 0; i < pair.length; i += 3) if (!isPaper(pair, i)) pairInk++;
    assert.ok(pairInk > 10_000, "the static pair paints both glyphs");

    // Rest: a span and a zero-offset animator change nothing.
    const rest = await frame0(
      directory,
      "ve-rest",
      serifPair("ve", { offset: [0, 0] }),
    );
    assert.equal(
      differing(rest, pair, 0),
      0,
      "ET5b: settled glyphs are pixel-identical to the static draw",
    );

    // The "e" drops by 300 px: the "v" keeps all its ink, nothing of the "v"
    // travels with the "e".
    const offset: [number, number] = [0, 300];
    const moved = await frame0(
      directory,
      "ve-moved",
      serifPair("ve", { offset }),
    );
    const displaced = differing(moved, expectedFrame(lone, pair, offset));
    // A transparent "e" leaves the "v" whole.
    const hidden = await frame0(
      directory,
      "ve-hidden",
      serifPair("ve", { opacity: 0 }),
    );
    const transparent = differing(hidden, lone);
    // Horizontal separation, as during the T1 tracking hold.
    const spread: [number, number] = [40, 0];
    const tracked = await frame0(
      directory,
      "ve-spread",
      serifPair("ve", { offset: spread }),
    );
    const separated = differing(tracked, expectedFrame(lone, pair, spread));
    // The other neighbours of the T1 headline "Olive" whose serifs overhang.
    const neighbours: Record<string, number> = {};
    for (const text of ["Ol", "li", "iv"]) {
      const first = await frame0(directory, text[0]!, serifPair(text[0]!));
      const still = await frame0(directory, text, serifPair(text));
      const drop = await frame0(
        directory,
        `${text}-moved`,
        serifPair(text, { offset }),
      );
      neighbours[text] = differing(drop, expectedFrame(first, still, offset));
    }
    // A ligature inside a unit that moves as one stays a ligature: the word
    // "fi" drops as one segment, shaped like the static line.
    const loose = { tracking: 0 } as const;
    const ligated = await frame0(
      directory,
      "lig-fi",
      serifPair("fi", undefined, loose),
    );
    const unligated = await frame0(
      directory,
      "lig-fi-no-liga",
      serifPair("fi", undefined, { ...loose, ligatures: 0 }),
    );
    assert.ok(
      differing(ligated, unligated) > 0,
      "the serif face forms an fi ligature with liga on",
    );
    const word = await frame0(
      directory,
      "lig-o",
      serifPair("o", undefined, loose),
    );
    const line = await frame0(
      directory,
      "lig-o-fi",
      serifPair("o fi", undefined, loose),
    );
    const dropped = await frame0(
      directory,
      "lig-o-fi-moved",
      serifPair("o fi", { offset, span: [2, 4] }, loose),
    );
    const ligature = differing(dropped, expectedFrame(word, line, offset));
    return { displaced, transparent, separated, neighbours, ligature };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function assertNoGlyphSeams() {
  const result = await verifyGlyphSeams();
  assert.deepEqual(
    result,
    {
      displaced: 0,
      transparent: 0,
      separated: 0,
      neighbours: { Ol: 0, li: 0, iv: 0 },
      ligature: 0,
    },
    `ET5b: per-glyph poses must not carry a neighbour's ink (pixels differing from the static oracle: ${JSON.stringify(result)})`,
  );
  return result;
}
