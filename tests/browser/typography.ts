import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { StorySceneSchema } from "../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../packages/renderer-core/src/story-scene.ts";

const root = resolve("."),
  output = resolve(
    process.env.TYPOGRAPHY_OUTPUT ?? "/tmp/still-shift-typography",
  );
await mkdir(output, { recursive: true });
const fontPath = resolve("assets/story-motion/fonts/plex-sans-semibold.ttf");
const fontBytes = await readFile(fontPath);
const fixture = StorySceneSchema.parse({
  schemaVersion: "story-scene-1",
  title: "Typography acceptance",
  width: 1920,
  height: 1080,
  fps: 30,
  frameCount: 121,
  background: "#f4f1e8",
  assets: [
    {
      id: "unused",
      path: "unused.svg",
      sha256: `sha256:${"0".repeat(64)}`,
      width: 1,
      height: 1,
    },
  ],
  fonts: [
    {
      id: "body",
      path: fontPath,
      sha256: `sha256:${createHash("sha256").update(fontBytes).digest("hex")}`,
      weight: "600",
    },
  ],
  typography: "type-1",
  motionModel: "curves-1",
  authoringVersion: "1",
  textStyles: {
    display: { fontAsset: "body", size: 96, tracking: -15 },
    body: { fontAsset: "body", size: 52 },
    count: { fontAsset: "body", size: 96, figures: "tabular" },
  },
  nodes: [
    {
      id: "headline",
      type: "text",
      text: "A record supports categories, not every detail.",
      x: 160,
      y: 120,
      fontSize: 96,
      color: "#292827",
      textRole: "heading",
      style: "display",
      anchor: "cap",
      wrap: "balance",
      textLayout: {
        width: 1400,
        height: 300,
        lineHeight: 1.2,
        overflow: "error",
      },
      spans: [{ id: "qualification", start: 30, end: 46, color: "#a4362f" }],
      decorations: [
        {
          span: "qualification",
          kind: "underline",
          color: "#a4362f",
          lineStyle: "brush",
          reveal: [
            { frame: 42, value: 0 },
            { frame: 60, value: 1 },
          ],
        },
      ],
    },
    {
      id: "qualifier",
      type: "text",
      text: "Not a recovered pantry",
      x: 160,
      y: 450,
      fontSize: 52,
      color: "#292827",
      textRole: "qualification",
      style: "body",
      wrap: "pretty",
      textLayout: {
        width: 460,
        height: 180,
        lineHeight: 1.4,
        overflow: "error",
      },
    },
    {
      id: "number",
      type: "text",
      text: "12",
      states: ["12", "1,280"],
      x: 1000,
      y: 500,
      fontSize: 96,
      color: "#292827",
      textRole: "label",
      style: "count",
      transition: { kind: "count", window: { start: 30, end: 90 } },
    },
    {
      id: "correction",
      type: "text",
      text: "Supported categories",
      states: ["Supported categories", "Exact details"],
      x: 160,
      y: 780,
      fontSize: 52,
      color: "#292827",
      textRole: "body",
      style: "body",
      transition: { kind: "crossfade", window: { start: 65, end: 100 } },
    },
  ],
  textAnimators: [
    {
      node: "headline",
      unit: "glyph",
      start: 0,
      end: 40,
      stagger: 0,
      selector: { start: 0, end: 1, order: "center-out" },
      from: { offset: [0, 100], opacity: 0, scale: 0.7, tracking: 25 },
      anchor: "glyph",
      mask: "line",
      excludeSpaces: true,
    },
  ],
  recipe: { preset: "generic" },
});
await writeFile(
  resolve(output, "fixture.json"),
  JSON.stringify(fixture, null, 2),
);
const server = await createServer({
  root,
  configFile: false,
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (fn) => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  const scene = compileStoryScene(fixture);
  const result = await page.evaluate(
    async ({ scene, fontPath, root }) => {
      const { loadPreparedFonts } = await import(
        `/@fs/${root}/packages/renderer-core/src/prepared-fonts.ts`
      );
      const { createIllustratedPreview } = await import(
        `/@fs/${root}/packages/renderer-core/src/illustrated-renderer.ts`
      );
      const fonts = await loadPreparedFonts(scene, () => `/@fs/${fontPath}`);
      const canvas = document.createElement("canvas"),
        images = Object.assign(new Map(), { fonts });
      const preview = createIllustratedPreview(canvas, scene, images);
      const frames = [0, 10, 25, 40, 41, 60, 75, 90, 100, 101, 120];
      const captures = frames.map((frame) => {
        preview.renderFrame(frame);
        return { frame, png: canvas.toDataURL() };
      });
      const backward = [...frames].reverse().every((frame) => {
        preview.renderFrame(frame);
        return (
          canvas.toDataURL() === captures.find((c) => c.frame === frame)!.png
        );
      });
      const isolated = {
        ...scene,
        nodes: [scene.nodes[0]],
        textEvents: [],
        textAnimators: scene.textAnimators,
      };
      const probe = document.createElement("canvas"),
        animator = createIllustratedPreview(probe, isolated, images);
      animator.renderFrame(40);
      const end = probe.toDataURL();
      animator.renderFrame(41);
      const handoff = end === probe.toDataURL();
      const layouts = [...preview.typography.nodes.entries()].map(
        ([id, states]: [
          string,
          Map<string, { layout: { lines: { text: string }[]; width: number } }>,
        ]) => ({
          id,
          states: [...states.values()].map((r) => ({
            lines: r.layout.lines.map((l) => l.text),
            width: r.layout.width,
          })),
        }),
      );
      const { prepareTypography, drawTypography } = await import(
        `/@fs/${root}/packages/renderer-core/src/typography-renderer.ts`
      );
      const glyph = {
        ...scene.nodes[0],
        id: "pivot",
        text: "O",
        style: "display",
        spans: undefined,
        textLayout: undefined,
        decorations: undefined,
      };
      const pivotScene = {
        ...scene,
        nodes: [glyph],
        textAnimators: [
          {
            node: "pivot",
            unit: "glyph",
            start: 0,
            end: 40,
            stagger: 0,
            anchor: "glyph",
            selector: { start: 0, end: 1 },
            from: { scale: 0.25 },
          },
        ],
      };
      const prepared = prepareTypography(pivotScene, fonts);
      const pivot = document.createElement("canvas");
      pivot.width = 600;
      pivot.height = 400;
      const ctx = pivot.getContext("2d")!;
      const centroids = [0, 10, 20, 30, 40].map((frame) => {
        ctx.resetTransform();
        ctx.clearRect(0, 0, pivot.width, pivot.height);
        ctx.translate(250, 150);
        drawTypography(ctx, glyph, { state: 0, reveal: 1 }, prepared, frame);
        const pixels = ctx.getImageData(0, 0, pivot.width, pivot.height).data;
        let x = 0,
          y = 0,
          total = 0;
        for (let i = 3; i < pixels.length; i += 4) {
          const alpha = pixels[i]!;
          total += alpha;
          x += (((i - 3) / 4) % pivot.width) * alpha;
          y += Math.floor((i - 3) / 4 / pivot.width) * alpha;
        }
        return { x: x / total, y: y / total };
      });
      const centroidDrift = Math.max(
        ...centroids.map((c) =>
          Math.hypot(c.x - centroids.at(-1)!.x, c.y - centroids.at(-1)!.y),
        ),
      );
      const { measureTypographyPixels } = await import(
        `/@fs/${root}/packages/renderer-core/src/typography-pixels.ts`
      );
      const invisible = {
        ...scene,
        nodes: [{ ...glyph, color: scene.background }],
        textEvents: [],
        textAnimators: [],
        tracks: {},
      };
      const invisibleContrast = Math.min(
        ...measureTypographyPixels(invisible, images)
          .filter(
            (sample: { contrast?: number }) => sample.contrast !== undefined,
          )
          .map((sample: { contrast: number }) => sample.contrast),
      );
      // Text containers must render and be validated on the typography path too.
      const { validateTypographySafeArea } = await import(
        `/@fs/${root}/packages/renderer-core/src/typography-safe-area.ts`
      );
      const bubble = {
        ...glyph,
        id: "bubble",
        text: "Wrong door?",
        textRole: "label",
        style: "body",
        textLayout: {
          width: 600,
          height: 120,
          lineHeight: 1.2,
          overflow: "error",
        },
        container: {
          kind: "speech",
          fill: "#ff00ff",
          stroke: "#514638",
          strokeWidth: 2,
          padding: 24,
          radius: 18,
          tail: { side: "bottom", position: 0.3, length: 28 },
        },
      };
      const bubbleScene = {
        ...scene,
        nodes: [bubble],
        textEvents: [],
        textAnimators: [],
      };
      const bubblePrepared = prepareTypography(bubbleScene, fonts);
      const bubbleCanvas = document.createElement("canvas");
      bubbleCanvas.width = 900;
      bubbleCanvas.height = 400;
      const bubbleCtx = bubbleCanvas.getContext("2d")!;
      bubbleCtx.translate(100, 100);
      drawTypography(
        bubbleCtx,
        bubble,
        { state: 0, reveal: 1 },
        bubblePrepared,
        0,
      );
      const layout = bubblePrepared.nodes.get("bubble").get(bubble.text).layout;
      const padding = bubbleCtx.getImageData(
        100 + layout.lines[0].x - 12,
        100 + layout.top + layout.height / 2,
        1,
        1,
      ).data;
      const containerFill = [padding[0], padding[1], padding[2]];
      // The text alone ends 10 px inside the frame; only padding and tail cross it.
      const textInsideY = 1080 - (layout.top + layout.height) - 10;
      let containerSafeArea = "accepted";
      validateTypographySafeArea(
        {
          ...bubbleScene,
          nodes: [{ ...bubble, y: textInsideY, container: undefined }],
        },
        bubblePrepared,
      );
      try {
        validateTypographySafeArea(
          { ...bubbleScene, nodes: [{ ...bubble, y: textInsideY }] },
          bubblePrepared,
        );
      } catch (error) {
        containerSafeArea = String(error);
      }
      return {
        containerFill,
        containerSafeArea,
        invisibleContrast,
        centroidDrift,
        captures,
        backward,
        handoff,
        layouts,
        fontVariations:
          "variationSettings" in new FontFace("probe", new ArrayBuffer(0)),
      };
    },
    { scene, fontPath, root },
  );
  assert.ok(
    result.centroidDrift <= 0.5,
    `Glyph pivot drifts ${result.centroidDrift} px`,
  );
  assert.deepEqual(
    result.containerFill,
    [255, 0, 255],
    "Typography text container is not drawn",
  );
  assert.match(
    result.containerSafeArea,
    /outside the output safe area/,
    "Container tail is not part of the typography safe area",
  );
  assert.ok(result.backward, "Backward seek changes pixels");
  assert.ok(result.handoff, "Animator handoff changes pixels");
  const count = result.layouts.find((l) => l.id === "number")!;
  assert.equal(
    new Set(count.states.map((s) => s.width)).size,
    1,
    "Counter width jitters",
  );
  for (const capture of result.captures)
    await writeFile(
      resolve(output, `${capture.frame}.png`),
      Buffer.from(capture.png.split(",")[1]!, "base64"),
    );
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(
      { ...result, captures: result.captures.map((c) => c.frame) },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      centroidDrift: result.centroidDrift,
      backward: result.backward,
      handoff: result.handoff,
      fontVariations: result.fontVariations,
      output,
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
