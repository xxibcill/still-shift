// EC effect render cost: timings and render hashes
// (docs/editorial-typography-improvement-plan.md#ec--effect-render-cost-shadow-halo).
//
//   pnpm exec tsx scripts/editorial-titles/ec-effect-cost.ts [--variants none,halo,...]
//     [--frames 48] [--lint true|false] [--legibility true|false]
//     [--candidates <a03.ts,...>] [--output <summary.json>]
//
// For each variant of benchmarks/fixtures/editorial-titles/ec-effect-cost.ts
// (and each optional ET7a candidate program) it runs, as separate timed CLI
// processes: `comp render --format png8` into a fresh folder under
// benchmarks/results/editorial-titles-ec/, hashing every PNG frame, then
// `comp lint --pixels true` (with `--legibility true` when asked). The
// per-frame SHA-256s prove a renderer change pixel-identical; the timings are
// the before/after record. Candidates use the local-only reels: their renders
// stay in the git-ignored results tree and only hashes and timings are kept.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = join(root, "tools/still-shift-cli/src/cli.ts");
const fixture = join(
  root,
  "benchmarks/fixtures/editorial-titles/ec-effect-cost.ts",
);
const results = join(root, "benchmarks/results/editorial-titles-ec");
const { values } = parseArgs({
  options: {
    variants: { type: "string", default: "none,outline,halo,shadow,glow" },
    frames: { type: "string", default: "48" },
    lint: { type: "string", default: "true" },
    legibility: { type: "string", default: "false" },
    candidates: { type: "string", default: "" },
    tag: { type: "string", default: "run" },
    output: { type: "string" },
  },
});

async function timed(args: string[], env: NodeJS.ProcessEnv = {}) {
  const started = performance.now();
  const outcome = await run(
    process.execPath,
    ["--import", "tsx", cli, "comp", ...args],
    {
      cwd: root,
      env: { ...process.env, ...env },
      maxBuffer: 512 * 1024 * 1024,
    },
  ).catch((error: { stdout?: string; stderr?: string; code?: number }) => ({
    stdout: error.stdout ?? "",
    stderr: error.stderr ?? "",
    code: error.code ?? 1,
  }));
  const seconds = Math.round((performance.now() - started) / 100) / 10;
  const text = outcome.stdout.trim() || outcome.stderr.trim();
  let report: Record<string, unknown>;
  try {
    report = JSON.parse(text) as Record<string, unknown>;
  } catch {
    report = { status: "unparsed", raw: text.slice(0, 2000) };
  }
  return { seconds, code: "code" in outcome ? outcome.code : 0, report };
}

async function frameHashes(dir: string) {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".png")).sort();
  const hashes: string[] = [];
  for (const file of files)
    hashes.push(
      createHash("sha256")
        .update(await readFile(join(dir, file)))
        .digest("hex"),
    );
  const all = createHash("sha256").update(hashes.join("\n")).digest("hex");
  return { frames: hashes.length, sha256: all, perFrame: hashes };
}

async function measure(name: string, input: string, env: NodeJS.ProcessEnv) {
  const dir = join(results, values.tag!, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const output = join(dir, "frames");
  const render = await timed(
    [
      "render",
      "--input",
      input,
      "--output",
      join(output, "frame_%06d.png"),
      "--format",
      "png8",
    ],
    env,
  );
  let frames: Awaited<ReturnType<typeof frameHashes>> | undefined;
  try {
    frames = await frameHashes(output);
  } catch {
    frames = undefined;
  }
  const record: Record<string, unknown> = {
    name,
    render: {
      seconds: render.seconds,
      status: render.report.status,
      rendererVersion: render.report.rendererVersion,
      frames: frames?.frames,
      framesSha256: frames?.sha256,
    },
  };
  if (render.report.status !== "rendered")
    record.render = { ...(record.render as object), report: render.report };
  if (values.lint === "true") {
    const lint = await timed(
      [
        "lint",
        "--input",
        input,
        "--pixels",
        "true",
        ...(values.legibility === "true" ? ["--legibility", "true"] : []),
      ],
      env,
    );
    await writeFile(
      join(dir, "lint.json"),
      JSON.stringify(lint.report, null, 2) + "\n",
    );
    record.lint = {
      seconds: lint.seconds,
      status: lint.report.status,
      legibility: values.legibility === "true",
    };
  }
  await writeFile(
    join(dir, "summary.json"),
    JSON.stringify({ ...record, perFrame: frames?.perFrame }, null, 2) + "\n",
  );
  console.error(JSON.stringify(record));
  return record;
}

const records = [];
for (const variant of values.variants!.split(",").filter(Boolean))
  records.push(
    await measure(`fixture-${variant}`, fixture, {
      EC_VARIANT: variant,
      EC_FRAMES: values.frames!,
    }),
  );
for (const candidate of values.candidates!.split(",").filter(Boolean))
  records.push(
    await measure(basename(candidate, ".ts"), resolve(candidate), {}),
  );
const summary = { tag: values.tag, frames: Number(values.frames), records };
if (values.output)
  await writeFile(values.output, JSON.stringify(summary, null, 2) + "\n");
else console.log(JSON.stringify(summary, null, 2));
