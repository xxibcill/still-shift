/**
 * ET1 exact-copy font coverage for `composition-1`
 * (docs/editorial-typography-improvement-plan.md#et1--exact-copy-font-coverage-gate).
 *
 * Reachable copy is collected exactly as font preparation collects it
 * (`text-scenes.ts`), each resolved run is checked against its pinned font's
 * `cmap` (`font-identity.ts`), and code points the font lacks may resolve to the
 * font asset's declared, pinned `fallbacks`. The module is pure: Node validation
 * and browser font preparation share it, so both assign the same code points to
 * the same faces.
 */
import type { Composition } from "@still-shift/scene-contract";
import { formatJsonPath } from "@still-shift/scene-contract";
import {
  formatCodePoint,
  inspectFontText,
  isShapingControl as isControl,
  readFontIdentity,
  type FontIdentity,
  type FontValidationDiagnostic,
} from "../font-identity.ts";
import type { CollectedFontTextRun } from "../font-copy.ts";
import { passageDiagnostics } from "../passage-diagnostics.ts";
import {
  fontContainerLabel,
  sfntContainer,
  type FontContainer,
} from "../font-sfnt.ts";
import {
  compositionFontTextRuns,
  pinned,
  scopes,
  textLayers,
  textNode,
  typographyScene,
} from "./render/text-scenes.ts";

export type CompositionFontCoverageProfile = "legacy" | "strict";
/** A coverage finding in composition diagnostic shape (JSON `path`). */
export type CompositionFontDiagnostic = Omit<
  FontValidationDiagnostic,
  "path"
> & {
  path: string;
  /** Root layer id or `precomp-id/layer-id`, for findings about copy. */
  layer?: string;
};
export type CompositionFontIdentity = {
  id: string;
  sha256: string;
  family: string;
  subfamily: string;
  postscriptName: string;
  weight: number;
  style: FontIdentity["style"];
  axes: FontIdentity["axes"];
  cmapFormats: (4 | 12)[];
};
/** Code points of one run drawn by a declared fallback instead of its font. */
export type CompositionFontFallbackRun = {
  layer: string;
  path: string;
  span?: string;
  font: string;
  fallback: string;
  fallbackSha256: string;
  codePoints: string[];
};
export type CompositionFontCoverageReport = {
  profile: CompositionFontCoverageProfile;
  /**
   * Every reachable code point was inspected and is in its pinned font or a
   * declared fallback. False when a font or the reachable copy could not be
   * inspected (for example `font-copy-budget`), never a guess.
   */
  covered: boolean;
  /** Resolved font runs and distinct reachable code points inspected. */
  runs: number;
  codePoints: number;
  fonts: CompositionFontIdentity[];
  fallbackRuns: CompositionFontFallbackRun[];
  /**
   * Fallback faces join the font's family under `unicode-range`; the browser
   * still shapes, so the actual face per glyph is not measured.
   */
  fallbackResolution: "none" | "declared-unicode-range";
};
/** Per font asset, the fallback faces and the exact code points they draw. */
export type CompositionFontFallbackPlan = Map<
  string,
  { fallback: string; codePoints: number[] }[]
>;

/** Collect reachable copy per resolved font run, as font preparation does. */
export function compositionCopyRuns(comp: Composition): CollectedFontTextRun[] {
  const typed = scopes(comp).map(([scope]) =>
    typographyScene(
      comp,
      scope,
      textLayers(scope)
        .map((layer) => textNode(comp, layer))
        .filter((node) => pinned(comp, node)),
    ),
  );
  return compositionFontTextRuns(comp, typed);
}

const fontConversionHints: Record<Exclude<FontContainer, "sfnt">, string> = {
  woff: "Decompress it, for example `fonttools ttLib font.woff -o font.ttf`",
  woff2: "Decompress it, for example `fonttools ttLib font.woff2 -o font.ttf`",
  collection:
    "Extract one face, for example `fonttools ttLib -y 0 fonts.ttc -o font.ttf`",
  unknown: "Supply the font's original TTF or OTF file",
};

/** Inspect every pinned font against its reachable copy. Never throws for font data. */
export function inspectCompositionFonts(
  comp: Composition,
  bytes: ReadonlyMap<string, ArrayBuffer>,
  profile: CompositionFontCoverageProfile,
): {
  report: CompositionFontCoverageReport;
  diagnostics: CompositionFontDiagnostic[];
} {
  const severity: "error" | "warning" =
    profile === "strict" ? "error" : "warning";
  const fonts = comp.assets.flatMap((asset, index) =>
    asset.type === "font" ? [{ asset, index }] : [],
  );
  const diagnostics: CompositionFontDiagnostic[] = [];
  const identities = new Map<string, FontIdentity>();
  for (const { asset, index } of fonts) {
    const source = bytes.get(asset.id);
    const container = source ? sfntContainer(source) : "sfnt";
    if (container !== "sfnt") {
      // Every composition font is read as SFNT for layout metrics, so this is
      // an error in either profile: the browser would otherwise fail opaquely.
      diagnostics.push({
        code: "font-format",
        severity: "error",
        message:
          `Font ${asset.id} is a ${fontContainerLabel(container)}; ` +
          "composition fonts must be SFNT TTF or OTF files. " +
          `${fontConversionHints[container]}, then pin the converted ` +
          "file's path and sha256.",
        path: formatJsonPath(["assets", index, "path"]),
        fontId: asset.id,
        fontSha256: asset.sha256,
      });
      continue;
    }
    try {
      if (!source) throw new Error(`font bytes unavailable: ${asset.id}`);
      identities.set(asset.id, readFontIdentity(source));
    } catch (error) {
      diagnostics.push(
        ...passageDiagnostics(error).map((finding) => ({
          ...finding,
          code:
            finding.code === "invalid-scene" ? "font-metadata" : finding.code,
          severity,
          message: `Font ${asset.id} cannot be inspected: ${finding.message}`,
          path: formatJsonPath(["assets", index]),
          fontId: asset.id,
          fontSha256: asset.sha256,
        })),
      );
    }
  }
  let runs: CollectedFontTextRun[] = [];
  // Cleared when copy or a font's runs cannot be inspected: coverage is then unknown.
  let inspected = true;
  try {
    runs = compositionCopyRuns(comp);
  } catch (error) {
    inspected = false;
    diagnostics.push(
      ...passageDiagnostics(error).map((finding) => ({
        ...finding,
        severity,
        message: `Reachable copy cannot be inspected: ${finding.message}`,
        path: formatJsonPath(dottedPath(finding.path ?? "")),
        fontId: "",
        fontSha256: "",
      })),
    );
  }
  const plan = fallbackPlan(comp, identities, runs);
  const fallbackRuns: CompositionFontFallbackRun[] = [];
  for (const { asset, index } of fonts) {
    const identity = identities.get(asset.id);
    if (!identity) continue;
    const fontRuns = runs.filter((run) => run.fontAsset === asset.id);
    const resolved = new Map(
      (plan.get(asset.id) ?? []).flatMap(({ fallback, codePoints }) =>
        codePoints.map((codePoint) => [codePoint, fallback] as const),
      ),
    );
    let found: FontValidationDiagnostic[];
    try {
      found = inspectFontText(
        identity,
        {
          id: asset.id,
          sha256: asset.sha256,
          weight: asset.weight,
          style: asset.style,
          variable: asset.variable,
          path: `assets.${index}`,
        },
        fontRuns,
        { profile },
      );
    } catch (error) {
      inspected = false;
      found = passageDiagnostics(error).map((finding) => ({
        ...finding,
        severity,
        fontId: asset.id,
        fontSha256: asset.sha256,
      }));
    }
    for (const finding of found) {
      const missing = finding.missingCodepoints?.filter(
        (codePoint) => !resolved.has(codePoint),
      );
      if (missing && !missing.length) continue;
      diagnostics.push(
        compositionDiagnostic(
          missing
            ? {
                ...finding,
                message: `Font ${asset.id} lacks ${missing.map(formatCodePoint).join(", ")}`,
                missingCodepoints: missing,
                missingGlyphs: missing.map((codePoint) => ({
                  codePoint,
                  glyphId: 0 as const,
                  character: String.fromCodePoint(codePoint),
                })),
              }
            : finding,
          comp,
        ),
      );
    }
    for (const run of fontRuns) {
      const byFallback = new Map<string, Set<number>>();
      for (const character of run.text) {
        const fallback = resolved.get(character.codePointAt(0)!);
        if (!fallback) continue;
        const codePoints = byFallback.get(fallback) ?? new Set<number>();
        codePoints.add(character.codePointAt(0)!);
        byFallback.set(fallback, codePoints);
      }
      for (const [fallback, codePoints] of byFallback)
        fallbackRuns.push({
          layer: layerLabel(comp, run.path ?? ""),
          path: formatJsonPath(dottedPath(run.path ?? "")),
          ...(run.span ? { span: run.span } : {}),
          font: asset.id,
          fallback,
          fallbackSha256: sha256Of(comp, fallback),
          codePoints: [...codePoints]
            .sort((a, b) => a - b)
            .map(formatCodePoint),
        });
      diagnostics.push(
        ...splitClusters(run, identity, resolved).map((cluster) =>
          compositionDiagnostic(
            {
              code: "font-fallback-cluster",
              severity,
              message: `Font ${asset.id} and its fallbacks split the cluster "${cluster}" between faces`,
              fontId: asset.id,
              fontSha256: asset.sha256,
              text: run.text,
              path: run.path ?? `assets.${index}`,
              ...(run.node ? { node: run.node } : {}),
              ...(run.span ? { span: run.span } : {}),
            },
            comp,
          ),
        ),
      );
    }
  }
  const reachable = new Set(
    runs.flatMap((run) => [...run.text].map((c) => c.codePointAt(0)!)),
  );
  return {
    report: {
      profile,
      covered:
        !diagnostics.some((finding) =>
          ["font-coverage", "font-fallback-cluster"].includes(finding.code),
        ) &&
        identities.size === fonts.length &&
        inspected,
      runs: runs.length,
      codePoints: reachable.size,
      fonts: fonts.flatMap(({ asset }) => {
        const identity = identities.get(asset.id);
        return identity
          ? [
              {
                id: asset.id,
                sha256: asset.sha256,
                family: identity.family,
                subfamily: identity.subfamily,
                postscriptName: identity.postscriptName,
                weight: identity.weight,
                style: identity.style,
                axes: identity.axes,
                cmapFormats: [...identity.supportedCmapFormats].sort(
                  (a, b) => a - b,
                ),
              },
            ]
          : [];
      }),
      fallbackRuns,
      fallbackResolution: fallbackRuns.length
        ? "declared-unicode-range"
        : "none",
    },
    diagnostics,
  };
}

/**
 * Assign each reachable code point a font lacks to the first declared fallback
 * that has it. Fallbacks are never followed transitively.
 *
 * Only fonts that declare or serve as fallbacks are read, and a font whose
 * identity cannot be read is skipped exactly as `inspectCompositionFonts` skips
 * it, so the browser plan matches the Node gate and legacy inputs that the gate
 * only warns about still render.
 */
export function compositionFontFallbacks(
  comp: Composition,
  bytes: ReadonlyMap<string, ArrayBuffer>,
): CompositionFontFallbackPlan {
  const involved = new Set(
    comp.assets.flatMap((asset) =>
      asset.type === "font" && asset.fallbacks?.length
        ? [asset.id, ...asset.fallbacks]
        : [],
    ),
  );
  if (!involved.size) return new Map();
  const identities = new Map<string, FontIdentity>();
  for (const id of involved) {
    const source = bytes.get(id);
    if (!source) continue;
    try {
      identities.set(id, readFontIdentity(source));
    } catch {
      // Reported by the Node gate; such a font neither has nor draws fallbacks.
    }
  }
  return fallbackPlan(comp, identities, compositionCopyRuns(comp));
}

function fallbackPlan(
  comp: Composition,
  identities: ReadonlyMap<string, FontIdentity>,
  runs: readonly CollectedFontTextRun[],
): CompositionFontFallbackPlan {
  const plan: CompositionFontFallbackPlan = new Map();
  for (const asset of comp.assets) {
    if (asset.type !== "font" || !asset.fallbacks?.length) continue;
    const primary = identities.get(asset.id);
    if (!primary) continue;
    const lacking = new Set<number>();
    for (const run of runs)
      if (run.fontAsset === asset.id)
        for (const character of run.text) {
          const codePoint = character.codePointAt(0)!;
          if (!isControl(codePoint) && !primary.hasGlyph(codePoint))
            lacking.add(codePoint);
        }
    const faces = asset.fallbacks.flatMap((fallback) => {
      const identity = identities.get(fallback);
      if (!identity) return [];
      const codePoints = [...lacking]
        .filter((codePoint) => identity.hasGlyph(codePoint))
        .sort((a, b) => a - b);
      for (const codePoint of codePoints) lacking.delete(codePoint);
      return codePoints.length ? [{ fallback, codePoints }] : [];
    });
    if (faces.length) plan.set(asset.id, faces);
  }
  return plan;
}

/** Clusters whose code points would be drawn by more than one face. */
function splitClusters(
  run: CollectedFontTextRun,
  primary: FontIdentity,
  resolved: ReadonlyMap<number, string>,
): string[] {
  if (!resolved.size) return [];
  const split: string[] = [];
  for (const { segment } of new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(run.text)) {
    const faces = new Set(
      [...segment].flatMap((character) => {
        const codePoint = character.codePointAt(0)!;
        if (isControl(codePoint)) return [];
        if (primary.hasGlyph(codePoint)) return [""];
        const fallback = resolved.get(codePoint);
        return fallback ? [fallback] : [];
      }),
    );
    if (faces.size > 1 && !split.includes(segment)) split.push(segment);
  }
  return split;
}

function compositionDiagnostic(
  finding: FontValidationDiagnostic,
  comp: Composition,
): CompositionFontDiagnostic {
  const dotted = finding.path ?? "";
  const copy = /^(?:precomps\.\d+\.)?layers\.\d+/u.test(dotted);
  const layer = copy ? layerLabel(comp, dotted) : undefined;
  return {
    ...finding,
    path: formatJsonPath(dottedPath(dotted)),
    ...(layer
      ? {
          layer,
          message: `${finding.message} in layer "${layer}" (${formatJsonPath(dottedPath(dotted))}${finding.span ? `, span "${finding.span}"` : ""})`,
        }
      : {}),
  };
}

/** `precomps.0.layers.2.text` → root layer id or `precomp-id/layer-id`. */
function layerLabel(comp: Composition, dotted: string) {
  const match = /^(?:precomps\.(\d+)\.)?layers\.(\d+)/u.exec(dotted);
  if (!match) return dotted;
  const scope =
    match[1] === undefined ? comp : comp.precomps?.[Number(match[1])];
  const layer = scope?.layers[Number(match[2])];
  if (!scope || !layer) return dotted;
  return scope === comp ? layer.id : `${scope.id}/${layer.id}`;
}
function dottedPath(dotted: string): (string | number)[] {
  return dotted
    ? dotted
        .split(".")
        .map((part) => (/^\d+$/u.test(part) ? Number(part) : part))
    : [];
}
function sha256Of(comp: Composition, id: string) {
  const asset = comp.assets.find((candidate) => candidate.id === id);
  return asset && "sha256" in asset ? String(asset.sha256) : "";
}
