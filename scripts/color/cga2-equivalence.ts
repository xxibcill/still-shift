/**
 * CGA2 A0: the equivalence gate between solver 1 (CGA's 8-bit `color.*`
 * effects) and solver 2 (the same solver on the grade engine), on the
 * synthetic fixtures and, optionally, a folder of locally supplied clips
 * (never committed).
 *
 *   pnpm color:cga2-equivalence [--clips <folder>] [--look <look.json>] \
 *     [--output dist/cga2]
 *
 * For every clip: the adaptive correction (auto) and, with --look, the look
 * at the default 60% (look). Both engines solve the same sampled frames
 * (12 per clip, the media path's pixels); their exact Canvas predictions are
 * compared at full resolution against the bound stated in A0; a row outside
 * the bound also records diagnostics of its cause. Writes <output>/equivalence.json. Software measurements only.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  AUTO_COLOR_LOOK_STRENGTH,
  CGA2_EQUIVALENCE_BOUND,
  applyColorEffects,
  colorDifference,
  engineEffects,
  colorLookEffect,
  colorSampleOrdinals,
  colorSolverFrames,
  openColorClip,
  parseColorLook,
  readColorFrames,
  solverEquivalence,
  type ColorCorrectionEffect,
  type ColorDifference,
  type ColorFrameSet,
  type ColorLook,
} from "@still-shift/animation-engine";
import {
  CGA_FLAT_COMBINED,
  CGA_SYNTHETIC,
  cgaDegradeAll,
  cgaReferenceFrames,
  type CgaDegradation,
} from "../../benchmarks/fixtures/color/cga-synthetic.ts";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i]!.replace(/^--/, ""), process.argv[i + 1]!);
const output = resolve(args.get("output") ?? "dist/cga2");
const cacheDirectory = join(output, "media-cache");
await mkdir(output, { recursive: true });
const log = (message: string) =>
  console.error(`[${new Date().toISOString().slice(11, 19)}] ${message}`);

type Row = {
  clip: string;
  mode: "auto" | "look" | "look+auto";
  withinBound: boolean;
  difference: ReturnType<typeof solverEquivalence>["difference"];
  legacy: ColorCorrectionEffect[];
  grade: ColorCorrectionEffect[];
  /**
   * Rows outside the bound only: whether the mapping or the pipeline makes
   * the difference. `translatedSolver1` renders solver 1's own corrections
   * through the grade engine (same parameters, so any difference is the
   * mapping or headroom); `lookClippedFirst` applies the look in 8 bits, as
   * CGA does, before solver 2's grade run (the look's headroom removed).
   */
  diagnostics?: {
    translatedSolver1: ColorDifference;
    lookClippedFirst?: ColorDifference;
  };
};
const rows: Row[] = [];

function compare(
  clip: string,
  frames: ColorFrameSet,
  look: ColorLook | undefined,
) {
  const solve = colorSolverFrames(
    frames.frames.map((frame) => ({ ...frame, width: frames.width })),
  );
  const prefix: ColorCorrectionEffect[] = look
    ? [colorLookEffect(look, AUTO_COLOR_LOOK_STRENGTH)]
    : [];
  const modes: [Row["mode"], boolean][] = look
    ? [
        ["look", false],
        ["look+auto", true],
      ]
    : [["auto", true]];
  for (const [mode, adaptive] of modes) {
    const result = solverEquivalence(solve, frames, {
      prefix,
      ...(adaptive
        ? look?.targets
          ? { targets: look.targets }
          : {}
        : {
            exposure: false,
            contrast: false,
            saturation: false,
            whiteBalance: false,
          }),
    });
    const render = (effects: readonly ColorCorrectionEffect[]) =>
      frames.frames.map((frame) => applyColorEffects(effects, frame.rgba));
    let diagnostics: Row["diagnostics"];
    if (!result.withinBound) {
      const legacyRender = render([...prefix, ...result.legacy.effects]);
      const against = (effects: readonly ColorCorrectionEffect[]) =>
        colorDifference(legacyRender, render(effects), frames.width);
      diagnostics = {
        translatedSolver1: against(
          engineEffects("grade", [...prefix, ...result.legacy.effects]),
        ),
        ...(prefix.length
          ? { lookClippedFirst: against([...prefix, ...result.grade.effects]) }
          : {}),
      };
    }
    rows.push({
      clip,
      mode,
      withinBound: result.withinBound,
      difference: result.difference,
      legacy: result.legacy.effects,
      grade: result.grade.effects,
      ...(diagnostics ? { diagnostics } : {}),
    });
    log(
      `${clip} ${mode}: blockRms ${result.difference.blockRms} p99 ${result.difference.p99} max ${result.difference.max}${result.withinBound ? "" : ` OUTSIDE; translated solver 1 p99 ${diagnostics!.translatedSolver1.p99}${diagnostics!.lookClippedFirst ? `, look clipped first p99 ${diagnostics!.lookClippedFirst.p99}` : ""}`}`,
    );
  }
}

// Synthetic fixtures: the reference, each known degradation and a combined one.
const reference = cgaReferenceFrames();
const synthetic: [string, readonly CgaDegradation[]][] = [
  ["balanced", []],
  ["exposure-0.6", [{ kind: "exposure", stops: -0.6 }]],
  ["exposure+0.5", [{ kind: "exposure", stops: 0.5 }]],
  ["contrast", [{ kind: "contrast", black: 0.1, white: 0.88 }]],
  ["saturation-0.4", [{ kind: "saturation", scale: 0.4 }]],
  ["white-balance", [{ kind: "white-balance", temperature: 30, tint: -12 }]],
  [
    "white-balance-limit",
    [{ kind: "white-balance", temperature: 40, tint: 10 }],
  ],
  ["flat-combined", CGA_FLAT_COMBINED],
];
for (const [name, changes] of synthetic) {
  const frames = cgaDegradeAll(reference, changes);
  compare(
    `synthetic/${name}`,
    {
      width: CGA_SYNTHETIC.width,
      frames: frames.map((rgba, ordinal) => ({ ordinal, rgba })),
    },
    undefined,
  );
}

const look = args.get("look")
  ? parseColorLook(JSON.parse(await readFile(args.get("look")!, "utf8")))
  : undefined;
const folder = args.get("clips");
if (folder)
  for (const name of (await readdir(folder))
    .filter((file) => /\.(mp4|mov|m4v|mkv)$/i.test(file))
    .sort()) {
    const clip = await openColorClip(join(folder, name), { cacheDirectory });
    const ordinals = colorSampleOrdinals(clip.probe.frameCount, 12);
    const frames = await readColorFrames(clip, ordinals, { cacheDirectory });
    const set = { width: clip.probe.width, frames };
    compare(name, set, undefined);
    if (look) compare(name, set, look);
  }

await writeFile(
  join(output, "equivalence.json"),
  JSON.stringify(
    {
      schema: "still-shift.cga2-equivalence-1",
      bound: CGA2_EQUIVALENCE_BOUND,
      summary: {
        rows: rows.length,
        withinBound: rows.filter((row) => row.withinBound).length,
        worstBlockRms: Math.max(...rows.map((row) => row.difference.blockRms)),
        worstP99: Math.max(...rows.map((row) => row.difference.p99)),
      },
      rows,
    },
    null,
    2,
  ) + "\n",
);
log(
  `${rows.filter((row) => row.withinBound).length}/${rows.length} rows within the bound; wrote ${join(output, "equivalence.json")}`,
);
