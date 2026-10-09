import type { FontAxes } from "../../scene-contract/src/typography.ts";
import { readFontCmap } from "./font-cmap.ts";
import {
  readFontNames,
  readFontAxes,
  readSfntTables,
  requireSfntTable,
  FONT_IDENTITY_LIMITS,
} from "./font-sfnt.ts";
import { passageError, type PassageDiagnostic } from "./passage-diagnostics.ts";
export { FONT_IDENTITY_LIMITS } from "./font-sfnt.ts";

export type FontIdentity = {
  family: string;
  subfamily: string;
  fullName: string;
  postscriptName: string;
  weight: number;
  style: "normal" | "italic" | "oblique";
  axes: FontAxes;
  supportedCmapFormats: (4 | 12)[];
  hasGlyph(codePoint: number): boolean;
};
export type FontDeclaration = {
  id: string;
  sha256: string;
  weight: string;
  style?: string | undefined;
  family?: string | undefined;
  subfamily?: string | undefined;
  postscriptName?: string | undefined;
  axes?: Record<string, number> | undefined;
  variable?: FontAxes | undefined;
  path?: string | undefined;
};
export type FontTextRun = {
  text: string;
  node?: string | undefined;
  span?: string | undefined;
  path?: string | undefined;
  frame?: number | undefined;
  axes?: Record<string, number> | undefined;
};
export type FontValidationDiagnostic = PassageDiagnostic & {
  fontId: string;
  fontSha256: string;
  text?: string;
  span?: string;
  missingCodepoints?: number[];
  missingGlyphs?: { codePoint: number; glyphId: 0; character: string }[];
};
export type FontValidationOptions = {
  profile: "legacy" | "strict";
  textRuns?: readonly (FontTextRun & { fontAsset: string })[] | undefined;
  onDiagnostics?:
    | ((diagnostics: readonly FontValidationDiagnostic[]) => void)
    | undefined;
};

/** Font facts describe pinned bytes; the browser remains the shaper. */
export function readFontIdentity(bytes: ArrayBuffer): FontIdentity {
  const tables = readSfntTables(bytes);
  const os2 = requireSfntTable(tables, "OS/2", 64);
  const weight = os2.getUint16(4),
    selection = os2.getUint16(62);
  if (weight < 1 || weight > 1000)
    passageError("font-metadata", "font-metadata: invalid OS/2 weight class");
  return {
    ...readFontNames(tables),
    weight,
    style: selection & 512 ? "oblique" : selection & 1 ? "italic" : "normal",
    axes: readFontAxes(tables),
    ...readFontCmap(tables),
  };
}

export function inspectFontText(
  identity: FontIdentity,
  declaration: FontDeclaration,
  runs: readonly FontTextRun[],
  options: Pick<FontValidationOptions, "profile"> = { profile: "strict" },
): FontValidationDiagnostic[] {
  if (runs.length > FONT_IDENTITY_LIMITS.textRuns)
    passageError(
      "font-copy-budget",
      "font-copy-budget: too many resolved font runs",
      { path: declaration.path ?? declaration.id },
    );
  const diagnostics = inspectDeclaration(
    identity,
    declaration,
    options.profile,
  );
  let inspectedCodepoints = 0;
  for (const run of runs) {
    diagnostics.push(
      ...inspectAxes(
        identity,
        declaration,
        run.axes ?? {},
        options.profile,
        run,
      ),
    );
    const missing = new Set<number>();
    for (const character of run.text) {
      if (++inspectedCodepoints > FONT_IDENTITY_LIMITS.textCodepoints)
        passageError(
          "font-copy-budget",
          "font-copy-budget: too many reachable code points",
          { path: run.path ?? declaration.path ?? declaration.id },
        );
      const codePoint = character.codePointAt(0)!;
      if (!isShapingControl(codePoint) && !identity.hasGlyph(codePoint))
        missing.add(codePoint);
    }
    if (!missing.size) continue;
    const missingCodepoints = [...missing].sort((a, b) => a - b);
    diagnostics.push({
      ...diagnostic(
        declaration,
        options.profile,
        "font-coverage",
        `Font ${declaration.id} lacks ${missingCodepoints.map(formatCodePoint).join(", ")}`,
        run,
      ),
      text: run.text,
      missingCodepoints,
      missingGlyphs: missingCodepoints.map((codePoint) => ({
        codePoint,
        glyphId: 0,
        character: String.fromCodePoint(codePoint),
      })),
    });
  }
  return diagnostics;
}
function inspectDeclaration(
  identity: FontIdentity,
  declaration: FontDeclaration,
  profile: FontValidationOptions["profile"],
) {
  const diagnostics: FontValidationDiagnostic[] = [];
  const weight = Number(declaration.weight),
    range = identity.axes.wght;
  if (
    !Number.isFinite(weight) ||
    (range
      ? weight < range.min || weight > range.max
      : weight !== identity.weight)
  )
    diagnostics.push(
      diagnostic(
        declaration,
        profile,
        "font-cut-identity",
        `Font ${declaration.id} declares weight ${declaration.weight}; pinned cut is ${identity.weight}${range ? ` with wght range ${range.min}–${range.max}` : ""}`,
      ),
    );
  if ((declaration.style ?? "normal") !== identity.style)
    diagnostics.push(
      diagnostic(
        declaration,
        profile,
        "font-cut-identity",
        `Font ${declaration.id} declares style ${declaration.style ?? "normal"}; pinned cut is ${identity.style}`,
      ),
    );
  for (const key of ["family", "subfamily", "postscriptName"] as const)
    if (declaration[key] !== undefined && declaration[key] !== identity[key])
      diagnostics.push(
        diagnostic(
          declaration,
          profile,
          "font-cut-identity",
          `Font ${declaration.id} declares ${key} ${declaration[key]}; pinned identity is ${identity[key]}`,
        ),
      );
  if (declaration.variable && !sameAxes(declaration.variable, identity.axes))
    diagnostics.push(
      diagnostic(
        declaration,
        profile,
        "font-axis-metadata",
        `Font ${declaration.id} declares axis metadata different from pinned bytes`,
      ),
    );
  diagnostics.push(
    ...inspectAxes(identity, declaration, declaration.axes ?? {}, profile),
  );
  return diagnostics;
}
function inspectAxes(
  identity: FontIdentity,
  declaration: FontDeclaration,
  axes: Record<string, number>,
  profile: FontValidationOptions["profile"],
  run?: FontTextRun,
) {
  return Object.entries(axes).flatMap(([tag, value]) => {
    const range = identity.axes[tag];
    return !range ||
      !Number.isFinite(value) ||
      value < range.min ||
      value > range.max
      ? [
          diagnostic(
            declaration,
            profile,
            "font-axis-range",
            `Font ${declaration.id} does not support ${tag}=${value}`,
            run,
          ),
        ]
      : [];
  });
}
function diagnostic(
  declaration: FontDeclaration,
  profile: FontValidationOptions["profile"],
  code: string,
  message: string,
  run?: FontTextRun,
): FontValidationDiagnostic {
  return {
    code,
    message,
    severity: profile === "strict" ? "error" : "warning",
    fontId: declaration.id,
    fontSha256: declaration.sha256,
    path: run?.path ?? declaration.path ?? declaration.id,
    ...(run?.node ? { node: run.node } : {}),
    ...(run?.span ? { span: run.span } : {}),
    ...(run?.frame === undefined ? {} : { frame: run.frame }),
  };
}
function formatCodePoint(codePoint: number) {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}
function isShapingControl(codePoint: number) {
  return (
    codePoint === 9 ||
    codePoint === 10 ||
    codePoint === 13 ||
    codePoint === 0x200b ||
    codePoint === 0xfeff ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef) ||
    codePoint === 0x200c ||
    codePoint === 0x200d ||
    codePoint === 0x200e ||
    codePoint === 0x200f ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069)
  );
}

function sameAxes(declared: FontAxes, actual: FontAxes) {
  return (
    Object.keys(declared).length === Object.keys(actual).length &&
    Object.entries(declared).every(([tag, range]) => {
      const source = actual[tag];
      return (
        source &&
        source.min === range.min &&
        source.default === range.default &&
        source.max === range.max
      );
    })
  );
}
