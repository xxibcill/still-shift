import { mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import {
  prepareStoryPassageInput,
  readStoryPassage,
} from "../../packages/animation-engine/src/story-passage-io.ts";
import { writeStoryWorkspace } from "../../packages/animation-engine/src/story-workspace.ts";
import { passageBeatKey } from "../../packages/animation-engine/src/passage-cache.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";
import { evaluatePreparedNode } from "../../packages/renderer-core/src/prepared-scene.ts";

it("relocates action presets and hand attachments without changing rendered samples or audio timing", async () => {
  const root = await mkdtemp(join(tmpdir(), "still-shift-actions-"));
  try {
    const passage = await readStoryPassage(
      resolve("benchmarks/fixtures/parcel-story/actions/parcel-story.json"),
    );
    await writeStoryWorkspace(
      join(root, "source"),
      passage,
      resolve("assets/parcel-story/narration-v001/narration.wav"),
    );
    await rename(join(root, "source"), join(root, "moved"));
    const restored = await readStoryPassage(join(root, "moved/workspace.json"));
    expect(
      restored.beats.map((b) => passageBeatKey(b.scene, "actions")),
    ).toEqual(passage.beats.map((b) => passageBeatKey(b.scene, "actions")));
    expect(restored.plan.beats[2]).toMatchObject({
      actions: expect.arrayContaining([
        expect.objectContaining({ kind: "walk", poses: ["step-a", "step-b"] }),
      ]),
      propTracks: {
        parcel: {
          changes: [
            expect.objectContaining({
              hold: { actor: "neighbor", anchor: "hand", offset: [0, 0] },
            }),
          ],
        },
      },
    });
    for (const index of [0, 1, 2]) {
      const original = compileStoryScene(passage.beats[index]!.scene),
        moved = compileStoryScene(restored.beats[index]!.scene);
      for (const frame of [0, 16, 25, 34, 80, 180]) {
        expect(
          evaluatePreparedNode(
            moved,
            moved.nodes.find((n) => n.id === "parcel")!,
            frame,
          ),
        ).toEqual(
          evaluatePreparedNode(
            original,
            original.nodes.find((n) => n.id === "parcel")!,
            frame,
          ),
        );
      }
    }
    expect(restored.audio!.sounds[0]!.start).toBe(243);
    expect(restored.frameCount).toBe(864);
    expect(
      restored.beats[2]!.scene.nodes.find((n) => n.id === "neighbor"),
    ).toMatchObject({
      states: expect.arrayContaining([
        expect.objectContaining({
          pose: "receive",
          anchors: { hand: [0.165, 0.336] },
        }),
      ]),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

const planPath = resolve(
  "benchmarks/fixtures/parcel-story/acting/parcel-story.json",
);
it("packages and relocates real pose artwork, registration, containers and cue tracks together", async () => {
  const root = await mkdtemp(join(tmpdir(), "still-shift-acting-"));
  try {
    const passage = await readStoryPassage(planPath);
    await writeStoryWorkspace(
      join(root, "source"),
      passage,
      resolve("assets/parcel-story/narration-v001/narration.wav"),
    );
    await rename(join(root, "source"), join(root, "moved"));
    const restored = await readStoryPassage(join(root, "moved/workspace.json"));
    expect(
      restored.beats.map((b) => passageBeatKey(b.scene, "acting")),
    ).toEqual(passage.beats.map((b) => passageBeatKey(b.scene, "acting")));
    expect(restored.plan.beats[0]).toMatchObject({
      poseTracks: { nora: { initial: "idle" } },
      textContainers: { caption: { kind: "thought" } },
    });
    const actor = restored.beats[0]!.scene.nodes.find((n) => n.id === "nora")!;
    expect(actor).toMatchObject({
      states: expect.arrayContaining([
        expect.objectContaining({
          pose: "inspect",
          registration: { anchor: [0.5731, 0.9574] },
        }),
      ]),
    });
    expect(restored.frameCount).toBe(864);
    expect(restored.audio!.sounds[0]!.start).toBe(243);
    const pose = restored.beats[0]!.scene.assets.find(
      (a) => a.id === "nora-inspect",
    )!;
    expect((await readFile(pose.path)).subarray(1, 4).toString()).toBe("PNG");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

it("rejects a container tail crossing the safe inset using the pinned export font", async () => {
  const passage = await readStoryPassage(planPath);
  const plan = structuredClone(passage.plan);
  if (plan.schemaVersion !== "story-passage-2")
    throw new Error("Expected authoring plan");
  plan.beats[0]!.textContainers!.title = {
    kind: "speech",
    fill: "#FFF8E7",
    stroke: "#514638",
    strokeWidth: 2,
    padding: 20,
    radius: 18,
    tail: { side: "top", position: 0.3, length: 65 },
  };
  await expect(prepareStoryPassageInput(plan, planPath)).rejects.toMatchObject({
    diagnostics: [
      expect.objectContaining({
        code: "text-outside-safe-area",
        node: "title",
      }),
    ],
  });
}, 30_000);
