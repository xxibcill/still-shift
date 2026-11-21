/**
 * CG4: grade.curves, grade.hue-curves and grade.tonal keep the composition
 * curve rules: 2–16 points with x = 0 and x = 1 endpoints, a fixed point count
 * when animated, strictly increasing x after drivers and expressions, plus
 * their own invariants (periodic hue curves, ordered tonal ranges).
 */
import { describe, expect, it } from "vitest";
import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";

const comp = (
  effect: string,
  params: unknown,
  extra: Partial<Composition> = {},
) =>
  ({
    schemaVersion: "composition-1",
    id: "cg4-rules",
    width: 32,
    height: 32,
    fps: 24,
    frameCount: 12,
    background: "#000000",
    assets: [],
    layers: [
      {
        id: "card",
        type: "solid",
        color: "#808080",
        size: [32, 32],
        effects: [{ id: "grade", effect, params }],
      },
    ],
    ...extra,
  }) as unknown as Composition;
const messages = (value: unknown) => {
  const result = validateComposition(value);
  return result.ok ? [] : result.diagnostics.map((d) => d.message);
};
const evaluateFails = (value: Composition, frame: number) => {
  try {
    evaluateComp(value, frame);
    return undefined;
  } catch (error) {
    return String((error as Error).message);
  }
};

describe("grade curve rules", () => {
  it("accepts animated curve points that keep their count and order", () => {
    const value = comp("grade.curves", {
      master: [
        [0, 0],
        {
          x: 0.5,
          y: {
            keys: [
              { frame: 0, value: 0.3 },
              { frame: 11, value: 0.7 },
            ],
          },
        },
        [1, 1],
      ],
    });
    expect(messages(value)).toEqual([]);
    for (const frame of [0, 5, 11])
      expect(evaluateFails(value, frame)).toBeUndefined();
  });
  it("rejects a keyed curve whose point count changes", () => {
    const value = comp("grade.curves", {
      red: {
        keys: [
          {
            frame: 0,
            value: [
              [0, 0],
              [1, 1],
            ],
          },
          {
            frame: 11,
            value: [
              [0, 0],
              [0.5, 0.6],
              [1, 1],
            ],
          },
        ],
      },
    });
    expect(messages(value).join("\n")).toMatch(
      /keep their control point count/,
    );
  });
  it("rejects endpoints away from x = 0 and x = 1 and more than 16 points", () => {
    // Rejected (the shared curve schema reports a static endpoint error as
    // its union's "Invalid input", as for color.curves).
    expect(
      messages(
        comp("grade.curves", {
          blue: [
            [0.1, 0],
            [1, 1],
          ],
        }),
      ),
    ).not.toEqual([]);
    const many = Array.from({ length: 17 }, (_, i) => [i / 16, i / 16]);
    expect(messages(comp("grade.hue-curves", { satVsSat: many }))).not.toEqual(
      [],
    );
  });
  it("rejects animated points that cross after evaluation, at the crossing frame", () => {
    const value = comp("grade.curves", {
      master: [
        [0, 0],
        {
          x: {
            keys: [
              { frame: 0, value: 0.2 },
              { frame: 11, value: 0.8 },
            ],
          },
          y: 0.5,
        },
        [0.6, 0.6],
        [1, 1],
      ],
    });
    expect(evaluateFails(value, 0)).toBeUndefined();
    expect(evaluateFails(value, 11)).toMatch(/strictly increasing/);
  });
  it("hue-indexed curves are periodic: their ends must share y", () => {
    expect(
      evaluateFails(
        comp("grade.hue-curves", {
          hueVsSat: [
            [0, 0.6],
            [0.5, 0.5],
            [1, 0.6],
          ],
        }),
        0,
      ),
    ).toBeUndefined();
    expect(
      evaluateFails(
        comp("grade.hue-curves", {
          hueVsSat: [
            [0, 0.6],
            [1, 0.5],
          ],
        }),
        0,
      ),
    ).toMatch(/periodic/);
    // Saturation and luma curves are not periodic.
    expect(
      evaluateFails(
        comp("grade.hue-curves", {
          satVsSat: [
            [0, 0.6],
            [1, 0.5],
          ],
        }),
        0,
      ),
    ).toBeUndefined();
  });
  it("tonal ranges stay ordered", () => {
    expect(
      evaluateFails(
        comp("grade.tonal", { shadowEnd: 0.7, highlightStart: 0.4 }),
        0,
      ),
    ).toMatch(/shadowEnd/);
  });
});
