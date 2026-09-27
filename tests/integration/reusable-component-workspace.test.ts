import { mkdtemp, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { readStoryPassage } from "../../packages/animation-engine/src/story-passage-io.ts";
import { writeStoryWorkspace } from "../../packages/animation-engine/src/story-workspace.ts";
import { passageBeatKey } from "../../packages/animation-engine/src/passage-cache.ts";
import { indexStoryEvents } from "../../packages/renderer-core/src/story-event-index.ts";
it("packages and relocates editable instances, annotations and numeric bindings", async () => {
  const root = await mkdtemp(join(tmpdir(), "shared-workspace-"));
  try {
    const original = await readStoryPassage(
      resolve(
        "benchmarks/fixtures/reusable-components/story-components.passage.json",
      ),
    );
    await writeStoryWorkspace(join(root, "package"), original);
    await rename(join(root, "package"), join(root, "moved"));
    const restored = await readStoryPassage(join(root, "moved/workspace.json"));
    expect(restored.frameCount).toBe(576);
    for (let i = 0; i < original.beats.length; i++) {
      expect(restored.beats[i]!.scene.componentData).toEqual(
        original.beats[i]!.scene.componentData,
      );
      expect(indexStoryEvents(restored.beats[i]!.scene)).toEqual(
        indexStoryEvents(original.beats[i]!.scene),
      );
      expect(passageBeatKey(restored.beats[i]!.scene, "test")).toEqual(
        passageBeatKey(original.beats[i]!.scene, "test"),
      );
    }
    expect(
      indexStoryEvents(restored.beats[0]!.scene).some(
        (e) => e.id === "marker2__rise",
      ),
    ).toBe(true);
    expect(
      indexStoryEvents(restored.beats[2]!.scene).find(
        (e) => e.id === "quantity__amount",
      )?.nodes,
    ).toEqual(["quantity__number", "quantity__bar"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
