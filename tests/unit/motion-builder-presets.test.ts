import { expect, it } from "vitest";
import {
  comp,
  CompositionBuilder,
  solid,
  text,
  layer,
  presets,
  seq,
  par,
  at,
  builderSource,
  BuilderError,
} from "@still-shift/motion";
import {
  STORY_MOTION_PRESETS,
  TEXT_INTENT_PRESETS,
  compileTextEvents,
  type CompositionAsset,
  PreparedNodeSchema,
} from "@still-shift/scene-contract";
import { evaluateComp, sampleCurve } from "@still-shift/renderer-core";
const options = { width: 160, height: 96, fps: 24 as const, frames: 96 };
const font: CompositionAsset = {
  id: "font",
  type: "font",
  path: "font.ttf",
  sha256: `sha256:${"0".repeat(64)}`,
  weight: "400",
};
it("ports every motion recipe to staged native keys and a carrier", () => {
  const names = ["settle", "press", "recoil", "handoff", "land"] as const;
  for (const name of names) {
    const result = comp(options, (c) => {
      const box = c.add(
        solid("box", { size: [8, 8], color: "#FFFFFF" }).at(10, 20),
      );
      c.timeline(
        at(12, presets[name](box, 40, { amount: 8 })),
        presets.breathe(box, 80, { amount: 2, property: "x" }),
      );
    });
    expect(result.signals![0]!.keys).toEqual(
      STORY_MOTION_PRESETS[name].keys.map(([time, value], i, all) => ({
        frame: 12 + Math.round(40 * time),
        value: value * 8,
        easing: "in-out-cubic",
        ...(i > 0 && i < all.length - 1 ? { smooth: true } : {}),
      })),
    );
    expect(result.drivers![0]).toMatchObject({
      target: "box.transform.position.y",
      blend: "add",
      layer: STORY_MOTION_PRESETS[name].layer,
    });
    expect(result.periodic![0]).toMatchObject({
      target: "box.transform.position.x",
      layer: "carrier",
      oscillate: { period: 80, amplitude: 2 },
    });
    const source = builderSource(result, "drivers[0]");
    expect(source?.file).toContain("motion-builder-presets.test.ts");
    const expected = result.signals![0]!.keys.map(({ frame, ...key }) => ({
      ...key,
      time: frame,
    }));
    for (const frame of [0, 12, 26, 40, 52, 95])
      expect(
        evaluateComp(result, frame).layers[0]!.transform.position[1],
      ).toBeCloseTo(20 + sampleCurve(expected, frame), 10);
  }
});
it("keeps overlapping staged drivers' separate call sites and repeated finish stable", () => {
  const c = new CompositionBuilder(options),
    box = c.add(solid("box", { size: [8, 8], color: "#FFFFFF" }));
  c.timeline(presets.press(box, 30));
  c.timeline(presets.recoil(box, 30));
  const first = c.finish(),
    second = c.finish();
  expect(second).toEqual(first);
  expect(builderSource(first, "drivers[0]")?.line).not.toBe(
    builderSource(first, "drivers[1]")?.line,
  );
});
it("draws interim native path providers without discarding their other channels", () => {
  const result = comp(options, (c) => {
    const path = c.add(
      layer({
        id: "path",
        type: "provider",
        provider: "story.path@1.0.0",
        params: {
          node: {
            id: "path",
            type: "path",
            points: [
              [0, 0],
              [40, 0],
            ],
            stroke: "#FFFFFF",
            lineWidth: 2,
          },
          samples: Array.from({ length: 96 }, () => ({
            gap: 0.1,
            pulse: 0.5,
            reveal: 1,
          })),
        },
      }),
    );
    c.timeline(at(8, presets.drawOn(path, 24)));
  });
  const path = result.layers[0]!;
  if (path.type !== "provider") throw new Error("Expected provider");
  const samples = path.params!.samples as {
    gap: number;
    reveal: number;
    pulse: number;
  }[];
  expect(samples[0]).toMatchObject({ gap: 0.1, pulse: 0.5, reveal: 0 });
  expect(samples[20]!.reveal).toBe(0.5);
  expect(samples[32]!.reveal).toBe(1);
  expect(() =>
    comp(options, (c) => {
      const box = c.add(solid("box", { size: [8, 8], color: "#FFFFFF" }));
      c.timeline(presets.drawOn(box));
    }),
  ).toThrow("comp-builder-preset");
});
it("ports all eight text intents, including release, correction and qualifier hierarchy", () => {
  expect(TEXT_INTENT_PRESETS).toHaveLength(8);
  const result = comp({ ...options, assets: [font] }, (c) => {
    const claim = c.add(
      text("Twenty", {
        id: "claim",
        fontAsset: "font",
        fontSize: 24,
        states: ["Twenty", "Thirty"],
      }).at(4, 8),
    );
    const qualifier = c.add(
      text("Example only", { id: "note", fontAsset: "font", fontSize: 12 }).at(
        4,
        60,
      ),
    );
    const count = c.add(
      text("20", {
        id: "count",
        fontAsset: "font",
        states: ["20", "30"],
        style: "numbers",
      }),
    );
    c.textStyle("numbers", { fontAsset: "font", figures: "tabular" });
    c.timeline(
      par(
        seq(
          presets.text.reveal(claim, 6),
          presets.text.emphasize(claim, 6, {
            manner: "color",
            color: "#FF0000",
          }),
          presets.text.release(claim, 6),
          presets.text.correct(claim, 6, { replacement: "Thirty" }),
          presets.text.redact(claim, 6),
          presets.text.retype(claim, 6),
        ),
        at(40, presets.text.qualify(qualifier, 12, { target: claim })),
        presets.text.count(count, 12),
      ),
    );
  });
  const claim = result.layers.find((n) => n.id === "claim")!;
  if (claim.type !== "text") throw new Error("Expected text");
  expect(claim.decorations?.map((d) => d.kind)).toEqual(["strike", "strike"]);
  expect(claim.corrections).toEqual([
    { replacement: "Thirty", start: 18, end: 24 },
  ]);
  expect(claim.transitions?.[0]).toMatchObject({
    kind: "retype",
    window: { start: 30, end: 36 },
    caret: true,
  });
  expect(result.textAnimators?.find((a) => a.start === 6)?.weight).toEqual([
    { frame: 12, value: 1 },
    { frame: 18, value: 0, easing: "in-out-cubic" },
  ]);
  expect(result.textAnimators?.filter((a) => a.start === 40)).toHaveLength(2);
  const count = result.layers.find((n) => n.id === "count")!;
  if (count.type !== "text") throw new Error("Expected text");
  expect(count.transitions?.[0]?.kind).toBe("count");
});
it("matches the shared story text compiler and retains located errors", () => {
  const node = PreparedNodeSchema.parse({
    id: "title",
    type: "text",
    text: "A claim",
    fontAsset: "font",
    fontSize: 24,
    color: "#000000",
  });
  const expected = compileTextEvents({
    typography: "type-1" as const,
    fps: 24,
    frameCount: 96,
    nodes: [node],
    textEvents: [
      {
        node: "title",
        verb: "emphasize" as const,
        at: 8,
        duration: 12,
        manner: "highlight" as const,
      },
    ],
  });
  const result = comp({ ...options, assets: [font] }, (c) => {
    const title = c.add(
      text("A claim", { id: "title", fontAsset: "font", fontSize: 24 }),
    );
    c.timeline(
      at(8, presets.text.emphasize(title, 12, { manner: "highlight" })),
    );
  });
  expect(
    (
      result.layers[0] as Extract<
        (typeof result.layers)[number],
        { type: "text" }
      >
    ).decorations,
  ).toEqual(
    (expected.nodes[0] as Extract<typeof node, { type: "text" }>).decorations,
  );
  expect(() =>
    comp({ ...options, assets: [font] }, (c) => {
      const title = c.add(
        text("Not numeric", { fontAsset: "font", states: ["A", "B"] }),
      );
      c.timeline(presets.text.count(title, 12));
    }),
  ).toThrow(/motion-builder-presets.test.ts:.*text-count-figures/);
  expect(() =>
    comp(options, (c) => {
      const box = c.add(solid("box", { size: [8, 8], color: "#FFFFFF" }));
      c.timeline(presets.press(box, 0));
    }),
  ).toThrow("comp-builder-duration");
});

it("attributes an invalid text preset to its call after a valid preset", () => {
  const c = new CompositionBuilder({ ...options, assets: [font] });
  const first = c.add(text("Valid reveal", { fontAsset: "font" }));
  const second = c.add(
    text("Invalid count", { fontAsset: "font", states: ["A", "B"] }),
  );
  const reveal = presets.text.reveal(first, 12);
  const count = presets.text.count(second, 12);
  if (count.kind !== "clip") throw new Error("Expected preset clip");
  c.timeline(par(reveal, count));
  try {
    c.finish();
    expect.fail("Invalid count must fail");
  } catch (error) {
    expect(error).toBeInstanceOf(BuilderError);
    expect((error as BuilderError).message).toContain("text-count-figures");
    expect((error as BuilderError).location).toEqual(count.value.location);
  }
});

it("locates the second identical text event when it conflicts with the first", () => {
  const c = new CompositionBuilder({ ...options, assets: [font] });
  c.textStyle("numbers", { fontAsset: "font", figures: "tabular" });
  const title = c.add(
    text("20", { fontAsset: "font", states: ["20", "30"], style: "numbers" }),
  );
  const first = presets.text.count(title, 12);
  const second = presets.text.count(title, 12);
  if (second.kind !== "clip") throw new Error("Expected preset clip");
  c.timeline(par(first, second));
  try {
    c.finish();
    expect.fail("Overlapping counts must fail");
  } catch (error) {
    expect(error).toBeInstanceOf(BuilderError);
    expect((error as BuilderError).message).toContain(
      "text-transition-conflict",
    );
    expect((error as BuilderError).location).toEqual(second.value.location);
  }
});
