import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  prepareStoryPassageInput,
  readStoryPassage,
} from "../../packages/animation-engine/src/story-passage-io.ts";

describe("passage text preparation", () => {
  it("rejects measured overflow with the same pinned font as preview", async () => {
    const path = resolve(
      "benchmarks/fixtures/story-authoring/linked-comparison.json",
    );
    const baseline = await readStoryPassage(path);
    expect(baseline.beats).toHaveLength(3);
    const overflowing = structuredClone(baseline.plan);
    if (overflowing.schemaVersion !== "story-passage-2")
      throw new Error("Wrong authoring fixture");
    overflowing.beats[0]!.parameters.title = "Long comparison title ".repeat(
      80,
    );
    await expect(
      prepareStoryPassageInput(overflowing, path),
    ).rejects.toMatchObject({
      name: "PassageError",
      diagnostics: [
        expect.objectContaining({
          code: "text-overflow",
          beat: "compare",
          node: "reference",
        }),
      ],
    });
  });
});
