import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import { StorySceneSchema, type StoryScene } from "@still-shift/scene-contract";
import { compileStoryComposition } from "../../packages/animation-engine/src/composition-compile.ts";
import {
  inspectFontText,
  readFontIdentity,
} from "../../packages/renderer-core/src/font-identity.ts";
import {
  MECHANISM_SEMANTIC_FONTS,
  MECHANISM_SEMANTIC_HISTORICAL_INPUTS,
} from "../helpers/mechanism-semantic-typography-proof.ts";
import type * as Renderer from "@still-shift/renderer-core";
import type * as Fonts from "../../packages/renderer-core/src/prepared-fonts.ts";
import type * as Type from "../../packages/renderer-core/src/typography-renderer.ts";
import type * as Shaping from "../../packages/renderer-core/src/shaped-text.ts";
import type * as Poses from "../../packages/renderer-core/src/typography-animation.ts";
import type * as Styles from "../../packages/renderer-core/src/typography-style.ts";

const root = resolve(import.meta.dirname, "../.."),
  output = await mkdtemp(join(tmpdir(), "still-shift-ms2-thai48-"));
const hash = (x: Uint8Array | string) =>
  createHash("sha256").update(x).digest("hex");
const auditPath = join(root, "docs/mechanism-shorts-ms0-typography-audit.json"),
  auditBytes = await readFile(auditPath);
const find = (x: unknown): string[] | undefined => {
  if (Array.isArray(x)) {
    for (const v of x) {
      const result = find(v);
      if (result) return result;
    }
  } else if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    if (o.id === "thai-run-poses-and-tracking")
      return o.stressStrings as string[];
    for (const v of Object.values(o)) {
      const result = find(v);
      if (result) return result;
    }
  }
  return undefined;
};
const stress = find(JSON.parse(auditBytes.toString()));
assert.equal(stress?.length, 6);
const production = MECHANISM_SEMANTIC_HISTORICAL_INPUTS.ss02,
  productionBytes = await readFile(production.path);
assert.equal(hash(productionBytes), production.sha256);
const productionScene = StorySceneSchema.parse(
  JSON.parse(productionBytes.toString()),
);
const productionText = productionScene.nodes.find((n) => n.id === "phrase");
assert.ok(productionText?.type === "text");
const copies = [...stress!, productionText.text];
const thai = MECHANISM_SEMANTIC_FONTS.thai,
  plex = MECHANISM_SEMANTIC_FONTS.semibold;
const fontBytes = await readFile(resolve(root, thai.path)),
  plexBytes = await readFile(resolve(root, plex.path));
assert.equal(`sha256:${hash(fontBytes)}`, thai.sha256);
assert.equal(`sha256:${hash(plexBytes)}`, plex.sha256);
const identity = readFontIdentity(
  fontBytes.buffer.slice(
    fontBytes.byteOffset,
    fontBytes.byteOffset + fontBytes.byteLength,
  ),
);
const plexIdentity = readFontIdentity(
  plexBytes.buffer.slice(
    plexBytes.byteOffset,
    plexBytes.byteOffset + plexBytes.byteLength,
  ),
);
assert.deepEqual(identity.axes, thai.axes);
const art = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
  artPath = join(output, "unused.svg");
await writeFile(artPath, art);
const routes = [
  "intact",
  "translate",
  "rotate",
  "opacity",
  "retype",
  "color-boundary",
  "size-boundary",
  "font-alias-boundary",
] as const;
type Route = (typeof routes)[number] | "latin-font-boundary";
type Tracking = "zero" | "optical" | "default" | "explicit-override";
const fixture = (
  text: string,
  route: Route,
  tracking: Tracking,
): StoryScene => {
  const graphemes = [
    ...new Intl.Segmenter("th", { granularity: "grapheme" }).segment(text),
  ];
  const marked = graphemes.findIndex((g) => /\p{Mark}/u.test(g.segment));
  const boundary = marked > 0 ? marked : 1;
  const span = route.endsWith("boundary")
    ? {
        id: "boundary",
        start: boundary,
        end: graphemes.length,
        style: "boundary",
        ...(route === "color-boundary" ? { color: "#b82c18" } : {}),
      }
    : undefined;
  if (route === "latin-font-boundary") {
    assert.ok(span);
    span.start = graphemes.findIndex((g) => g.segment === "X");
    assert.ok(span.start >= 0);
    span.end = span.start + 2;
  }
  const style = {
    fontAsset: "thai",
    axes: { wght: 600, wdth: 100 },
    ...(tracking === "zero"
      ? { tracking: 0 }
      : tracking === "optical"
        ? { opticalTracking: true }
        : tracking === "explicit-override"
          ? { opticalTracking: true, tracking: 0 }
          : {}),
  };
  const from =
    route === "rotate"
      ? { rotation: 24 }
      : route === "opacity"
        ? { opacity: 0 }
        : { offset: [48, 24] };
  return StorySceneSchema.parse({
    schemaVersion: "story-scene-1",
    title: "Scoped Thai motion risk",
    width: 1920,
    height: 1080,
    fps: 30,
    frameCount: 24,
    background: "#ffffff",
    motionModel: "curves-1",
    authoringVersion: "1",
    typography: "type-1",
    assets: [
      {
        id: "unused",
        path: artPath,
        sha256: `sha256:${hash(art)}`,
        width: 1,
        height: 1,
      },
    ],
    fonts: [
      {
        id: "thai",
        path: resolve(root, thai.path),
        sha256: thai.sha256,
        weight: thai.weight,
        variable: thai.axes,
      },
      {
        id: "thaiAlias",
        path: resolve(root, thai.path),
        sha256: thai.sha256,
        weight: thai.weight,
        variable: thai.axes,
      },
      {
        id: "plex",
        path: resolve(root, plex.path),
        sha256: plex.sha256,
        weight: plex.weight,
      },
    ],
    textStyles: {
      base: style,
      boundary: {
        ...style,
        ...(route === "size-boundary" ? { size: 120 } : {}),
        ...(route === "font-alias-boundary" ? { fontAsset: "thaiAlias" } : {}),
        ...(route === "latin-font-boundary"
          ? { fontAsset: "plex", axes: {} }
          : {}),
      },
    },
    nodes: [
      {
        id: "phrase",
        type: "text",
        text,
        style: "base",
        textRole: "heading",
        fontSize: 96,
        color: "#202020",
        x: 120,
        y: 200,
        origin: [0, 0],
        anchor: "top",
        align: "left",
        locale: "th",
        width: 1680,
        height: 720,
        textLayout: {
          width: 1680,
          height: 720,
          lineHeight: 1.4,
          overflow: "error",
        },
        ...(span ? { spans: [span] } : {}),
        ...(route === "retype"
          ? {
              states: [" ", text],
              transition: {
                kind: "retype",
                window: { start: 2, end: 18 },
                fromState: 0,
                toState: 1,
                easing: "linear",
                caret: false,
              },
            }
          : {}),
      },
    ],
    ...(["intact", "translate", "rotate", "opacity"].includes(route)
      ? {
          textAnimators: [
            {
              node: "phrase",
              unit: "glyph",
              start: 2,
              end: 18,
              stagger: 0,
              selector: {
                start: 0,
                end: 1,
                shape: route === "intact" ? "square" : "ramp",
                basedOn: "clusters",
              },
              from,
              anchor: route === "intact" ? "all" : "glyph",
              mask: "none",
              excludeSpaces: false,
            },
          ],
        }
      : {}),
    recipe: { preset: "generic" },
  });
};
const evidence: Record<string, unknown> = {
  version: "mechanism-thai-motion-preflight-1",
  status: "running",
  output,
  scope:
    "Authoring, strict pinned-font coverage, loaded browser shaping/raster preparation and all-frame pose preflight. Encoded native inspection is not performed by this command.",
  inputs: {
    auditPath,
    auditSha256: hash(auditBytes),
    productionPath: production.path,
    productionSha256: hash(productionBytes),
    copies,
  },
  font: { ...thai, actualAxes: identity.axes, actualWeight: identity.weight },
  cases: [],
  wrongFontControls: [],
};
const cases: unknown[] = evidence.cases as unknown[],
  negatives: unknown[] = evidence.wrongFontControls as unknown[];
const write = () =>
  writeFile(join(output, "run.json"), JSON.stringify(evidence, null, 2) + "\n");
await write();
console.log(JSON.stringify({ status: "started", output }));
const server = await createServer({
  root,
  cacheDir: join(output, "vite-cache"),
  configFile: false,
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root, output] } },
});
await server.listen();
const browser = await launchRenderBrowser();
try {
  const page = await browser.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript("window.__name = fn => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  const paths = {
    renderer: "index",
    fonts: "prepared-fonts",
    type: "typography-renderer",
    shaping: "shaped-text",
    poses: "typography-animation",
    styles: "typography-style",
  };
  await page.addScriptTag({
    type: "module",
    content:
      Object.entries(paths)
        .map(
          ([k, v]) =>
            `import * as ${k} from ${JSON.stringify(`/@fs/${root}/packages/renderer-core/src/${v}.ts`)};`,
        )
        .join("") +
      "globalThis.__thaiProof={renderer,fonts,type,shaping,poses,styles};",
  });
  await page.waitForFunction(() => "__thaiProof" in globalThis);
  for (const [copyIndex, text] of copies.entries()) {
    const coverage = inspectFontText(
      identity,
      {
        id: "thai",
        sha256: thai.sha256,
        weight: thai.weight,
        variable: thai.axes,
      },
      [{ text, axes: { wght: 600, wdth: 100 } }],
    );
    assert.deepEqual(coverage, []);
    const wrong = inspectFontText(
      plexIdentity,
      { id: "plex", sha256: plex.sha256, weight: plex.weight },
      [{ text }],
    );
    assert.ok(wrong.some((d) => d.code === "font-coverage"));
    negatives.push({ copyIndex, diagnostics: wrong });
    const matrix: [Route, Tracking][] = [
      ...routes.flatMap((route) =>
        ["zero", "optical"].map((t) => [route, t] as [Route, Tracking]),
      ),
      ["intact", "default"],
      ["intact", "explicit-override"],
      ...(copyIndex === 1
        ? ([
            ["latin-font-boundary", "zero"],
            ["latin-font-boundary", "optical"],
          ] as [Route, Tracking][])
        : []),
    ];
    for (const [route, tracking] of matrix) {
      const id = `copy${copyIndex + 1}-${route}-${tracking}`,
        dir = join(output, id);
      await mkdir(dir);
      const source = fixture(text, route, tracking);
      await writeFile(
        join(dir, "source.json"),
        JSON.stringify(source, null, 2) + "\n",
      );
      const composition = await compileStoryComposition(source, root);
      for (const a of composition.assets) a.path = resolve(root, a.path);
      await writeFile(
        join(dir, "composition.json"),
        JSON.stringify(composition, null, 2) + "\n",
      );
      const receipt = await page.evaluate(
        async ({ json }) => {
          const source = JSON.parse(json) as StoryScene;
          const { renderer, fonts, type, shaping, poses, styles } = (
            globalThis as typeof globalThis & {
              __thaiProof: {
                renderer: typeof Renderer;
                fonts: typeof Fonts;
                type: typeof Type;
                shaping: typeof Shaping;
                poses: typeof Poses;
                styles: typeof Styles;
              };
            }
          ).__thaiProof;
          const scene = renderer.compileStoryScene(source),
            loaded = await fonts.loadPreparedFonts(
              scene,
              (id) => `/@fs/${scene.fonts!.find((f) => f.id === id)!.path}`,
              { profile: "strict" },
            ),
            node = scene.nodes.find((n) => n.id === "phrase");
          if (node?.type !== "text") throw Error("missing phrase");
          const ctx = document.createElement("canvas").getContext("2d")!,
            layout = shaping.shapeText(
              ctx,
              node,
              node.text,
              loaded,
              scene.textStyles,
            ),
            prepared = type.prepareTypography(scene, loaded);
          try {
            return {
              layout,
              resolvedStyle: styles.resolvedTextStyle(
                node,
                scene.textStyles ?? {},
              ),
              poses: Array.from({ length: 24 }, (_, frame) => ({
                frame,
                poses: poses.evaluateTextPoses(
                  node,
                  layout,
                  scene.textAnimators ?? [],
                  frame,
                  { fps: 30 },
                ),
              })),
              defaultSpaceExclusionPoses: poses.evaluateTextPoses(
                node,
                layout,
                (scene.textAnimators ?? []).map((a) => {
                  const copy = { ...a };
                  delete copy.excludeSpaces;
                  return copy;
                }),
                0,
                { fps: 30 },
              ),
              rasterPrepared: true,
            };
          } finally {
            type.disposeTypography(prepared);
          }
        },
        { json: JSON.stringify(source) },
      );
      assert.equal(receipt.layout.overflow, false);
      assert.equal(
        receipt.resolvedStyle.tracking,
        tracking === "optical" ? -25 : 0,
      );
      assert.equal(receipt.poses.length, 24);
      assert.ok(
        receipt.poses.every(
          (f) => f.poses.length === receipt.layout.clusters.length,
        ),
      );
      if (route === "intact")
        for (const f of receipt.poses) {
          const first = f.poses[0]!;
          assert.ok(
            f.poses.every(
              (p) =>
                p.x === first.x &&
                p.y === first.y &&
                p.opacity === first.opacity &&
                p.rotation === first.rotation,
            ),
          );
        }
      const record = {
        id,
        copyIndex,
        route,
        tracking,
        text,
        sourceSha256: hash(JSON.stringify(source)),
        compositionSha256: hash(JSON.stringify(composition)),
        boundary:
          source.nodes[0]?.type === "text" ? source.nodes[0].spans : null,
        ...receipt,
      };
      cases.push(record);
      await writeFile(
        join(dir, "preflight.json"),
        JSON.stringify(record, null, 2) + "\n",
      );
      await write();
    }
    console.log(
      JSON.stringify({ copyIndex, status: "passed", cases: cases.length }),
    );
  }
  assert.equal(cases.length, 128);
  assert.deepEqual(errors, []);
  evidence.browserErrors = errors;
  evidence.status = "passed";
  await write();
  console.log(
    JSON.stringify({ status: "passed", output, cases: cases.length }),
  );
} catch (error) {
  evidence.status = "failed";
  evidence.error = String(error);
  await write();
  throw error;
} finally {
  await browser.close();
  await server.close();
}
