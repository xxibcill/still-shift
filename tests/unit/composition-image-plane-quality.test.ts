import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  CompositionSchema,
  type Composition,
} from "@still-shift/scene-contract";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
import { compositionQualityFrame } from "../../packages/renderer-core/src/composition/quality-samples.ts";

function fixture(name: string): Composition {
  return CompositionSchema.parse(
    JSON.parse(
      readFileSync(`benchmarks/fixtures/composition/ce4d/${name}.json`, "utf8"),
    ),
  );
}
const frozen = (comp: Composition) =>
  analyzeCompositionQuality(comp).diagnostics.filter(
    (diagnostic) => diagnostic.code === "frozen-run",
  );

it("recognizes the supplied native depth animation with an unchanged layer transform", () => {
  const comp = fixture("native-depth"),
    before = JSON.stringify(comp);
  const first = compositionQualityFrame(comp, 0),
    last = compositionQualityFrame(comp, 89);
  expect(first.layers.get("photo")!.matrix).toEqual(
    last.layers.get("photo")!.matrix,
  );
  expect(first.signature).not.toBe(last.signature);
  expect(frozen(comp)).toEqual([]);
  expect(
    analyzeCompositionQuality(comp, {
      pixelChangedCounts: Array.from({ length: 90 }, (_, frame) =>
        frame ? 1000 : 0,
      ),
    }).diagnostics.some((diagnostic) => diagnostic.code === "frozen-run"),
  ).toBe(false);
  expect(JSON.stringify(comp)).toBe(before);
  expect(compositionQualityFrame(comp, 0)).toEqual(first);
});

it("recognizes an image-plane reveal and still reports its actual held tail", () => {
  const comp = fixture("linear-image-plane");
  expect(compositionQualityFrame(comp, 0).signature).not.toBe(
    compositionQualityFrame(comp, 16).signature,
  );
  expect(frozen(comp).map((diagnostic) => diagnostic.frames)).toEqual([
    [17, 89],
  ]);
  comp.frameCount = 17;
  expect(frozen(comp)).toEqual([]);
});

it.each(["held", "disabled", "guide", "transparent", "offscreen", "constant"])(
  "retains stillness detection for %s depth",
  (control) => {
    const comp = fixture("native-depth"),
      photo = comp.layers[0]!;
    if (photo.type !== "depth-image") throw new Error("Missing depth fixture");
    if (control === "held") photo.holdFrame = 0;
    if (control === "disabled") photo.enabled = false;
    if (control === "guide") photo.guide = true;
    if (control === "transparent") photo.transform!.opacity = 0;
    if (control === "offscreen") photo.transform!.position = [2000, 2000];
    if (control === "constant") photo.motion = { scale: 1, strength: 0 };
    expect(frozen(comp)).not.toEqual([]);
  },
);

it("samples expression-driven depth controls", () => {
  const comp = fixture("native-depth"),
    photo = comp.layers[0]!;
  if (photo.type !== "depth-image") throw new Error("Missing depth fixture");
  photo.motion = { scale: 1, strength: 0 };
  comp.expressions = { "photo.motion.strength": { source: "frame * 0.0003" } };
  expect(frozen(comp)).toEqual([]);
});

it("uses the evaluated local depth clock in a held precomposition", () => {
  const comp = fixture("native-depth"),
    photo = comp.layers[0]!;
  comp.precomps = [
    {
      id: "child",
      width: comp.width,
      height: comp.height,
      frameCount: comp.frameCount,
      layers: [photo],
    },
  ];
  comp.layers = [
    { id: "instance", type: "precomp", comp: "child", timeRemap: 0 },
  ];
  const first = compositionQualityFrame(comp, 0),
    last = compositionQualityFrame(comp, 89);
  expect(first.layers.get("instance/photo")!.state.depthMotion).toEqual(
    last.layers.get("instance/photo")!.state.depthMotion,
  );
  expect(first.signature).toBe(last.signature);
  expect(frozen(comp)).not.toEqual([]);
});
