import type { z } from "zod";
import { CompositionSchema, type Composition } from "./composition.ts";
import { compositionWarnings } from "./validate.ts";

/**
 * Every diagnostic code `validateComposition` can return. Codes are stable: add new
 * ones, never rename. docs/composition-reference.md documents each one.
 */
export const COMPOSITION_DIAGNOSTICS = {
  // Structure (mapped from schema issues)
  "comp-schema-version": "`schemaVersion` is not `composition-1`.",
  "comp-schema-type": "A value has the wrong JSON type.",
  "comp-schema-unknown-key":
    "An object has a field the contract does not define.",
  "comp-schema-value":
    "A value is not one of the allowed literals or enum members.",
  "comp-schema-format":
    "A string does not match its required format (id, colour, hash).",
  "comp-schema-range": "A number is outside its allowed range.",
  "comp-schema-union":
    "A value matches none of the allowed forms (for example an unknown layer `type`).",
  "comp-schema": "Any other structural error.",
  "comp-limit": "An array, string or record exceeds its size limit.",
  "comp-effect-layer":
    "An effect input slot is missing, undeclared or outside its scope.",
  "comp-effect-cycle":
    "Layer inputs, mattes or group descendants form a render dependency cycle.",
  "comp-effect-budget":
    "The scoped effect source graph exceeds its bounded work budget.",
  "comp-effect-registration":
    "Effect registration requires a unique ID, valid definition and GPU callback.",
  "comp-effect-surface":
    "Effect scratch textures and output must belong to the current callback and meet size/budget constraints.",
  "comp-effect-version":
    "Registered effect versions differ from the captured export snapshot.",
  "comp-effect-params":
    "Check evaluated effect controls and their cross-parameter invariants.",
  "comp-effect-curve":
    "Evaluated color curve points must be bounded, ordered and span the input domain.",
  "comp-effect-bounds":
    "An effect bounds callback failed or returned a non-finite/reversed rectangle.",
  // Keys and animated values
  "comp-key-order": "Key frames are not strictly increasing.",
  "comp-sample-time-order": "Baked sample times are not strictly increasing.",
  "comp-motion-blur-range":
    "The exposure interval or cut list is outside the composition or not increasing.",
  "comp-key-smooth": "A smooth key is the first or last key.",
  "comp-key-bezier": '`interpolation: "bezier"` without `bezier` handles.',
  "comp-key-speed-vector":
    "A temporal handle `speed` on a vector or colour property.",
  "comp-path-tangents":
    "A bezier path's tangent count differs from its vertex count.",
  "comp-path-vertex-count":
    "Keys of one path property have different vertex counts.",
  "comp-vector-dimension":
    "A three-component vector on a layer without `threeD`.",
  // Identity and references
  "comp-duplicate-id": "An id is used twice in its namespace.",
  "comp-reserved-id": "A layer or precomp uses the reserved id `comp`.",
  "comp-layer-time": "`inPoint` is not before `outPoint`.",
  "comp-time-control": "A finite precomp loop count requires a loop mode.",
  "comp-media-time":
    "Media sampling needs finite source time and a positive safe integer frame count.",
  "comp-media-frame-blending": "Frame blending must be hold or linear.",
  "comp-layer-limit":
    "More than 2,000 layers across the composition and its precomps.",
  "comp-parent-missing": "`parent` names no layer in the same composition.",
  "comp-parent-cycle": "A parent chain loops.",
  "comp-parent-depth": "A parent chain is deeper than 32.",
  "comp-matte-missing":
    "`trackMatte.layer` names no layer in the same composition.",
  "comp-matte-self": "A layer is its own track matte.",
  "comp-matte-cycle": "Track mattes reference each other in a loop.",
  "comp-mask-open": "A mask path is not closed.",
  "comp-precomp-missing": "A precomp layer references an unknown precomp.",
  "comp-precomp-cycle": "A precomp contains itself directly or indirectly.",
  "comp-precomp-depth": "Precomps nest deeper than 8.",
  "comp-asset-missing": "A layer references an unknown asset.",
  "comp-asset-type": "A layer references an asset of the wrong type.",
  "comp-crop-bounds": "An image crop extends beyond its asset.",
  "comp-image-registration":
    "Pose registration on an image whose fit is not `contain`.",
  "comp-state-range":
    "A `state` or `stateFrom` value has no matching source or text state.",
  "comp-state-mix": "Only one of `stateFrom` and `stateMix` is set.",
  "comp-text-style-missing": "A text layer uses an unknown text style.",
  "comp-text-font": "A text size above 180 without a pinned font.",
  "comp-text-pinned-font":
    "Spans, decorations, transitions, text animators or `textBox` on a text layer without a pinned font.",
  "comp-text-box-size": "A `textBox` text layer without a `size`.",
  "comp-marker-frame": "A marker lies at or after `frameCount`.",
  "comp-marker-duration": "A marker's `duration` runs past `frameCount`.",
  "comp-text-span-range":
    "A text span ends after the text or a state, or overlaps another span.",
  "comp-text-span-missing":
    "A decoration or text animator names an unknown span.",
  "comp-text-font-axis":
    "A style, span or animated variable-font axis is absent or outside the pinned font's range.",
  "comp-text-locale": "A text layer's locale is not recognised.",
  "comp-text-transition":
    "Conflicting, overlapping or impossible text transitions.",
  "comp-camera-key-range": "A `camera2d` key lies at or after `frameCount`.",
  "comp-light-limit":
    "More than eight authored light layers in one scope, including disabled lights.",
  "comp-light-settings":
    "Invalid light type controls, bounded values, cone/falloff relations or finite GPU coefficients.",
  "comp-light-receiver":
    "Lighting opt-in requires explicitly 3D image, solid, text, shape or flat precomp artwork.",
  "comp-camera-settings":
    "Native camera optical controls, model or clip planes are invalid after sampling.",
  "comp-3d-constraint":
    "The constraint uses 2D geometry and cannot reference a spatial layer or parent chain.",
  "comp-3d-transform":
    "Spatial transform sampling or parent composition produces non-finite world geometry.",
  "comp-camera-cycle":
    "An active camera cannot depend on a camera-facing parent transform.",
  "comp-3d-surface-budget":
    "A projected local artwork surface exceeds the bounded allocation budget.",
  "comp-3d-collapse":
    "Perspective precomps render as flat surfaces and cannot collapse transforms.",
  "comp-3d-effect":
    "A projected layer requires a scope-space adjustment or precomp for time echo.",
  "comp-3d-effect-space":
    "Cross-plane effect coordinates require an affine relation between planes.",
  "comp-camera-geometry":
    "Camera world basis or point of interest is degenerate after parent evaluation.",
  "comp-marker-missing": "A `cue` names no marker in the same composition.",
  "comp-signal-missing": "A reference names no signal.",
  "comp-constraint-target":
    "A constraint names no layer in the same composition.",
  "comp-text-animator-target":
    "A text animator's `node` is not a text layer in the same composition.",
  "comp-camera-depth": "`cameraDepth` on a parented layer or inside a precomp.",
  "comp-camera-jolt": "A camera jolt starts at or after `frameCount`.",
  "comp-format-size": "`format` disagrees with `width` and `height`.",
  "comp-metadata-size": "Metadata serialises to more than 64 KiB.",
  "comp-json-size": "An opaque JSON payload serialises to more than 64 KiB.",
  "comp-json-depth":
    "A JSON payload exceeds its payload-specific container-depth bound below its root.",
  "comp-metadata-depth":
    "Metadata nests more than 64 container levels below its root.",
  "comp-driver-source":
    "A driver has none or several of `signal`, `source` and `sum`.",
  "comp-motion-cycle":
    "Driver, constraint or parent dependencies form a cycle.",
  "comp-periodic": "Invalid periodic motion window, generator or target form.",
  // Expressions and behaviours (CE9); source diagnostics carry a 1-based `column`
  "comp-expression-syntax":
    "Expression text does not match the grammar (including unknown identifiers).",
  "comp-expression-unknown-function":
    "An expression calls a function that is not a registered built-in.",
  "comp-expression-type":
    "An expression's types do not fit an operator, built-in or its target property.",
  "comp-expression-limit":
    "An expression exceeds 2,000 characters, 500 AST nodes, 64 nesting levels or a literal argument bound.",
  "comp-expression-mismatch":
    "An expression's `ast` differs from the AST parsed from its `source`.",
  "comp-expression-cycle":
    "Expression reads form a dependency cycle, alone or with drivers, constraints or parents.",
  "comp-expression-overlap":
    "Two expressions or behaviours target the same property or one of its components.",
  "comp-key-speed-dimension":
    "A grouped temporal speed tuple does not match its value's dimensions.",
  "comp-key-speed-spatial":
    "A component speed tuple on spatial keys, or `spatialSpeed` on keys without spatial tangents.",
  // Property paths
  "comp-path-syntax": "A property path does not match the grammar.",
  "comp-path-scope":
    "A path's precomp layer instance is missing or not a precomp at that level.",
  "comp-path-layer": "A path names no layer in its composition.",
  "comp-path-property": "A path names no property of its layer.",
  "comp-path-type":
    "A driver or periodic motion targets a non-scalar property.",
  "comp-path-readonly": "A path that can only be read is used as a target.",
  // Native shape geometry and bounded runtime work
  "comp-shape-id":
    "Shape content or gradient stop IDs are not unique in their collection.",
  "comp-shape-limit":
    "A native shape tree exceeds its content or nesting limits.",
  "comp-shape-value": "A sampled native shape value is not finite.",
  "comp-shape-range":
    "A generated primitive has invalid dimensions or point counts.",
  "comp-shape-work-limit":
    "Generated geometry or reference copies exceed the shared evaluation budget.",
  "comp-shape-coordinate":
    "Generated coordinates exceed their finite coordinate envelope.",
  "comp-shape-flatten-limit":
    "Cubic flattening cannot meet its fixed tolerance within the depth limit.",
  "comp-shape-polygon-limit":
    "A polygon operation exceeds its input-vertex complexity limit.",
  "comp-shape-polygon-coordinate":
    "Quantized polygon coordinates are not safe integers.",
  "comp-shape-polygon": "The pinned polygon library rejected an operation.",
  "comp-shape-repeater-range": "Repeater copies exceed their supported range.",
  "comp-shape-repeater-scale":
    "A repeated scale power is undefined or not finite.",
  "comp-shape-repeater-transform": "A repeated transform is not finite.",
  "comp-shape-dash-precision":
    "Nib dash spacing is below the available coordinate precision.",
  "comp-shape-follow-empty":
    "A follow-path source has no contour or zero arc length.",
  "comp-constraint-path": "A follow-path source is not a native shape layer.",
  // Availability
  "comp-feature-unavailable":
    "A contract feature whose implementation milestone has not landed.",
  "comp-provider-bounds": "Provider bounds have non-positive width or height.",
  "comp-provider-unavailable":
    "A versioned content provider is not registered in this renderer.",
  "comp-provider-duplicate": "A provider id was registered more than once.",
  "comp-provider-params": "A provider payload fails its registered schema.",
  "comp-provider-asset":
    "A provider uses an undeclared, missing or incompatible asset.",
  "comp-camera-coverage":
    "A persisted story image cover leaves the viewport uncovered or samples transparent pixels.",
  "comp-adapter-unsupported":
    "A family feature is not supported by the current adapter slice.",
  "comp-adapter-limit":
    "Baking an adapter scene would exceed composition limits.",
  "comp-adapter-layout-required":
    "Font-dependent geometry needs a pinned-font measurement context before compilation.",
} as const;

/** Advisory codes; they never make a composition invalid. */
export const COMPOSITION_WARNINGS = {
  "comp-layer-never-visible":
    "A layer starts at or after the composition's last frame.",
  "comp-matte-not-adjacent": "A track matte is not the layer directly above.",
  "comp-camera-depth-unused":
    "`cameraDepth` is set but the composition has no `camera2d`.",
  "comp-precomp-unused": "A precomp is never referenced.",
  "comp-text-system-font":
    "A text layer has no pinned font, so it draws with the browser's generic face and may render differently on other machines or browser versions.",
} as const;

export type CompositionDiagnosticCode =
  | keyof typeof COMPOSITION_DIAGNOSTICS
  | keyof typeof COMPOSITION_WARNINGS;

/**
 * Same shape as passage diagnostics (`renderer-core/src/passage-diagnostics.ts`).
 * `path` is a JSON path such as `layers[2].transform.position.keys[1].frame`.
 */
export type CompositionDiagnostic = {
  code: string;
  severity: "error" | "warning";
  message: string;
  path: string;
  /** 1-based character column for expression source diagnostics. */
  column?: number;
};

export function formatJsonPath(path: readonly PropertyKey[]) {
  return path
    .map((part, i) =>
      typeof part === "number"
        ? `[${part}]`
        : typeof part === "string" && /^[A-Za-z_$][\w$]*$/.test(part)
          ? `${i ? "." : ""}${part}`
          : `[${JSON.stringify(String(part))}]`,
    )
    .join("");
}

type Issue = z.core.$ZodIssue;

/** For a union, the branch that got furthest before failing explains the error best. */
function deepestUnionIssue(issue: Issue): Issue | undefined {
  if (issue.code !== "invalid_union" || !issue.errors.length) return undefined;
  let best: Issue | undefined;
  for (const branch of issue.errors)
    for (const candidate of branch) {
      const inner = deepestUnionIssue(candidate) ?? candidate;
      if (!best || inner.path.length > best.path.length) best = inner;
    }
  return best && best.path.length > 0
    ? { ...best, path: [...issue.path, ...best.path] }
    : undefined;
}

function issueCode(issue: Issue): string {
  const params = (issue as { params?: { diagnosticCode?: string } }).params;
  if (params?.diagnosticCode) return params.diagnosticCode;
  switch (issue.code) {
    case "invalid_type":
      return "comp-schema-type";
    case "unrecognized_keys":
      return "comp-schema-unknown-key";
    case "invalid_value":
      return issue.path.length === 1 && issue.path[0] === "schemaVersion"
        ? "comp-schema-version"
        : "comp-schema-value";
    case "invalid_format":
      return "comp-schema-format";
    case "too_big":
    case "too_small":
      return issue.origin === "array" ||
        issue.origin === "string" ||
        issue.origin === "set"
        ? "comp-limit"
        : "comp-schema-range";
    case "invalid_union":
      return "comp-schema-union";
    default:
      return "comp-schema";
  }
}

function stripCode(message: string, code: string) {
  return message.startsWith(`${code}: `)
    ? message.slice(code.length + 2)
    : message;
}

export function compositionIssueDiagnostics(
  issues: readonly Issue[],
): CompositionDiagnostic[] {
  return issues.map((original) => {
    const issue = deepestUnionIssue(original) ?? original;
    const code = issueCode(issue);
    const message =
      issue.code === "unrecognized_keys"
        ? `unknown field${issue.keys.length > 1 ? "s" : ""} ${issue.keys.map((k) => `"${k}"`).join(", ")}`
        : stripCode(issue.message, code);
    const column = (issue as { params?: { column?: number } }).params?.column;
    return {
      code,
      severity: "error",
      message,
      path: formatJsonPath(issue.path),
      ...(column === undefined ? {} : { column }),
    };
  });
}

export type CompositionValidation =
  | {
      ok: true;
      composition: Composition;
      diagnostics: CompositionDiagnostic[];
    }
  | { ok: false; diagnostics: CompositionDiagnostic[] };

/**
 * Validate untrusted input (hand-written, adapter or agent output). Errors make the
 * result invalid; warnings are returned alongside a valid composition.
 */
export function validateComposition(input: unknown): CompositionValidation {
  const parsed = CompositionSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      diagnostics: compositionIssueDiagnostics(parsed.error.issues),
    };
  return {
    ok: true,
    composition: parsed.data,
    diagnostics: compositionWarnings(parsed.data).map((w) => ({
      code: w.code,
      severity: "warning",
      message: w.message,
      path: formatJsonPath(w.path),
    })),
  };
}
