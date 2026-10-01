import { describe, expect, it } from "vitest";
import {
  CompositionSchema,
  validateComposition,
} from "@still-shift/scene-contract";

const composition = () => ({
  schemaVersion: "composition-1",
  id: "main",
  width: 100,
  height: 100,
  fps: 30,
  frameCount: 30,
  assets: [],
  layers: [],
});

describe("composition structural limits before semantic traversal", () => {
  it("returns diagnostics for an oversized precomp chain without overflowing", () => {
    const count = 8_000;
    const doc = {
      ...composition(),
      precomps: Array.from({ length: count }, (_, i) => ({
        id: `p${i}`,
        width: 100,
        height: 100,
        frameCount: 30,
        layers:
          i + 1 < count
            ? [{ id: "child", type: "precomp", comp: `p${i + 1}` }]
            : [],
      })),
    };
    expect(validateComposition(doc)).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({ code: "comp-limit", path: "precomps" }),
      ],
    });
    expect(CompositionSchema.safeParse(doc).success).toBe(false);
  });

  it("returns diagnostics for an oversized parent chain without traversing it", () => {
    const doc = {
      ...composition(),
      layers: Array.from({ length: 8_000 }, (_, i) => ({
        id: `layer${i}`,
        type: "null",
        ...(i ? { parent: `layer${i - 1}` } : {}),
      })),
    };
    expect(validateComposition(doc)).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({ code: "comp-limit", path: "layers" }),
      ],
    });
  });
});
