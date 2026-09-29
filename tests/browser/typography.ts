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
      const headline = scene.nodes.find((node) => node.id === "headline");
      if (headline?.type !== "text") throw new Error("Missing headline");
      const glyph = {
        ...headline,
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
      const renderProbe = (
        node: typeof headline,
        animators: typeof scene.textAnimators,
        frame: number,
      ) => {
        const probeScene = {
          ...scene,
          nodes: [node],
          textEvents: [],
          textAnimators: animators,
        };
        const typography = prepareTypography(probeScene, fonts);
        const raster = typography.nodes.get(node.id)!.get(node.text)!;
        const preparedStrokeCount = raster.strokes.size;
        const surface = document.createElement("canvas");
        surface.width = 650;
        surface.height = 400;
        const context = surface.getContext("2d")!;
        context.translate(200, 160);
        drawTypography(
          context,
          node,
          { state: 0, reveal: 1 },
          typography,
          frame,
        );
        return {
          surface,
          layout: raster.layout,
          preparedStrokeCount,
          drawnStrokeCount: raster.strokes.size,
        };
      };
      const pixelDifference = (
        a: HTMLCanvasElement,
        b: HTMLCanvasElement,
        left: number,
        top: number,
        width: number,
        height: number,
      ) => {
        const first = a
          .getContext("2d")!
          .getImageData(left, top, width, height).data;
        const second = b
          .getContext("2d")!
          .getImageData(left, top, width, height).data;
        let changed = 0;
        for (let i = 0; i < first.length; i++)
          if (first[i] !== second[i]) changed++;
        return changed;
      };
      const blurNode = {
        ...glyph,
        id: "blur-probe",
        text: "O     O",
        spans: [{ id: "second", start: 6, end: 7 }],
      };
      const blurControl = renderProbe(blurNode, [], 0);
      const blurred = renderProbe(
        blurNode,
        [
          {
            node: blurNode.id,
            unit: "glyph",
            start: 0,
            end: 40,
            stagger: 0,
            span: "second",
            selector: { start: 0, end: 1 },
            from: { blur: 12 },
          },
        ],
        0,
      );
      const glyphDifference = (index: number) => {
        const ink = blurred.layout.clusters[index]!.ink!;
        return pixelDifference(
          blurControl.surface,
          blurred.surface,
          Math.floor(200 + ink.x - 8),
          Math.floor(160 + ink.y - 8),
          Math.ceil(ink.width + 16),
          Math.ceil(ink.height + 16),
        );
      };
      const settledBlurPixels = glyphDifference(0);
      const activeBlurPixels = glyphDifference(6);
      const outlineNode = { ...glyph, id: "outline-probe", text: "O" };
      const outlined = renderProbe(
        outlineNode,
        [
          {
            node: outlineNode.id,
            unit: "glyph",
            start: 0,
            end: 1,
            stagger: 0,
            selector: { start: 0, end: 1 },
            from: {},
            to: { strokeWidth: 10, stroke: "#b64032" },
          },
        ],
        1,
      );
      const reference = document.createElement("canvas");
      reference.width = 650;
      reference.height = 400;
      const referenceCtx = reference.getContext("2d")!;
      const { applyTextStyle } = await import(
        `/@fs/${root}/packages/renderer-core/src/typography-style.ts`
      );
      const run = outlined.layout.runs[0]!;
      referenceCtx.translate(200, 160);
      applyTextStyle(referenceCtx, run.style, fonts);
      referenceCtx.strokeStyle = "#b64032";
      referenceCtx.lineWidth = 10;
      referenceCtx.lineJoin = "round";
      referenceCtx.strokeText(run.text, run.x, run.baseline);
      referenceCtx.fillStyle = outlineNode.color;
      referenceCtx.fillText(run.text, run.x, run.baseline);
      const outlinePixels = pixelDifference(
        outlined.surface,
        reference,
        0,
        0,
        reference.width,
        reference.height,
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
      const releaseNode = { ...glyph, id: "release-handoff" };
      const releaseHandoff = measureTypographyPixels(
        {
          ...scene,
          nodes: [releaseNode],
          textEvents: [],
          textAnimators: [
            {
              node: releaseNode.id,
              unit: "glyph",
              start: 0,
              end: 10,
              stagger: 0,
              selector: { start: 0, end: 1 },
              from: {},
              to: { offset: [20, 0] },
              weight: [
                { frame: 20, value: 1 },
                { frame: 40, value: 0 },
              ],
            },
          ],
        },
        images,
      ).find(
        (sample: { handoffPixels?: number }) =>
          sample.handoffPixels !== undefined,
      )?.frame;
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
      const contrastScene = {
        ...bubbleScene,
        background: "#ffffff",
        nodes: [
          {
            ...bubble,
            color: "#ffffff",
            container: {
              ...bubble.container,
              fill: "#000000",
              stroke: "#000000",
            },
          },
        ],
      };
      const containerContrast = Math.min(
        ...measureTypographyPixels(contrastScene, images)
          .filter(
            (sample: { contrast?: number }) => sample.contrast !== undefined,
          )
          .map((sample: { contrast: number }) => sample.contrast),
      );
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
        containerContrast,
        containerSafeArea,
        invisibleContrast,
        releaseHandoff,
        centroidDrift,
        settledBlurPixels,
        activeBlurPixels,
        outlinePixels,
        preparedStrokeCount: outlined.preparedStrokeCount,
        drawnStrokeCount: outlined.drawnStrokeCount,
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
  assert.equal(result.settledBlurPixels, 0, "Blur altered a settled glyph");
  assert.ok(
    result.activeBlurPixels > 0,
    "Blur did not affect its selected glyph",
  );
  assert.ok(
    result.outlinePixels < 500,
    `Stroke differs from a true glyph outline by ${result.outlinePixels} channels`,
  );
  assert.ok(
    result.preparedStrokeCount > 0,
    "Stroke variants were not prepared",
  );
  assert.equal(
    result.drawnStrokeCount,
    result.preparedStrokeCount,
    "Drawing added a stroke raster after preparation",
  );
  assert.deepEqual(
    result.containerFill,
    [255, 0, 255],
    "Typography text container is not drawn",
  );
  assert.ok(
    result.containerContrast > 12,
    `Container contrast used the wrong backdrop: ${result.containerContrast}`,
  );
  assert.match(
    result.containerSafeArea,
    /outside the output safe area/,
    "Container tail is not part of the typography safe area",
  );
  assert.ok(result.backward, "Backward seek changes pixels");
  assert.ok(result.handoff, "Animator handoff changes pixels");
  assert.equal(
    result.releaseHandoff,
    40,
    "Release handoff checked before settling",
  );
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
