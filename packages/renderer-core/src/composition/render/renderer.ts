import {
  createWebgl2Backend,
  COMPOSITION_WEBGL_RENDERER_VERSION,
} from "./webgl2.ts";
import type { RenderBackend, Surface } from "./backend.ts";
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
import type { Bounds } from "../evaluate/types.ts";
import { createCanvas2dBackend } from "./canvas2d.ts";
import {
  renderCompositionExposure,
  type CompositionFrameCache,
} from "./exposure.ts";
import { loadCompositionFonts, prepareCompositionText } from "./text.ts";
import { COMPOSITION_RENDERER_VERSION } from "./version.ts";
import {
  prepareCompositionProviders,
  loadProviderFonts,
  type CanvasContentProvider,
} from "./providers.ts";
import { STORY_CONTENT_PROVIDERS } from "../adapters/story-providers.ts";
import { COMMERCE_CONTENT_PROVIDERS } from "../adapters/commerce-providers.ts";
import { APPEARANCE_PROVIDERS } from "../adapters/appearance-providers.ts";
import { MOTION_PATH_PROVIDERS } from "../adapters/motion-path.ts";
import {
  NUMERIC_TYPOGRAPHY_PROVIDER,
  RICH_TYPOGRAPHY_PROVIDER,
} from "../adapters/numeric-typography.ts";

const BUILTIN_PROVIDERS = [
  ...STORY_CONTENT_PROVIDERS,
  ...COMMERCE_CONTENT_PROVIDERS,
  NUMERIC_TYPOGRAPHY_PROVIDER,
  RICH_TYPOGRAPHY_PROVIDER,
  ...MOTION_PATH_PROVIDERS,
  ...APPEARANCE_PROVIDERS,
];

export type CompositionBackend = "canvas2d" | "webgl2";
export type CompositionRendererVersion =
  | typeof COMPOSITION_RENDERER_VERSION
  | typeof COMPOSITION_WEBGL_RENDERER_VERSION;
export function compositionRendererVersion(backend: CompositionBackend) {
  if (backend === "webgl2") return COMPOSITION_WEBGL_RENDERER_VERSION;
  if (backend === "canvas2d") return COMPOSITION_RENDERER_VERSION;
  throw new Error(`comp-backend-unsupported: ${String(backend)}`);
}

/** A validated composition wrapped with the export runtime's canvas and timeline. */
export type CompositionScene = {
  schemaVersion: "composition-scene-1";
  rendererVersion: CompositionRendererVersion;
  backend?: CompositionBackend;
  composition: Composition;
  canvas: { width: number; height: number };
  timeline: { fps: number; frameCount: number; durationMs: number };
};

export function compositionScene(
  composition: Composition,
  backend: CompositionBackend = "canvas2d",
): CompositionScene {
  const result = validateComposition(composition);
  if (!result.ok) throw new PassageError(result.diagnostics);
  return {
    schemaVersion: "composition-scene-1",
    rendererVersion: compositionRendererVersion(backend),
    ...(backend === "webgl2" ? { backend } : {}),
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
  /** Actual complete-frame renders; zero when an identical GPU frame is reused. */
  samples: number;
};

export type CompositionPreview = {
  readonly backend: CompositionBackend;
  readonly rendererVersion: string;
  readPixels(): Uint8ClampedArray;
  /** Measured local text bounds per state, as supplied to the evaluator. */
  textBounds: Record<string, Bounds[]>;
  renderFrame(frame: number): CompositionFrameReport;
  dispose(): void;
};

/**
 * Render with the selected backend (Canvas 2D by default). Preview and export
 * share the evaluator, graph, prepared content and exposure sampling.
 * The canvas is opaque: transparent backgrounds show black until alpha output
 * formats arrive (CE15).
 */
export function createCompositionPreview(
  canvas: HTMLCanvasElement,
  composition: Composition,
  resources: CompositionResources,
  options: {
    backend?: CompositionBackend;
    createCanvas?: (width: number, height: number) => HTMLCanvasElement;
    providers?: readonly CanvasContentProvider[];
  } = {},
): CompositionPreview {
  const validation = validateComposition(composition);
  if (!validation.ok) throw new PassageError(validation.diagnostics);
  canvas.width = composition.width;
  canvas.height = composition.height;
  const kind = options.backend ?? "canvas2d";
  compositionRendererVersion(kind);
  const measurementCanvas =
    kind === "webgl2" ? document.createElement("canvas") : canvas;
  const ctx = measurementCanvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  const text = prepareCompositionText(composition, resources.fonts, ctx);
  const drawProvider = prepareCompositionProviders(composition, resources, [
    ...BUILTIN_PROVIDERS,
    ...(options.providers ?? []),
  ]);
  const backendOptions = {
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
  };
  if (kind === "webgl2") {
    const backend = createWebgl2Backend(canvas, {
      ...backendOptions,
      contentKey: (content) =>
        content.type === "provider"
          ? drawProvider.contentKey(content)
          : text.contentKey(content),
      contentBounds: (content) =>
        content.type === "provider"
          ? drawProvider.contentBounds(content)
          : text.contentBounds(content),
    });
    return preview(backend, backend.target, () => backend.present());
  }
  const backend = createCanvas2dBackend(backendOptions);
  return preview(backend, backend.wrap(canvas, ctx), () => {});

  function preview<S extends Surface>(
    backend: RenderBackend<S> & { dispose(): void },
    target: S,
    present: () => void,
  ): CompositionPreview {
    // The GPU backend retains bounded readback bytes; graph reuse skips identical draws.
    const cache: CompositionFrameCache | undefined =
      kind === "webgl2" ? {} : undefined;
    return {
      backend: kind,
      rendererVersion: backend.version,
      readPixels: () => backend.readPixels(target),
      textBounds: text.bounds,
      renderFrame(frame) {
        if (
          !Number.isInteger(frame) ||
          frame < 0 ||
          frame >= composition.frameCount
        )
          throw new Error("Frame index outside composition timeline");
        const report = renderCompositionExposure(
          backend,
          target,
          composition,
          frame,
          {
            textBounds: text.bounds,
          },
          cache,
        );
        if (report.samples > 0) present();
        return report;
      },
      dispose() {
        if (cache) {
          cache.root = undefined;
          cache.key = undefined;
        }
        backend.dispose();
        canvas.width = composition.width;
      },
    };
  }
}
