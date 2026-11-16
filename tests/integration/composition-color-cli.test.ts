/**
 * CGA CLI commands (`comp color-stats`, `comp look fit|apply`,
 * `comp auto-color`): option handling and output safety on the tracked
 * synthetic fixtures.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import {
  cgaDegrade,
  cgaReferenceFrames,
  writeCgaClip,
} from "../../benchmarks/fixtures/color/cga-synthetic.ts";

let root: string;
const reference = cgaReferenceFrames();
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cga-color-cli-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});
async function run(args: string[]) {
  let stdout = "",
    stderr = "";
  const code = await runCli(["comp", ...args], {
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });
  return { code, stdout, stderr };
}
const failure = (stderr: string) =>
  JSON.parse(stderr.trim().split("\n").at(-1)!) as {
    status: string;
    diagnostics: { code: string; path: string }[];
  };

describe("CGA CLI output safety", () => {
  it("color-stats refuses an existing --output before measuring", async () => {
    const input = join(root, "stats.mkv");
    await writeCgaClip(input, reference.slice(0, 3));
    const output = join(root, "stats.json");
    await writeFile(output, "keep\n");
    const result = await run([
      "color-stats",
      "--input",
      input,
      "--output",
      output,
    ]);
    expect(result.code).not.toBe(0);
    expect(failure(result.stderr).diagnostics[0]).toMatchObject({
      code: "comp-program-output",
      path: "output",
    });
    expect(await readFile(output, "utf8")).toBe("keep\n");
  });
  it("a folder run refuses an existing summary before processing any clip", async () => {
    const folder = join(root, "folder-in");
    await mkdir(folder, { recursive: true });
    await writeCgaClip(
      join(folder, "a.mkv"),
      cgaDegrade(reference.slice(0, 3), { kind: "exposure", stops: -0.6 }),
    );
    const out = join(root, "folder-out");
    await mkdir(out, { recursive: true });
    await writeFile(join(out, "auto-color-summary.json"), "keep\n");
    const result = await run([
      "auto-color",
      "--input",
      folder,
      "--write-composition",
      out,
    ]);
    expect(result.code).not.toBe(0);
    expect(failure(result.stderr).diagnostics[0]!.code).toBe(
      "comp-program-output",
    );
    expect(await readdir(out)).toEqual(["auto-color-summary.json"]);
    expect(await readFile(join(out, "auto-color-summary.json"), "utf8")).toBe(
      "keep\n",
    );
  });
  it("look fit checks --output before reading any clip", async () => {
    const output = join(root, "look.json");
    await writeFile(output, "keep\n");
    const missing = join(root, "no-such-clip.mkv");
    for (const [args, code] of [
      [["--output", output], "comp-program-output"],
      [[], "invalid-scene"], // missing --output, not a media error
    ] as const) {
      const result = await run([
        "look",
        "fit",
        "--before",
        missing,
        "--after",
        missing,
        ...args,
      ]);
      expect(result.code).not.toBe(0);
      expect(failure(result.stderr).diagnostics[0]!.code).toBe(code);
    }
    expect(await readFile(output, "utf8")).toBe("keep\n");
  });
  it("auto-color takes a 0–1 scale per correction and rejects other values", async () => {
    const input = join(root, "scaled.mkv");
    await writeCgaClip(
      input,
      cgaDegrade(reference.slice(0, 3), { kind: "saturation", scale: 0.5 }),
    );
    const bad = await run([
      "auto-color",
      "--input",
      input,
      "--write-composition",
      join(root, "scaled-bad.json"),
      "--saturation",
      "1.5",
    ]);
    expect(bad.code).not.toBe(0);
    expect(failure(bad.stderr).diagnostics[0]).toMatchObject({
      code: "comp-program-option",
      path: "saturation",
    });
    const vibrance = async (scale: string) => {
      const result = await run([
        "auto-color",
        "--input",
        input,
        "--write-composition",
        join(root, `scaled-${scale}.json`),
        "--saturation",
        scale,
      ]);
      expect(result.code).toBe(0);
      const effects = JSON.parse(result.stdout).effects as {
        effect: string;
        params: { vibrance: number };
      }[];
      return effects.find((effect) => effect.effect === "color.vibrance")!
        .params.vibrance;
    };
    expect(await vibrance("0.5")).toBeLessThan(await vibrance("true"));
  });
});
