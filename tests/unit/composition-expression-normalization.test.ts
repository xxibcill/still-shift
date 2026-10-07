import { describe, expect, it } from "vitest";
import {
  COMPOSITION_LIMITS,
  EXPRESSION_LIMITS,
  normalizeExpressions,
  validateComposition,
} from "@still-shift/scene-contract";
import { evaluateProperty } from "../../packages/renderer-core/src/composition/evaluate/index.ts";

const composition = (source: string, ast?: unknown) => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 100,
  height: 100,
  fps: 30,
  frameCount: 30,
  assets: [],
  layers: [{ id: "node", type: "null" }],
  expressions: {
    "node.transform.rotation": {
      source,
      ...(ast === undefined ? {} : { ast }),
    },
  },
});

describe("expression normalization", () => {
  it.each([40, 250])(
    "round-trips a flattened %i-term expression through normalized JSON",
    (terms) => {
      const source = Array<string>(terms).fill("1").join(" + ");
      const validation = validateComposition(composition(source));
      expect(validation.ok).toBe(true);
      if (!validation.ok)
        throw new Error(JSON.stringify(validation.diagnostics));

      const normalized = normalizeExpressions(validation.composition);
      const imported = validateComposition(
        JSON.parse(JSON.stringify(normalized)),
      );
      expect(imported.diagnostics).toEqual([]);
      expect(imported.ok).toBe(true);
      if (!imported.ok) throw new Error(JSON.stringify(imported.diagnostics));

      for (const frame of [0, 12, 29]) {
        expect(
          evaluateProperty(
            imported.composition,
            "node.transform.rotation",
            frame,
          ),
        ).toBe(terms);
      }
    },
  );

  it("round-trips an expression at the 500-node limit", () => {
    const source = `-${Array<string>(250).fill("1").join(" + ")}`;
    const validation = validateComposition(composition(source));
    expect(validation.ok).toBe(true);
    if (!validation.ok) throw new Error(JSON.stringify(validation.diagnostics));
    const imported = validateComposition(
      normalizeExpressions(validation.composition),
    );
    expect(imported.diagnostics).toEqual([]);
    if (!imported.ok) throw new Error(JSON.stringify(imported.diagnostics));
    expect(
      evaluateProperty(imported.composition, "node.transform.rotation", 0),
    ).toBe(248);
  });

  it("keeps source/AST mismatch validation at the expression node bound", () => {
    let ast: unknown = { num: 1 };
    for (let i = 1; i < EXPRESSION_LIMITS.maxNodes; i++)
      ast = { op: "neg", args: [ast] };
    expect(validateComposition(composition("1", ast))).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({ code: "comp-expression-mismatch" }),
      ],
    });
  });

  it("rejects a source that exceeds the expression node bound", () => {
    const source = Array<string>(251).fill("1").join(" + ");
    expect(validateComposition(composition(source))).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "comp-expression-limit" })],
    });
  });

  it("bounds deeply nested supplied ASTs before recursive JSON parsing", () => {
    let ast: unknown = { num: 1 };
    for (let i = 0; i < 4_000; i++) ast = { op: "neg", args: [ast] };
    expect(validateComposition(composition("1", ast))).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "comp-json-depth" })],
    });
  });

  it("retains the supplied AST byte limit", () => {
    const ast = { str: "x".repeat(COMPOSITION_LIMITS.maxJsonBytes) };
    expect(validateComposition(composition("1", ast))).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "comp-json-size" })],
    });
  });

  it("rejects malformed and cyclic supplied ASTs", () => {
    expect(
      validateComposition(composition("1", { op: "unknown", args: [] })),
    ).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({ code: "comp-expression-mismatch" }),
      ],
    });
    const cyclic: { op: string; args: unknown[] } = { op: "neg", args: [] };
    cyclic.args.push(cyclic);
    expect(validateComposition(composition("1", cyclic))).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "comp-schema-type" })],
    });
  });

  it("keeps the metadata depth limit independent of expression ASTs", () => {
    let metadata: unknown = 0;
    for (let i = 0; i <= COMPOSITION_LIMITS.maxMetadataDepth; i++)
      metadata = { note: metadata };
    expect(
      validateComposition({
        ...composition("1"),
        metadata: { note: metadata },
      }),
    ).toMatchObject({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "comp-metadata-depth" })],
    });
  });
});
