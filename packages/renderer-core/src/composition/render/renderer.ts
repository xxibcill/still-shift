import {
  createRenderBlob,
  decodeRenderImage,
  mapRenderResources,
  prepareRenderResources,
  readRenderAssetBody,
  releaseRenderBlob,
} from "../../managed-resources.ts";
import { releaseRenderPixels } from "../../managed-memory-context.ts";
import {
  createRenderCanvas,
  readRenderImageData,
  releaseRenderCanvas,
  renderMemory,
} from "../../managed-memory-context.ts";
import { CompositionRenderStatistics } from "./statistics.ts";
import { compositionPrefixLayers } from "./prefix.ts";
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
import type { CanvasPixelSource } from "../../canvas-pixel-source.ts";
import { CompositionSourceCache } from "./source-cache.ts";
import { prepareGraphSources } from "./source-preparation.ts";
import { CompositionRootCache } from "./root-cache.ts";
import {
  PassageError,
  type PassageDiagnostic,
} from "../../passage-diagnostics.ts";
import type { LoadedFont } from "../../prepared-fonts.ts";
import type { Bounds } from "../evaluate/types.ts";
import { createCanvas2dBackend, requiresSoftwareFilters } from "./canvas2d.ts";
import {
  renderCompositionExposure,
  createCompositionFrameCache,
  releaseCompositionFrameCache,
  type CompositionFrameCache,
} from "./exposure.ts";
import {
  loadCompositionFonts,
  prepareCompositionText,
  type TextProbe,
} from "./text.ts";
import { COMPOSITION_RENDERER_VERSION } from "./version.ts";
import {
  CompositionSurfaceCache,
  type CompositionSurfaceCacheOptions,
} from "./surface-cache.ts";
import { compositionRenderGraphs } from "./graphs.ts";
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
  compositionRequiredCoverageGraphs,
} from "./required-coverage.ts";
import { validateStoryCompositionCoverage } from "../adapters/story-coverage.ts";
import { validateCinematicCompositionCoverage } from "../adapters/cinematic-coverage.ts";
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
  return prepareRenderResources(async () => {
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
    await mapRenderResources(composition.assets, async (asset) => {
      if (asset.type !== "image") return;
      const response = await fetch(assetUrl(asset.id), {
        signal: options.signal ?? null,
      });
      if (!response.ok) throw new Error(`Asset unavailable: ${asset.id}`);
      const bytes = await readRenderAssetBody(response);
      if (`sha256:${await sha256Hex(bytes)}` !== asset.sha256)
        throw new Error(`Asset checksum differs: ${asset.id}`);
      const blob = createRenderBlob(
        bytes,
        response.headers.get("Content-Type") ?? "application/octet-stream",
      );
      const url = URL.createObjectURL(blob);
      let image: HTMLImageElement;
      try {
        image = await decodeRenderImage(url, asset.width, asset.height);
        options.signal?.throwIfAborted();
      } finally {
        URL.revokeObjectURL(url);
        releaseRenderBlob(blob);
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
      releaseRenderPixels(bytes);
    });
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
  });
}

export type CompositionFrameReport = {
  diagnostics: PassageDiagnostic[];
  /** Layer keys skipped because their bounds miss their surface. */
  culled: string[];
  /** Actual complete-frame renders; zero when an identical GPU frame is reused. */
  samples: number;
};

export type CompositionPreview = {
  renderStatistics?: () => CompositionRenderStatistics["statistics"];
  sourceCacheStatistics?: () => CompositionSourceCache["statistics"];
  readonly backend: CompositionBackend;
  readonly rendererVersion: string;
  readPixels(): Uint8ClampedArray;
  /** Measured local text bounds per state, as supplied to the evaluator. */
  textBounds: Record<string, Bounds[]>;
  /** Still-only frames are ready synchronously; native media returns its loading promise. */
  prepareFrame(frame: number): Promise<void> | void;
  surfaceCacheStatistics?(): CompositionSurfaceCache<Surface>["statistics"];
  rootCacheStatistics?(): CompositionRootCache<Surface>["statistics"];
  renderFrame(frame: number): CompositionFrameReport;
  dispose(): void;
};

/**
 * Render with the selected backend (Canvas 2D by default). Preview and export
 * share the evaluator, graph, prepared content and exposure sampling.
 * The default canvas is opaque. Alpha-capable exports opt into a transparent root.
 */
export function createCompositionPreview(
  canvas: HTMLCanvasElement,
  composition: Composition,
  resources: CompositionResources,
  options: {
    backend?: CompositionBackend;
    createCanvas?: (width: number, height: number) => HTMLCanvasElement;
    providers?: readonly CanvasContentProvider[];
    coverageSeverity?: "error" | "warning";
    /** Carry the authored background alpha; opaque preview remains the default. */
    preserveAlpha?: boolean;
    surfaceCache?: CompositionSurfaceCacheOptions;
    sourceCanvas?: CanvasPixelSource;
    prepareSourcePixels?: (prepare: () => void) => Promise<void>;
    collectStatistics?: boolean;
  } = {},
): CompositionPreview {
  const validation = validateComposition(composition);
  if (!validation.ok) throw new PassageError(validation.diagnostics);
  canvas.width = composition.width;
  canvas.height = composition.height;
  const kind = options.backend ?? "canvas2d";
  compositionRendererVersion(kind);
  const measurementCanvas = kind === "webgl2" ? createRenderCanvas() : canvas;
  const softwareRaster =
    kind === "canvas2d" && requiresSoftwareFilters(composition);
  const ctx = measurementCanvas.getContext("2d", {
    alpha: options.preserveAlpha === true,
    ...(softwareRaster ? { willReadFrequently: true } : {}),
  });
  if (!ctx) {
    if (kind === "webgl2") releaseRenderCanvas(measurementCanvas);
    throw new Error("Canvas 2D is unavailable");
  }
  const readAssetPixels = (id: string) => {
    const asset = composition.assets.find((asset) => asset.id === id)!;
    if (asset.type !== "image")
      throw new Error(`Cover asset is not an image: ${id}`);
    const image = resources.images.get(id);
    if (!image) throw new Error(`Cover image was not loaded: ${id}`);
    const makeProbe = (width: number, height: number) => {
      const probe = options.createCanvas
        ? options.createCanvas(width, height)
        : createRenderCanvas();
      probe.width = width;
      probe.height = height;
      if (!probe.getContext("2d", { willReadFrequently: true }))
        throw Error("Canvas 2D is unavailable");
      return probe;
    };
    const paint = () => {
      const probe = makeProbe(asset.width, asset.height);
      probe.getContext("2d")!.drawImage(image, 0, 0);
      return probe;
    };
    let source: HTMLCanvasElement;
    if (options.sourceCanvas) {
      // Only context policy is needed before rendezvous; the original full paint
      // or restore allocates its own target after a producer/consumer is admitted.
      const header = makeProbe(1, 1);
      const policy = header.getContext("2d")!.getContextAttributes();
      releaseRenderCanvas(header);
      source = options.sourceCanvas(
        {
          kind: "coverage-asset",
          input: [asset, policy],
          width: asset.width,
          height: asset.height,
        },
        paint,
        (pixels) => {
          const probe = makeProbe(asset.width, asset.height);
          probe
            .getContext("2d")!
            .putImageData(
              new ImageData(
                new Uint8ClampedArray(
                  pixels.buffer,
                  pixels.byteOffset,
                  pixels.byteLength,
                ),
                asset.width,
                asset.height,
              ),
              0,
              0,
            );
          return probe;
        },
      );
    } else source = paint();
    try {
      return readRenderImageData(
        source.getContext("2d")!,
        0,
        0,
        source.width,
        source.height,
      );
    } finally {
      if (!options.sourceCanvas) releaseRenderCanvas(source);
    }
  };
  let text: ReturnType<typeof prepareCompositionText>;
  try {
    validateStoryCompositionCoverage(composition, readAssetPixels);
    validateCinematicCompositionCoverage(composition, readAssetPixels);
    text = prepareCompositionText(
      composition,
      resources.fonts,
      ctx,
      undefined,
      resources.textProbe,
      options.sourceCanvas,
    );
  } finally {
    if (kind === "webgl2") releaseRenderCanvas(measurementCanvas);
  }
  const drawProvider = prepareCompositionProviders(
    composition,
    {
      ...resources,
      softwareRaster: requiresSoftwareFilters(composition),
      ...(options.sourceCanvas ? { sourceCanvas: options.sourceCanvas } : {}),
    },
    [...BUILTIN_PROVIDERS, ...(options.providers ?? [])],
  );
  const statistics = options.collectStatistics
    ? new CompositionRenderStatistics()
    : undefined;
  const backendOptions = {
    ...(statistics ? { statistics } : {}),
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
  if (kind === "webgl2") {
    const backend = createWebgl2Backend(canvas, {
      ...backendOptions,
      preserveAlpha: options.preserveAlpha === true,
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
  const backend = createCanvas2dBackend(backendOptions);
  return preview(backend, backend.wrap(canvas, ctx), () => {});

  function preview<S extends Surface>(
    backend: RenderBackend<S> & { dispose(): void },
    target: S,
    present: () => void,
  ): CompositionPreview {
    // The GPU backend retains bounded readback bytes; graph reuse skips identical draws.
    let cache: CompositionFrameCache | undefined;
    let coverageDiagnostics: PassageDiagnostic[] = [];
    let initialization: Promise<void> | undefined;
    let preparedFrame: number | undefined;
    let surfaceCache: CompositionSurfaceCache<S> | undefined;
    let rootCache: CompositionRootCache<S> | undefined;
    try {
      if (kind === "webgl2") cache = createCompositionFrameCache();
      if (options.surfaceCache) {
        surfaceCache = new CompositionSurfaceCache(
          backend,
          options.surfaceCache,
          (content) =>
            content.type === "provider"
              ? drawProvider.contentKey(content)
              : text.contentKey(content),
          composition.colorSpace ?? "srgb",
        );
        rootCache = new CompositionRootCache(
          backend,
          options.surfaceCache,
          (content) =>
            content.type === "provider"
              ? drawProvider.contentKey(content)
              : text.contentKey(content),
          compositionPrefixLayers(composition),
        );
      }
      if (!resources.media && !surfaceCache)
        coverageDiagnostics = validateRequiredCompositionCoverage(
          composition,
          backend,
          { textBounds: text.bounds },
          options.coverageSeverity ?? "error",
        );
    } catch (error) {
      if (cache) releaseCompositionFrameCache(cache);
      backend.dispose();
      statistics?.dispose();
      throw error;
    }
    return {
      backend: kind,
      rendererVersion: backend.version,
      readPixels: () => backend.readPixels(target),
      textBounds: text.bounds,
      ...(statistics ? { renderStatistics: () => statistics.statistics } : {}),
      ...(surfaceCache
        ? { surfaceCacheStatistics: () => surfaceCache.statistics }
        : {}),
      ...(rootCache ? { rootCacheStatistics: () => rootCache.statistics } : {}),
      prepareFrame(frame) {
        if (
          !Number.isInteger(frame) ||
          frame < 0 ||
          frame >= composition.frameCount
        )
          throw Error("Frame index outside composition timeline");
        if (!resources.media && !surfaceCache) return;
        if (!initialization)
          initialization = (async () => {
            if (!hasRequiredCompositionCoverage(composition)) return;
            const validate = createCompositionCoverageValidator(
              composition,
              backend,
              { textBounds: text.bounds },
              options.coverageSeverity ?? "error",
            );
            try {
              for (let at = 0; at < composition.frameCount; at++) {
                await resources.media?.prepareFrame(at, {
                  textBounds: text.bounds,
                  cull: false,
                });
                if (surfaceCache)
                  for (const {
                    graph,
                    node,
                  } of compositionRequiredCoverageGraphs(composition, at, {
                    textBounds: text.bounds,
                  })) {
                    await options.prepareSourcePixels?.(() =>
                      prepareGraphSources(
                        graph,
                        text.preparePixels,
                        drawProvider.preparePixels,
                      ),
                    );
                    await surfaceCache.prepare(graph);
                    if (rootCache) {
                      const target = backend.createSurface(
                        graph.root.width,
                        graph.root.height,
                      );
                      try {
                        await rootCache.prepare(
                          graph,
                          target,
                          "coverage:" + node,
                        );
                      } finally {
                        backend.releaseSurface(target);
                      }
                    }
                  }
                coverageDiagnostics.push(...validate(at));
              }
            } finally {
              backend.endFrame?.(false);
            }
          })();
        return initialization.then(async () => {
          await resources.media?.prepareFrame(frame, {
            textBounds: text.bounds,
          });
          if (surfaceCache)
            for (const { graph } of compositionRenderGraphs(
              composition,
              frame,
              { textBounds: text.bounds },
            )) {
              await options.prepareSourcePixels?.(() =>
                prepareGraphSources(
                  graph,
                  text.preparePixels,
                  drawProvider.preparePixels,
                ),
              );
              await surfaceCache.prepare(graph);
              await rootCache?.prepare(graph, target);
            }
          preparedFrame = frame;
        });
      },
      renderFrame(frame) {
        if (surfaceCache && preparedFrame !== frame)
          throw Error(
            "Prepare the absolute composition frame before using retained surfaces",
          );
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
        if (cache) releaseCompositionFrameCache(cache);
        rootCache?.dispose();
        surfaceCache?.dispose();
        text.dispose();
        backend.dispose();
        statistics?.dispose();
        resources.media?.dispose();
        canvas.width = composition.width;
      },
    };
  }
}

/** Shares preparation pixels before constructing the ordinary synchronous preview. */
export async function createCompositionPreviewAsync(
  canvas: HTMLCanvasElement,
  composition: Composition,
  resources: CompositionResources,
  options: NonNullable<Parameters<typeof createCompositionPreview>[3]> = {},
): Promise<CompositionPreview> {
  if (!options.surfaceCache)
    return createCompositionPreview(canvas, composition, resources, options);
  const sources = new CompositionSourceCache(options.surfaceCache);
  const memory = renderMemory();
  try {
    for (;;) {
      if (memory) memory.beginScratch();
      try {
        const preview = createCompositionPreview(
          canvas,
          composition,
          resources,
          {
            ...options,
            sourceCanvas: sources.read,
            prepareSourcePixels: async (prepare) => {
              for (;;) {
                try {
                  prepare();
                  return;
                } catch (error) {
                  if (!(await sources.prepare(error))) throw error;
                }
              }
            },
          },
        );
        memory?.commitScratch();
        return {
          ...preview,
          sourceCacheStatistics: () => sources.statistics,
          dispose() {
            preview.dispose();
            sources.dispose();
          },
        };
      } catch (error) {
        if (memory?.hasScratch) memory.endScratch();
        if (!(await sources.prepare(error))) throw error;
      }
    }
  } catch (error) {
    sources.dispose();
    throw error;
  }
}
