import {
  validateComposition,
  type Composition,
} from "@still-shift/scene-contract";
import { sha256Hex } from "../../browser-checksum.ts";
import {
  PassageError,
  type PassageDiagnostic,
} from "../../passage-diagnostics.ts";
import type { LoadedFont } from "../../prepared-fonts.ts";
import { evaluateComp } from "../evaluate/evaluate.ts";
import type { Bounds } from "../evaluate/types.ts";
import { executeGraph } from "./backend.ts";
import { createCanvas2dBackend } from "./canvas2d.ts";
import { buildRenderGraph } from "./graph.ts";
import { loadCompositionFonts, prepareCompositionText } from "./text.ts";
import { COMPOSITION_RENDERER_VERSION } from "./version.ts";
import {
  prepareCompositionProviders,
  loadProviderFonts,
  type CanvasContentProvider,
} from "./providers.ts";
import { STORY_CONTENT_PROVIDERS } from "../adapters/story-providers.ts";
import { COMMERCE_CONTENT_PROVIDERS } from "../adapters/commerce-providers.ts";
import { MOTION_PATH_PROVIDERS } from "../adapters/motion-path.ts";
import { NUMERIC_TYPOGRAPHY_PROVIDER } from "../adapters/numeric-typography.ts";

const BUILTIN_PROVIDERS = [
  ...STORY_CONTENT_PROVIDERS,
  ...COMMERCE_CONTENT_PROVIDERS,
  NUMERIC_TYPOGRAPHY_PROVIDER,
  ...MOTION_PATH_PROVIDERS,
];

/** A validated composition wrapped with the export runtime's canvas and timeline. */
export type CompositionScene = {
  schemaVersion: "composition-scene-1";
  rendererVersion: typeof COMPOSITION_RENDERER_VERSION;
  composition: Composition;
  canvas: { width: number; height: number };
  timeline: { fps: number; frameCount: number; durationMs: number };
};

export function compositionScene(composition: Composition): CompositionScene {
  const result = validateComposition(composition);
  if (!result.ok) throw new PassageError(result.diagnostics);
  return {
    schemaVersion: "composition-scene-1",
    rendererVersion: COMPOSITION_RENDERER_VERSION,
    composition: result.composition,
    canvas: { width: composition.width, height: composition.height },
    timeline: {
      fps: composition.fps,
      frameCount: composition.frameCount,
      durationMs: (composition.frameCount * 1000) / composition.fps,
    },
  };
}

export type CompositionResources = {
  images: Map<string, CanvasImageSource>;
  fonts: Map<string, LoadedFont>;
  providerFonts?: ReadonlyMap<string, ReadonlyMap<string, LoadedFont>>;
};

/** Fetch, verify (SHA-256 and pixel size) and decode every image and font asset. */
export async function loadCompositionResources(
  composition: Composition,
  assetUrl: (id: string) => string,
  options: { providers?: readonly CanvasContentProvider[] } = {},
): Promise<CompositionResources> {
  const images = new Map<string, CanvasImageSource>();
  await Promise.all(
    composition.assets.map(async (asset) => {
      if (asset.type !== "image") return;
      const response = await fetch(assetUrl(asset.id));
      if (!response.ok) throw new Error(`Asset unavailable: ${asset.id}`);
      const bytes = await response.arrayBuffer();
      if (`sha256:${await sha256Hex(bytes)}` !== asset.sha256)
        throw new Error(`Asset checksum differs: ${asset.id}`);
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type:
            response.headers.get("Content-Type") ?? "application/octet-stream",
        }),
      );
      const image = new Image();
      image.src = url;
      try {
        await image.decode();
      } finally {
        URL.revokeObjectURL(url);
      }
      if (
        image.naturalWidth !== asset.width ||
        image.naturalHeight !== asset.height
      )
        throw new Error(`Dimensions differ for ${asset.id}`);
      images.set(asset.id, image);
    }),
  );
  const fonts = await loadCompositionFonts(composition, assetUrl);
  return {
    images,
    fonts,
    providerFonts: await loadProviderFonts(composition, fonts, [
      ...BUILTIN_PROVIDERS,
      ...(options.providers ?? []),
    ]),
  };
}

export type CompositionFrameReport = {
  diagnostics: PassageDiagnostic[];
  /** Layer keys skipped because their bounds miss their surface. */
  culled: string[];
};

export type CompositionPreview = {
  /** Measured local text bounds per state, as supplied to the evaluator. */
  textBounds: Record<string, Bounds[]>;
  renderFrame(frame: number): CompositionFrameReport;
  dispose(): void;
};

/**
 * Render a composition into `canvas` with the Canvas 2D reference backend. Lab
 * preview and export both use this, so they share evaluator and backend code.
 * The canvas is opaque: transparent backgrounds show black until alpha output
 * formats arrive (CE15).
 */
export function createCompositionPreview(
  canvas: HTMLCanvasElement,
  composition: Composition,
  resources: CompositionResources,
  options: {
    createCanvas?: (width: number, height: number) => HTMLCanvasElement;
    providers?: readonly CanvasContentProvider[];
  } = {},
): CompositionPreview {
  const validation = validateComposition(composition);
  if (!validation.ok) throw new PassageError(validation.diagnostics);
  canvas.width = composition.width;
  canvas.height = composition.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  const text = prepareCompositionText(composition, resources.fonts, ctx);
  const drawProvider = prepareCompositionProviders(composition, resources, [
    ...BUILTIN_PROVIDERS,
    ...(options.providers ?? []),
  ]);
  const backend = createCanvas2dBackend({
    images: {
      images: resources.images,
      sizes: new Map(
        composition.assets.flatMap((a) =>
          a.type === "image" ? [[a.id, [a.width, a.height] as const]] : [],
        ),
      ),
    },
    drawText: text.draw,
    drawProvider,
    ...(options.createCanvas ? { createCanvas: options.createCanvas } : {}),
  });
  const target = backend.wrap(canvas, ctx);
  return {
    textBounds: text.bounds,
    renderFrame(frame) {
      if (
        !Number.isInteger(frame) ||
        frame < 0 ||
        frame >= composition.frameCount
      )
        throw new Error("Frame index outside composition timeline");
      const tree = evaluateComp(composition, frame, {
        textBounds: text.bounds,
      });
      const graph = buildRenderGraph(composition, tree);
      executeGraph(backend, graph, target);
      return { diagnostics: tree.diagnostics, culled: graph.culled };
    },
    dispose() {
      backend.dispose();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
