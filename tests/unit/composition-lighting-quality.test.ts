import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  CompositionSchema,
  type Composition,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
import { compositionQualityFrame } from "../../packages/renderer-core/src/composition/quality-samples.ts";

const fixture = () =>
  CompositionSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          "../../benchmarks/fixtures/composition/zipper-qa/ambient-intensity-only.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
const frozen = (doc: Composition) =>
  analyzeCompositionQuality(doc).diagnostics.some(
    (d) => d.code === "frozen-run",
  );
const lamp = (doc: Composition) =>
  doc.layers.find(
    (layer): layer is Extract<CompositionLayer, { type: "light" }> =>
      layer.id === "ambient" && layer.type === "light",
  )!;
const plate = (doc: Composition) =>
  doc.layers.find((layer) => layer.id === "plate")!;

it("accepts the exact ambient-intensity-only repro without changing geometry or input", () => {
  const doc = fixture(),
    before = JSON.stringify(doc);
  const a = compositionQualityFrame(doc, 0),
    b = compositionQualityFrame(doc, 23);
  expect(a.layers.get("plate")!.matrix).toEqual(b.layers.get("plate")!.matrix);
  expect(a.signature).not.toBe(b.signature);
  expect(frozen(doc)).toBe(false);
  expect(analyzeCompositionQuality(doc).status).toBe("passed");
  expect(JSON.stringify(doc)).toBe(before);
  expect(compositionQualityFrame(doc, 0)).toEqual(a);
});

it.each(["disabled", "guide", "unlit", "offscreen", "transparent"])(
  "retains frozen-state detection for %s receiver/light controls",
  (control) => {
    const doc = fixture();
    if (control === "disabled") lamp(doc).enabled = false;
    if (control === "guide") lamp(doc).guide = true;
    if (control === "unlit") plate(doc).receivesLight = false;
    if (control === "offscreen") plate(doc).transform!.position = [2000, 90, 0];
    if (control === "transparent") plate(doc).transform!.opacity = 0;
    expect(frozen(doc)).toBe(true);
  },
);

it.each(["ambient", "point", "spot"] as const)(
  "samples relevant %s illumination changes",
  (type) => {
    const doc = fixture();
    lamp(doc).lightType = type;
    lamp(doc).intensity = 0.5;
    if (type === "ambient")
      lamp(doc).color = {
        keys: [
          { frame: 0, value: "#444444" },
          { frame: 23, value: "#ffffff" },
        ],
      };
    else
      lamp(doc).transform = {
        position: {
          keys: [
            { frame: 0, value: [80, 90, -240] },
            { frame: 23, value: [240, 90, -240] },
          ],
        },
      };
    expect(frozen(doc)).toBe(false);
  },
);

it.each(["ambient", "zero", "point-rotation"])(
  "excludes irrelevant light transforms: %s",
  (control) => {
    const doc = fixture();
    lamp(doc).intensity = control === "zero" ? 0 : 0.5;
    if (control !== "ambient") lamp(doc).lightType = "point";
    lamp(doc).transform =
      control === "point-rotation"
        ? {
            rotationY: {
              keys: [
                { frame: 0, value: 0 },
                { frame: 23, value: 90 },
              ],
            },
          }
        : {
            position: {
              keys: [
                { frame: 0, value: [80, 90, -240] },
                { frame: 23, value: [240, 90, -240] },
              ],
            },
          };
    expect(frozen(doc)).toBe(true);
  },
);

it("keeps unrelated root lights out of child receiver signatures", () => {
  const doc = fixture();
  const receiver = plate(doc);
  doc.layers = [lamp(doc), { id: "instance", type: "precomp", comp: "child" }];
  doc.precomps = [
    {
      id: "child",
      width: 320,
      height: 180,
      frameCount: 24,
      layers: [receiver],
    },
  ];
  expect(frozen(doc)).toBe(true);
  doc.precomps[0]!.layers.unshift({ ...lamp(doc), id: "child-light" });
  expect(frozen(doc)).toBe(false);
});

it("includes spotlight aim and cone controls in receiver state", () => {
  for (const control of ["aim", "cone"]) {
    const doc = fixture();
    const light = lamp(doc);
    light.lightType = "spot";
    light.intensity = 0.5;
    light.transform = { position: [160, 90, -240] };
    if (control === "aim")
      light.transform.rotationY = {
        keys: [
          { frame: 0, value: 0 },
          { frame: 23, value: 30 },
        ],
      };
    else
      light.outerCone = {
        keys: [
          { frame: 0, value: 40 },
          { frame: 23, value: 80 },
        ],
      };
    expect(frozen(doc)).toBe(false);
  }
});

it("uses settled expression-driven light controls", () => {
  const doc = fixture();
  lamp(doc).intensity = 0.05;
  doc.expressions = { "ambient.intensity": { source: "0.05 + frame * 0.03" } };
  expect(frozen(doc)).toBe(false);
});

it("keeps scope illumination animated when only the receiver content clock is held", () => {
  const doc = fixture();
  plate(doc).holdFrame = 0;
  expect(compositionQualityFrame(doc, 0).layers.get("plate")!.state.time).toBe(
    0,
  );
  expect(compositionQualityFrame(doc, 23).layers.get("plate")!.state.time).toBe(
    0,
  );
  expect(frozen(doc)).toBe(false);
});
