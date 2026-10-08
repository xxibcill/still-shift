import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Browser } from "playwright";
import {
  StorySceneSchema,
  type Composition,
} from "@still-shift/scene-contract";
import type { CompiledStoryPassage } from "../../packages/renderer-core/src/story-passage.ts";
import type * as PassagePreview from "../../apps/lab/src/passage-preview.ts";

/** Exercise actual passage preparation beyond Chromium's 16-context limit. */
export async function assertBoundedPassagePreviews(
  browser: Browser,
  baseUrl: string,
) {
  const templatePath = resolve(
    "benchmarks/fixtures/story-authoring/comparison-template.json",
  );
  const template = JSON.parse(await readFile(templatePath, "utf8"));
  const asset = template.scene.assets[0];
  const scene = StorySceneSchema.parse({
    schemaVersion: "story-scene-1",
    title: "Context budget",
    fps: 24,
    width: 1920,
    height: 1080,
    frameCount: 2,
    motionModel: "curves-1",
    assets: [{ ...asset, path: resolve(dirname(templatePath), asset.path) }],
    nodes: [
      { id: "panel", type: "rect", width: 100, height: 100, fill: "#ff0000" },
    ],
    recipe: { preset: "generic" },
  });
  const beats = Array.from({ length: 20 }, (_, index) => ({
    id: `beat-${index}`,
    scene,
    handoff: { mode: "cut", camera: "reset", subjects: [] },
    focus: ["panel"],
    cues: [],
  }));
  const colors = ["#ff0000", "#00ff00", "#0000ff"];
  const overrides: Record<string, Composition> = Object.fromEntries(
    beats.map((beat, index) => [
      beat.id,
      {
        schemaVersion: "composition-1",
        id: beat.id,
        width: scene.width,
        height: scene.height,
        fps: scene.fps,
        frameCount: scene.frameCount,
        assets: [],
        layers: [
          {
            id: "panel",
            type: "solid",
            size: [100, 100],
            color: colors[index % colors.length]!,
            transform: { anchor: [0, 0] },
          },
        ],
        metadata: { passage: { subjectLayers: { panel: "panel" } } },
      } satisfies Composition,
    ]),
  );
  const page = await browser.newPage();
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Too many active WebGL contexts"))
      warnings.push(message.text());
  });
  try {
    await page.addInitScript("window.__name = (fn) => fn;");
    await page.route("**/passage-preview-budget.html*", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<html><body></body></html>",
      }),
    );
    await page.goto(
      baseUrl +
        "passage-preview-budget.html?renderer=composition&backend=webgl2",
    );
    const report = await page.evaluate(
      async ({ beatsJson, overridesJson, asset }) => {
        const beats = JSON.parse(beatsJson) as CompiledStoryPassage["beats"];
        const overrides = JSON.parse(overridesJson) as Record<
          string,
          Composition
        >;
        const moduleUrl = "/src/passage-preview.ts";
        const { preparePreviews } = (await import(
          moduleUrl
        )) as typeof PassagePreview;
        const canvases = new Set<HTMLCanvasElement>();
        const original = HTMLCanvasElement.prototype.getContext;
        Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
          configurable: true,
          value: function (this: HTMLCanvasElement, ...args: unknown[]) {
            const context = Reflect.apply(original, this, args);
            if (args[0] === "webgl2" && context) canvases.add(this);
            return context;
          },
        });
        const active = () =>
          [...canvases].filter(
            (canvas) => !canvas.getContext("webgl2")!.isContextLost(),
          ).length;
        const source = { beats } as unknown as CompiledStoryPassage;
        const expected = [
          [255, 0, 0, 255],
          [0, 255, 0, 255],
          [0, 0, 255, 255],
        ];
        const check = (
          ready: Awaited<ReturnType<typeof preparePreviews>>,
          indices: number[],
        ) => {
          for (const index of indices) {
            ready[index]!.preview.renderFrame(1);
            ready[index]!.preview.renderFrame(0);
            const pixel = Array.from(
              ready[index]!.canvas.getContext("2d")!.getImageData(0, 0, 1, 1)
                .data,
            );
            if (
              JSON.stringify(pixel) !==
              JSON.stringify(expected[index % expected.length])
            )
              throw new Error(`Beat ${index} rendered ${pixel}`);
          }
        };
        const forward = beats.map((_, index) => index);
        let ready = await preparePreviews(source, overrides);
        let peakActive = active();
        check(ready, [...forward, ...forward.toReversed()]);
        if (active() !== 2)
          throw new Error("Passage must use two WebGL contexts");
        for (let edit = 0; edit < 8; edit++) {
          const replacement = await preparePreviews(source, overrides);
          peakActive = Math.max(peakActive, active());
          check(ready, [0, 19, 0]);
          check(replacement, [19, 18, 19]);
          ready.forEach((beat) => beat.preview.dispose());
          await new Promise((resolve) => setTimeout(resolve, 25));
          if (active() !== 2)
            throw new Error("Replaced passage contexts were not released");
          ready = replacement;
        }
        const broken = structuredClone(overrides);
        broken["beat-10"]!.assets = [
          { ...asset, type: "image", path: asset.path + ".missing" },
        ];
        let failed = false;
        try {
          await preparePreviews(source, broken);
        } catch {
          failed = true;
        }
        if (!failed)
          throw new Error(
            "Missing picture asset should fail during preparation",
          );
        await new Promise((resolve) => setTimeout(resolve, 25));
        if (active() !== 2)
          throw new Error("Failed preparation leaked contexts");
        check(ready, [...forward.toReversed(), ...forward]);
        ready.forEach((beat) => beat.preview.dispose());
        await new Promise((resolve) => setTimeout(resolve, 25));
        return {
          beats: beats.length,
          edits: 8,
          peakActive,
          remaining: active(),
          contextsCreated: canvases.size,
        };
      },
      {
        beatsJson: JSON.stringify(beats),
        overridesJson: JSON.stringify(overrides),
        asset: scene.assets[0]!,
      },
    );
    assert.equal(report.beats, 20);
    assert.equal(report.peakActive, 4);
    assert.equal(report.remaining, 0);
    assert.ok(report.contextsCreated > 16);
    assert.deepEqual(warnings, []);
    console.log(
      `Bounded WebGL passage previews: ${JSON.stringify(report)}; all beat pixels, backward seeks, overlapping edits and failed-preparation cleanup pass.`,
    );
  } finally {
    await page.close();
  }
}
