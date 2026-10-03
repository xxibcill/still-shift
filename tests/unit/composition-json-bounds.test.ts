import { describe, expect, it } from "vitest";
import {
  COMPOSITION_LIMITS,
  validateComposition,
} from "@still-shift/scene-contract";

const cases = [
  {
    field: "expression AST",
    path: 'expressions["node.x"].ast',
    offset: 0,
    // A bounded AST then has to match its parsed source.
    next: "comp-expression-mismatch",
    input: (payload: unknown) => ({
      expressions: { "node.x": { source: "value", ast: payload } },
    }),
  },
  {
    field: "effect parameters",
    path: "layers[0].effects[0].params",
    offset: 0,
    input: (payload: unknown) => ({
      layers: [
        {
          id: "node",
          type: "null",
          effects: [{ id: "glow", effect: "glow", params: payload }],
        },
      ],
    }),
  },
  {
    field: "shape contents",
    path: "layers[0].contents",
    offset: 1,
    input: (payload: unknown) => ({
      layers: [{ id: "node", type: "shape", contents: [payload] }],
    }),
  },
];
const nested = (depth: number, objects = false) => {
  let value: unknown = 0;
  for (let i = 0; i < depth; i++) value = objects ? { child: value } : [value];
  return value;
};
const composition = (input: object) => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 100,
  height: 100,
  fps: 24,
  frameCount: 24,
  assets: [],
  layers: [{ id: "node", type: "null" }],
  ...input,
});

for (const entry of cases) {
  describe(entry.field, () => {
    it.each([false, true])(
      "diagnoses deep JSON without throwing (objects=%s)",
      (objects) => {
        const result = validateComposition(
          composition(entry.input({ note: nested(4_000, objects) })),
        );
        expect(result.ok).toBe(false);
        expect(result.diagnostics).toContainEqual(
          expect.objectContaining({
            code: "comp-json-depth",
            path: expect.stringContaining(entry.path),
          }),
        );
      },
    );
    it("rejects cycles but allows shared objects through to feature validation", () => {
      const cyclic: Record<string, unknown> = {};
      cyclic.self = cyclic;
      const result = validateComposition(composition(entry.input(cyclic)));
      expect(result).toMatchObject({
        ok: false,
        diagnostics: [
          expect.objectContaining({
            code: "comp-schema-type",
            path: expect.stringContaining(entry.path),
          }),
        ],
      });
      const shared = { value: [1, 2] };
      expect(
        validateComposition(
          composition(entry.input({ first: shared, second: shared })),
        ),
      ).toMatchObject({
        ok: false,
        diagnostics: [
          expect.objectContaining({
            code: "next" in entry ? entry.next : "comp-feature-unavailable",
          }),
        ],
      });
    });
    it("accepts the depth boundary and rejects the next container", () => {
      const depth = COMPOSITION_LIMITS.maxJsonDepth - entry.offset;
      expect(
        validateComposition(composition(entry.input({ note: nested(depth) }))),
      ).toMatchObject({
        ok: false,
        diagnostics: [
          expect.objectContaining({
            code: "next" in entry ? entry.next : "comp-feature-unavailable",
          }),
        ],
      });
      expect(
        validateComposition(
          composition(entry.input({ note: nested(depth + 1) })),
        ),
      ).toMatchObject({
        ok: false,
        diagnostics: [expect.objectContaining({ code: "comp-json-depth" })],
      });
    });
    it("counts the complete payload at the byte boundary", () => {
      const overhead = JSON.stringify({ text: "" }).length + entry.offset * 2;
      const payload = {
        text: "x".repeat(COMPOSITION_LIMITS.maxJsonBytes - overhead),
      };
      expect(
        validateComposition(composition(entry.input(payload))),
      ).toMatchObject({
        ok: false,
        diagnostics: [
          expect.objectContaining({
            code: "next" in entry ? entry.next : "comp-feature-unavailable",
          }),
        ],
      });
      payload.text += "x";
      expect(
        validateComposition(composition(entry.input(payload))),
      ).toMatchObject({
        ok: false,
        diagnostics: [
          expect.objectContaining({ code: "comp-json-size", path: entry.path }),
        ],
      });
    });
    it("counts UTF-8 and escaped JSON bytes", () => {
      for (const text of ["😀".repeat(20_000), "\n".repeat(40_000)]) {
        expect(
          validateComposition(composition(entry.input({ text }))),
        ).toMatchObject({
          ok: false,
          diagnostics: [expect.objectContaining({ code: "comp-json-size" })],
        });
      }
    });
    it("bounds expanding shared references before recursive parsing", () => {
      let payload: unknown = 0;
      for (let i = 0; i < 30; i++)
        payload = { first: payload, second: payload };
      expect(
        validateComposition(composition(entry.input(payload))),
      ).toMatchObject({
        ok: false,
        diagnostics: [expect.objectContaining({ code: "comp-json-size" })],
      });
    });
    it.each([BigInt(1), undefined, Infinity, () => 0])(
      "diagnoses non-JSON payload values",
      (value) => {
        expect(
          validateComposition(composition(entry.input({ value }))),
        ).toMatchObject({
          ok: false,
          diagnostics: [expect.objectContaining({ code: "comp-schema-type" })],
        });
      },
    );
  });
}

it("publishes opaque JSON limits", () => {
  expect(COMPOSITION_LIMITS).toMatchObject({
    maxJsonBytes: 65_536,
    maxJsonDepth: 64,
  });
});
