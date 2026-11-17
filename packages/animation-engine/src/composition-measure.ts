/**
 * ET6a: `comp measure`. Measured text geometry of a composition, read in the
 * pinned browser from the same font loading, shaping and text preparation that
 * rendering uses (docs/editorial-typography-improvement-plan.md#et6a--text-measurement-command).
 *
 * Node reads and validates the document, verifies the pinned font files and
 * runs exact-copy font coverage, as `comp validate` does, but prepares no
 * video, sequence, image or audio media: text layout does not depend on them.
 * The browser loads only the fonts, prepares text and returns its
 * measurement. No frame is evaluated, drawn or encoded.
 */
import { dirname, resolve } from "node:path";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import type { BrowserRuntimeOptions } from "@still-shift/execution-runtime/browser";
import type {
  Composition,
  CompositionDiagnostic,
} from "@still-shift/scene-contract";
import {
  PassageError,
  type CompositionTextMeasure,
  type PassageDiagnostic,
} from "@still-shift/renderer-core";
import type * as Renderer from "@still-shift/renderer-core";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";
import { readCompositionDocument } from "./composition-document-read.ts";
import { validatePreparedAssets } from "./prepared-animation-engine.ts";
import {
  checkCompositionFonts,
  compositionFontCoverageProfile,
  type CompositionFontCoverageProfile,
  type CompositionFontCoverageReport,
} from "./composition-font-coverage.ts";
import { withRendererPage } from "./composition-browser-page.ts";

export type CompositionMeasureReport = {
  schemaVersion: "composition-measure-1";
  status: "measured";
  composition: string;
  /** Validation warnings for the measured composition. */
  diagnostics: CompositionDiagnostic[];
  /** ET1 exact-copy coverage of every pinned font, as `comp validate` reports it. */
  fontCoverage: CompositionFontCoverageReport;
} & CompositionTextMeasure;

export type CompositionMeasureOptions = BrowserRuntimeOptions & {
  signal?: AbortSignal | undefined;
  /** The caller turns process signals into an abort of `signal` (the CLI does). */
  ownsProcessSignals?: boolean;
  /** Raise exact-copy font coverage to strict; findings then fail measuring. */
  fontCoverage?: CompositionFontCoverageProfile;
  nodeMemory?: CompositionNodeMemory;
};

/** Measure every text layer of a `composition-1` file (layer-local pixels). */
export async function measureCompositionFile(
  input: string,
  options: CompositionMeasureOptions = {},
): Promise<CompositionMeasureReport> {
  options.signal?.throwIfAborted();
  const sourcePath = resolve(input);
  const owner = new CompositionNodeMemory(options.nodeMemory);
  let composition: Composition;
  let warnings: CompositionDiagnostic[];
  let fontCoverage: CompositionFontCoverageReport;
  let assetPaths: Record<string, string>;
  try {
    const { result } = await readCompositionDocument(
      sourcePath,
      owner,
      options.signal,
    );
    composition = result.composition;
    if (composition.assets.some((asset) => asset.type === "native3d"))
      passageError(
        "comp-measure-unsupported",
        "Text measurement does not prepare native 3D sources; measure the text in a composition without native3d assets",
        { path: "assets" },
      );
    assetPaths = await validatePreparedAssets(
      {
        assets: [],
        fonts: composition.assets.flatMap((a) =>
          a.type === "font" ? [a] : [],
        ),
      },
      dirname(sourcePath),
    );
    const fonts = await checkCompositionFonts(
      composition,
      assetPaths,
      compositionFontCoverageProfile(composition, options.fontCoverage),
    );
    warnings = [...result.diagnostics, ...fonts.warnings];
    fontCoverage = fonts.report;
  } finally {
    owner.dispose();
  }
  options.signal?.throwIfAborted();
  const result = await withRendererPage(
    assetPaths,
    { ...options, cacheDirectoryPrefix: "composition-measure-vite-" },
    (page) =>
      page.evaluate(
        async ({ json }) => {
          const renderer = (
            globalThis as typeof globalThis & {
              __stillShiftLintRenderer: typeof Renderer;
            }
          ).__stillShiftLintRenderer;
          try {
            return {
              ok: true as const,
              measure: await renderer.measureCompositionText(
                JSON.parse(json) as Composition,
                (id: string) => `/_lint/assets/${encodeURIComponent(id)}`,
              ),
            };
          } catch (error) {
            return {
              ok: false as const,
              diagnostics: renderer.passageDiagnostics(error),
            };
          }
        },
        { json: JSON.stringify(composition) },
      ),
  );
  if (!result.ok)
    throw new PassageError(result.diagnostics as PassageDiagnostic[]);
  return {
    schemaVersion: "composition-measure-1",
    status: "measured",
    composition: composition.id,
    diagnostics: warnings,
    fontCoverage,
    ...result.measure,
  };
}
