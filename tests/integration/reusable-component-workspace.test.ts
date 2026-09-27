import { mkdtemp, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { readStoryPassage } from "../../packages/animation-engine/src/story-passage-io.ts";
import { writeStoryWorkspace } from "../../packages/animation-engine/src/story-workspace.ts";
import { passageBeatKey } from "../../packages/animation-engine/src/passage-cache.ts";
import { indexStoryEvents } from "../../packages/renderer-core/src/story-event-index.ts";
it("retimes and relocates gated phases with pins, fitted states and masks", async () => {
  const { createPassageEditor } = await import(
    "../../packages/renderer-core/src/passage-editor.ts"
  );
  const root = await mkdtemp(join(tmpdir(), "timing-workspace-"));
  try {
    const original = await readStoryPassage(
      resolve(
        "benchmarks/fixtures/reusable-components/story-timing.passage.json",
      ),
    );
    const editor = createPassageEditor(original.plan, original.templates);
    const before = structuredClone(editor.passage);
    editor.edit((plan) => {
      plan.beats[2]!.cues[1]!.frame += 6;
    });
    for (const event of before.beats[2]!.events) {
      const edited = editor.passage.beats[2]!.events.find(
        (e) => e.id === event.id,
      )!;
      expect(edited.start).toBe(
        event.start + (event.id.startsWith("phase2__") ? 6 : 0),
      );
      expect(edited.end).toBe(
        event.end + (event.id.startsWith("phase2__") ? 6 : 0),
      );
    }
    expect(editor.undo().plan).toEqual(before.plan);
    editor.redo();
    editor.edit((plan) => {
      if (plan.schemaVersion !== "story-passage-2")
        throw new Error("v2 expected");
      delete plan.beats[2]!.bindings["phase2__lifetime-detail"];
      plan.beats[2]!.timing["phase2__lifetime-detail"] = {
        start: 78,
        end: 126,
      };
    });
    const edited = editor.passage;
    await writeStoryWorkspace(join(root, "package"), {
      ...original,
      ...edited,
    });
    await rename(join(root, "package"), join(root, "moved"));
    const restored = await readStoryPassage(join(root, "moved/workspace.json"));
    for (let i = 0; i < edited.beats.length; i++) {
      expect(restored.beats[i]!.scene.componentData).toEqual(
        edited.beats[i]!.scene.componentData,
      );
      expect(indexStoryEvents(restored.beats[i]!.scene)).toEqual(
        indexStoryEvents(edited.beats[i]!.scene),
      );
      expect(passageBeatKey(restored.beats[i]!.scene, "test")).toEqual(
        passageBeatKey(edited.beats[i]!.scene, "test"),
      );
    }
    expect(restored.frameCount).toBe(576);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
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

it("preserves state points and path windows through cue edits, undo/redo and relocation", async () => {
  const { createPassageEditor } = await import(
    "../../packages/renderer-core/src/passage-editor.ts"
  );
  const root = await mkdtemp(join(tmpdir(), "behavior-workspace-"));
  try {
    const original = await readStoryPassage(
      resolve(
        "benchmarks/fixtures/reusable-components/story-behaviors.passage.json",
      ),
    );
    const editor = createPassageEditor(original.plan, original.templates);
    const before = structuredClone(editor.passage.plan);
    editor.edit((plan) => {
      plan.beats[3]!.cues[0]!.frame = 96;
    });
    for (const id of ["behavior__caption-change", "behavior__image-change"])
      expect(
        editor.passage.beats[3]!.events.find((e) => e.id === id),
      ).toMatchObject({ start: 96, end: 96, kind: "cut" });
    expect(editor.undo().plan).toEqual(before);
    expect(
      editor
        .redo()
        .beats[3]!.events.find((e) => e.id === "behavior__caption-change")
        ?.start,
    ).toBe(96);
    expect(() =>
      editor.edit((plan) => {
        plan.beats[3]!.cues[0]!.frame = 192;
      }),
    ).toThrow();
    editor.edit((plan) => {
      if (plan.schemaVersion !== "story-passage-2")
        throw new Error("authoring plan expected");
      const beat = plan.beats[3]!;
      delete beat.bindings["behavior__caption-change"];
      beat.timing["behavior__caption-change"] = { start: 96, end: 96 };
    });
    const edited = editor.passage;
    await writeStoryWorkspace(join(root, "package"), {
      ...original,
      ...edited,
    });
    await rename(join(root, "package"), join(root, "moved"));
    const restored = await readStoryPassage(join(root, "moved/workspace.json"));
    expect(restored.frameCount).toBe(768);
    for (let i = 0; i < edited.beats.length; i++) {
      expect(restored.beats[i]!.scene.componentData).toEqual(
        edited.beats[i]!.scene.componentData,
      );
      expect(indexStoryEvents(restored.beats[i]!.scene)).toEqual(
        indexStoryEvents(edited.beats[i]!.scene),
      );
      expect(passageBeatKey(restored.beats[i]!.scene, "test")).toBe(
        passageBeatKey(edited.beats[i]!.scene, "test"),
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
