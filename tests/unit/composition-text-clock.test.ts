import { describe, expect, it } from "vitest";
import type { TextAnimator } from "@still-shift/scene-contract";
import { typographyClock } from "../../packages/renderer-core/src/composition/render/text-clock.ts";

const animation: TextAnimator = {
  node: "label",
  unit: "glyph",
  start: 0,
  end: 30,
  stagger: 2,
  selector: { start: 0, end: 1 },
  from: { opacity: 0 },
};

describe("prepared typography cache clock", () => {
  it("keeps fractional times and backward seeks distinct until animation settles", () => {
    const clock = typographyClock({ id: "label" }, [animation], []);
    expect([0, 8.25, 8.75, 30.5, 31, 80, 8.25].map(clock)).toEqual([
      0, 8.25, 8.75, 30.5, 31, 31, 8.25,
    ]);
  });
  it("includes later layer weights, corrections, transitions and decorations", () => {
    const clock = typographyClock(
      {
        id: "label",
        transitions: [
          {
            kind: "crossfade",
            fromState: 0,
            toState: 1,
            window: { start: 40, end: 60 },
          },
        ],
        decorations: [
          {
            kind: "underline",
            color: "#000000",
            reveal: [
              { frame: 80, value: 0 },
              { frame: 120, value: 1 },
            ],
          },
        ],
      },
      [
        {
          ...animation,
          weight: [
            { frame: 0, value: 0 },
            { frame: 100, value: 1 },
          ],
        },
      ],
      [{ end: 150 }],
    );
    expect(clock(140)).toBe(140);
    expect(clock(200)).toBe(151);
  });
  it("keeps signals and animated selectors live beyond the animator end", () => {
    for (const animated of [
      { ...animation, signal: "pulse" },
      {
        ...animation,
        selector: { ...animation.selector, offset: { signal: "cursor" } },
      },
      {
        ...animation,
        selectors: [
          {
            start: 0,
            end: 1,
            offset: [
              { frame: 0, value: 0 },
              { frame: 120, value: 1 },
            ],
          },
        ],
      },
    ]) {
      const clock = typographyClock({ id: "label" }, [animated], []);
      expect(clock(200.5)).toBe(200.5);
    }
  });
  it("ignores other nodes and constant decorations", () => {
    const clock = typographyClock(
      { id: "other", decorations: [{ kind: "underline", color: "#000000" }] },
      [{ ...animation, signal: "pulse" }],
      [],
    );
    expect([0, 60, 120].map(clock)).toEqual([0, 0, 0]);
  });
});
