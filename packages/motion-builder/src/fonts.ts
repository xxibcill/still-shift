import {
  compositionWarnings,
  formatJsonPath,
  type Composition,
  type CompositionDiagnostic,
} from "@still-shift/scene-contract";
/** Authored fonts must be pinned; explicit adapter provenance retains the warning. */
export function authoredFontDiagnostics(
  composition: Composition,
): CompositionDiagnostic[] {
  return compositionWarnings(composition).flatMap((warning) => {
    if (warning.code !== "comp-text-system-font") return [];
    const scope =
      warning.path[0] === "precomps"
        ? composition.precomps![Number(warning.path[1])]!
        : composition;
    const index = Number(warning.path[warning.path.indexOf("layers") + 1]);
    if (scope.layers[index]?.source?.family) return [];
    return [
      {
        code: warning.code,
        severity: "error" as const,
        path: formatJsonPath(warning.path),
        message: warning.message,
      },
    ];
  });
}
