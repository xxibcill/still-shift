/**
 * CG5: `comp grade bake`, `comp grade cdl-export` and `comp grade cdl-import`,
 * and pinned LUT assets through the real asset pipeline (`comp probe`).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCubeLut, sampleLut, type Rgb } from "@still-shift/color-science";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { floatGradeOp } from "../../packages/renderer-core/src/composition/render/float-grade.ts";

const fixtures = join(
  import.meta.dirname,
  "../../benchmarks/fixtures/color/cg0",
);
let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cg5-interchange-"));
  await copyFile(
    join(fixtures, "stills/chart-24.png"),
    join(root, "chart.png"),
  );
});
afterAll(() => rm(root, { recursive: true, force: true }));

async function run(args: string[]) {
  let stdout = "",
    stderr = "";
  const code = await runCli(["comp", ...args], {
    stdout: (value) => void (stdout += value),
    stderr: (value) => void (stderr += value),
  });
  return { code, stdout, stderr };
}
const failure = (stderr: string) =>
  JSON.parse(stderr.trim().split("\n").at(-1)!) as {
    diagnostics: { code: string; message: string }[];
  };
const sha = async (path: string) =>
  `sha256:${createHash("sha256")
    .update(await readFile(path))
    .digest("hex")}`;
const defaults = (id: string) =>
  Object.fromEntries(
    Object.entries(compositionEffectDefinition(id)!.properties).map(
      ([k, p]) => [k, p.default],
    ),
  );

const STACK = [
  {
    id: "primary",
    effect: "grade.primary",
    params: { gainMaster: 1.2, liftB: 0.04, contrast: 1.1, saturation: 1.15 },
  },
  {
    id: "curves",
    effect: "grade.curves",
    params: {
      master: [
        [0, 0],
        [0.3, 0.24],
        [0.7, 0.78],
        [1, 1],
      ],
    },
  },
  {
    id: "look",
    effect: "grade.cdl",
    params: {
      slopeR: 1.0234,
      slopeG: 0.9876,
      slopeB: 0.95,
      offsetR: 0.0123,
      offsetG: -0.004,
      powerR: 1.1,
      powerB: 0.9,
      saturation: 0.85,
    },
  },
];
async function write(
  name: string,
  effects: unknown[],
  extraAssets: unknown[] = [],
) {
  const composition = {
    schemaVersion: "composition-1",
    id: `cg5-${name}`,
    width: 384,
    height: 256,
    fps: 24,
    frameCount: 1,
    background: "#000000",
    assets: [
      {
        id: "chart",
        type: "image",
        path: "chart.png",
        sha256: await sha(join(root, "chart.png")),
        width: 384,
        height: 256,
      },
      ...extraAssets,
    ],
    layers: [
      {
        id: "chart",
        type: "image",
        sources: [{ asset: "chart" }],
        size: [384, 256],
        fit: "stretch",
        transform: { anchor: [0, 0] },
        effects,
      },
    ],
  };
  const path = join(root, `${name}.json`);
  await writeFile(path, JSON.stringify(composition));
  return path;
}
const lutAsset = async (file: string, pin?: string) => ({
  id: "baked",
  type: "lut",
  path: file,
  sha256: pin ?? (await sha(join(root, file))),
  format: "cube",
  inputSpace: "legacy-srgb",
  outputSpace: "legacy-srgb",
});
const probe = async (input: string, at: string, backend: string) => {
  const result = await run([
    "probe",
    "--input",
    input,
    "--layer",
    "chart",
    "--at",
    at,
    "--backend",
    backend,
  ]);
  expect(result.code, result.stderr).toBe(0);
  return JSON.parse(result.stdout).stages.at(-1).bytes as number[];
};

describe("comp grade bake", () => {
  it("bakes a pointwise stack that grade.lut reproduces through the asset pipeline", async () => {
    const graded = await write("stack", STACK);
    const output = join(root, "look.cube");
    const baked = await run([
      "grade",
      "bake",
      "--input",
      graded,
      "--layer",
      "chart",
      "--size",
      "33",
      "--output",
      output,
    ]);
    expect(baked.code, baked.stderr).toBe(0);
    const report = JSON.parse(baked.stdout);
    expect(report).toMatchObject({
      status: "baked",
      size: 33,
      effects: ["primary", "curves", "look"],
      cubeSha256: await sha(output),
    });
    // The table holds the stack's float64 reference at every node.
    const lut = parseCubeLut(await readFile(output, "utf8"));
    const ops = STACK.map(
      (e) =>
        floatGradeOp(
          e.effect as never,
          {
            ...defaults(e.effect),
            ...e.params,
          } as never,
        )!,
    );
    const stack = (v: Rgb) => ops.reduce((x, op) => op.apply(x), v);
    let worst = 0;
    for (let i = 0; i < 1000; i++) {
      const v: Rgb = [(i * 0.618) % 1, (i * 0.414) % 1, (i * 0.732) % 1];
      const want = stack(v);
      sampleLut(lut, v).forEach(
        (o, c) => (worst = Math.max(worst, Math.abs(o - want[c]!))),
      );
    }
    expect(worst).toBeLessThan(4e-3);
    // Applied with grade.lut (asset pinned, verified and parsed in Node, then
    // fetched by the page), each probed patch is within two code values.
    const viaLut = await write(
      "via-lut",
      [{ id: "lut", effect: "grade.lut", assets: { lut: "baked" } }],
      [await lutAsset("look.cube")],
    );
    for (const backend of ["canvas2d", "webgl2"])
      for (const at of ["32,32", "160,96", "352,224"]) {
        const a = await probe(graded, at, backend);
        const b = await probe(viaLut, at, backend);
        a.forEach((v, c) => expect(Math.abs(v - b[c]!)).toBeLessThanOrEqual(2));
      }
    // Never overwrites.
    const again = await run([
      "grade",
      "bake",
      "--input",
      graded,
      "--layer",
      "chart",
      "--output",
      output,
    ]);
    expect(again.code).not.toBe(0);
  }, 120_000);
  it("refuses a stack with a non-pointwise effect, naming it", async () => {
    const input = await write("blurred", [
      ...STACK.slice(0, 1),
      { id: "soft", effect: "blur.gaussian", params: { radius: 4 } },
    ]);
    const result = await run([
      "grade",
      "bake",
      "--input",
      input,
      "--layer",
      "chart",
      "--output",
      join(root, "no.cube"),
    ]);
    expect(result.code).not.toBe(0);
    const [diagnostic] = failure(result.stderr).diagnostics;
    expect(diagnostic!.code).toBe("comp-grade-not-pointwise");
    expect(diagnostic!.message).toMatch(/blur\.gaussian \("soft"\)/);
  });
  it("fails before rendering on a wrong-hash LUT", async () => {
    const input = await write(
      "wrong-hash",
      [{ id: "lut", effect: "grade.lut", assets: { lut: "baked" } }],
      [await lutAsset("look.cube", `sha256:${"0".repeat(64)}`)],
    );
    const result = await run([
      "probe",
      "--input",
      input,
      "--layer",
      "chart",
      "--at",
      "1,1",
    ]);
    expect(result.code).not.toBe(0);
    expect(failure(result.stderr).diagnostics[0]!.code).toBe(
      "comp-lut-checksum",
    );
  });
});

describe("comp grade cdl-export / cdl-import", () => {
  it("exports the values as written and imports them back exactly", async () => {
    const input = await write("cdl", STACK);
    const cc = join(root, "look.cc");
    const exported = await run([
      "grade",
      "cdl-export",
      "--input",
      input,
      "--layer",
      "chart",
      "--output",
      cc,
    ]);
    expect(exported.code, exported.stderr).toBe(0);
    expect(JSON.parse(exported.stdout).notes).toHaveLength(1); // unclamped style
    const text = await readFile(cc, "utf8");
    for (const values of [
      "1.0234 0.9876 0.95",
      "0.0123 -0.004 0",
      "1.1 1 0.9",
      "<Saturation>0.85</Saturation>",
    ])
      expect(text).toContain(values);
    const imported = await run([
      "grade",
      "cdl-import",
      "--input",
      cc,
      "--clamp",
      "false",
    ]);
    expect(imported.code, imported.stderr).toBe(0);
    const [effect] = JSON.parse(imported.stdout).effects;
    const params = { ...defaults("grade.cdl"), ...STACK[2]!.params, clamp: 0 };
    expect(effect).toEqual({ id: "look", effect: "grade.cdl", params });
    // A composition holding the imported effect exports byte-identical text.
    const back = await write("cdl-back", [effect]);
    const cc2 = join(root, "back.cc");
    expect(
      (
        await run([
          "grade",
          "cdl-export",
          "--input",
          back,
          "--layer",
          "chart",
          "--output",
          cc2,
        ])
      ).code,
    ).toBe(0);
    expect(await readFile(cc2, "utf8")).toBe(text);
    // Collections: .ccc with every grade.cdl; .cc refuses more than one.
    const two = await write("two-cdl", [
      STACK[2],
      { ...STACK[2], id: "second" },
    ]);
    const ccc = join(root, "both.ccc");
    expect(
      (
        await run([
          "grade",
          "cdl-export",
          "--input",
          two,
          "--layer",
          "chart",
          "--output",
          ccc,
        ])
      ).code,
    ).toBe(0);
    const both = JSON.parse(
      (await run(["grade", "cdl-import", "--input", ccc])).stdout,
    );
    expect(
      both.effects.map((e: { id: string; params: { clamp: number } }) => [
        e.id,
        e.params.clamp,
      ]),
    ).toEqual([
      ["look", 1],
      ["second", 1],
    ]);
    const one = await run([
      "grade",
      "cdl-export",
      "--input",
      two,
      "--layer",
      "chart",
      "--output",
      join(root, "one.cc"),
    ]);
    expect(failure(one.stderr).diagnostics[0]!.code).toBe("comp-cdl-count");
  });
  it("keeps a correction id that is not a composition id, renamed and reported", async () => {
    const sop = `<SOPNode><Slope>1.1 1 1</Slope><Offset>0 0 0</Offset><Power>1 1 1</Power></SOPNode>`;
    const path = join(root, "ids.ccc");
    await writeFile(
      path,
      `<ColorCorrectionCollection xmlns="urn:ASC:CDL:v1.2">${[
        "001",
        "shot 010",
        "cdl-001",
        undefined,
      ]
        .map(
          (id) =>
            `<ColorCorrection${id === undefined ? "" : ` id="${id}"`}>${sop}</ColorCorrection>`,
        )
        .join("")}</ColorCorrectionCollection>`,
    );
    const result = await run(["grade", "cdl-import", "--input", path]);
    expect(result.code, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.effects.map((e: { id: string }) => e.id)).toEqual([
      "cdl-001",
      "cdl-shot-010",
      "cdl-001-2",
      "cdl-4",
    ]);
    expect(report.renamed).toEqual([
      { correction: "001", id: "cdl-001" },
      { correction: "shot 010", id: "cdl-shot-010" },
      { correction: "cdl-001", id: "cdl-001-2" },
      { correction: null, id: "cdl-4" },
    ]);
  });
  it("rejects values outside grade.cdl's bounds", async () => {
    const path = join(root, "steep.cc");
    await writeFile(
      path,
      `<ColorCorrection id="x"><SOPNode><Slope>9 1 1</Slope><Offset>0 0 0</Offset><Power>1 1 1</Power></SOPNode></ColorCorrection>`,
    );
    const result = await run(["grade", "cdl-import", "--input", path]);
    expect(result.code).not.toBe(0);
    const [diagnostic] = failure(result.stderr).diagnostics;
    expect(diagnostic!.code).toBe("comp-cdl-range");
    expect(diagnostic!.message).toMatch(/slopeR 9/);
  });
});
