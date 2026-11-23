/**
 * CGA2 A1: solver 2's prediction equals what the renderer draws. Two
 * synthetic clips (a flat, warm, desaturated one and a narrow-range one that
 * needs the S-curve) are corrected with
 * `auto-color --engine grade --write-composition`, rendered losslessly
 * (`comp render --format png8`) with Canvas and WebGL2, and every frame is
 * compared with `applyColorEffects` on the media path's frames:
 * Canvas exactly, WebGL2 within one code value (owner decision 3).
 * CGA2 A3: the same for look 2 — a matrix-curves look at 60% (a strength key
 * over a mixer and curves) and a LUT look (a pinned `lut` asset).
 *
 *   pnpm test:browser:color-grading-cga2
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  applyColorEffects,
  autoColorClip,
  fitColorLook2,
  loadColorLookLuts,
  openColorClip,
  readColorFrames,
  type AutoColorReport,
} from "@still-shift/animation-engine";
import { decodeCompositionRgbaPng } from "../../packages/animation-engine/src/composition-media-color.ts";
import {
  CGA_SYNTHETIC,
  cgaDegrade,
  cgaReferenceFrames,
  writeCgaClip,
  type CgaDegradation,
} from "../../benchmarks/fixtures/color/cga-synthetic.ts";

const root = resolve(import.meta.dirname, "../..");
const FIXTURES = {
  // A warm, desaturated clip with lifted blacks: white balance, levels and a
  // skin-keyed vibrance boost.
  flat: [
    { kind: "contrast", black: 0.12, white: 0.8 },
    { kind: "saturation", scale: 0.5 },
    { kind: "white-balance", temperature: 20, tint: 6 },
  ],
  // A narrow tonal range: levels and the kink-guarded S-curve as well.
  narrow: [{ kind: "contrast", black: 0.2, white: 0.75 }],
} as const satisfies Record<string, readonly CgaDegradation[]>;

const work = await mkdtemp(join(tmpdir(), "cga2-render-"));
const cacheDirectory = join(work, "media-cache");
try {
  for (const [name, changes] of Object.entries(FIXTURES))
    await solverParity(name, changes);
  await lookParity();
  console.log("CGA2 render parity: ok");
} finally {
  await rm(work, { recursive: true, force: true });
}

async function solverParity(name: string, changes: readonly CgaDegradation[]) {
  let frames = cgaReferenceFrames();
  for (const change of changes) frames = cgaDegrade(frames, change);
  const input = join(work, `${name}.mkv`);
  await writeCgaClip(input, frames);
  const composition = join(work, `${name}.composition.json`);
  const report = await autoColorClip({
    input,
    writeComposition: composition,
    engine: "grade",
    cacheDirectory,
  });
  const ids = report.effects.map((effect) => effect.effect);
  assert.ok(ids.includes("grade.key"), `a keyed run: ${ids.join(", ")}`);
  assert.ok(ids.includes("grade.cdl"));
  if (name === "narrow")
    assert.ok(
      report.effects.some((effect) => "master" in effect.params),
      "the S-curve is rendered",
    );
  await renderParity(name, input, composition, report);
}

/** A3: look 2 fitted on a toned edit, as a keyed matrix-curves run and a LUT. */
async function lookParity() {
  const raw = cgaDegrade(cgaReferenceFrames(), {
    kind: "contrast",
    black: 0.1,
    white: 0.85,
  });
  const second = cgaDegrade(cgaReferenceFrames(1), {
    kind: "contrast",
    black: 0.1,
    white: 0.85,
  });
  const before = [join(work, "look-a.mkv"), join(work, "look-b.mkv")];
  await writeCgaClip(before[0]!, raw);
  await writeCgaClip(before[1]!, second);
  const after = join(work, "look-after.mkv");
  await writeCgaClip(after, [
    ...cgaReferenceFrames(1).slice(5, 12),
    ...cgaReferenceFrames().slice(0, 8),
  ]);
  for (const model of ["matrix-curves", "lut"] as const) {
    const { look, cube } = await fitColorLook2(before, after, {
      cacheDirectory,
      step: 4,
      model,
      lutPath: "look.cube",
    });
    const lookPath = join(work, `${model}.look.json`);
    if (cube) await writeFile(join(work, "look.cube"), cube);
    await writeFile(lookPath, JSON.stringify(look));
    const composition = join(work, `look-${model}.composition.json`);
    const report = await autoColorClip({
      input: before[0]!,
      look,
      lookLuts: await loadColorLookLuts(look, lookPath),
      engine: "grade",
      writeComposition: composition,
      cacheDirectory,
    });
    const ids = report.effects.map((effect) => effect.effect);
    assert.deepEqual(
      ids,
      model === "lut"
        ? ["grade.lut"]
        : ["grade.key", "grade.rgb-mixer", "grade.curves"],
    );
    await renderParity(`look-${model}`, before[0]!, composition, report);
  }
}

async function renderParity(
  name: string,
  input: string,
  composition: string,
  report: AutoColorReport,
) {
  const ids = report.effects.map((effect) => effect.effect);

  const clip = await openColorClip(input, { cacheDirectory });
  const source = await readColorFrames(
    clip,
    Array.from({ length: CGA_SYNTHETIC.frameCount }, (_, i) => i),
    { cacheDirectory },
  );
  const expected = source.map((frame) =>
    applyColorEffects(report.effects, frame.rgba),
  );

  const results: Record<string, { max: number; channelsOff: number }> = {};
  for (const backend of ["canvas2d", "webgl2"] as const) {
    const out = join(work, `${name}-${backend}`);
    const run = spawnSync(
      "pnpm",
      [
        "--silent",
        "still-shift",
        "comp",
        "render",
        "--input",
        composition,
        "--output",
        join(out, "frame.%06d.png"),
        "--format",
        "png8",
        "--backend",
        backend,
      ],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const files = (await readdir(out))
      .filter((file) => file.endsWith(".png"))
      .sort();
    assert.equal(files.length, CGA_SYNTHETIC.frameCount);
    let max = 0,
      channelsOff = 0;
    for (const [i, file] of files.entries()) {
      const { rgba } = decodeCompositionRgbaPng(
        await readFile(join(out, file)),
      );
      const want = expected[i]!;
      for (let p = 0; p < want.length; p += 4)
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(rgba[p + c]! - want[p + c]!);
          if (d) channelsOff++;
          if (d > max) max = d;
        }
    }
    results[backend] = { max, channelsOff };
  }
  console.log(JSON.stringify({ fixture: name, effects: ids, results }));
  assert.equal(
    results.canvas2d!.max,
    0,
    `${name}: Canvas equals the prediction`,
  );
  assert.ok(results.webgl2!.max <= 1, `${name}: WebGL2 within one code value`);
}
