import process from "node:process";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
const base = resolve(
  process.env.STILL_SHIFT_SOUNDTRACK_RESULTS ??
    "benchmarks/results/composition-ce16/integration",
);
const verifyOnly = process.argv.includes("--verify-only");
const project = "benchmarks/fixtures/composition/ce16/project.json";
const measurements = [];
function cli(args) {
  const started = performance.now();
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "tools/still-shift-cli/src/cli.ts",
      "soundtrack",
      ...args,
    ],
    { encoding: "utf8", maxBuffer: 8_000_000 },
  );
  measurements.push({
    command: [
      process.execPath,
      "--import",
      "tsx",
      "tools/still-shift-cli/src/cli.ts",
      "soundtrack",
      ...args,
    ],
    equivalentCommand: "pnpm still-shift soundtrack " + args.join(" "),
    exitCode: result.status,
    wallSeconds: (performance.now() - started) / 1000,
  });
  writeFileSync(
    join(base, "command-" + measurements.length + ".stdout.json"),
    result.stdout ?? "",
  );
  writeFileSync(
    join(base, "command-" + measurements.length + ".stderr.log"),
    result.stderr ?? "",
  );
  if (result.status !== 0)
    throw new Error("Lifecycle failed: " + args[0] + " " + result.stderr);
  return JSON.parse(result.stdout).result;
}
if (!verifyOnly) {
  if (existsSync(base))
    throw new Error(
      "Use a fresh STILL_SHIFT_SOUNDTRACK_RESULTS path; existing evidence is protected",
    );
  mkdirSync(base, { recursive: true });
  cli(["validate", "--project", project]);
  cli([
    "render",
    "--project",
    project,
    "--output-dir",
    join(base, "initial"),
    "--stems",
  ]);
  cli([
    "render",
    "--project",
    project,
    "--output-dir",
    join(base, "reloaded"),
    "--stems",
  ]);
  copyFileSync(project, join(base, "edited-project.json"));
  cli([
    "edit",
    "--project",
    join(base, "edited-project.json"),
    "--revision",
    "0",
    "--operations",
    "benchmarks/fixtures/composition/ce16/edits.json",
  ]);
  cli([
    "render",
    "--project",
    join(base, "edited-project.json"),
    "--output-dir",
    join(base, "edited"),
    "--stems",
  ]);
  cli([
    "package",
    "--project",
    join(base, "edited-project.json"),
    "--output-dir",
    join(base, "portable"),
  ]);
  cli([
    "render",
    "--project",
    join(base, "portable/project.json"),
    "--output-dir",
    join(base, "relocated"),
    "--stems",
  ]);
  writeFileSync(
    join(base, "commands.json"),
    JSON.stringify(measurements, null, 2) + "\n",
  );
}
const python =
  process.env.STILL_SHIFT_SOUNDTRACK_PYTHON ??
  "benchmarks/results/composition-ce16/runtime/bin/python";
const checked = spawnSync(
  python,
  ["scripts/soundtrack/verify-integration.py", "--results", base],
  { stdio: "inherit" },
);
process.exitCode = checked.status ?? 1;
