import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const results = "benchmarks/results/composition-ce16";
const python =
  process.env.STILL_SHIFT_SOUNDTRACK_PYTHON ?? `${results}/runtime/bin/python`;
const flags = process.argv.slice(2).filter((argument) => argument !== "--");
if (!existsSync(python)) {
  throw new Error(
    "Create the isolated CE16 runtime using scripts/soundtrack/requirements.txt, or set STILL_SHIFT_SOUNDTRACK_PYTHON.",
  );
}
function run(script, args) {
  const result = spawnSync(python, [resolve(script), ...args], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const stages = [
  ["initial", "backend-proof.json"],
  ["reloaded", "backend-proof.json"],
  ["edited", "backend-proof.edited.json"],
];
if (!flags.includes("--verify-only")) {
  const existing = stages.find(([stage]) => existsSync(`${results}/${stage}`));
  if (existing) {
    throw new Error(
      `Proof output ${existing[0]} already exists. Verify with --verify-only, or preserve the old results before starting a fresh trial.`,
    );
  }
  for (const [stage, project] of stages) {
    run("scripts/soundtrack/proof-worker.py", [
      "--project",
      `benchmarks/fixtures/composition/ce16/${project}`,
      "--output-dir",
      `${results}/${stage}`,
    ]);
  }
}
run("scripts/soundtrack/verify-proof.py", ["--results", results]);
