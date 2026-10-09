import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));

export async function packNpmPackage(project = root): Promise<string> {
  const directory = resolve(project, "dist/releases");
  await mkdir(directory, { recursive: true });
  const { stdout } = await execute(
    "npm",
    [
      "--cache",
      resolve(tmpdir(), "still-shift-npm-cache"),
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      directory,
    ],
    { cwd: resolve(project, "dist/npm"), maxBuffer: 16 * 1024 * 1024 },
  );
  const results = JSON.parse(stdout) as {
    filename: string;
    files: { path: string }[];
  }[];
  const packed = results[0];
  if (!packed || results.length !== 1)
    throw new Error("Expected one release archive");
  if (!packed.files.some(({ path }) => path === "npm-shrinkwrap.json"))
    throw new Error("Release archive is missing npm-shrinkwrap.json");
  const forbidden = packed.files.filter(
    ({ path }) =>
      /(^|\/)(node_modules|\.venv|\.git|benchmarks|\.env|__pycache__)(\/|$)/.test(
        path,
      ) || /\.py[co]$/.test(path),
  );
  if (forbidden.length)
    throw new Error(
      `Unexpected package files: ${forbidden.map((file) => file.path).join(", ")}`,
    );
  await writeFile(resolve(directory, "pack-result.json"), stdout);
  return resolve(directory, packed.filename);
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  console.log(await packNpmPackage());
