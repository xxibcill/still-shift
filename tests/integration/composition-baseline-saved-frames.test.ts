import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const run = promisify(execFile);

it("replaces saved frame inventory when reusing a mismatch directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "still-shift-saved-frames-"));
  const item = "commerce/h04-square";
  const selectedFrames = join(directory, "reference", encodeURIComponent(item));
  const retiredFrames = join(directory, "reference", "retired-item");
  try {
    await mkdir(selectedFrames, { recursive: true });
    await mkdir(retiredFrames, { recursive: true });
    await writeFile(join(selectedFrames, "999.rgba"), "old late frame");
    await writeFile(join(retiredFrames, "0.rgba"), "retired item");
    await writeFile(join(directory, "environment.json"), "old metadata");
    await writeFile(join(directory, "keep.txt"), "unrelated file");

    const { stdout } = await run(process.execPath, [
      "--import",
      "tsx",
      "scripts/composition/baselines.ts",
      "--check",
      "--only",
      item,
      "--save-mismatches",
      directory,
    ]);
    expect(stdout).toContain("1 items, 240 frames");
    const saved = JSON.parse(
      await readFile(join(directory, "environment.json"), "utf8"),
    ) as {
      mismatches: Record<string, { frames: number; differingFrames: number }>;
    };
    expect(saved.mismatches).toEqual({
      [item]: { frames: 240, differingFrames: 0 },
    });
    expect((await readdir(directory)).sort()).toEqual([
      "environment.json",
      "keep.txt",
    ]);
    expect(await readFile(join(directory, "keep.txt"), "utf8")).toBe(
      "unrelated file",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);
