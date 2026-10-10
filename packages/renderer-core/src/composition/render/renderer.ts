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
import type { RenderGraphOptions } from "./graph.ts";
import {
  validateComposition,
  type Composition,
  type CompositionPreparedMedia,
  type CompositionPreparedAudio,
  type CompositionPreparedNative3D,
  NativeAppearanceCodeIdentitySchema,
  type NativeAppearanceCodeIdentity,
  type NativeObservedSample,
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
import type { Bounds, EvaluationOptions } from "../evaluate/types.ts";
import type { PreparedNative3DScene } from "../../native3d/types.ts";
import type { NativeDepthRuntimeFactory } from "../../native3d/runtime.ts";
import { prepareCompositionNative3D } from "../../native3d/prepare.ts";
import { canonicalMechanismJson } from "../../mechanism/canonical.ts";
import { createNativeObservationCollector } from "../../native3d/observations.ts";
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
  preparedNative3D?: CompositionPreparedNative3D;
  nativeAppearanceCodeIdentity?: NativeAppearanceCodeIdentity;
  nativeAppearanceCodeSha256?: string;
  canvas: { width: number; height: number };
  timeline: { fps: number; frameCount: number; durationMs: number };
};

export function compositionScene(
  composition: Composition,
  backend: CompositionBackend = "canvas2d",
): CompositionScene {
  const result = validateComposition(composition);
  if (!result.ok) throw new PassageError(result.diagnostics);
  if (
    backend !== "webgl2" &&
    composition.assets.some((asset) => asset.type === "native3d")
  )
    passageError("comp-native3d-backend", "Native 3D requires WebGL2", {
      path: "backend",
    });
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
  preparedNative3D?: CompositionPreparedNative3D;
  native3D?: Readonly<Record<string, PreparedNative3DScene>>;
  nativeDepthFactory?: NativeDepthRuntimeFactory;
  nativeAppearanceCodeIdentity?: NativeAppearanceCodeIdentity;
  nativeAppearanceCodeSha256?: string;
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
    preparedNative3D?: CompositionPreparedNative3D;
    appearanceCodeIdentity?: NativeAppearanceCodeIdentity;
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
    const hasNative = composition.assets.some(
      (asset) => asset.type === "native3d",
    );
    if (
      hasNative &&
      (!options.preparedNative3D || !options.appearanceCodeIdentity)
    )
      passageError(
        "comp-native3d-not-ready",
        "Prepare native source and pinned appearance identity before loading resources",
        { path: "preparedNative3D" },
      );
    const native3D = hasNative
      ? await prepareCompositionNative3D(composition, options.preparedNative3D!)
      : undefined;
    const appearanceCodeIdentity = hasNative
      ? NativeAppearanceCodeIdentitySchema.parse(options.appearanceCodeIdentity)
      : undefined;
    const nativeAppearanceCodeSha256 = appearanceCodeIdentity
      ? `sha256:${await sha256Hex(new TextEncoder().encode(canonicalMechanismJson(appearanceCodeIdentity)).buffer)}`
      : undefined;
    const nativeDepthFactory = hasNative
      ? (await import("../../native3d/browser.ts")).createNativeDepthRuntime
      : undefined;
    options.signal?.throwIfAborted();
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
    const fonts = await loadCompositionFonts(
      composition,
      assetUrl,
      undefined,
      native3D ? { preparedNative3D: native3D } : {},
    );
    options.signal?.throwIfAborted();
    return {
      images,
      ...(native3D
        ? {
            native3D,
            preparedNative3D: options.preparedNative3D!,
            nativeDepthFactory: nativeDepthFactory!,
            nativeAppearanceCodeIdentity: appearanceCodeIdentity!,
            nativeAppearanceCodeSha256: nativeAppearanceCodeSha256!,
          }
        : {}),
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
  /** Completed actual passes from this output frame only; no cached replay. */
  nativeObservations?: readonly NativeObservedSample[];
};

export type CompositionPreview = {
  renderStatistics?: () => CompositionRenderStatistics["statistics"];
  sourceCacheStatistics?: () => CompositionSourceCache["statistics"];
  readonly backend: CompositionBackend;
  readonly rendererVersion: string;
  readPixels(): Uint8ClampedArray;
  /** Measured local text bounds per state, as supplied to the evaluator. */
  textBounds: Record<string, Bounds[]>;
  /** Runtime-only immutable native lookup; never serialize into a saved policy. */
  evaluationOptions?: EvaluationOptions;
  /** Still-only frames are ready synchronously; native media returns its loading promise. */
  prepareFrame(frame: number): Promise<void> | void;
  surfaceCacheStatistics?(): CompositionSurfaceCache<Surface>["statistics"];
  rootCacheStatistics?(): CompositionRootCache<Surface>["statistics"];
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
  /** Carry the authored background alpha; opaque preview remains the default. */
  preserveAlpha?: boolean;
  surfaceCache?: CompositionSurfaceCacheOptions;
  sourceCanvas?: CanvasPixelSource;
  prepareSourcePixels?: (prepare: () => void | Promise<void>) => Promise<void>;
  collectStatistics?: boolean;
  collectNativeObservations?: boolean;
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
 * The default canvas is opaque. Alpha-capable exports opt into a transparent root.
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
  const kind = options.backend ?? "canvas2d";
  const hasNative = composition.assets.some(
    (asset) => asset.type === "native3d",
  );
  if (hasNative && kind !== "webgl2")
    passageError("comp-native3d-backend", "Native 3D requires WebGL2", {
      path: "backend",
    });
  if (
    hasNative &&
    (!resources.native3D ||
      !resources.nativeDepthFactory ||
      !resources.nativeAppearanceCodeSha256)
  )
    passageError(
      "comp-native3d-not-ready",
      "Prepare native catalogue, renderer and appearance identity before preview",
      { path: "preparedNative3D" },
    );
  const evaluationOptions: EvaluationOptions = {
    ...(resources.native3D ? { preparedNative3D: resources.native3D } : {}),
    ...(options.collectNativeObservations
      ? { nativeObservationRequired: true }
      : {}),
  };
  canvas.width = composition.width;
  canvas.height = composition.height;
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
    validateStoryCompositionCoverage(
      composition,
      readAssetPixels,
      options.validationFrames,
    );
    text = prepareCompositionText(
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
      options.sourceCanvas,
      evaluationOptions,
    );
  } finally {
    if (kind === "webgl2") releaseRenderCanvas(measurementCanvas);
  }
  const renderingOptions: RenderGraphOptions = {
    ...evaluationOptions,
    nativeArtworkBounds: text.nativeContentBounds,
  };
  const drawProvider = prepareCompositionProviders(
    composition,
    {
      ...resources,
      softwareRaster: requiresSoftwareFilters(composition),
      ...(options.sourceCanvas ? { sourceCanvas: options.sourceCanvas } : {}),
    },
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
    ...(resources.native3D
      ? {
          native3D: resources.native3D,
          nativeDepthFactory: resources.nativeDepthFactory!,
          nativeAppearanceCodeSha256: resources.nativeAppearanceCodeSha256!,
          nativeTextureFont: (id: string) => {
            const asset = composition.assets.find(
              (asset) => asset.id === id && asset.type === "native3d",
            );
            if (!asset || asset.type !== "native3d" || !asset.textureFont)
              return undefined;
            const font = resources.fonts.get(asset.textureFont);
            const descriptor = composition.assets.find(
              (candidate) =>
                candidate.id === asset.textureFont && candidate.type === "font",
            );
            return font && descriptor
              ? {
                  family: font.family,
                  weight: font.weight,
                  sha256: descriptor.sha256,
                }
              : undefined;
          },
        }
      : {}),
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
    const statistics = options.collectStatistics
      ? new CompositionRenderStatistics()
      : undefined;
    const observations =
      options.collectNativeObservations && hasNative
        ? createNativeObservationCollector()
        : undefined;
    const previewOptions = {
      ...backendOptions,
      ...(observations ? { observeNativeFrame: observations.observe } : {}),
      ...(statistics ? { statistics } : {}),
    };
    if (kind === "webgl2") {
      const backend = createWebgl2Backend(targetCanvas, {
        ...previewOptions,
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
    const targetContext = targetCanvas.getContext("2d", {
      alpha: options.preserveAlpha === true,
      ...(softwareRaster ? { willReadFrequently: true } : {}),
    });
    if (!targetContext) throw Error("Canvas 2D is unavailable");
    const backend = createCanvas2dBackend(previewOptions);
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
      let cache: CompositionFrameCache | undefined;
      let preparedFrame: number | undefined;
      let surfaceCache: CompositionSurfaceCache<S> | undefined;
      let rootCache: CompositionRootCache<S> | undefined;
      try {
        if (kind === "webgl2" && !observations)
          cache = createCompositionFrameCache();
        if (options.surfaceCache && !hasNative) {
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
        if (
          validateCoverage &&
          !resources.media &&
          !surfaceCache &&
          !hasNative
        ) {
          validateRenderedCinematicCompositionCoverage(
            composition,
            readAssetPixels,
            backend,
            { ...renderingOptions, textBounds: text.bounds },
          );
          coverageDiagnostics = validateRequiredCompositionCoverage(
            composition,
            backend,
            { ...renderingOptions, textBounds: text.bounds },
            options.coverageSeverity ?? "error",
            requiredRootLayers,
            options.validationFrames,
          );
        }
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
        ...(resources.native3D ? { evaluationOptions } : {}),
        ...(statistics
          ? { renderStatistics: () => statistics.statistics }
          : {}),
        ...(surfaceCache
          ? { surfaceCacheStatistics: () => surfaceCache.statistics }
          : {}),
        ...(rootCache
          ? { rootCacheStatistics: () => rootCache.statistics }
          : {}),
        prepareFrame(frame) {
          if (
            !Number.isInteger(frame) ||
            frame < 0 ||
            frame >= composition.frameCount
          )
            throw Error("Frame index outside composition timeline");
          if (!resources.media && !surfaceCache && !hasNative) return;
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
                { ...renderingOptions, textBounds: text.bounds },
                options.coverageSeverity ?? "error",
                requiredRootLayers,
              );
              const prepare = async (at: number) => {
                await resources.media?.prepareFrame(at, {
                  ...evaluationOptions,
                  textBounds: text.bounds,
                  cull: false,
                });
                if (surfaceCache)
                  for (const {
                    graph,
                    node,
                  } of compositionRequiredCoverageGraphs(
                    composition,
                    at,
                    {
                      ...renderingOptions,
                      textBounds: text.bounds,
                    },
                    requiredRootLayers,
                  )) {
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
                if (required && selected.has(at) && !validated.has(at)) {
                  coverageDiagnostics.push(...validate(at));
                  validated.add(at);
                }
              };
              try {
                const validateCinematic = async () => {
                  await validateRenderedCinematicCompositionCoverageAsync(
                    composition,
                    readAssetPixels,
                    backend,
                    prepare,
                    { ...renderingOptions, textBounds: text.bounds },
                  );
                };
                if (options.prepareSourcePixels)
                  await options.prepareSourcePixels(validateCinematic);
                else await validateCinematic();
                if (required)
                  for (const at of frames)
                    if (!validated.has(at)) await prepare(at);
              } finally {
                backend.endFrame?.(false);
              }
            })();
          return initialization.then(async () => {
            await resources.media?.prepareFrame(frame, {
              ...evaluationOptions,
              textBounds: text.bounds,
            });
            if (surfaceCache)
              for (const { graph } of compositionRenderGraphs(
                composition,
                frame,
                { ...renderingOptions, textBounds: text.bounds },
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
          if ((surfaceCache || hasNative) && preparedFrame !== frame)
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
          observations?.begin();
          try {
            const report = renderCompositionExposure(
              backend,
              target,
              composition,
              frame,
              { ...renderingOptions, textBounds: text.bounds },
              cache,
            );
            if (report.samples > 0) present();
            const nativeObservations = observations?.finish();
            return {
              ...report,
              ...(nativeObservations ? { nativeObservations } : {}),
              ...(coverageDiagnostics.length
                ? {
                    diagnostics: [
                      ...report.diagnostics,
                      ...coverageDiagnostics,
                    ],
                  }
                : {}),
            };
          } catch (error) {
            observations?.abort();
            throw error;
          }
        },
        dispose() {
          observations?.dispose();
          if (cache) releaseCompositionFrameCache(cache);
          rootCache?.dispose();
          surfaceCache?.dispose();
          if (ownsMedia) text.dispose();
          backend.dispose();
          statistics?.dispose();
          if (ownsMedia) resources.media?.dispose();
          targetCanvas.width = composition.width;
        },
      };
    }
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
                  await prepare();
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
