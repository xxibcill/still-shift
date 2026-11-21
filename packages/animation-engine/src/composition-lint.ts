import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  AnimationEngineError,
  resolveCompositionMediaLimits,
  type Composition,
} from "@still-shift/scene-contract";
import { readFile } from "node:fs/promises";
import {
  analyzeCompositionQuality,
  declaresTextLegibility,
  PassageError,
  textLegibilityFontEvidence,
  type PassageDiagnostic,
  type CompositionQualityPolicy,
  type CompositionBackend,
  type CompositionQualityReport,
} from "@still-shift/renderer-core";
import type { CompositionMediaResourceStats } from "../../renderer-core/src/composition/render/media-resources.ts";
import type * as Renderer from "@still-shift/renderer-core";
import type { BrowserRuntimeOptions } from "@still-shift/execution-runtime/browser";
import { withRendererPage } from "./composition-browser-page.ts";
import { loadComposition } from "./composition-render.ts";

export { closeViteServer } from "./composition-browser-page.ts";

export type CompositionLintReport = CompositionQualityReport & {
  validationDiagnostics: PassageDiagnostic[];
  backend?: CompositionBackend;
  rendererVersion?: string;
  renderStatistics?: ReturnType<
    NonNullable<
      ReturnType<typeof Renderer.createCompositionPreview>["renderStatistics"]
    >
  >;
  textBounds?: NonNullable<
    NonNullable<CompositionQualityPolicy["evaluation"]>["textBounds"]
  >;
  /**
   * ET2: native media decode residency after the last linted frame, with the
   * browser LRU budget (`mediaLimits.decodedFrameBytes`). Present only when
   * `collectMediaStatistics` is set and the composition has video or sequence
   * media, so existing reports keep their bytes.
   */
  mediaStatistics?: Readonly<CompositionMediaResourceStats> & {
    decodedFrameBytesLimit: number;
  };
};

export type CompositionLintOptions = BrowserRuntimeOptions & {
  pixels?: boolean;
  backend?: CompositionBackend;
  collectTextBounds?: boolean;
  collectStatistics?: boolean;
  /** ET2: report native media decode residency (see `mediaStatistics`). */
  collectMediaStatistics?: boolean;
  cacheDirectory?: string;
  nodeMemory?: CompositionNodeMemory;
  signal?: AbortSignal | undefined;
  /**
   * ET2: the caller turns process signals into an abort of `signal` (the CLI
   * does). The pinned browser is then launched without Playwright's process
   * signal handlers, which exit the process before cleanup can finish.
   */
  ownsProcessSignals?: boolean;
  /** ET1: raise exact-copy font coverage to strict; findings then fail loading. */
  fontCoverage?: "legacy" | "strict";
};
export async function lintCompositionFile(
  input: string,
  policy: CompositionQualityPolicy = {},
  options: CompositionLintOptions = {},
): Promise<CompositionLintReport> {
  const owner = new CompositionNodeMemory(options.nodeMemory);
  try {
    return await lintOwnedComposition(input, policy, {
      ...options,
      nodeMemory: owner,
    });
  } finally {
    owner.dispose();
  }
}
async function lintOwnedComposition(
  input: string,
  policy: CompositionQualityPolicy,
  options: CompositionLintOptions & { nodeMemory: CompositionNodeMemory },
): Promise<CompositionLintReport> {
  options.signal?.throwIfAborted();
  const backend = options.backend ?? "canvas2d";
  const loaded = await loadComposition(input, backend, {
    nodeMemory: options.nodeMemory,
    ...(options.cacheDirectory
      ? { cacheDirectory: options.cacheDirectory }
      : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.fontCoverage ? { fontCoverage: options.fontCoverage } : {}),
  }).catch((error: unknown) => {
    if (
      error instanceof AnimationEngineError &&
      typeof error.context?.diagnosticsJson === "string"
    )
      throw new PassageError(
        JSON.parse(error.context.diagnosticsJson) as PassageDiagnostic[],
      );
    throw error;
  });
  options.signal?.throwIfAborted();
  policy = await withTextLegibilityFonts(
    loaded.composition,
    loaded.assetPaths,
    policy,
  );
  options.signal?.throwIfAborted();
  if (!options.pixels)
    return {
      ...analyzeCompositionQuality(loaded.composition, {
        ...policy,
        evaluation: {
          ...policy.evaluation,
          ...(loaded.native3D ? { preparedNative3D: loaded.native3D } : {}),
        },
      }),
      validationDiagnostics: loaded.warnings,
    };
  const result = await withRendererPage(
    loaded.assetPaths,
    { ...options, cacheDirectoryPrefix: "composition-lint-vite-" },
    (page) =>
      page.evaluate(
        async ({
          json,
          preparedMedia,
          preparedNative3D,
          appearanceCodeIdentity,
          policyJson,
          backend,
          collectTextBounds,
          collectStatistics,
          collectMediaStatistics,
          decodedFrameBytesLimit,
        }) => {
          const comp = JSON.parse(json) as Composition;
          const policy = JSON.parse(policyJson) as CompositionQualityPolicy;
          const renderer = (
            globalThis as typeof globalThis & {
              __stillShiftLintRenderer: typeof Renderer;
            }
          ).__stillShiftLintRenderer;
          let preview:
            | ReturnType<typeof renderer.createCompositionPreview>
            | undefined;
          let resources:
            | Awaited<ReturnType<typeof renderer.loadCompositionResources>>
            | undefined;
          try {
            resources = await renderer.loadCompositionResources(
              comp,
              (id: string) => `/_lint/assets/${encodeURIComponent(id)}`,
              {
                ...(preparedMedia ? { preparedMedia } : {}),
                ...(preparedNative3D
                  ? { preparedNative3D, appearanceCodeIdentity }
                  : {}),
              },
            );
            preview = renderer.createCompositionPreview(
              document.createElement("canvas"),
              comp,
              resources,
              { backend, collectStatistics },
            );
            const report = await renderer.analyzeRenderedCompositionQuality(
              comp,
              preview,
              policy,
              renderer.declaresTextLegibility(
                policy,
                comp.metadata?.readingPolicy,
              )
                ? { legibilityResources: resources }
                : {},
            );
            return {
              ok: true as const,
              report,
              ...(collectStatistics
                ? { renderStatistics: preview.renderStatistics?.() }
                : {}),
              ...(collectTextBounds ? { textBounds: preview.textBounds } : {}),
              ...(collectMediaStatistics && resources.media
                ? {
                    mediaStatistics: {
                      ...resources.media.stats(),
                      decodedFrameBytesLimit,
                    },
                  }
                : {}),
            };
          } catch (error) {
            return {
              ok: false as const,
              diagnostics: renderer.passageDiagnostics(error),
            };
          } finally {
            preview?.dispose();
          }
        },
        {
          json: JSON.stringify(loaded.composition),
          preparedMedia: loaded.preparedMedia,
          preparedNative3D: loaded.preparedNative3D,
          appearanceCodeIdentity: loaded.nativeAppearanceCodeIdentity,
          policyJson: JSON.stringify(policy),
          backend,
          collectTextBounds: options.collectTextBounds ?? false,
          collectStatistics: options.collectStatistics ?? false,
          collectMediaStatistics: options.collectMediaStatistics ?? false,
          decodedFrameBytesLimit: resolveCompositionMediaLimits(
            loaded.composition.mediaLimits,
          ).decodedFrameBytes,
        },
      ),
  );
  options.signal?.throwIfAborted();
  if (!result.ok) throw new PassageError(result.diagnostics);
  return {
    ...result.report,
    ...(result.renderStatistics
      ? { renderStatistics: result.renderStatistics }
      : {}),
    validationDiagnostics: loaded.warnings,
    ...(result.textBounds ? { textBounds: result.textBounds } : {}),
    ...(result.mediaStatistics
      ? { mediaStatistics: result.mediaStatistics }
      : {}),
  };
}

/**
 * ET3: when the policy (or the composition's saved reading policy) declares
 * `textLegibility`, read each pinned font's x-height per em from its OS/2
 * table for the `x-height-floor` rule; fonts that cannot be read are kept as
 * unmeasured with their reason. Other lints keep their policy as given.
 */
async function withTextLegibilityFonts(
  composition: Composition,
  assetPaths: Readonly<Record<string, string>>,
  policy: CompositionQualityPolicy,
): Promise<CompositionQualityPolicy> {
  if (!declaresTextLegibility(policy, composition.metadata?.readingPolicy))
    return policy;
  const fonts: { id: string; bytes: ArrayBuffer }[] = [];
  for (const asset of composition.assets) {
    const path = assetPaths[asset.id];
    if (asset.type !== "font" || !path) continue;
    const bytes = await readFile(path);
    fonts.push({
      id: asset.id,
      bytes: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ),
    });
  }
  // WOFF/WOFF2 or unreadable fonts are reported as unmeasured, not thrown.
  return {
    ...policy,
    textLegibilityEvidence: {
      ...policy.textLegibilityEvidence,
      ...textLegibilityFontEvidence(fonts),
    },
  };
}
