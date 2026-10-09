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
  it("holds an explicit constant outline after its start, including reverse seeks", () => {
    const clock = typographyClock(
      { id: "label" },
      [
        {
          ...animation,
          stagger: 0,
          from: { strokeWidth: 1, stroke: "#113355" },
          to: { stroke: "#113355", strokeWidth: 1 },
        },
      ],
      [],
    );
    expect([0, 1, 2, 8.25, 80, 0, -2, -0.25].map(clock)).toEqual([
      0, 0, 0, 0, 0, 0, -1, -0.25,
    ]);
  });
  it("keeps a constant destination's later start gate distinct from its pre-roll", () => {
    const clock = typographyClock(
      { id: "label" },
      [
        {
          ...animation,
          start: 30,
          end: 60,
          from: { strokeWidth: 1 },
          to: { strokeWidth: 1 },
        },
      ],
      [],
    );
    expect([0, 29, 29.5, 30, 30.5, 31, 100, 0].map(clock)).toEqual([
      29, 29, 29.5, 30, 30, 30, 30, 29,
    ]);
  });
  it("keeps selector and layer-weight changes live with a constant pose", () => {
    for (const extra of [
      {
        weight: [
          { frame: 0, value: 0 },
          { frame: 100, value: 1 },
        ],
      },
      {
        selector: {
          start: 0,
          end: 1,
          offset: [
            { frame: 0, value: 0 },
            { frame: 100, value: 1 },
          ],
        },
      },
    ]) {
      const clock = typographyClock(
        { id: "label" },
        [
          {
            ...animation,
            ...extra,
            from: { strokeWidth: 1 },
            to: { strokeWidth: 1 },
          },
        ],
        [],
      );
      expect([20.25, 80.5, 120].map(clock)).toEqual([20.25, 80.5, 101]);
    }
  });
  it("keeps a reveal mask live even when its pose endpoints are identical", () => {
    const clock = typographyClock(
      { id: "label" },
      [
        {
          ...animation,
          mask: "word",
          from: { strokeWidth: 1 },
          to: { strokeWidth: 1 },
        },
      ],
      [],
    );
    expect([2.5, 10.25, 20.5].map(clock)).toEqual([2.5, 10.25, 20.5]);
  });
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
      [{ start: 130, end: 150 }],
    );
    expect(clock(140)).toBe(140);
    expect(clock(200)).toBe(151);
  });
  it("keeps unresolved signals live beyond the animator end", () => {
    for (const animated of [
      { ...animation, signal: "pulse" },
      {
        ...animation,
        selector: { ...animation.selector, offset: { signal: "cursor" } },
      },
    ]) {
      const clock = typographyClock({ id: "label" }, [animated], []);
      expect(clock(200.5)).toBe(200.5);
    }
  });
  it("tracks selector curves beyond the animator and reuses their settled state", () => {
    const clock = typographyClock(
      { id: "label" },
      [
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
      ],
      [],
    );
    expect([80.25, 120, 160, 200].map(clock)).toEqual([80.25, 120, 121, 121]);
  });
  it("reuses finite signal plateaus while preserving held animator start gates", () => {
    const clock = typographyClock(
      { id: "label" },
      [
        {
          ...animation,
          start: 80,
          end: 140,
          signal: "margin",
          to: { tracking: 20 },
        },
      ],
      [],
      [
        {
          id: "margin",
          keys: [
            { frame: 0, value: 0 },
            { frame: 60, value: 1 },
            { frame: 100, value: 1 },
            { frame: 140, value: 0 },
          ],
        },
      ],
    );
    expect([30.5, 65, 75, 80, 85, 95, 120, 160, 65].map(clock)).toEqual([
      30.5, 61, 61, 80, 81, 81, 120, 141, 61,
    ]);
  });
  it("keeps additive signals live even when their keys are constant", () => {
    const clock = typographyClock(
      { id: "label" },
      [
        {
          ...animation,
          selector: { start: 0, end: 1, offset: { signal: "pulse" } },
        },
      ],
      [],
      [
        {
          id: "pulse",
          keys: [{ frame: 0, value: 1 }],
          add: [{ pulse: { at: 100, half: 10, depth: 1 } }],
        },
      ],
    );
    expect(clock(200.5)).toBe(200.5);
  });
  it("holds coverage between discrete keys without freezing key changes", () => {
    const clock = typographyClock(
      { id: "label" },
      [
        {
          ...animation,
          signal: "steps",
        },
      ],
      [],
      [
        {
          id: "steps",
          keys: [
            { frame: 0, value: 0 },
            { frame: 60, value: 1, interpolation: "hold" },
            { frame: 120, value: 0, interpolation: "hold" },
          ],
        },
      ],
    );
    expect([0, 30, 60, 80, 100, 120, 180].map(clock)).toEqual([
      59, 59, 60, 61, 61, 120, 121,
    ]);
  });
  it("keeps equal-value curves with temporal handles active", () => {
    const clock = typographyClock(
      { id: "label" },
      [
        {
          ...animation,
          signal: "curve",
        },
      ],
      [],
      [
        {
          id: "curve",
          keys: [
            { frame: 0, value: 1, out: { speed: 0.1, ease: 0.3 } },
            { frame: 120, value: 1, in: { speed: -0.1, ease: 0.3 } },
          ],
        },
      ],
    );
    expect([30.25, 90.5, 200].map(clock)).toEqual([30.25, 90.5, 121]);
  });
  it("ignores other nodes and constant decorations", () => {
    const clock = typographyClock(
      { id: "other", decorations: [{ kind: "underline", color: "#000000" }] },
      [{ ...animation, signal: "pulse" }],
      [],
    );
    expect([0, 60, 120].map(clock)).toEqual([0, 0, 0]);
  });
  it("reuses each idle gap without confusing separate animation phases", () => {
    const clock = typographyClock(
      {
        id: "label",
        decorations: [
          {
            kind: "underline",
            color: "#000000",
            reveal: [
              { frame: 80, value: 0 },
              { frame: 100, value: 1 },
            ],
          },
        ],
      },
      [{ ...animation, start: 20, end: 40 }],
      [],
    );
    expect([0, 10, 20.5, 40.5, 50, 70, 85.25, 120, 50].map(clock)).toEqual([
      19, 19, 20.5, 40.5, 41, 41, 85.25, 101, 41,
    ]);
  });
  it("does not freeze inside overlapping animation windows", () => {
    const clock = typographyClock(
      { id: "label" },
      [
        { ...animation, start: 10, end: 30 },
        { ...animation, start: 20, end: 50 },
      ],
      [],
    );
    expect([0, 15, 30, 40, 50, 80].map(clock)).toEqual([9, 15, 30, 40, 50, 51]);
  });
});
