import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { bakeExpressions } from "../../packages/renderer-core/src/composition/bake.ts";
import {
  evaluateComp,
  evaluateProperty,
} from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";

const root = resolve(import.meta.dirname, "../..");
const fixture = async (name: string) =>
  JSON.parse(
    await readFile(
      resolve(root, `benchmarks/fixtures/composition/ce9/${name}.json`),
      "utf8",
    ),
  ) as Composition;
const solid = (id: string, extra: object = {}) => ({
  id,
  type: "solid",
  size: [10, 10],
  color: "#808080",
  ...extra,
});
const valid = (doc: object) => {
  const result = validateComposition(doc);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.composition;
};
const base = (extra: object = {}) => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 200,
  height: 200,
  fps: 30,
  frameCount: 40,
  assets: [],
  layers: [
    solid("lead", {
      transform: {
        position: {
          keys: [
            { frame: 0, value: [0, 0] },
            { frame: 20, value: [100, 40] },
          ],
        },
      },
    }),
    solid("a"),
  ],
  ...extra,
});

/** Evaluated transform, opacity and visibility of every layer, recursively. */
function snapshot(comp: Composition, frame: number) {
  const visit = (tree: ReturnType<typeof evaluateComp>): unknown =>
    tree.layers.map((layer) => ({
      id: layer.id,
      visible: layer.visible,
      opacity: layer.opacity,
      world: layer.worldMatrix,
      color: layer.color,
      time: layer.time,
      children: layer.precomp ? visit(layer.precomp) : undefined,
    }));
  return visit(evaluateComp(comp, frame));
}
function expectSameFrames(a: Composition, b: Composition) {
  for (let frame = 0; frame < a.frameCount; frame++)
    expect(snapshot(b, frame), `frame ${frame}`).toEqual(snapshot(a, frame));
}

describe("comp bake", () => {
  it("bakes the CE9 acceptance demo exactly and matches the committed file", async () => {
    const demo = await fixture("overlap-demo");
    const followers = demo.layers.slice(1);
    for (const follower of followers)
      expect(JSON.stringify(follower)).not.toContain("keys");
    const baked = bakeExpressions(demo);
    expect(baked.ok).toBe(true);
    if (!baked.ok) return;
    expect(baked.diagnostics).toEqual([]);
    expect(baked.composition).toEqual(
      validateComposition(await fixture("overlap-demo.baked")).ok &&
        (await fixture("overlap-demo.baked")),
    );
    expect(baked.composition.expressions).toBeUndefined();
    expect(baked.composition.behaviours).toBeUndefined();
    expectSameFrames(valid(demo), baked.composition);
    // Every follower moves although it has no keys of its own.
    const positions = (frame: number) =>
      evaluateComp(demo, frame).layers.map((l) => l.transform.position);
    expect(positions(20).slice(1)).not.toEqual(positions(0).slice(1));
  });

  it("folds motion craft on baked properties and keeps the rest", () => {
    const doc = valid(
      base({
        signals: [
          {
            id: "s",
            keys: [
              { frame: 0, value: 0 },
              { frame: 39, value: 39 },
            ],
          },
        ],
        drivers: [
          { target: "a.transform.position.x", signal: "s" },
          { target: "a.transform.rotation", signal: "s" },
        ],
        periodic: [
          {
            target: "a.transform.position.y",
            start: 0,
            end: 39,
            oscillate: { period: 10, amplitude: 5 },
          },
        ],
        expressions: {
          "a.transform.position": {
            source: "value + ref('lead.transform.position') / 2",
          },
          "a.color": { source: "mix(#000000, #ffffff, frame / 39)" },
        },
      }),
    );
    const baked = bakeExpressions(doc);
    expect(baked.ok).toBe(true);
    if (!baked.ok) return;
    expect(baked.composition.drivers).toEqual([
      { target: "a.transform.rotation", signal: "s" },
    ]);
    expect(baked.composition.periodic).toBeUndefined();
    expect(baked.diagnostics).toEqual([
      expect.objectContaining({
        code: "comp-bake-quantized",
        severity: "warning",
      }),
    ]);
    // Colour is rounded to 8-bit channels; transforms are exact.
    for (let frame = 0; frame < 40; frame++) {
      expect(
        evaluateProperty(baked.composition, "a.transform.position", frame),
      ).toEqual(evaluateProperty(doc, "a.transform.position", frame));
      expect(
        evaluateProperty(baked.composition, "a.transform.rotation", frame),
      ).toEqual(evaluateProperty(doc, "a.transform.rotation", frame));
      const [r] = evaluateProperty(
        baked.composition,
        "a.color",
        frame,
      ) as number[];
      expect(Math.abs(r! - frame / 39)).toBeLessThanOrEqual(0.5 / 255 + 1e-12);
    }
  });

  it("clones a shared precomp before baking one instance and handles reversed clocks", () => {
    const doc = valid(
      base({
        precomps: [
          {
            id: "clip",
            width: 100,
            height: 100,
            frameCount: 40,
            layers: [
              solid("hero", {
                transform: {
                  rotation: {
                    keys: [
                      { frame: 0, value: 0 },
                      { frame: 39, value: 39 },
                    ],
                  },
                },
              }),
            ],
          },
        ],
        layers: [
          { id: "intro", type: "precomp", comp: "clip" },
          {
            id: "outro",
            type: "precomp",
            comp: "clip",
            startFrame: 39,
            stretch: -1,
          },
          solid("lead"),
        ],
        expressions: {
          "outro/hero.transform.rotation": {
            source: "value * 2 + ref('intro/hero.transform.rotation')",
          },
        },
      }),
    );
    const baked = bakeExpressions(doc);
    expect(baked.ok).toBe(true);
    if (!baked.ok) return;
    expect(baked.composition.precomps!.map((p) => p.id)).toEqual([
      "clip",
      "clip-baked-1",
    ]);
    expect(baked.composition.layers[1]).toMatchObject({ comp: "clip-baked-1" });
    expect(baked.composition.layers[0]).toMatchObject({ comp: "clip" });
    expectSameFrames(doc, baked.composition);
  });

  it("refuses properties whose layer time is not an integer frame", () => {
    const doc = base({
      layers: [solid("lead", { stretch: 2 }), solid("a")],
      expressions: { "lead.transform.rotation": { source: "frame" } },
    });
    expect(bakeExpressions(doc)).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "comp-bake-time",
          path: 'expressions["lead.transform.rotation"]',
        }),
      ],
    });
  });

  it.each([
    "[frame, frame * frame]",
    "frame < -32 ? [frame + 32, frame + 32] : frame > 60 ? [frame - 60, 60 - frame] : [0, 0]",
  ])(
    "preserves auto-orient boundary and rest-direction samples for %s",
    (source) => {
      const doc = valid(
        base({
          layers: [solid("a", { transform: { autoOrient: "path" } })],
          expressions: { "a.transform.position": { source } },
        }),
      );
      const baked = bakeExpressions(doc);
      expect(baked.ok).toBe(true);
      if (!baked.ok) return;
      expect(baked.diagnostics).toEqual([]);
      expect(baked.composition.layers[0]!.transform!.autoOrient).toBe("path");
      expectSameFrames(doc, baked.composition);
    },
  );

  it("refuses auto-orient history that varies on a held precomp clock", () => {
    const doc = valid(
      base({
        layers: [{ id: "intro", type: "precomp", comp: "clip" }],
        precomps: [
          {
            id: "clip",
            width: 100,
            height: 100,
            frameCount: 40,
            layers: [solid("hero", { transform: { autoOrient: "path" } })],
          },
        ],
        expressions: {
          "intro/hero.transform.position": { source: "[frame, frame * frame]" },
        },
      }),
    );
    expect(bakeExpressions(doc)).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "comp-bake-time" })],
    });
  });

  it("refuses an indirect auto-orient read whose boundary history was not baked", () => {
    const doc = valid(
      base({
        layers: [
          solid("lead"),
          solid("a"),
          solid("b", {
            transform: { autoOrient: "path" },
          }),
        ],
        drivers: [
          {
            target: "b.transform.position.x",
            source: "lead.transform.rotation",
          },
          { target: "b.transform.position.y", source: "a.transform.rotation" },
        ],
        expressions: {
          "lead.transform.rotation": { source: "frame" },
          "a.transform.rotation": { source: "frame * frame" },
        },
      }),
    );
    expect(bakeExpressions(doc)).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "comp-bake-auto-orient",
          path: "b.transform.autoOrient",
        }),
      ],
    });
  });

  it("returns invalid input diagnostics and leaves expression-free input unchanged", () => {
    expect(bakeExpressions({})).toMatchObject({ ok: false });
    const plain = valid(base());
    expect(bakeExpressions(plain)).toEqual({
      ok: true,
      composition: plain,
      baked: [],
      diagnostics: [],
    });
  });
});

describe("comp CLI", () => {
  const directories: string[] = [];
  afterAll(() =>
    Promise.all(
      directories.map((d) => rm(d, { recursive: true, force: true })),
    ),
  );
  const run = async (args: string[]) => {
    let stdout = "",
      stderr = "";
    const code = await runCli(args, {
      stdout: (text) => (stdout += text),
      stderr: (text) => (stderr += text),
    });
    return { code, stdout, stderr };
  };

  it("normalizes expressions with canonical ASTs and bakes to a new file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ce9-cli-"));
    directories.push(directory);
    const input = join(directory, "comp.json");
    await writeFile(
      input,
      JSON.stringify(
        base({
          expressions: { "a.transform.rotation": { source: "wiggle(2,6,7)" } },
        }),
      ),
    );
    const normalized = await run(["comp", "normalize", "--input", input]);
    expect(normalized.code).toBe(0);
    expect(JSON.parse(normalized.stdout).expressions).toEqual({
      "a.transform.rotation": {
        source: "wiggle(2,6,7)",
        ast: { call: "wiggle", args: [{ num: 2 }, { num: 6 }, { num: 7 }] },
      },
    });
    const output = join(directory, "baked.json");
    const baked = await run([
      "comp",
      "bake",
      "--input",
      input,
      "--output",
      output,
    ]);
    expect(baked.code).toBe(0);
    expect(JSON.parse(baked.stdout)).toMatchObject({
      status: "baked",
      baked: [{ path: "a.transform.rotation", keys: 40 }],
    });
    expect(
      JSON.parse(await readFile(output, "utf8")).expressions,
    ).toBeUndefined();
    // Never overwrite an existing output.
    expect(
      (await run(["comp", "bake", "--input", input, "--output", output])).code,
    ).toBe(1);
    await writeFile(
      input,
      JSON.stringify(
        base({ expressions: { "a.transform.rotation": { source: "foo(" } } }),
      ),
    );
    const failed = await run(["comp", "bake", "--input", input]);
    expect(failed.code).toBe(1);
    expect(JSON.parse(failed.stderr).diagnostics).toEqual([
      expect.objectContaining({
        code: "comp-expression-unknown-function",
        column: 1,
      }),
    ]);
  });
});

describe("grouped temporal speed (CE2 follow-up)", () => {
  const doc = (position: unknown, rotation?: unknown) =>
    base({
      layers: [
        solid("lead", {
          transform: { position, ...(rotation ? { rotation } : {}) },
        }),
        solid("a"),
      ],
    });
  const codes = (input: object) =>
    validateComposition(input).diagnostics.map((d) => [d.code, d.path]);

  it("validates tuple dimensions, scalar speeds and spatial speeds", () => {
    const keys = (out: object, extra: object = {}) => ({
      keys: [
        { frame: 0, value: [0, 0], out, ...extra },
        { frame: 20, value: [100, 50] },
      ],
    });
    expect(codes(doc(keys({ ease: 0.4, speed: [5, 2] })))).toEqual([]);
    expect(codes(doc(keys({ ease: 0.4, speed: 5 })))).toEqual([
      [
        "comp-key-speed-vector",
        "layers[0].transform.position.keys[0].out.speed",
      ],
    ]);
    expect(codes(doc(keys({ ease: 0.4, speed: [5, 2, 1] })))).toEqual([
      [
        "comp-key-speed-dimension",
        "layers[0].transform.position.keys[0].out.speed",
      ],
    ]);
    expect(
      codes(doc(keys({ ease: 0.4, speed: [5, 2] }, { spatialOut: [10, 0] }))),
    ).toEqual([
      [
        "comp-key-speed-spatial",
        "layers[0].transform.position.keys[0].out.speed",
      ],
    ]);
    expect(codes(doc(keys({ ease: 0.4, spatialSpeed: 3 })))).toEqual([
      [
        "comp-key-speed-spatial",
        "layers[0].transform.position.keys[0].out.spatialSpeed",
      ],
    ]);
    expect(
      codes(doc(keys({ ease: 0.4, spatialSpeed: 3 }, { spatialOut: [10, 0] }))),
    ).toEqual([]);
    expect(
      codes(
        base({
          layers: [
            solid("lead", {
              color: {
                keys: [
                  {
                    frame: 0,
                    value: "#000000",
                    out: { ease: 0.5, speed: [0.1, 0, 0, 0] },
                  },
                  { frame: 9, value: "#ffffff" },
                ],
              },
            }),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("samples a grouped tuple like separated scalar speeds", () => {
    const grouped = valid(
      doc({
        keys: [
          { frame: 0, value: [0, 0], out: { ease: 0.5, speed: [12, -3] } },
          { frame: 20, value: [100, 50], in: { ease: 0.3, speed: [1, 4] } },
        ],
      }),
    );
    const separated = valid(
      doc({
        x: {
          keys: [
            { frame: 0, value: 0, out: { ease: 0.5, speed: 12 } },
            { frame: 20, value: 100, in: { ease: 0.3, speed: 1 } },
          ],
        },
        y: {
          keys: [
            { frame: 0, value: 0, out: { ease: 0.5, speed: -3 } },
            { frame: 20, value: 50, in: { ease: 0.3, speed: 4 } },
          ],
        },
      }),
    );
    for (const t of [0, 1, 3.5, 10, 19, 20])
      expect(evaluateProperty(grouped, "lead.transform.position", t)).toEqual(
        evaluateProperty(separated, "lead.transform.position", t),
      );
  });

  it("converts spatial speed in arc pixels/frame to path progress", () => {
    const spatial = valid(
      doc(
        {
          keys: [
            {
              frame: 0,
              value: [0, 0],
              spatialOut: [0, 0],
              out: { ease: 0.5, spatialSpeed: 12 },
            },
            { frame: 20, value: [100, 0], in: { ease: 0.3, spatialSpeed: 2 } },
          ],
        },
        {
          keys: [
            { frame: 0, value: 0, out: { ease: 0.5, speed: 12 } },
            { frame: 20, value: 100, in: { ease: 0.3, speed: 2 } },
          ],
        },
      ),
    );
    for (const t of [1, 4, 9.5, 17]) {
      const x = (
        evaluateProperty(spatial, "lead.transform.position", t) as number[]
      )[0]!;
      expect(x).toBeCloseTo(
        evaluateProperty(spatial, "lead.transform.rotation", t) as number,
        1,
      );
    }
  });
});
