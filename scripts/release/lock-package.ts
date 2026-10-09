import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { workspaceLayout } from "./package-layout.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const execute = promisify(execFile);
const directory = await mkdtemp(
  resolve(tmpdir(), "still-shift-dependency-lock-"),
);
try {
  const metadata = JSON.parse(
    await readFile(resolve(root, "npm-release.json"), "utf8"),
  );
  const manifest = {
    ...metadata,
    dependencies: workspaceLayout(root).dependencies,
    bin: { "still-shift": "bin/still-shift.js" },
  };
  await writeFile(resolve(directory, "package.json"), JSON.stringify(manifest));
  for (const args of [
    [
      "install",
      "--package-lock-only",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ],
    ["shrinkwrap"],
  ])
    await execute(
      "npm",
      ["--cache", resolve(tmpdir(), "still-shift-npm-cache"), ...args],
      { cwd: directory },
    );
  await cp(
    resolve(directory, "npm-shrinkwrap.json"),
    resolve(root, "scripts/release/npm-shrinkwrap.json"),
  );
  console.log(
    "Updated the npm release dependency lock. Rebuild and rerun release verification.",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
