import console from "node:console";
import process from "node:process";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const runtime = resolve(
  process.env.STILL_SHIFT_SOUNDTRACK_ENV ??
    "benchmarks/results/composition-ce16/runtime",
);
for (const args of [
  ...(!existsSync(runtime + "/bin/python")
    ? [["venv", "--python", "3.12.11", runtime]]
    : []),
  [
    "pip",
    "install",
    "--python",
    runtime + "/bin/python",
    "--require-hashes",
    "-r",
    "scripts/soundtrack/requirements.txt",
  ],
]) {
  const result = spawnSync("uv", args, { stdio: "inherit" });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message ?? "Soundtrack setup failed");
    process.exit(result.status ?? 1);
  }
}
console.log(
  JSON.stringify({
    ok: true,
    python: runtime + "/bin/python",
    optIn: "Set STILL_SHIFT_SOUNDTRACK_PYTHON to use a custom runtime path",
  }),
);
