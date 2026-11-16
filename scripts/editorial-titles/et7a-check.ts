// ET7a candidate check loop
// (docs/editorial-typography-improvement-plan.md#et7a--generator-pilot-and-aesthetic-proof-absorbs-et8).
//
//   pnpm exec tsx scripts/editorial-titles/et7a-check.ts --input <candidate.ts> [--lint false]
//   pnpm exec tsx scripts/editorial-titles/et7a-check.ts --input <candidate.ts> --lint-only true
//   pnpm exec tsx scripts/editorial-titles/et7a-check.ts --overview <a|b>
//
// For one candidate program it runs, as separate CLI processes:
//   1. `comp validate --font-coverage strict` (stops on errors);
//   2. `comp render --font-coverage strict` into a fresh iteration folder;
//   3. `comp lint --pixels true --legibility true --font-coverage strict`;
//   4. entrance, hold and exit contact sheets from the render, at native size
//      and at phone scale (360×640 per frame), taken at the candidate's
//      `build`, `hold` and `exit` markers;
// and writes `summary.json` beside them. Iterations are numbered r01, r02, …
// under benchmarks/results/editorial-titles-et7a/<candidate>/, so every
// render-and-fix pass is kept. The pilot's clips are local-only third-party
// reels: everything this script writes stays in the git-ignored
// benchmarks/results tree and must never be committed.
//
// `--lint-only true` lints the latest iteration again without rendering, for
// a change to the saved reading policy (waivers) only; it refuses any other
// change to the composition.
//
// `--overview a` tiles the latest hold frame of every candidate for reel A
// into one phone-scale sheet for side-by-side review.
//
// The script reports; it does not judge. Owner acceptance is recorded
// separately, in the owner's words.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const results = join(root, "benchmarks/results/editorial-titles-et7a");
const cli = join(root, "tools/still-shift-cli/src/cli.ts");
const { values } = parseArgs({
  options: {
    input: { type: "string" },
    lint: { type: "string", default: "true" },
    "lint-only": { type: "string", default: "false" },
    overview: { type: "string" },
  },
});

type Diagnostic = {
  code: string;
  severity: string;
  node?: string;
  path?: string;
  message?: string;
  frames?: [number, number];
  measured?: number;
  words?: { word: string; contrast: number; frame: number }[];
};
type LegibilityLayer = {
  layer: string;
  role: string;
  readingFrames: number;
  measuredFrames?: number;
  worst?: { contrast: number; frame: number; word: string };
  xHeight?: { reviewPixels: number };
  waiver?: unknown;
};

async function still(args: string[]) {
  const started = performance.now();
  const outcome = await run(
    process.execPath,
    ["--import", "tsx", cli, "comp", ...args],
    { cwd: root, maxBuffer: 512 * 1024 * 1024 },
  ).catch((error: { stdout?: string; stderr?: string; code?: number }) => ({
    stdout: error.stdout ?? "",
    stderr: error.stderr ?? "",
    code: error.code ?? 1,
  }));
  const seconds = Math.round((performance.now() - started) / 100) / 10;
  const text = outcome.stdout.trim() || outcome.stderr.trim();
  let report: Record<string, unknown> = {};
  try {
    report = JSON.parse(text) as Record<string, unknown>;
  } catch {
    report = { status: "unparsed", raw: text.slice(0, 4000) };
  }
  return { seconds, code: "code" in outcome ? outcome.code : 0, report };
}

async function ffmpeg(args: string[]) {
  await run("ffmpeg", ["-v", "error", "-y", ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function nextIteration(dir: string) {
  await mkdir(dir, { recursive: true });
  const taken = (await readdir(dir))
    .map((name) => /^r(\d+)$/.exec(name)?.[1])
    .filter(Boolean)
    .map(Number);
  const next = (taken.length ? Math.max(...taken) : 0) + 1;
  return `r${String(next).padStart(2, "0")}`;
}

/** Four frames spread over [start, end), always including both ends' insides. */
function spread(start: number, end: number, count = 4) {
  const last = Math.max(start, end - 1);
  return Array.from({ length: count }, (_, i) =>
    Math.round(start + ((last - start) * i) / (count - 1)),
  );
}

async function sheet(
  video: string,
  frames: number[],
  out: string,
  scale?: [number, number],
) {
  const select = frames.map((n) => `eq(n\\,${n})`).join("+");
  const resize = scale ? `,scale=${scale[0]}:${scale[1]}` : "";
  await ffmpeg([
    "-i",
    video,
    "-vf",
    `select='${select}'${resize},tile=${frames.length}x1`,
    "-frames:v",
    "1",
    "-fps_mode",
    "passthrough",
    out,
  ]);
}

async function check(input: string) {
  const program = resolve(input);
  const name = basename(program).replace(/\.ts$/, "");
  const dir = join(results, name);
  const iteration = await nextIteration(dir);
  const out = join(dir, iteration);
  await mkdir(out, { recursive: true });
  const strict = ["--font-coverage", "strict"];

  const validate = await still(["validate", "--input", program, ...strict]);
  await writeFile(
    join(out, "validate.json"),
    JSON.stringify(validate.report, null, 2),
  );
  const coverage = validate.report.fontCoverage as
    | { covered?: boolean; profile?: string }
    | undefined;
  const summary: Record<string, unknown> = {
    version: "et7a-check-1",
    candidate: name,
    iteration,
    node: process.version,
    source: input,
    sourceSha256: createHash("sha256")
      .update(await readFile(program))
      .digest("hex"),
    validate: {
      status: validate.report.status,
      seconds: validate.seconds,
      fontCoverage: coverage
        ? { profile: coverage.profile, covered: coverage.covered }
        : undefined,
      errors: (validate.report.diagnostics as Diagnostic[] | undefined)
        ?.filter((d) => d.severity === "error")
        .map((d) => `${d.code} ${d.path ?? ""} ${d.message ?? ""}`.trim()),
    },
  };
  if (validate.report.status !== "valid") {
    await writeFile(
      join(out, "summary.json"),
      JSON.stringify(summary, null, 2),
    );
    return summary;
  }

  const exported = await still([
    "export-json",
    "--input",
    program,
    "--output",
    join(out, "composition.json"),
  ]);
  const composition = JSON.parse(
    await readFile(join(out, "composition.json"), "utf8"),
  ) as {
    frameCount: number;
    markers?: { id: string; frame: number; duration?: number }[];
  };
  void exported;
  const marker = (id: string) => composition.markers?.find((m) => m.id === id);

  const video = join(out, `${name}-${iteration}.mp4`);
  const render = await still([
    "render",
    "--input",
    program,
    "--output",
    video,
    ...strict,
  ]);
  summary.render = {
    status: render.report.status ?? (render.code === 0 ? "ok" : "failed"),
    seconds: render.seconds,
    exit: render.code,
    sha256:
      render.code === 0
        ? createHash("sha256")
            .update(await readFile(video))
            .digest("hex")
        : undefined,
  };
  if (render.code !== 0) {
    await writeFile(join(out, "render.json"), JSON.stringify(render.report));
    await writeFile(
      join(out, "summary.json"),
      JSON.stringify(summary, null, 2),
    );
    return summary;
  }

  // Contact sheets: entrance across `build`, hold across `hold`, exit across
  // `exit` (falling back to the composition's thirds without markers).
  const third = Math.floor(composition.frameCount / 3);
  const span = (id: string, start: number, end: number) => {
    const m = marker(id);
    return m ? [m.frame, m.frame + (m.duration ?? 1)] : [start, end];
  };
  const phases = {
    entrance: span("build", 0, third),
    hold: span("hold", third, 2 * third),
    exit: span("exit", 2 * third, composition.frameCount),
  };
  const frames: Record<string, number[]> = {};
  for (const [phase, [start, end]] of Object.entries(phases)) {
    frames[phase] = spread(start!, Math.min(end!, composition.frameCount));
    await sheet(video, frames[phase]!, join(out, `${phase}-native.png`));
    await sheet(
      video,
      frames[phase]!,
      join(out, `${phase}-phone.png`),
      [360, 640],
    );
  }
  await ffmpeg([
    "-i",
    join(out, "entrance-phone.png"),
    "-i",
    join(out, "hold-phone.png"),
    "-i",
    join(out, "exit-phone.png"),
    "-filter_complex",
    "vstack=inputs=3",
    join(out, "phone-sheet.png"),
  ]);
  summary.sheets = { frames, dir: out };

  if (values.lint !== "false") await lintInto(program, out, summary);
  await writeFile(join(out, "summary.json"), JSON.stringify(summary, null, 2));
  return summary;
}

/** Pixel and legibility lint of `program`, recorded in `summary.lint`. */
async function lintInto(
  program: string,
  out: string,
  summary: Record<string, unknown>,
) {
  const strict = ["--font-coverage", "strict"];
  const lint = await still([
    "lint",
    "--input",
    program,
    "--pixels",
    "true",
    "--legibility",
    "true",
    ...strict,
  ]);
  await writeFile(join(out, "lint.json"), JSON.stringify(lint.report));
  const diagnostics = (lint.report.diagnostics as Diagnostic[]) ?? [];
  const legibility = lint.report.textLegibility as
    | { layers?: LegibilityLayer[]; limitations?: unknown }
    | undefined;
  summary.lint = {
    status: lint.report.status,
    seconds: lint.seconds,
    errors: diagnostics
      .filter((d) => d.severity === "error")
      .map((d) => ({
        code: d.code,
        node: d.node,
        path: d.path,
        frames: d.frames,
        measured: d.measured,
        message: d.message?.slice(0, 240),
      })),
    warnings: Object.entries(
      diagnostics
        .filter((d) => d.severity !== "error")
        .reduce<Record<string, number>>((counts, d) => {
          const key = `${d.code}${d.node ? ` ${d.node}` : ""}`;
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        }, {}),
    ).map(([key, count]) => `${key} ×${count}`),
    legibilityFindings: diagnostics
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
    layers: legibility?.layers?.map((layer) => ({
      layer: layer.layer,
      role: layer.role,
      readingFrames: layer.readingFrames,
      measuredFrames: layer.measuredFrames,
      worst: layer.worst,
      xHeightAt360: layer.xHeight?.reviewPixels,
      waived: layer.waiver !== undefined,
    })),
    limitations: legibility?.limitations,
  };
}

/**
 * The composition as rendered: without its saved reading policy (the part a
 * lint-only rerun may change) and without `metadata.builder`, which records
 * the source file paths, not anything drawn. Keys are sorted so key order
 * cannot differ.
 */
function renderedPart(composition: Record<string, unknown>) {
  const copy = structuredClone(composition);
  const metadata = copy.metadata as Record<string, unknown> | undefined;
  if (metadata) {
    delete metadata.readingPolicy;
    delete metadata.builder;
    if (Object.keys(metadata).length === 0) delete copy.metadata;
  }
  const sorted = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sorted)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([key, entry]) => [key, sorted(entry)]),
          )
        : value;
  return JSON.stringify(sorted(copy));
}

/**
 * Lint the latest iteration again without rendering, for a change that does
 * not alter pixels (a waiver). Refuses when the exported composition differs
 * from the iteration's in anything but `metadata.readingPolicy`, so the
 * iteration's render and sheets always match the composition that is linted.
 */
async function lintOnly(input: string) {
  const program = resolve(input);
  const name = basename(program).replace(/\.ts$/, "");
  const dir = join(results, name);
  const latest = (await readdir(dir))
    .filter((n) => /^r\d+$/.test(n))
    .sort()
    .at(-1);
  if (!latest) throw new Error(`no iteration for ${name}; run a full check`);
  const out = join(dir, latest);
  const summary = JSON.parse(
    await readFile(join(out, "summary.json"), "utf8"),
  ) as Record<string, unknown>;
  if (!summary.sheets)
    throw new Error(`${name} ${latest} has no render; run a full check`);
  const sha = createHash("sha256")
    .update(await readFile(program))
    .digest("hex");
  if (sha !== summary.sourceSha256) {
    const current = join(out, "lint-only-composition.json");
    await rm(current, { force: true }); // export-json never overwrites
    const exported = await still([
      "export-json",
      "--input",
      program,
      "--output",
      current,
    ]);
    if (exported.code !== 0)
      throw new Error(
        `export-json failed for ${name}: ${JSON.stringify(exported.report)}`,
      );
    const read = async (path: string) =>
      JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    if (
      renderedPart(await read(current)) !==
      renderedPart(await read(join(out, "composition.json")))
    )
      throw new Error(
        `${name} changed beyond metadata.readingPolicy since ${latest}; ` +
          "run a full check so the render matches what is linted",
      );
    summary.lintSource = {
      sha256: sha,
      note: "lint-only rerun; only metadata.readingPolicy changed, render unchanged",
    };
  }
  await lintInto(program, out, summary);
  await writeFile(join(out, "summary.json"), JSON.stringify(summary, null, 2));
  return summary;
}

async function overview(reel: string) {
  const names = (await readdir(results))
    .filter((name) => name.startsWith(reel) && /^[ab]\d\d-/.test(name))
    .sort();
  const holds: string[] = [];
  for (const name of names) {
    const iterations = (await readdir(join(results, name)))
      .filter((n) => /^r\d+$/.test(n))
      .sort();
    for (const iteration of iterations.reverse()) {
      const summary = JSON.parse(
        await readFile(join(results, name, iteration, "summary.json"), "utf8"),
      ) as { sheets?: { frames: Record<string, number[]> } };
      if (!summary.sheets) continue;
      const frame = summary.sheets.frames.hold![1]!;
      const png = join(results, name, iteration, "overview-hold.png");
      await ffmpeg([
        "-i",
        join(results, name, iteration, `${name}-${iteration}.mp4`),
        "-vf",
        `select='eq(n\\,${frame})',scale=360:640`,
        "-frames:v",
        "1",
        "-fps_mode",
        "passthrough",
        png,
      ]);
      holds.push(png);
      break;
    }
  }
  if (!holds.length) throw new Error(`no rendered candidates for reel ${reel}`);
  const out = join(results, `reel-${reel}-overview.png`);
  const inputs = holds.flatMap((png) => ["-i", png]);
  const columns = Math.min(4, holds.length);
  const layout = holds
    .map((_, i) => `${(i % columns) * 360}_${Math.floor(i / columns) * 640}`)
    .join("|");
  await ffmpeg([
    ...inputs,
    "-filter_complex",
    holds.length === 1
      ? "null"
      : `xstack=inputs=${holds.length}:layout=${layout}:fill=black`,
    out,
  ]);
  return { overview: out, candidates: names };
}

const output = values.overview
  ? await overview(values.overview)
  : values.input && values["lint-only"] === "true"
    ? await lintOnly(values.input)
    : values.input
      ? await check(values.input)
      : (() => {
          throw new Error("pass --input <candidate.ts> or --overview <a|b>");
        })();
process.stdout.write(JSON.stringify(output, null, 2) + "\n");
