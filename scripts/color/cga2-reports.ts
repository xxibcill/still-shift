/**
 * CGA2 A2: auto-color reports on the synthetic fixtures, so two commits can
 * be compared byte for byte (legacy reports must not change).
 *
 *   node --import tsx scripts/color/cga2-reports.ts --output <new folder> \
 *     [--inputs <folder of a previous run's work/>]
 *
 * Writes `<case>.<engine>.auto-color.json` for each fixture case and engine
 * (composition only; one legacy case also renders, for the `output` block).
 * Paths inside reports are the output folder's, so compare two runs written
 * to the same folder path (for example after moving the first one aside).
 * The fixture writer's MKV bytes differ between runs (so would the input
 * hashes); `--inputs` reuses the clips a previous run wrote. Only uses
 * `autoColorClip`, so it runs unchanged on A1. Software only.
 */
import { copyFile, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { autoColorClip } from "@still-shift/animation-engine";
import {
  cgaDegrade,
  cgaReferenceFrames,
  writeCgaClip,
  type CgaDegradation,
} from "../../benchmarks/fixtures/color/cga-synthetic.ts";

const at = process.argv.indexOf("--output");
if (at < 0 || !process.argv[at + 1])
  throw new Error("usage: cga2-reports.ts --output <new folder>");
const output = resolve(process.argv[at + 1]!);
const inputsAt = process.argv.indexOf("--inputs");
const inputs = inputsAt < 0 ? undefined : resolve(process.argv[inputsAt + 1]!);
await mkdir(output, { recursive: false });
const work = join(output, "work");
const reference = cgaReferenceFrames();
const cases: [string, CgaDegradation[]][] = [
  ["balanced", []],
  ["exposure", [{ kind: "exposure", stops: -0.6 }]],
  ["contrast", [{ kind: "contrast", black: 0.1, white: 0.88 }]],
  ["white-balance", [{ kind: "white-balance", temperature: 30, tint: -12 }]],
  ["desaturation", [{ kind: "saturation", scale: 0.4 }]],
  [
    "flat",
    [
      { kind: "contrast", black: 0.12, white: 0.8 },
      { kind: "saturation", scale: 0.5 },
      { kind: "white-balance", temperature: 20, tint: 6 },
    ],
  ],
];
for (const [name, changes] of cases) {
  let frames = reference;
  for (const change of changes) frames = cgaDegrade(frames, change);
  const input = join(work, `${name}.mkv`);
  await mkdir(work, { recursive: true });
  if (inputs) await copyFile(join(inputs, `${name}.mkv`), input);
  else await writeCgaClip(input, frames, { audio: name === "exposure" });
  for (const engine of ["legacy", "grade"] as const) {
    const render = name === "exposure" && engine === "legacy";
    await autoColorClip({
      input,
      ...(render ? { output: join(work, `${name}.${engine}.mp4`) } : {}),
      writeComposition: join(work, `${name}.${engine}.composition.json`),
      report: join(output, `${name}.${engine}.auto-color.json`),
      engine,
      cacheDirectory: join(work, "media-cache"),
    });
    console.error(`${name} ${engine}`);
  }
}
await rm(join(work, "media-cache"), { recursive: true, force: true });
