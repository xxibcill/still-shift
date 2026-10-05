import process from "node:process";
import { spawnSync } from "node:child_process";

// Audited audio-only entry points. A direct-import filter misses browser work
// launched through renderer libraries and child-process scripts.
const files = [
  "tests/integration/soundtrack.test.ts",
  "tests/integration/soundtrack-api.test.ts",
  "tests/integration/soundtrack-api-concurrency.test.ts",
  "tests/integration/passage-audio.test.ts",
];
const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", ...files, "--no-file-parallelism"],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
