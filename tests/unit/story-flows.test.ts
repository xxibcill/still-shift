import { describe, expect, it } from "vitest";
import {
  compileStoryFlows,
  sampleStoryFlow,
  pinchWarp,
} from "../../packages/renderer-core/src/story-flows.ts";
import { StoryFlowSchema } from "../../packages/scene-contract/src/story-motion.ts";
import { PreparedNodeSchema } from "../../packages/scene-contract/src/prepared.ts";

const flow = StoryFlowSchema.parse({
  id: "supply",
  path: "route",
  direction: 1,
  count: 4,
  shape: "dot",
  size: 7,
  color: "#B47A2A",
  colorStates: [{ frame: 72, color: "#59664D" }],
  window: { start: 0, end: 192 },
  speed: [
    { frame: 0, pxPerFrame: 2 },
    { frame: 72, pxPerFrame: 4, easing: "linear" },
  ],
});
const path = PreparedNodeSchema.parse({
  id: "route",
  type: "path",
  points: [
    [0, 0],
    [800, 0],
  ],
  stroke: "#000000",
  lineWidth: 10,
});

describe("story currents", () => {
  it("integrates speed once and keeps count and seeking deterministic", () => {
    if (path.type !== "path") throw new Error("Not a path");
    const compiled = compileStoryFlows([flow], 192)[0]!;
    expect(compiled.offsets[1]).toBe(2);
    const state = { reveal: 1, gap: 0 };
    const direct = sampleStoryFlow(compiled, path, state, 100, 192);
    for (let f = 0; f <= 100; f++)
      expect(sampleStoryFlow(compiled, path, state, f, 192)).toHaveLength(4);
    expect(sampleStoryFlow(compiled, path, state, 100, 192)).toEqual(direct);
    expect(direct.every((t) => t.color === "#59664D")).toBe(true);
    expect(
      sampleStoryFlow(compiled, path, state, 71, 192).every(
        (t) => t.color === "#B47A2A",
      ),
    ).toBe(true);
  });
  it("gates tokens by the visible path and an opened fracture", () => {
    if (path.type !== "path") throw new Error("Not a path");
    const compiled = compileStoryFlows([flow], 192)[0]!;
    const tokens = sampleStoryFlow(
      compiled,
      path,
      { reveal: 0.8, gap: 1 },
      80,
      192,
    );
    expect(
      tokens.every(
        (t) =>
          t.progress <= 0.8 &&
          Math.abs(t.progress - path.gapAt) > path.gapSize / 2,
      ),
    ).toBe(true);
  });
  it("warps monotonically and preserves path endpoints", () => {
    const table = pinchWarp({ at: 0.5, strength: 0.7, width: 0.2 });
    expect(table[0]).toBe(0);
    expect(table.at(-1)).toBe(1);
    for (let i = 1; i < table.length; i++)
      expect(table[i]).toBeGreaterThan(table[i - 1]!);
    expect(table[256]! - table[255]!).toBeLessThan(table[20]! - table[19]!);
  });
});
