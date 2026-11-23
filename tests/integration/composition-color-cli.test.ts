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

describe("CGA2 A2 CLI: --scopes and --diff", () => {
  it("look apply on a folder writes report 2 and a still and sheet per clip", async () => {
    // A look fitted from the fixture's own degradation.
    const before = join(root, "a2-before.mkv"),
      after = join(root, "a2-after.mkv");
    const short = reference.slice(0, 6);
    await writeCgaClip(
      before,
      cgaDegrade(short, { kind: "saturation", scale: 0.5 }),
    );
    await writeCgaClip(after, short);
    const look = join(root, "a2.look.json");
    const fit = await run([
      "look",
      "fit",
      "--before",
      before,
      "--after",
      after,
      "--output",
      look,
    ]);
    expect(fit.code, fit.stderr).toBe(0);
    const folder = join(root, "a2-folder");
    await mkdir(folder, { recursive: true });
    for (const name of ["one", "two"])
      await writeCgaClip(
        join(folder, `${name}.mkv`),
        cgaDegrade(short, { kind: "exposure", stops: -0.4 }),
      );
    const out = join(root, "a2-folder-out"),
      diff = join(root, "a2-folder-diff");
    const result = await run([
      "look",
      "apply",
      "--look",
      look,
      "--input",
      folder,
      "--write-composition",
      out,
      "--scopes",
      "true",
      "--diff",
      diff,
    ]);
    expect(result.code, result.stderr).toBe(0);
    expect((await readdir(diff)).sort()).toEqual([
      "one.sheet.png",
      "one.still.png",
      "two.sheet.png",
      "two.still.png",
    ]);
    const summary = JSON.parse(
      await readFile(join(out, "auto-color-summary.json"), "utf8"),
    );
    expect(summary.items[0].diff).toEqual({
      still: join(diff, "one.still.png"),
      sheet: join(diff, "one.sheet.png"),
      after: "prediction",
    });
    expect(summary.items[0].scopesChange).toBeDefined();
    const report = JSON.parse(
      await readFile(join(out, "one.composition.auto-color.json"), "utf8"),
    );
    expect(report.schemaVersion).toBe("still-shift-auto-color-report-2");
    expect(report.engine).toBe("legacy");
    // look apply runs no solver, so report 2 names none (PR #80 F12).
    expect("solver" in report).toBe(false);
    expect(report.scopes.predicted.skin.lineDegrees).toBe(123);
    // A rerun refuses the existing diff files (the clip fails, nothing else
    // is overwritten).
    const rerun = await run([
      "look",
      "apply",
      "--look",
      look,
      "--input",
      join(folder, "one.mkv"),
      "--write-composition",
      join(root, "a2-rerun.composition.json"),
      "--diff",
      diff,
    ]);
    expect(rerun.code).not.toBe(0);
    expect(failure(rerun.stderr).diagnostics[0]).toMatchObject({
      code: "comp-auto-color-output",
      path: "diff",
    });
  }, 120_000);
  it("auto-color rejects a non-boolean --scopes", async () => {
    const input = join(root, "a2-scopes.mkv");
    await writeCgaClip(input, reference.slice(0, 3));
    const result = await run([
      "auto-color",
      "--input",
      input,
      "--write-composition",
      join(root, "a2-scopes.json"),
      "--scopes",
      "yes",
    ]);
    expect(result.code).not.toBe(0);
    expect(failure(result.stderr).diagnostics[0]).toMatchObject({
      code: "comp-program-option",
      path: "scopes",
    });
  });
});

describe("CGA2 A3 CLI: look 2", () => {
  it("look fit --engine grade writes look 2, look apply uses it, look export writes .cube or refuses CDL", async () => {
    const before = join(root, "a3-before.mkv"),
      after = join(root, "a3-after.mkv");
    const short = reference.slice(0, 6);
    await writeCgaClip(
      before,
      cgaDegrade(short, { kind: "contrast", black: 0.1, white: 0.85 }),
    );
    await writeCgaClip(after, short);
    // --model chooses a look-2 model: it needs the grade engine.
    const legacyModel = await run([
      "look",
      "fit",
      "--before",
      before,
      "--after",
      after,
      "--output",
      join(root, "a3-legacy.look.json"),
      "--model",
      "cdl",
    ]);
    expect(legacyModel.code).not.toBe(0);
    expect(failure(legacyModel.stderr).diagnostics[0]).toMatchObject({
      code: "comp-program-option",
      path: "model",
    });
    const look = join(root, "a3.look.json");
    const fit = await run([
      "look",
      "fit",
      "--before",
      before,
      "--after",
      after,
      "--output",
      look,
      "--engine",
      "grade",
      "--model",
      "cdl",
    ]);
    expect(fit.code, fit.stderr).toBe(0);
    const fitted = JSON.parse(fit.stdout);
    expect(fitted).toMatchObject({
      status: "fitted",
      schemaVersion: "still-shift-look-2",
      model: "cdl",
    });
    expect(fitted.candidates).toHaveLength(6);
    const document = JSON.parse(await readFile(look, "utf8"));
    expect(document.fit.selection.requested).toBe("cdl");
    // Applied through the grade engine; the legacy engine refuses a CDL look.
    const applied = await run([
      "look",
      "apply",
      "--look",
      look,
      "--input",
      before,
      "--write-composition",
      join(root, "a3-apply.composition.json"),
      "--engine",
      "grade",
      "--strength",
      "1",
    ]);
    expect(applied.code, applied.stderr).toBe(0);
    expect(
      JSON.parse(applied.stdout).effects.map(
        (e: { effect: string }) => e.effect,
      ),
    ).toEqual(document.effects.map((e: { effect: string }) => e.effect));
    const legacy = await run([
      "look",
      "apply",
      "--look",
      look,
      "--input",
      before,
      "--write-composition",
      join(root, "a3-legacy.composition.json"),
    ]);
    expect(legacy.code).not.toBe(0);
    expect(failure(legacy.stderr).diagnostics[0]!.code).toBe(
      "comp-look-engine",
    );
    // Export: a .cube through the CG5 bake, measured against the look.
    const cube = join(root, "a3.cube");
    const exported = await run([
      "look",
      "export",
      "--look",
      look,
      "--cube",
      cube,
    ]);
    expect(exported.code, exported.stderr).toBe(0);
    const report = JSON.parse(exported.stdout);
    expect(report).toMatchObject({
      status: "exported",
      schema: "still-shift.look-export-1",
      format: "cube",
      size: 33,
      strength: 1,
    });
    expect((await readFile(cube, "utf8")).startsWith("LUT_3D_SIZE 33")).toBe(
      true,
    );
    // An existing output is refused; exactly one format is required.
    const again = await run(["look", "export", "--look", look, "--cube", cube]);
    expect(failure(again.stderr).diagnostics[0]).toMatchObject({
      code: "comp-program-output",
      path: "cube",
    });
    const neither = await run(["look", "export", "--look", look]);
    expect(failure(neither.stderr).diagnostics[0]!.code).toBe(
      "comp-program-option",
    );
    // ASC CDL: the fit kept the encoded CDL, one grade.cdl.
    expect(document.space).toBe("encoded-srgb");
    const cc = join(root, "a3.cc");
    const cdl = await run(["look", "export", "--look", look, "--cdl", cc]);
    expect(cdl.code, cdl.stderr).toBe(0);
    expect(await readFile(cc, "utf8")).toContain("<ColorCorrection");
    // A look-1 file exports as a .cube and refuses CDL.
    const look1 = join(root, "a3-look1.json");
    expect(
      (
        await run([
          "look",
          "fit",
          "--before",
          before,
          "--after",
          after,
          "--output",
          look1,
        ])
      ).code,
    ).toBe(0);
    expect(
      (
        await run([
          "look",
          "export",
          "--look",
          look1,
          "--cube",
          join(root, "a3-look1.cube"),
          "--size",
          "17",
        ])
      ).code,
    ).toBe(0);
    const refused = await run([
      "look",
      "export",
      "--look",
      look1,
      "--cdl",
      join(root, "a3-look1.cc"),
    ]);
    expect(failure(refused.stderr).diagnostics[0]!.code).toBe(
      "comp-look-export",
    );
  }, 180_000);

  it("look fit --model lut writes the table beside the look and refuses an existing one first", async () => {
    const before = join(root, "a3-lut-before.mkv"),
      after = join(root, "a3-lut-after.mkv");
    const short = reference.slice(0, 6);
    await writeCgaClip(
      before,
      cgaDegrade(short, { kind: "saturation", scale: 0.6 }),
    );
    await writeCgaClip(after, short);
    const folder = join(root, "a3-lut");
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "taken.cube"), "keep\n");
    const refused = await run([
      "look",
      "fit",
      "--before",
      before,
      "--after",
      after,
      "--output",
      join(folder, "taken.json"),
      "--engine",
      "grade",
      "--model",
      "lut",
    ]);
    expect(failure(refused.stderr).diagnostics[0]!.code).toBe(
      "comp-program-output",
    );
    expect(await readdir(folder)).toEqual(["taken.cube"]);
    const fit = await run([
      "look",
      "fit",
      "--before",
      before,
      "--after",
      after,
      "--output",
      join(folder, "graded.json"),
      "--engine",
      "grade",
      "--model",
      "lut",
    ]);
    expect(fit.code, fit.stderr).toBe(0);
    expect(JSON.parse(fit.stdout).lut).toBe(join(folder, "graded.cube"));
    const look = JSON.parse(
      await readFile(join(folder, "graded.json"), "utf8"),
    );
    expect(look.assets[0].path).toBe("graded.cube");
    const applied = await run([
      "look",
      "apply",
      "--look",
      join(folder, "graded.json"),
      "--input",
      before,
      "--write-composition",
      join(root, "a3-lut-apply", "clip.json"),
      "--engine",
      "grade",
    ]);
    expect(applied.code, applied.stderr).toBe(0);
    const composition = JSON.parse(
      await readFile(join(root, "a3-lut-apply", "clip.json"), "utf8"),
    );
    expect(composition.assets[1].path).toBe(
      join("..", "a3-lut", "graded.cube"),
    );
    // A look path that appears during the fit fails the run, and the table
    // written before it is removed so it does not block the retry.
    const raced = join(folder, "raced.json");
    let stderr = "";
    const code = await runCli(
      [
        "comp",
        "look",
        "fit",
        "--before",
        before,
        "--after",
        after,
        "--output",
        raced,
        "--engine",
        "grade",
        "--model",
        "lut",
      ],
      {
        stdout: () => undefined,
        stderr: (value) => {
          stderr += value;
          if (value.includes('"progress"') && value.includes("fitting lut"))
            void writeFile(raced, "taken\n", { flag: "wx" }).catch(
              () => undefined,
            );
        },
      },
    );
    expect(code).not.toBe(0);
    expect(failure(stderr).diagnostics[0]!.code).toBe("comp-program-output");
    expect(await readFile(raced, "utf8")).toBe("taken\n");
    expect((await readdir(folder)).includes("raced.cube")).toBe(false);
  }, 180_000);
});
