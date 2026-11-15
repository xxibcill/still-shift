// ET3 proof checks: text legibility over the proof treatments and the tracked
// O6 fixture
// (docs/editorial-typography-improvement-plan.md#et3--text-over-video-legibility-checks).
//
//   pnpm exec tsx scripts/editorial-titles/et3-proof-checks.ts [--output summary.json]
//
// The proof treatments need the git-ignored local clip
// `benchmarks/results/cinematic-illustrated/review-v3/ci-09-layered-parallax.mp4`
// (SHA-256 d5bc5a52…7fdcd); in a worktree, link it from the checkout that has
// it. The pass-1 JSON exports are copied to
// `benchmarks/results/editorial-titles-et3/pass1/` with absolute asset paths,
// because JSON inputs take only regular files. Each check runs `comp lint` as a
// separate CLI process, timed, and the script prints one summary record of the
// legibility findings, the per-layer worst contrast and x-height, and the
// runtime with and without the legibility rules. It reports; the owner judges.
import { execFile } from "node:child_process";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const proof = join(root, "research/editorial-typography-proof");
const results = join(root, "benchmarks/results/editorial-titles-et3");
const { values } = parseArgs({ options: { output: { type: "string" } } });

type Report = {
  status: string;
  diagnostics: {
    code: string;
    severity: string;
    node?: string;
    frames: [number, number];
    measured: number;
    words?: { word: string; contrast: number }[];
  }[];
  textLegibility?: {
    layers: {
      layer: string;
      role: string;
      readingFrames: number;
      measuredFrames?: number;
      worst?: { contrast: number; frame: number; word: string };
      xHeight?: { reviewPixels: number; outputPixels: number };
    }[];
  };
};

async function lint(input: string, args: string[]) {
  const started = performance.now();
  const { stdout } = await run(
    process.execPath,
    [
      "--import",
      "tsx",
      join(root, "tools/still-shift-cli/src/cli.ts"),
      "comp",
      "lint",
      "--input",
      input,
      "--pixels",
      "true",
      ...args,
    ],
    { cwd: root, maxBuffer: 256 * 1024 * 1024 },
  ).catch((error: { stdout?: string; code?: number }) => {
    // Exit 1 with a report is a lint with errors (reading-time, strict codes).
    if (error.code === 1 && error.stdout?.startsWith("{"))
      return error as { stdout: string };
    throw error;
  });
  const seconds = Math.round((performance.now() - started) / 100) / 10;
  const report = JSON.parse(stdout) as Report;
  return {
    seconds,
    status: report.status,
    findings: report.diagnostics
      .filter((d) =>
        ["text-contrast", "x-height-floor", "platform-safe-zone"].includes(
          d.code,
        ),
      )
      .map((d) => ({
        code: d.code,
        severity: d.severity,
        node: d.node,
        frames: d.frames,
        measured: d.measured,
        ...(d.words
          ? { words: d.words.map((w) => `${w.word} ${w.contrast}`) }
          : {}),
      })),
    layers: report.textLegibility?.layers.map((layer) => ({
      layer: layer.layer,
      role: layer.role,
      readingFrames: layer.readingFrames,
      measuredFrames: layer.measuredFrames,
      worst: layer.worst,
      xHeightAt360: layer.xHeight?.reviewPixels,
    })),
  };
}

async function relocatedPass1(name: string) {
  const source = join(proof, "pass1", `${name}.composition.json`);
  const composition = JSON.parse(await readFile(source, "utf8")) as {
    assets: { path: string }[];
  };
  for (const asset of composition.assets)
    asset.path = await realpath(resolve(dirname(source), asset.path));
  await mkdir(join(results, "pass1"), { recursive: true });
  const target = join(results, "pass1", `${name}.composition.json`);
  await writeFile(target, JSON.stringify(composition));
  return target;
}

const legibility = ["--legibility", "true"];
const summary = {
  version: "et3-proof-checks-1",
  clip: await realpath(
    join(
      root,
      "benchmarks/results/cinematic-illustrated/review-v3/ci-09-layered-parallax.mp4",
    ),
  ),
  o6DarkBand: await lint(
    join(root, "benchmarks/fixtures/editorial-titles/o6-dark-band.ts"),
    legibility,
  ),
  t1Pass2: await lint(join(proof, "t1-editorial-stack.ts"), legibility),
  t2Pass2: await lint(join(proof, "t2-thai-condensed-poster.ts"), legibility),
  t2WithoutScrim: await lint(join(proof, "t2-without-scrim.ts"), legibility),
  t3Pass2: await lint(join(proof, "t3-minimal-centered.ts"), legibility),
  t3Pass2WithoutRules: await lint(join(proof, "t3-minimal-centered.ts"), []),
  t1Pass1: await lint(await relocatedPass1("t1-editorial-stack"), legibility),
  t3Pass1: await lint(await relocatedPass1("t3-minimal-centered"), legibility),
};
const text = JSON.stringify(summary, null, 2) + "\n";
if (values.output) await writeFile(values.output, text);
process.stdout.write(text);
