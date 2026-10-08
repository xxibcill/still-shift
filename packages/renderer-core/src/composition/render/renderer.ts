import { passageError } from "../../passage-diagnostics.ts";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import {
  createWebgl2Backend,
  COMPOSITION_WEBGL_RENDERER_VERSION,
} from "./webgl2.ts";
import type { RenderBackend, Surface } from "./backend.ts";
import {
  validateComposition,
  type Composition,
  type CompositionPreparedMedia,
  type CompositionPreparedAudio,
} from "@still-shift/scene-contract";
import { sha256Hex } from "../../browser-checksum.ts";
import {
  PassageError,
  type PassageDiagnostic,
} from "../../passage-diagnostics.ts";
import type { LoadedFont } from "../../prepared-fonts.ts";
import type { Bounds } from "../evaluate/types.ts";
import { createCanvas2dBackend, requiresSoftwareFilters } from "./canvas2d.ts";
import {
  renderCompositionExposure,
  type CompositionFrameCache,
} from "./exposure.ts";
import {
  loadCompositionFonts,
  prepareCompositionText,
  type TextProbe,
} from "./text.ts";
import { COMPOSITION_RENDERER_VERSION } from "./version.ts";
import {
  prepareCompositionProviders,
  loadProviderFonts,
  type CanvasContentProvider,
} from "./providers.ts";
import { STORY_CONTENT_PROVIDERS } from "../adapters/story-providers.ts";
import {
  createCompositionMediaResources,
  type CompositionMediaResources,
} from "./media-resources.ts";
import { resolveCompositionMediaLimits } from "@still-shift/scene-contract";
import {
  hasRequiredCompositionCoverage,
  createCompositionCoverageValidator,
  validateRequiredCompositionCoverage,
} from "./required-coverage.ts";
import { validateStoryCompositionCoverage } from "../adapters/story-coverage.ts";
import { cinematicRenderedCoverageRequirements } from "../adapters/cinematic-coverage.ts";
import {
  validateRenderedCinematicCompositionCoverage,
  validateRenderedCinematicCompositionCoverageAsync,
} from "./cinematic-reveal.ts";
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

/** The versions of effects actually used by this immutable document, sorted by ID. */
export function compositionEffectVersions(
  composition: Composition,
): Readonly<Record<string, string>> {
  const ids = new Set(
    [composition, ...(composition.precomps ?? [])].flatMap((scope) =>
      scope.layers.flatMap((layer) =>
        (layer.effects ?? []).map((effect) => effect.effect),
      ),
    ),
  );
  return Object.fromEntries(
    [...ids]
      .sort()
      .map((id) => [
        id,
        compositionEffectDefinition(id)?.version ?? "unavailable",
      ]),
  );
}

/** Check the export snapshot before loading assets or creating frame surfaces. */
export function assertCompositionEffectVersions(scene: CompositionScene): void {
  if (scene.effectVersions === undefined) return;
  const current = compositionEffectVersions(scene.composition);
  if (
    Object.keys(current).length !== Object.keys(scene.effectVersions).length ||
    Object.entries(current).some(
      ([id, version]) =>
        !Object.hasOwn(scene.effectVersions!, id) ||
        scene.effectVersions![id] !== version,
    )
  )
    passageError(
      "comp-effect-version",
      "Effect definitions differ from the captured export versions",
      { path: "effectVersions" },
    );
}

/** A validated composition wrapped with the export runtime's canvas and timeline. */
export type CompositionScene = {
  schemaVersion: "composition-scene-1";
  rendererVersion: CompositionRendererVersion;
  /** Captured plugin/kernel versions participate in scene/export cache identity. */
  effectVersions?: Readonly<Record<string, string>>;
  backend?: CompositionBackend;
  composition: Composition;
  preparedMedia?: CompositionPreparedMedia;
  preparedAudio?: CompositionPreparedAudio;
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
    effectVersions: compositionEffectVersions(result.composition),
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
  /** Optional local glyph/container diagnostic; never part of a saved document. */
  textProbe?: TextProbe;
  images: Map<string, CanvasImageSource>;
  media?: CompositionMediaResources;
  preparedMedia?: CompositionPreparedMedia;
  /** PNG signatures verified from asset bytes, independent of filenames and URLs. */
  pngImages?: ReadonlySet<string>;
  fonts: Map<string, LoadedFont>;
  providerFonts?: ReadonlyMap<string, ReadonlyMap<string, LoadedFont>>;
};

/** Fetch, verify (SHA-256 and pixel size) and decode every image and font asset. */
export async function loadCompositionResources(
  composition: Composition,
  assetUrl: (id: string) => string,
  options: {
    providers?: readonly CanvasContentProvider[];
    preparedMedia?: CompositionPreparedMedia;
    signal?: AbortSignal;
  } = {},
): Promise<CompositionResources> {
  options.signal?.throwIfAborted();
  if (
    !options.preparedMedia &&
    composition.assets.some(
      (asset) => asset.type === "video" || asset.type === "sequence",
    )
  )
    passageError(
      "comp-media-not-ready",
      "Capture native source frames before loading composition resources",
      { path: "preparedMedia" },
    );
  const images = new Map<string, CanvasImageSource>();
  const pngImages = new Set<string>();
  await Promise.all(
    composition.assets.map(async (asset) => {
      if (asset.type !== "image") return;
      const response = await fetch(assetUrl(asset.id), {
        signal: options.signal ?? null,
      });
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
        options.signal?.throwIfAborted();
      } finally {
        URL.revokeObjectURL(url);
      }
      if (
        image.naturalWidth !== asset.width ||
        image.naturalHeight !== asset.height
      )
        throw new Error(`Dimensions differ for ${asset.id}`);
      images.set(asset.id, image);
      const signature = new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength));
      if (
        [137, 80, 78, 71, 13, 10, 26, 10].every(
          (value, i) => signature[i] === value,
        )
      )
        pngImages.add(asset.id);
    }),
  );
  const fonts = await loadCompositionFonts(composition, assetUrl);
  options.signal?.throwIfAborted();
  return {
    images,
    ...(options.preparedMedia
      ? {
          preparedMedia: options.preparedMedia,
          media: createCompositionMediaResources(
            composition,
            options.preparedMedia,
            assetUrl,
            images,
            pngImages,
          ),
        }
      : {}),
    pngImages,
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
  /** Still-only frames are ready synchronously; native media returns its loading promise. */
  prepareFrame(frame: number): Promise<void> | void;
  renderFrame(frame: number): CompositionFrameReport;
  dispose(): void;
};

type CompositionPreviewOptions = {
  backend?: CompositionBackend;
  createCanvas?: (width: number, height: number) => HTMLCanvasElement;
  providers?: readonly CanvasContentProvider[];
  coverageSeverity?: "error" | "warning";
  /** Exact integer frames owned by an independently bounded family timeline window. */
  validationFrames?: readonly number[];
};

/** Prepared local content and coverage, reusable without retaining a backend's surfaces. */
export type PreparedCompositionPreview = {
  create(canvas: HTMLCanvasElement): CompositionPreview;
};

export function prepareCompositionPreview(
  composition: Composition,
  resources: CompositionResources,
  options: CompositionPreviewOptions = {},
): PreparedCompositionPreview {
  // Keep compiled clocks and prepared drawers tied to the same immutable source,
  // even when an author edits the document after preparing another preview.
  const snapshot = structuredClone(composition);
  const canvas = options.createCanvas
    ? options.createCanvas(snapshot.width, snapshot.height)
    : document.createElement("canvas");
  try {
    const prepared = prepareCompositionPreviewOnCanvas(
      canvas,
      snapshot,
      resources,
      options,
      false,
    );
    prepared.preview.dispose();
    return { create: prepared.createPreview };
  } finally {
    canvas.width = canvas.height = 0;
  }
}

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
  options: CompositionPreviewOptions = {},
): CompositionPreview {
  return prepareCompositionPreviewOnCanvas(
    canvas,
    composition,
    resources,
    options,
  ).preview;
}

function prepareCompositionPreviewOnCanvas(
  canvas: HTMLCanvasElement,
  composition: Composition,
  resources: CompositionResources,
  options: CompositionPreviewOptions,
  ownsMedia = true,
) {
  const validation = validateComposition(composition);
  if (!validation.ok) throw new PassageError(validation.diagnostics);
  canvas.width = composition.width;
  canvas.height = composition.height;
  const kind = options.backend ?? "canvas2d";
  compositionRendererVersion(kind);
  const measurementCanvas =
    kind === "webgl2" ? document.createElement("canvas") : canvas;
  const softwareRaster =
    kind === "canvas2d" && requiresSoftwareFilters(composition);
  const ctx = measurementCanvas.getContext("2d", {
    alpha: false,
    ...(softwareRaster ? { willReadFrequently: true } : {}),
  });
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  const readAssetPixels = (id: string) => {
    const asset = composition.assets.find((asset) => asset.id === id)!;
    if (asset.type !== "image")
      throw new Error(`Cover asset is not an image: ${id}`);
    const image = resources.images.get(id);
    if (!image) throw new Error(`Cover image was not loaded: ${id}`);
    const probe = options.createCanvas
      ? options.createCanvas(asset.width, asset.height)
      : document.createElement("canvas");
    probe.width = asset.width;
    probe.height = asset.height;
    const context = probe.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas 2D is unavailable");
    try {
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, probe.width, probe.height);
    } finally {
      probe.width = probe.height = 0;
    }
  };
  validateStoryCompositionCoverage(
    composition,
    readAssetPixels,
    options.validationFrames,
  );
  const text = prepareCompositionText(
    composition,
    resources.fonts,
    ctx,
    options.validationFrames
      ? Object.fromEntries(
          composition.layers.flatMap((layer) =>
            layer.type === "text"
              ? [
                  [
                    layer.id,
                    [
                      ...new Set(
                        (layer.sampleTimes ?? options.validationFrames!).map(
                          Math.round,
                        ),
                      ),
                    ],
                  ],
                ]
              : [],
          ),
        )
      : undefined,
    resources.textProbe,
  );
  const drawProvider = prepareCompositionProviders(
    composition,
    { ...resources, softwareRaster: requiresSoftwareFilters(composition) },
    [...BUILTIN_PROVIDERS, ...(options.providers ?? [])],
  );
  const backendOptions = {
    nativeImageByteLimit: resolveCompositionMediaLimits(composition.mediaLimits)
      .decodedTextureBytes,
    ...(composition.colorSpace ? { colorSpace: composition.colorSpace } : {}),
    softwareRaster,
    images: {
      images: resources.images,
      ...(resources.pngImages ? { pngImages: resources.pngImages } : {}),
      sizes: new Map([
        ...composition.assets.flatMap((a) =>
          a.type === "image"
            ? [[a.id, [a.width, a.height] as const] as const]
            : [],
        ),
        ...(resources.preparedMedia?.frames ?? []).map(
          (frame) => [frame.id, [frame.width, frame.height] as const] as const,
        ),
      ]),
    },
    drawText: text.draw,
    drawProvider,
    ...(options.createCanvas ? { createCanvas: options.createCanvas } : {}),
  };
  let coverageDiagnostics: PassageDiagnostic[] = [];
  let initialization: Promise<void> | undefined;
  const requiredRootLayers = cinematicRenderedCoverageRequirements(composition);
  return { preview: createPreview(canvas, true), createPreview };

  function createPreview(
    targetCanvas: HTMLCanvasElement,
    validateCoverage = false,
  ): CompositionPreview {
    targetCanvas.width = composition.width;
    targetCanvas.height = composition.height;
    if (kind === "webgl2") {
      const backend = createWebgl2Backend(targetCanvas, {
        ...backendOptions,
        boundedCanvas: (content) =>
          content.type === "text" || drawProvider.boundedCanvas(content),
        singleImage: (content) =>
          content.type === "provider"
            ? drawProvider.singleImage(content)
            : text.singleImage(content),
        stableImages: (content) =>
          content.type === "provider"
            ? drawProvider.stableImages(content)
            : text.stableImages(content),
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
    const targetContext = targetCanvas.getContext("2d", {
      alpha: false,
      ...(softwareRaster ? { willReadFrequently: true } : {}),
    });
    if (!targetContext) throw new Error("Canvas 2D is unavailable");
    const backend = createCanvas2dBackend(backendOptions);
    return preview(
      backend,
      backend.wrap(targetCanvas, targetContext),
      () => {},
    );

    function preview<S extends Surface>(
      backend: RenderBackend<S> & { dispose(): void },
      target: S,
      present: () => void,
    ): CompositionPreview {
      // The GPU backend retains bounded readback bytes; graph reuse skips identical draws.
      const cache: CompositionFrameCache | undefined =
        kind === "webgl2" ? {} : undefined;
      if (validateCoverage && !resources.media)
        try {
          validateRenderedCinematicCompositionCoverage(
            composition,
            readAssetPixels,
            backend,
            { textBounds: text.bounds },
          );
          coverageDiagnostics = validateRequiredCompositionCoverage(
            composition,
            backend,
            { textBounds: text.bounds },
            options.coverageSeverity ?? "error",
            requiredRootLayers,
            options.validationFrames,
          );
        } catch (error) {
          backend.dispose();
          throw error;
        }
      return {
        backend: kind,
        rendererVersion: backend.version,
        readPixels: () => backend.readPixels(target),
        textBounds: text.bounds,
        prepareFrame(frame) {
          if (!resources.media) return;
          if (!initialization)
            initialization = (async () => {
              const required = hasRequiredCompositionCoverage(
                composition,
                requiredRootLayers,
              );
              const frames =
                options.validationFrames ??
                Array.from({ length: composition.frameCount }, (_, at) => at);
              const selected = new Set(frames);
              const validated = new Set<number>();
              const validate = createCompositionCoverageValidator(
                composition,
                backend,
                { textBounds: text.bounds },
                options.coverageSeverity ?? "error",
                requiredRootLayers,
              );
              const prepare = async (at: number) => {
                await resources.media!.prepareFrame(at, {
                  textBounds: text.bounds,
                  cull: false,
                });
                if (required && selected.has(at)) {
                  coverageDiagnostics.push(...validate(at));
                  validated.add(at);
                }
              };
              try {
                await validateRenderedCinematicCompositionCoverageAsync(
                  composition,
                  readAssetPixels,
                  backend,
                  prepare,
                  { textBounds: text.bounds },
                );
                if (required)
                  for (const at of frames)
                    if (!validated.has(at)) await prepare(at);
              } finally {
                backend.endFrame?.(false);
              }
            })();
          return initialization.then(() =>
            resources.media!.prepareFrame(frame, { textBounds: text.bounds }),
          );
        },
        renderFrame(frame) {
          resources.media?.assertReady(frame);
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
          return coverageDiagnostics.length
            ? {
                ...report,
                diagnostics: [...report.diagnostics, ...coverageDiagnostics],
              }
            : report;
        },
        dispose() {
          if (cache) {
            cache.root = undefined;
            cache.key = undefined;
          }
          backend.dispose();
          if (ownsMedia) resources.media?.dispose();
          targetCanvas.width = composition.width;
        },
      };
    }
  }
}
