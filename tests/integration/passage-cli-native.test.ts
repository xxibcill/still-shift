import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const run = promisify(execFile);
const plan = "benchmarks/fixtures/story-authoring/linked-comparison.json";
const map = "benchmarks/fixtures/composition/ce4a/native-beats.json";

async function prepare(output: string, ...flags: string[]) {
  try {
    const { stdout } = await run(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/prepare-story-passage.ts",
        "--plan",
        plan,
        "--output-dir",
        output,
        "--prepare-only",
        ...flags,
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    return { code: 0, result: JSON.parse(stdout) };
  } catch (error) {
    const failure = error as { code: number; stderr: string };
    return {
      code: failure.code,
      result: JSON.parse(failure.stderr.trim().split("\n").at(-1)!),
    };
  }
}

it("validates native beat maps before preparing a passage", async () => {
  const directory = await mkdtemp(join(tmpdir(), "passage-cli-native-"));
  try {
    const unknown = join(directory, "unknown.json");
    await writeFile(
      unknown,
      JSON.stringify({
        missing: join(
          process.cwd(),
          "benchmarks/fixtures/composition/ce4a/native-beat.json",
        ),
      }),
    );
    const rejected = await prepare(
      join(directory, "unknown-out"),
      "--renderer",
      "composition",
      "--composition-beats",
      unknown,
    );
    expect(rejected.code).toBe(1);
    expect(rejected.result.diagnostics).toEqual([
      expect.objectContaining({ code: "comp-passage-beat", beat: "missing" }),
    ]);
    await expect(access(join(directory, "unknown-out"))).rejects.toThrow();

    const legacy = await prepare(
      join(directory, "legacy-out"),
      "--composition-beats",
      map,
    );
    expect(legacy.code).toBe(1);
    expect(JSON.stringify(legacy.result.diagnostics)).toContain(
      "--composition-beats requires --renderer composition",
    );
    await expect(access(join(directory, "legacy-out"))).rejects.toThrow();

    const output = join(directory, "prepared");
    const prepared = await prepare(
      output,
      "--renderer",
      "composition",
      "--composition-beats",
      map,
    );
    expect(prepared).toMatchObject({ code: 0, result: { status: "prepared" } });
    expect(
      JSON.parse(await readFile(join(output, "passage.json"), "utf8")).id,
    ).toBe(prepared.result.plan);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);
