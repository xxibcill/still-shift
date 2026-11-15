import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type {
  Composition,
  CompositionDiagnostic,
} from "@still-shift/scene-contract";
import {
  inspectCompositionFonts,
  type CompositionFontCoverageProfile,
  type CompositionFontCoverageReport,
} from "../../renderer-core/src/composition/font-coverage.ts";
import { PassageError } from "../../renderer-core/src/passage-diagnostics.ts";

export type { CompositionFontCoverageProfile, CompositionFontCoverageReport };

/** The stricter of the composition's declaration and the caller's request. */
export function compositionFontCoverageProfile(
  composition: Composition,
  requested?: CompositionFontCoverageProfile,
): CompositionFontCoverageProfile {
  return composition.fontCoverage === "strict" || requested === "strict"
    ? "strict"
    : "legacy";
}

/**
 * ET1 gate: check exact reachable copy against the pinned font bytes before any
 * browser work. Strict coverage findings throw; legacy findings are returned as
 * warnings and never change what renders.
 */
export async function checkCompositionFonts(
  composition: Composition,
  assetPaths: Readonly<Record<string, string>>,
  profile: CompositionFontCoverageProfile,
): Promise<{
  report: CompositionFontCoverageReport;
  warnings: CompositionDiagnostic[];
}> {
  const bytes = new Map<string, ArrayBuffer>();
  for (const asset of composition.assets) {
    if (asset.type !== "font") continue;
    const path = assetPaths[asset.id];
    if (!path) continue;
    const buffer = await readFile(path);
    // Bind coverage to the same bytes the checksum admitted.
    if (
      `sha256:${createHash("sha256").update(buffer).digest("hex")}` ===
      asset.sha256
    )
      bytes.set(asset.id, Uint8Array.from(buffer).buffer);
  }
  const { report, diagnostics } = inspectCompositionFonts(
    composition,
    bytes,
    profile,
  );
  const errors = diagnostics.filter((finding) => finding.severity === "error");
  if (errors.length) throw new PassageError(errors);
  return { report, warnings: diagnostics };
}
