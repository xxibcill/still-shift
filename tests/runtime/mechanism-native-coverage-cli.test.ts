import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
const exec = promisify(execFile);
it("bounds malformed-board diagnostics and publishes nothing before native verification", async () => {
  const root = await mkdtemp(
    join(tmpdir(), "still-shift-native-coverage-invalid-"),
  );
  const board = join(root, "board.json"),
    report = join(root, "report.json");
  await writeFile(
    board,
    JSON.stringify({
      schemaVersion: "wrong",
      registry: Array.from({ length: 300 }, () => ({
        id: null,
        family: null,
        designVariant: null,
        selectedAssetSha256: null,
        currentAssetSha256: null,
        controllerSha256: null,
      })),
      episodes: [],
      qualification: "Invalid fixture only.",
    }),
  );
  try {
    await exec(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/mechanism/native-coverage-board.ts",
        board,
        join(root, "queue.json"),
        root,
        join(root, "Blender-must-not-run"),
        report,
      ],
      { cwd: process.cwd(), timeout: 15000, maxBuffer: 8192 },
    );
    throw Error("Malformed native board unexpectedly passed");
  } catch (error) {
    const failure = error as Error & {
      code: number;
      stdout: string;
      stderr: string;
    };
    expect(failure.code).toBe(1);
    expect(failure.stdout).toBe("");
    expect(Buffer.byteLength(failure.stderr)).toBeLessThan(2048);
    const value = JSON.parse(failure.stderr);
    expect(value.status).toBe("failed");
    expect(value.diagnostic).toHaveLength(4);
  }
  await expect(access(report)).rejects.toThrow();
}, 20000);

it("rejects an existing input as report destination before reading or replacing it", async () => {
  const root = await mkdtemp(
      join(tmpdir(), "still-shift-native-coverage-destination-"),
    ),
    board = join(root, "board.json");
  const bytes = Buffer.from("{}\n");
  await writeFile(board, bytes);
  try {
    await exec(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/mechanism/native-coverage-board.ts",
        board,
        join(root, "queue.json"),
        root,
        join(root, "Blender-must-not-run"),
        board,
      ],
      { cwd: process.cwd(), timeout: 15000, maxBuffer: 8192 },
    );
    throw Error("Existing report destination accepted");
  } catch (error) {
    const failure = error as Error & { code: number; stderr: string };
    expect(failure.code).toBe(1);
    expect(JSON.parse(failure.stderr).diagnostic.message).toMatch(
      /fresh report destination/,
    );
  }
  expect(await readFile(board)).toEqual(bytes);
}, 20000);
