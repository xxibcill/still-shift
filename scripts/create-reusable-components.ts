import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { format } from "prettier";
import {
  REUSABLE_EXAMPLES,
  reusableDemoVersion,
  ReusableDemoSchema,
} from "../packages/scene-contract/src/reusable-component-demo.ts";
import { buildReusableDemo } from "../packages/renderer-core/src/reusable-component-demo.ts";
import { indexStoryEvents } from "../packages/renderer-core/src/story-event-index.ts";
const directory = resolve("benchmarks/fixtures/reusable-components");
const writeJson = async (name: string, value: unknown) =>
  writeFile(
    join(directory, name),
    await format(JSON.stringify(value), { parser: "json", printWidth: 80 }),
  );
await mkdir(directory, { recursive: true });
for (const mode of ["commerce", "story", "isolated"] as const)
  for (const example of REUSABLE_EXAMPLES) {
    const demo = ReusableDemoSchema.parse({
      schemaVersion: reusableDemoVersion(example.id),
      mode,
      example: example.id,
      ...(reusableDemoVersion(example.id) === "reusable-demo-1"
        ? { count: example.id === "stagger" ? 5 : 3 }
        : {}),
    });
    const scene = buildReusableDemo(demo),
      name = mode + "-" + example.id;
    await writeJson(name + ".json", scene);
    await writeJson(name + ".demo.json", demo);
    if (mode === "story" && example.id === "instances")
      await writeJson("story-instances.template.json", {
        schemaVersion: "story-template-1",
        id: "shared-markers",
        scene,
        slots: {
          middleLabel: { kind: "text", node: "marker2__label" },
          middleRise: { kind: "timing", event: "marker2__rise" },
        },
      });
  }
console.log(
  `Prepared ${REUSABLE_EXAMPLES.length} reusable examples in isolation, commerce and story.`,
);
await writeJson("story-components.passage.json", {
  schemaVersion: "story-passage-2",
  id: "shared-components",
  title: "Shared components · engineering examples",
  styleProfile: { schemaVersion: "story-style-1", id: "neutral-test" },
  contentPolicy: "general",
  fps: 24,
  sourceStartFrame: 0,
  beats: ["instances", "leader", "value"].map((example) => ({
    id: example,
    template:
      "story-" +
      example +
      (example === "instances" ? ".template.json" : ".json"),
    purpose: "compare",
    takeaway: "Demonstrate reusable " + example,
    focus: ["house-a", "house-b"],
    intensity: "develop",
    frameCount: 192,
    cues: [],
    parameters:
      example === "instances"
        ? { middleLabel: "Middle marker", middleRise: { start: 33, end: 51 } }
        : {},
    bindings: {},
  })),
});

const behaviorScene = buildReusableDemo(
  ReusableDemoSchema.parse({
    schemaVersion: "reusable-demo-2",
    example: "supply",
    mode: "story",
  }),
);
await writeJson("story-supply.template.json", {
  schemaVersion: "story-template-1",
  id: "supply-route",
  scene: behaviorScene,
  slots: {
    change: { kind: "timing", event: "behavior__caption-change" },
    journey: { kind: "timing", event: "behavior__journey" },
  },
});
await writeJson("story-behaviors.passage.json", {
  schemaVersion: "story-passage-2",
  id: "shared-behaviors",
  title: "Shared behavior engineering examples",
  styleProfile: { schemaVersion: "story-style-1", id: "neutral-test" },
  contentPolicy: "general",
  fps: 24,
  sourceStartFrame: 0,
  beats: ["transform", "state", "travel", "supply"].map((example) => ({
    id: example,
    template:
      "story-" + example + (example === "supply" ? ".template.json" : ".json"),
    purpose: "compare",
    takeaway: "Demonstrate " + example,
    focus: ["house-a", "house-b"],
    intensity: "develop",
    frameCount: 192,
    cues:
      example === "supply"
        ? [
            {
              id: "change",
              frame: 80,
              phrase: "Route changes",
              events: ["behavior__image-change", "behavior__caption-change"],
            },
          ]
        : [],
    parameters:
      example === "supply" ? { journey: { start: 30, end: 168 } } : {},
    bindings:
      example === "supply"
        ? {
            "behavior__caption-change": {
              anchor: { type: "cue", id: "change" },
              offset: 0,
              duration: 0,
            },
            "behavior__image-change": {
              anchor: { type: "cue", id: "change" },
              offset: 0,
              duration: 0,
            },
          }
        : {},
  })),
});

const phasedScene = buildReusableDemo(
  ReusableDemoSchema.parse({
    schemaVersion: "reusable-demo-3",
    example: "supply-sequence",
    mode: "story",
  }),
);
if (phasedScene.schemaVersion !== "story-scene-1")
  throw new Error("Story expected");
await writeJson("story-supply-sequence.template.json", {
  schemaVersion: "story-template-1",
  id: "supply-phases",
  scene: phasedScene,
  slots: { middleWindow: { kind: "timing", event: "phase2__lifetime-detail" } },
});
const phases = [12, 72, 120].map((frame, i) => ({
  id: "phase" + (i + 1),
  frame,
  phrase: "Supply phase " + (i + 1),
  events: indexStoryEvents(phasedScene)
    .filter((e) => e.id.startsWith("phase" + (i + 1) + "__"))
    .map((e) => e.id),
}));
const phaseBindings = Object.fromEntries(
  phases.flatMap((cue) =>
    indexStoryEvents(phasedScene)
      .filter((e) => cue.events.includes(e.id))
      .map((event) => [
        event.id,
        {
          anchor: { type: "cue", id: cue.id },
          offset: event.start - cue.frame,
          duration: event.end - event.start,
        },
      ]),
  ),
);
await writeJson("story-timing.passage.json", {
  schemaVersion: "story-passage-2",
  id: "shared-timing",
  title: "Shared timing and relationships",
  styleProfile: { schemaVersion: "story-style-1", id: "neutral-test" },
  contentPolicy: "general",
  fps: 24,
  sourceStartFrame: 0,
  beats: ["visibility", "text-fit", "supply-sequence"].map((example) => ({
    id: example,
    template:
      "story-" +
      example +
      (example === "supply-sequence" ? ".template.json" : ".json"),
    purpose: "compare",
    takeaway: "Demonstrate " + example,
    focus: ["house-a", "house-b"],
    intensity: "develop",
    frameCount: 192,
    cues: example === "supply-sequence" ? phases : [],
    parameters: {},
    bindings: example === "supply-sequence" ? phaseBindings : {},
  })),
});
