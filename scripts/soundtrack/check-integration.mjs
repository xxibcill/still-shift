import process from "node:process";
// CE16's command-only tier: exclude suites that directly drive a browser.
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const files = readdirSync("tests/integration").filter(
  (name) =>
    name.endsWith(".test.ts") &&
    !/from ["']playwright["']/.test(
      readFileSync("tests/integration/" + name, "utf8"),
    ),
);
const result = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
    ...files.map((file) => "tests/integration/" + file),
    "--maxWorkers=2",
    "--no-file-parallelism",
  ],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
