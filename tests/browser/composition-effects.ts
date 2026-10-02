import type * as PixelTests from "../helpers/composition-pixel-reference.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { renderComposition } from "@still-shift/animation-engine";
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import type * as Render from "../../packages/renderer-core/src/index.ts";

const server = await createServer({
  root: resolve(import.meta.dirname, "../.."),
  configFile: false,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const browser = await launchRenderBrowser();
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (fn) => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  const results = await page.evaluate(async () => {
    const url = "/packages/renderer-core/src/index.ts";
    const m = (await import(url)) as typeof Render;
    const canvas = () => {
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 96;
      return c;
    };
    const resources = {
      images: new Map<string, CanvasImageSource>(),
      fonts: new Map(),
    };
    const tile = canvas(),
      tc = tile.getContext("2d")!;
    tc.fillStyle = "#bb667799";
    tc.fillRect(0, 0, 60, 60);
    tc.fillStyle = "#eec344";
    tc.fillRect(30, 20, 70, 60);
    resources.images.set("tile", tile);
    const providers = [
      {
        id: "test.circle@1.0.0",
        prepare: () => (ctx: CanvasRenderingContext2D) => {
          ctx.fillStyle = "#ccb822";
          ctx.beginPath();
          ctx.arc(24, 24, 24, 0, Math.PI * 2);
          ctx.fill();
        },
      },
    ];
    const result: { id: string; frames: number; maxDelta: number }[] = [];
    const base = (): Composition => ({
      schemaVersion: "composition-1",
      id: "blur",
      width: 128,
      height: 96,
      fps: 30,
      frameCount: 20,
      background: "#26313b",
      assets: [],
      layers: [],
    });
    const solid = (
      id: string,
      x = 25,
      y = 20,
    ): Extract<CompositionLayer, { type: "solid" }> => ({
      id,
      type: "solid",
      size: [50, 45],
      color: "#cf704a",
      transform: { anchor: [0, 0], position: [x, y] },
    });
    // The reference paints unfiltered content, then explicitly blurs it and applies
    // the final coverage. It does not use effect evaluation or graph effect ops.
    function content(comp: Composition) {
      const c = canvas(),
        ctx = c.getContext("2d")!;
      const text = m.prepareCompositionText(comp, resources.fonts, ctx);
      const backend = m.createCanvas2dBackend({
        images: {
          images: resources.images,
          sizes: new Map([["tile", [128, 96] as const]]),
        },
        drawText: text.draw,
        drawProvider: m.prepareCompositionProviders(comp, resources, providers),
      });
      return { c, backend, target: backend.wrap(c, ctx), text };
    }
    const pixelUrl = "/tests/helpers/composition-pixel-reference.ts";
    const { pixelStacks, pixelReference } = (await import(
      pixelUrl
    )) as typeof PixelTests;
    const kinds = [
      "solid",
      "image",
      "text",
      "provider",
      "group",
      "precomp",
      "collapsed",
      "masked",
      "offscreen",
      "group-offscreen",
    ];
    for (const treatment of ["gaussian", ...Object.keys(pixelStacks)])
      for (const kind of kinds) {
        const comp = base();
        let root: CompositionLayer = solid("art");
        if (kind === "image") {
          root = {
            ...root,
            type: "image",
            sources: [{ asset: "tile" }],
            fit: "stretch",
          } as CompositionLayer;
          delete (root as unknown as Record<string, unknown>).color;
          comp.assets = [
            {
              id: "tile",
              type: "image",
              path: "tile.png",
              sha256: `sha256:${"0".repeat(64)}`,
              width: 128,
              height: 96,
            },
          ];
        } else if (kind === "text")
          root = {
            id: "art",
            type: "text",
            text: "Aa",
            fontSize: 36,
            color: "#e6cd70",
            transform: { position: [20, 60] },
          };
        else if (kind === "provider")
          root = {
            id: "art",
            type: "provider",
            provider: providers[0]!.id,
            params: {},
            transform: { position: [25, 20] },
          };
        else if (kind === "precomp" || kind === "collapsed") {
          const nested = solid("nested");
          comp.precomps = [
            {
              id: "source",
              width: 128,
              height: 96,
              frameCount: 20,
              layers: [nested],
            },
          ];
          root = {
            id: "art",
            type: "precomp",
            comp: "source",
            collapseTransforms: kind === "collapsed",
            transform: { anchor: [0, 0] },
          };
        } else if (kind === "group" || kind === "group-offscreen") {
          root = {
            id: "art",
            type: "group",
            size: [105, 85],
            clip: kind === "group",
            transform: { anchor: [0, 0] },
          };
          comp.layers.push(
            {
              ...solid("child", kind === "group-offscreen" ? -53 : 55),
              parent: "art",
            },
            {
              ...solid("back", kind === "group-offscreen" ? -60 : 25, 35),
              parent: "art",
            },
          );
        } else if (kind === "offscreen") root.transform!.position = [-53, 20];
        root.transform = { ...root.transform, opacity: 0.55 };
        root.effects = [
          {
            id: "soft",
            effect: "blur.gaussian",
            inPoint: 2,
            outPoint: 12,
            params: {
              radius: {
                keys: [
                  { frame: 0, value: 2 },
                  { frame: 10, value: 7, interpolation: "linear" },
                ],
              },
            },
          },
          {
            id: "extra",
            effect: "blur.gaussian",
            inPoint: 6,
            params: { radius: 2 },
          },
        ];
        if (treatment !== "gaussian")
          root.effects = pixelStacks[treatment]!.map((effect) => ({
            ...effect,
            inPoint: 2,
          }));
        if (kind === "text") {
          const sweep = root.effects.find(
            (effect) => effect.effect === "light.sweep",
          );
          if (sweep) {
            sweep.space = "screen";
            sweep.params = {
              ...sweep.params,
              width: 128,
              height: 96,
              left: 0,
              top: 0,
              regionWidth: 1,
              regionHeight: 1,
              band: 0.5,
              progress: 0.5,
            };
            comp.layers.push({ id: "screen", type: "null", enabled: false });
          }
        }
        if (kind === "masked")
          root.masks = [
            {
              id: "cut",
              path: {
                closed: true,
                vertices: [
                  [10, -10],
                  [40, -10],
                  [40, 80],
                  [10, 80],
                ],
              },
              mode: "add",
            },
          ];
        comp.layers.push(root);
        const actual = canvas(),
          preview = m.createCompositionPreview(actual, comp, resources, {
            providers,
          });
        const unfiltered = structuredClone(comp);
        delete unfiltered.background;
        const plainRoot = unfiltered.layers.find((l) => l.id === "art")!;
        delete plainRoot.effects;
        delete plainRoot.masks;
        if (plainRoot.type !== "group" && kind !== "collapsed")
          plainRoot.transform!.opacity = 1;
        const raw = content(unfiltered);
        const noEffects = structuredClone(comp);
        delete noEffects.layers.find((l) => l.id === "art")!.effects;
        const direct = content(noEffects);
        let maxDelta = 0;
        const frames = [0, 2, 6, 9, 12, 19, 4, 1];
        for (const frame of frames) {
          preview.renderFrame(frame);
          m.executeGraph(
            raw.backend,
            m.buildRenderGraph(
              unfiltered,
              m.evaluateComp(unfiltered, frame, {
                textBounds: raw.text.bounds,
              }),
            ),
            raw.target,
          );
          let painted = raw.c;
          if (treatment === "gaussian")
            for (const radius of [
              ...(frame >= 2 && frame < 12
                ? [2 + 5 * Math.min(frame / 10, 1)]
                : []),
              ...(frame >= 6 ? [2] : []),
            ]) {
              const next = canvas(),
                ctx = next.getContext("2d")!;
              ctx.filter = `blur(${radius}px)`;
              ctx.drawImage(painted, 0, 0);
              painted = next;
            }
          if (treatment !== "gaussian" && frame >= 2) {
            const x =
              kind === "offscreen"
                ? -53
                : ["solid", "image", "provider", "masked"].includes(kind)
                  ? 25
                  : 0;
            const y = [
              "solid",
              "image",
              "provider",
              "masked",
              "offscreen",
            ].includes(kind)
              ? 20
              : 0;
            for (const effect of root.effects!)
              painted = pixelReference(painted, effect, [1, 0, 0, 1, x, y]);
          }
          if (kind === "masked") {
            const ctx = painted.getContext("2d")!;
            ctx.filter = "none";
            ctx.globalCompositeOperation = "destination-in";
            ctx.fillStyle = "#000000";
            ctx.fillRect(35, 10, 30, 90);
          }
          const expected = canvas(),
            ctx = expected.getContext("2d")!;
          ctx.fillStyle = "#26313b";
          ctx.fillRect(0, 0, 128, 96);
          ctx.globalAlpha =
            root.type === "group" || kind === "collapsed" ? 1 : 0.55;
          ctx.drawImage(painted, 0, 0);
          if (frame < 2) {
            m.executeGraph(
              direct.backend,
              m.buildRenderGraph(
                noEffects,
                m.evaluateComp(noEffects, frame, {
                  textBounds: direct.text.bounds,
                }),
              ),
              direct.target,
            );
            ctx.globalAlpha = 1;
            ctx.drawImage(direct.c, 0, 0);
          }
          const a = actual.getContext("2d")!.getImageData(0, 0, 128, 96).data,
            b = ctx.getImageData(0, 0, 128, 96).data;
          for (let i = 0; i < a.length; i++)
            maxDelta = Math.max(maxDelta, Math.abs(a[i]! - b[i]!));
        }
        preview.dispose();
        raw.backend.dispose();
        direct.backend.dispose();
        result.push({
          id: `${treatment}/${kind}`,
          frames: frames.length,
          maxDelta,
        });
      }
    for (const treatment of ["gaussian", ...Object.keys(pixelStacks)])
      for (const mode of ["normal", "multiply", "full"] as const) {
        const full = mode === "full",
          blendMode = full ? "normal" : mode;
        const comp = base();
        comp.layers = [
          {
            id: "adjust",
            type: "adjustment",
            size: [65, 55],
            blendMode,
            transform: { anchor: [0, 0], position: [30, 20], opacity: 0.5 },
            effects: [
              { id: "soft", effect: "blur.gaussian", params: { radius: 4 } },
            ],
          },
          solid("front", 55, 20),
          { ...solid("back", 25, 35), color: "#56a999" },
        ];
        if (full)
          Object.assign(comp.layers[0]!, {
            size: [128, 96],
            transform: { anchor: [0, 0], opacity: 1 },
          });
        if (treatment !== "gaussian")
          comp.layers[0]!.effects = pixelStacks[treatment]!;
        const actual = canvas(),
          preview = m.createCompositionPreview(actual, comp, resources);
        preview.renderFrame(0);
        const underlying = structuredClone(comp);
        underlying.layers.shift();
        const raw = content(underlying);
        m.executeGraph(
          raw.backend,
          m.buildRenderGraph(underlying, m.evaluateComp(underlying, 0)),
          raw.target,
        );
        const filtered = canvas(),
          fc = filtered.getContext("2d")!;
        fc.filter = "blur(4px)";
        fc.drawImage(raw.c, 0, 0);
        if (treatment !== "gaussian") {
          let source = raw.c;
          for (const effect of pixelStacks[treatment]!)
            source = pixelReference(source, effect, [
              1,
              0,
              0,
              1,
              full ? 0 : 30,
              full ? 0 : 20,
            ]);
          fc.filter = "none";
          fc.clearRect(0, 0, 128, 96);
          fc.drawImage(source, 0, 0);
        }
        const a = actual.getContext("2d")!.getImageData(0, 0, 128, 96).data;
        const b = raw.c.getContext("2d")!.getImageData(0, 0, 128, 96).data;
        const f = fc.getImageData(0, 0, 128, 96).data;
        let maxDelta = 0;
        for (let y = 0; y < 96; y++)
          for (let x = 0; x < 128; x++)
            for (let c = 0; c < 3; c++) {
              const i = (y * 128 + x) * 4 + c;
              const coverage = full
                ? 1
                : x >= 30 && x < 95 && y >= 20 && y < 75
                  ? 0.5
                  : 0;
              const alpha = f[(y * 128 + x) * 4 + 3]! / 255;
              const adjusted =
                blendMode === "normal"
                  ? f[i]! * alpha
                  : b[i]! * (1 - alpha) + ((f[i]! * b[i]!) / 255) * alpha;
              const expected = Math.round(
                b[i]! * (1 - coverage) + adjusted * coverage,
              );
              maxDelta = Math.max(maxDelta, Math.abs(a[i]! - expected));
            }
        preview.dispose();
        raw.backend.dispose();
        result.push({
          id: `adjustment-${treatment}-${mode}`,
          frames: 1,
          maxDelta,
        });
      }
    return result;
  });
  for (const result of results)
    console.log("Native effects:", JSON.stringify(result));
  for (const result of results)
    assert.ok(result.maxDelta <= 1, `${result.id}: ${result.maxDelta}`);
} finally {
  await browser.close();
  await server.close();
}

const output = await mkdtemp(join(tmpdir(), "still-shift-gaussian-"));
try {
  for (const fixture of [
    "gaussian",
    "pixel-stack",
    "generators",
    "light-sweep",
  ]) {
    const compositionPath = resolve(
      `benchmarks/fixtures/composition/ce6/${fixture}.json`,
    );
    const first = await renderComposition({
      compositionPath,
      outputPath: join(output, `${fixture}-first.mp4`),
    });
    const second = await renderComposition({
      compositionPath,
      outputPath: join(output, `${fixture}-second.mp4`),
    });
    assert.equal(first.checksums.output, second.checksums.output);
    assert.deepEqual(first.systemFontLayers, []);
    console.log(
      `Native ${fixture} export: ${first.frameCount} frames, two byte-identical MP4s`,
    );
  }
} finally {
  await rm(output, { recursive: true, force: true });
}
