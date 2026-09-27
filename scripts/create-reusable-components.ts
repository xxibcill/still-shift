import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { format } from "prettier";
import {
  REUSABLE_EXAMPLES,
  ReusableDemoSchema,
} from "../packages/scene-contract/src/reusable-component-demo.ts";
import { buildReusableDemo } from "../packages/renderer-core/src/reusable-component-demo.ts";
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
      schemaVersion: "reusable-demo-1",
      mode,
      example: example.id,
      count: example.id === "stagger" ? 5 : 3,
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
console.log("Prepared 8 reusable examples in isolation, commerce and story.");
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
