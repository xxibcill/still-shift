import type { z } from "zod";
import { formatSize } from "../output-format.ts";
import { tabularFigures, type TextStyle } from "../typography.ts";
import type {
  Composition,
  CompositionAsset,
  CompositionScope,
} from "./composition.ts";
import { isKeyed } from "./keys.ts";
import { checkMotionDependencies } from "./dependencies.ts";
import { UNAVAILABLE_LAYER_TYPES, type CompositionLayer } from "./layers.ts";
import { COMPOSITION_PATH_ROOT } from "./property-path.ts";
import {
  COMPOSITION_LIMITS,
  reporter,
  type IssueReporter,
} from "./primitives.ts";
import { isResolvedProperty, resolvePropertyPath } from "./resolve.ts";

const L = COMPOSITION_LIMITS;
type Path = (string | number)[];

const scopeBase = (comp: Composition, scope: CompositionScope): Path =>
  scope === comp ? [] : ["precomps", comp.precomps!.indexOf(scope)];

function declaredTextStyle(comp: Composition, id: string | undefined) {
  const styles = comp.textStyles;
  return id && styles && Object.hasOwn(styles, id) ? styles[id] : undefined;
}

/** Values of an animatable, fixed or keyed. */
function values<T>(value: T | { keys: { value: T }[] } | undefined): T[] {
  if (value === undefined) return [];
  return isKeyed(value)
    ? (value as { keys: { value: T }[] }).keys.map((k) => k.value)
    : [value as T];
}

function duplicates(
  fail: IssueReporter,
  items: { id: string }[] | undefined,
  path: Path,
  what: string,
) {
  const seen = new Set<string>();
  items?.forEach((item, i) => {
    if (seen.has(item.id))
      fail(
        "comp-duplicate-id",
        [...path, i, "id"],
        `duplicate ${what} id "${item.id}"`,
      );
    seen.add(item.id);
  });
}

const jsonBytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;

function checkMetadata(fail: IssueReporter, value: unknown, path: Path) {
  if (value !== undefined && jsonBytes(value) > L.maxMetadataBytes)
    fail(
      "comp-metadata-size",
      path,
      `metadata must serialise to at most ${L.maxMetadataBytes} bytes`,
    );
}

function checkVectorDimensions(
  fail: IssueReporter,
  layer: CompositionLayer,
  path: Path,
) {
  if (layer.threeD) return;
  for (const field of ["anchor", "position", "scale"] as const) {
    const value = layer.transform?.[field];
    if (value === undefined) continue;
    const threeD = Array.isArray(value)
      ? value.length === 3
      : isKeyed(value)
        ? (value.keys[0]!.value as unknown[]).length === 3
        : "z" in value && value.z !== undefined;
    if (threeD)
      fail(
        "comp-vector-dimension",
        [...path, "transform", field],
        "three-component values require threeD",
      );
  }
}

function checkLayer(
  comp: Composition,
  scope: CompositionScope,
  layer: CompositionLayer,
  path: Path,
  fail: IssueReporter,
  assets: Map<string, CompositionAsset>,
) {
  const inPoint = layer.inPoint ?? 0,
    outPoint = layer.outPoint ?? scope.frameCount;
  if (inPoint >= outPoint)
    fail(
      "comp-layer-time",
      [...path, layer.outPoint === undefined ? "inPoint" : "outPoint"],
      `inPoint (${inPoint}) must be before outPoint (${outPoint})`,
    );
  if (layer.id === COMPOSITION_PATH_ROOT)
    fail(
      "comp-reserved-id",
      [...path, "id"],
      `"${COMPOSITION_PATH_ROOT}" is reserved for composition properties`,
    );

  const unavailable = (field: Path, feature: string, milestone: string) =>
    fail(
      "comp-feature-unavailable",
      [...path, ...field],
      `${feature} is not available until ${milestone}`,
    );
  const missingType = UNAVAILABLE_LAYER_TYPES[layer.type];
  if (missingType) unavailable(["type"], `${layer.type} layers`, missingType);
  if (layer.threeD) unavailable(["threeD"], "3D layers", "CE8");
  if (layer.motionBlur) unavailable(["motionBlur"], "motion blur", "CE7");
  if (layer.effects?.length) unavailable(["effects"], "effects", "CE6");
  for (const field of ["rotationX", "rotationY", "orientation"] as const)
    if (layer.transform?.[field] !== undefined)
      unavailable(["transform", field], `transform.${field}`, "CE8");
  if (layer.transform?.autoOrient === "path")
    unavailable(["transform", "autoOrient"], "auto-orient along a path", "CE9");
  if (layer.transform?.autoOrient === "camera")
    unavailable(
      ["transform", "autoOrient"],
      "auto-orient toward the camera",
      "CE8",
    );
  checkVectorDimensions(fail, layer, path);

  if (layer.cameraDepth !== undefined && (layer.parent || scope !== comp))
    fail(
      "comp-camera-depth",
      [...path, "cameraDepth"],
      "cameraDepth applies only to unparented layers of the root composition; children follow their parent",
    );

  duplicates(fail, layer.masks, [...path, "masks"], "mask");
  duplicates(fail, layer.effects, [...path, "effects"], "effect");
  layer.masks?.forEach((mask, i) => {
    if (values(mask.path).some((p) => !p.closed))
      fail(
        "comp-mask-open",
        [...path, "masks", i, "path"],
        "mask paths must be closed",
      );
  });

  if (layer.trackMatte) {
    const matte = layer.trackMatte.layer;
    if (matte === layer.id)
      fail(
        "comp-matte-self",
        [...path, "trackMatte", "layer"],
        "a layer cannot be its own track matte",
      );
    else if (!scope.layers.some((l) => l.id === matte))
      fail(
        "comp-matte-missing",
        [...path, "trackMatte", "layer"],
        `no layer "${matte}" in this composition`,
      );
  }

  const asset = (id: string, type: CompositionAsset["type"], field: Path) => {
    const found = assets.get(id);
    if (!found)
      fail("comp-asset-missing", [...path, ...field], `no asset "${id}"`);
    else if (found.type !== type)
      fail(
        "comp-asset-type",
        [...path, ...field],
        `asset "${id}" is a ${found.type}, not a ${type}`,
      );
    return found?.type === type ? found : undefined;
  };
  const stateRange = (
    field: "state" | "stateFrom",
    count: number,
    what: string,
  ) => {
    const value = (layer as { [k: string]: unknown })[field] as
      | number
      | { keys: { value: number }[] }
      | undefined;
    if (values(value).some((v) => v >= count))
      fail(
        "comp-state-range",
        [...path, field],
        `${field} must index one of the ${count} ${what}`,
      );
  };

  switch (layer.type) {
    case "image": {
      layer.sources.forEach((source, i) => {
        const image = asset(source.asset, "image", ["sources", i, "asset"]);
        if (
          image?.type === "image" &&
          source.crop &&
          (source.crop[0] + source.crop[2] > image.width ||
            source.crop[1] + source.crop[3] > image.height)
        )
          fail(
            "comp-crop-bounds",
            [...path, "sources", i, "crop"],
            `crop exceeds asset "${image.id}"`,
          );
        if (source.registration && (layer.fit ?? "contain") !== "contain")
          fail(
            "comp-image-registration",
            [...path, "sources", i, "registration"],
            "pose registration requires contain fit",
          );
      });
      const poses = layer.sources.flatMap((s) => (s.pose ? [s.pose] : []));
      if (new Set(poses).size !== poses.length)
        fail(
          "comp-duplicate-id",
          [...path, "sources"],
          "pose names must be unique",
        );
      stateRange("state", layer.sources.length, "sources");
      stateRange("stateFrom", layer.sources.length, "sources");
      if ((layer.stateFrom === undefined) !== (layer.stateMix === undefined))
        fail(
          "comp-state-mix",
          [...path, layer.stateFrom === undefined ? "stateMix" : "stateFrom"],
          "stateFrom and stateMix must be set together",
        );
      break;
    }
    case "text":
      if (layer.fontAsset) asset(layer.fontAsset, "font", ["fontAsset"]);
      if (layer.style && !declaredTextStyle(comp, layer.style))
        fail(
          "comp-text-style-missing",
          [...path, "style"],
          `no text style "${layer.style}"`,
        );
      stateRange("state", layer.states?.length ?? 1, "text states");
      checkText(comp, layer, path, fail, assets);
      break;
    case "precomp":
      if (!comp.precomps?.some((p) => p.id === layer.comp))
        fail(
          "comp-precomp-missing",
          [...path, "comp"],
          `no precomp "${layer.comp}"`,
        );
      break;
    case "video":
    case "sequence":
    case "audio":
      asset(layer.asset, layer.type, ["asset"]);
      break;
  }
  checkMetadata(fail, layer.metadata, [...path, "metadata"]);
}

type TextLayer = Extract<CompositionLayer, { type: "text" }>;
const NUMERIC_STATE = /^-?\d+(?:,\d{3})*(?:\.\d+)?$/;

function checkDisplayFont(
  fail: IssueReporter,
  assets: Map<string, CompositionAsset>,
  style: TextStyle,
  path: Path,
) {
  if (
    (style.size ?? 0) > 180 &&
    assets.get(style.fontAsset ?? "")?.type !== "font"
  )
    fail(
      "comp-text-font",
      path,
      "display sizes above 180 require a pinned font",
    );
}

/** Variable-font axes must stay inside the pinned font's fvar range. */
function checkAxes(
  fail: IssueReporter,
  assets: Map<string, CompositionAsset>,
  style: TextStyle,
  path: Path,
  label: string,
) {
  const font = assets.get(style.fontAsset ?? "");
  for (const [axis, value] of Object.entries(style.axes ?? {})) {
    const range = font?.type === "font" ? font.variable?.[axis] : undefined;
    if (!range || value < range.min || value > range.max)
      fail(
        "comp-text-font-axis",
        path,
        `${label} axis ${axis} = ${value} is outside the pinned font's range`,
      );
  }
}

function graphemeCount(text: string, locale: string) {
  return [
    ...new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(text),
  ].length;
}

/** The story typography rules (typography-validation.ts), applied to text layers. */
function checkText(
  comp: Composition,
  layer: TextLayer,
  path: Path,
  fail: IssueReporter,
  assets: Map<string, CompositionAsset>,
) {
  const style = declaredTextStyle(comp, layer.style);
  const base = { fontAsset: layer.fontAsset, size: layer.fontSize, ...style };
  checkDisplayFont(fail, assets, base, [
    ...path,
    style?.size === undefined ? "fontSize" : "style",
  ]);
  checkAxes(fail, assets, base, [...path, "style"], `"${layer.id}"`);

  let locale = layer.locale ?? layer.textBox?.locale ?? "en";
  try {
    new Intl.Segmenter(locale);
  } catch {
    fail("comp-text-locale", [...path, "locale"], `unknown locale "${locale}"`);
    locale = "en";
  }
  const lengths = [layer.text, ...(layer.states ?? [])].map((text) =>
    graphemeCount(text, locale),
  );
  const spanIds = new Set<string>();
  const ordered = (layer.spans ?? [])
    .map((span, i) => ({ span, i }))
    .sort((a, b) => a.span.start - b.span.start);
  ordered.forEach(({ span, i }, n) => {
    const spanPath = [...path, "spans", i];
    if (lengths.some((length) => span.end > length))
      fail(
        "comp-text-span-range",
        [...spanPath, "end"],
        `span ends after the shortest text or state (${Math.min(...lengths)} characters)`,
      );
    if (n && ordered[n - 1]!.span.end > span.start)
      fail(
        "comp-text-span-range",
        [...spanPath, "start"],
        "spans must not overlap",
      );
    if (span.id && spanIds.has(span.id))
      fail(
        "comp-duplicate-id",
        [...spanPath, "id"],
        `duplicate span id "${span.id}"`,
      );
    if (span.id) spanIds.add(span.id);
    const spanStyle = declaredTextStyle(comp, span.style);
    if (span.style && !spanStyle)
      fail(
        "comp-text-style-missing",
        [...spanPath, "style"],
        `no text style "${span.style}"`,
      );
    else if (span.style) {
      const effectiveStyle = { ...base, ...spanStyle };
      checkDisplayFont(fail, assets, effectiveStyle, [...spanPath, "style"]);
      checkAxes(
        fail,
        assets,
        effectiveStyle,
        [...spanPath, "style"],
        `span "${span.id ?? i}"`,
      );
    }
  });
  layer.decorations?.forEach((decoration, i) => {
    if (decoration.span && !spanIds.has(decoration.span))
      fail(
        "comp-text-span-missing",
        [...path, "decorations", i, "span"],
        `no span "${decoration.span}"`,
      );
  });

  if (layer.transition && layer.transitions)
    fail(
      "comp-text-transition",
      [...path, "transitions"],
      "use transition or transitions, not both",
    );
  const transitions =
    layer.transitions ?? (layer.transition ? [layer.transition] : []);
  const field = layer.transitions ? "transitions" : "transition";
  let end = -1;
  transitions.forEach((transition, i) => {
    const at = layer.transitions ? [...path, field, i] : [...path, field];
    if (transition.window.start < end)
      fail(
        "comp-text-transition",
        [...at, "window"],
        "transition windows must not overlap",
      );
    end = transition.window.end;
    const from = transition.fromState ?? 0,
      to = transition.toState ?? 1;
    if (layer.states?.[from] === undefined || layer.states?.[to] === undefined)
      fail(
        "comp-text-transition",
        at,
        `transition needs text states ${from} and ${to}`,
      );
    else if (
      transition.kind === "count" &&
      (!tabularFigures(style) ||
        ![layer.states[from], layer.states[to]].every((s) =>
          NUMERIC_STATE.test(s!),
        ))
    )
      fail(
        "comp-text-transition",
        at,
        "count transitions need numeric states and tabular figures",
      );
  });
}

function checkParents(
  scope: CompositionScope,
  base: Path,
  fail: IssueReporter,
) {
  const byId = new Map(scope.layers.map((l) => [l.id, l]));
  scope.layers.forEach((layer, i) => {
    if (!layer.parent) return;
    const path = [...base, "layers", i, "parent"];
    if (!byId.has(layer.parent)) {
      fail(
        "comp-parent-missing",
        path,
        `no layer "${layer.parent}" in this composition`,
      );
      return;
    }
    const chain = new Set([layer.id]);
    let parent: string | undefined = layer.parent;
    while (parent) {
      if (chain.has(parent)) {
        fail(
          "comp-parent-cycle",
          path,
          `parent chain of "${layer.id}" loops through "${parent}"`,
        );
        return;
      }
      chain.add(parent);
      parent = byId.get(parent)?.parent;
    }
    if (chain.size - 1 > L.maxParentDepth)
      fail(
        "comp-parent-depth",
        path,
        `parent chains may be at most ${L.maxParentDepth} deep`,
      );
  });
  scope.layers.forEach((layer, i) => {
    const seen = new Set([layer.id]);
    let matte = layer.trackMatte?.layer;
    while (matte && byId.has(matte)) {
      if (seen.has(matte)) {
        fail(
          "comp-matte-cycle",
          [...base, "layers", i, "trackMatte"],
          `track mattes of "${layer.id}" form a cycle`,
        );
        return;
      }
      seen.add(matte);
      matte = byId.get(matte)!.trackMatte?.layer;
    }
  });
}

/** Precomp references form a DAG no deeper than the nesting limit. */
function checkPrecompGraph(comp: Composition, fail: IssueReporter) {
  const precomps = new Map(
    (comp.precomps ?? []).map((p, i) => [p.id, { p, i }]),
  );
  const refs = (scope: CompositionScope) =>
    scope.layers.flatMap((l) => (l.type === "precomp" ? [l.comp] : []));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const reported = new Set<string>();
  /** Longest chain of precomps below and including `id`. */
  const visit = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    const entry = precomps.get(id);
    if (!entry) return 0;
    if (visiting.has(id)) {
      if (!reported.has(id))
        fail(
          "comp-precomp-cycle",
          ["precomps", entry.i, "id"],
          `precomp "${id}" contains itself`,
        );
      reported.add(id);
      return 0;
    }
    visiting.add(id);
    const result = 1 + Math.max(0, ...refs(entry.p).map(visit));
    visiting.delete(id);
    depth.set(id, result);
    return result;
  };
  const maxDepth = Math.max(
    0,
    ...refs(comp).map(visit),
    ...Array.from(precomps.keys(), visit),
  );
  if (maxDepth > L.maxPrecompDepth)
    fail(
      "comp-precomp-depth",
      ["precomps"],
      `precomps may nest at most ${L.maxPrecompDepth} deep (found ${maxDepth})`,
    );
}

function checkConstraints(
  scope: CompositionScope,
  base: Path,
  fail: IssueReporter,
  signals: Set<string>,
  markers: Set<string>,
) {
  const layers = new Map(scope.layers.map((l) => [l.id, l]));
  scope.constraints?.forEach((constraint, i) => {
    const path = [...base, "constraints", i];
    const refs: [string, string][] = [["target", constraint.target]];
    if (constraint.type === "attach") refs.push(["anchor", constraint.anchor]);
    if (constraint.type === "contact")
      refs.push(["surface", constraint.surface]);
    if (constraint.type === "look-at") refs.push(["toward", constraint.toward]);
    if (constraint.type === "follow-path") refs.push(["path", constraint.path]);
    for (const [field, id] of refs)
      if (!layers.has(id))
        fail(
          "comp-constraint-target",
          [...path, field],
          `no layer "${id}" in this composition`,
        );
    if (constraint.type === "follow-path") {
      fail(
        "comp-feature-unavailable",
        [...path, "path"],
        "follow-path needs shape paths, available in CE5",
      );
      if (!signals.has(constraint.progress))
        fail(
          "comp-signal-missing",
          [...path, "progress"],
          `no signal "${constraint.progress}"`,
        );
    }
  });
  scope.textAnimators?.forEach((animator, i) => {
    const path = [...base, "textAnimators", i];
    if (layers.get(animator.node)?.type !== "text")
      fail(
        "comp-text-animator-target",
        [...path, "node"],
        `no text layer "${animator.node}" in this composition`,
      );
    if (animator.cue && !markers.has(animator.cue))
      fail(
        "comp-marker-missing",
        [...path, "cue"],
        `no marker "${animator.cue}"`,
      );
    if (animator.signal && !signals.has(animator.signal))
      fail(
        "comp-signal-missing",
        [...path, "signal"],
        `no signal "${animator.signal}"`,
      );
    const node = layers.get(animator.node);
    if (
      animator.span &&
      node?.type === "text" &&
      !node.spans?.some((span) => span.id === animator.span)
    )
      fail(
        "comp-text-span-missing",
        [...path, "span"],
        `text layer "${node.id}" has no span "${animator.span}"`,
      );
    [animator.selector, ...(animator.selectors ?? [])].forEach(
      (selector, j) => {
        const at = j ? [...path, "selectors", j - 1] : [...path, "selector"];
        for (const field of ["start", "end", "offset"] as const) {
          const value = selector[field];
          if (
            typeof value === "object" &&
            !Array.isArray(value) &&
            !signals.has(value.signal)
          )
            fail(
              "comp-signal-missing",
              [...at, field, "signal"],
              `no signal "${value.signal}"`,
            );
        }
      },
    );
  });
}

function checkPath(
  comp: Composition,
  fail: IssueReporter,
  text: string,
  path: Path,
  use: "target" | "source",
) {
  const resolved = resolvePropertyPath(comp, text);
  if (!isResolvedProperty(resolved)) {
    fail(resolved.code, path, resolved.message);
    return;
  }
  if (resolved.type !== "scalar")
    fail(
      "comp-path-type",
      path,
      `"${text}" is a ${resolved.type} property; drivers need a scalar`,
    );
  else if (use === "target" && resolved.readOnly)
    fail("comp-path-readonly", path, `"${text}" can be read but not driven`);
}

function checkMotion(
  comp: Composition,
  fail: IssueReporter,
  signals: Set<string>,
  markers: Set<string>,
) {
  comp.signals?.forEach((signal, i) => {
    if (signal.cue && !markers.has(signal.cue))
      fail(
        "comp-marker-missing",
        ["signals", i, "cue"],
        `no marker "${signal.cue}"`,
      );
  });
  comp.drivers?.forEach((driver, i) => {
    const path = ["drivers", i];
    checkPath(comp, fail, driver.target, [...path, "target"], "target");
    if (driver.signal && !signals.has(driver.signal))
      fail(
        "comp-signal-missing",
        [...path, "signal"],
        `no signal "${driver.signal}"`,
      );
    if (driver.source)
      checkPath(comp, fail, driver.source, [...path, "source"], "source");
    driver.sum?.forEach((term, j) => {
      if (term.includes("."))
        checkPath(comp, fail, term, [...path, "sum", j], "source");
      else if (!signals.has(term))
        fail("comp-signal-missing", [...path, "sum", j], `no signal "${term}"`);
    });
  });
  comp.periodic?.forEach((motion, i) => {
    const path = ["periodic", i];
    const target = motion.target ?? `${motion.node}.${motion.property}`;
    checkPath(
      comp,
      fail,
      target,
      [...path, motion.target ? "target" : "property"],
      "target",
    );
    if (motion.cue && !markers.has(motion.cue))
      fail(
        "comp-marker-missing",
        [...path, "cue"],
        `no marker "${motion.cue}"`,
      );
  });
  const expressions = Object.keys(comp.expressions ?? {});
  if (expressions.length)
    fail(
      "comp-feature-unavailable",
      ["expressions"],
      "expressions are not available until CE9",
    );
  for (const key of expressions) {
    const resolved = resolvePropertyPath(comp, key);
    if (!isResolvedProperty(resolved))
      fail(resolved.code, ["expressions", key], resolved.message);
    else if (resolved.readOnly)
      fail(
        "comp-path-readonly",
        ["expressions", key],
        `"${key}" can be read but not driven`,
      );
  }
}

/** Cross-field rules that the structural schema cannot express. */
export function validateCompositionSemantics(
  comp: Composition,
  ctx: z.RefinementCtx,
) {
  const fail = reporter(ctx);
  duplicates(fail, comp.assets, ["assets"], "asset");
  duplicates(fail, comp.precomps, ["precomps"], "precomp");
  duplicates(fail, comp.signals, ["signals"], "signal");
  comp.precomps?.forEach((p, i) => {
    if (p.id === COMPOSITION_PATH_ROOT)
      fail(
        "comp-reserved-id",
        ["precomps", i, "id"],
        `"${COMPOSITION_PATH_ROOT}" is reserved for composition properties`,
      );
  });
  const assets = new Map(comp.assets.map((a) => [a.id, a]));
  comp.assets.forEach((asset, i) => {
    if (
      asset.type === "video" ||
      asset.type === "sequence" ||
      asset.type === "audio"
    )
      fail(
        "comp-feature-unavailable",
        ["assets", i, "type"],
        `${asset.type} assets are not available until CE13`,
      );
  });
  const signals = new Set(comp.signals?.map((s) => s.id));
  for (const [id, style] of Object.entries(comp.textStyles ?? {})) {
    if (!style.fontAsset) continue;
    const font = assets.get(style.fontAsset);
    const path = ["textStyles", id, "fontAsset"];
    if (!font)
      fail("comp-asset-missing", path, `no asset "${style.fontAsset}"`);
    else if (font.type !== "font")
      fail(
        "comp-asset-type",
        path,
        `asset "${font.id}" is a ${font.type}, not a font`,
      );
    else
      checkAxes(
        fail,
        assets,
        style,
        ["textStyles", id, "axes"],
        `style "${id}"`,
      );
  }

  const scopes: CompositionScope[] = [comp, ...(comp.precomps ?? [])];
  let layerCount = 0;
  for (const scope of scopes) {
    const base = scopeBase(comp, scope);
    duplicates(fail, scope.layers, [...base, "layers"], "layer");
    duplicates(fail, scope.markers, [...base, "markers"], "marker");
    scope.markers?.forEach((marker, i) => {
      if (
        marker.frame < scope.frameCount &&
        marker.duration !== undefined &&
        marker.frame + marker.duration > scope.frameCount
      )
        fail(
          "comp-marker-duration",
          [...base, "markers", i, "duration"],
          `marker runs past the end (frame ${marker.frame} + ${marker.duration} > ${scope.frameCount})`,
        );
      if (marker.frame >= scope.frameCount)
        fail(
          "comp-marker-frame",
          [...base, "markers", i, "frame"],
          `marker frame must be below frameCount (${scope.frameCount})`,
        );
    });
    scope.layers.forEach((layer, i) =>
      checkLayer(comp, scope, layer, [...base, "layers", i], fail, assets),
    );
    checkParents(scope, base, fail);
    checkConstraints(
      scope,
      base,
      fail,
      signals,
      new Set(scope.markers?.map((m) => m.id)),
    );
    layerCount += scope.layers.length;
  }
  if (layerCount > L.maxLayers)
    fail(
      "comp-layer-limit",
      ["layers"],
      `at most ${L.maxLayers} layers across the composition and its precomps (found ${layerCount})`,
    );
  checkPrecompGraph(comp, fail);
  checkMotion(comp, fail, signals, new Set(comp.markers?.map((m) => m.id)));
  checkMotionDependencies(comp, fail);

  if (comp.camera2d) {
    comp.camera2d.keys.forEach((key, i) => {
      if (key.frame >= comp.frameCount)
        fail(
          "comp-camera-key-range",
          ["camera2d", "keys", i, "frame"],
          `camera keys must be below frameCount (${comp.frameCount})`,
        );
      if (i && key.frame <= comp.camera2d!.keys[i - 1]!.frame)
        fail(
          "comp-key-order",
          ["camera2d", "keys", i, "frame"],
          "key frames must increase",
        );
    });
    comp.camera2d.jolts?.forEach((jolt, i) => {
      if (jolt.frame >= comp.frameCount)
        fail(
          "comp-camera-jolt",
          ["camera2d", "jolts", i, "frame"],
          "jolts must start inside the composition",
        );
    });
  }
  if (comp.motionBlur?.enabled)
    fail(
      "comp-feature-unavailable",
      ["motionBlur"],
      "motion blur is not available until CE7",
    );
  if (comp.colorSpace === "linear-srgb")
    fail(
      "comp-feature-unavailable",
      ["colorSpace"],
      "linear-light compositing is not available until CE6",
    );
  if (comp.format) {
    const size = formatSize(comp.format);
    if (comp.width !== size.width || comp.height !== size.height)
      fail(
        "comp-format-size",
        ["format"],
        `${comp.format} format requires ${size.width}x${size.height}`,
      );
  }
  checkMetadata(fail, comp.metadata, ["metadata"]);
}

export type CompositionWarning = {
  code: string;
  path: Path;
  message: string;
};

/** Advisory findings for a composition that already passed validation. */
export function compositionWarnings(comp: Composition): CompositionWarning[] {
  const warnings: CompositionWarning[] = [];
  const used = new Set<string>();
  for (const scope of [comp, ...(comp.precomps ?? [])]) {
    const base = scopeBase(comp, scope);
    scope.layers.forEach((layer, i) => {
      if (layer.type === "precomp") used.add(layer.comp);
      if ((layer.inPoint ?? 0) >= scope.frameCount)
        warnings.push({
          code: "comp-layer-never-visible",
          path: [...base, "layers", i, "inPoint"],
          message: `"${layer.id}" starts after the composition ends`,
        });
      const matte = layer.trackMatte?.layer;
      if (matte && scope.layers[i - 1]?.id !== matte)
        warnings.push({
          code: "comp-matte-not-adjacent",
          path: [...base, "layers", i, "trackMatte", "layer"],
          message: `matte "${matte}" is not directly above "${layer.id}"; this is valid but differs from the classic AE layout`,
        });
      if (layer.cameraDepth !== undefined && !comp.camera2d && scope === comp)
        warnings.push({
          code: "comp-camera-depth-unused",
          path: [...base, "layers", i, "cameraDepth"],
          message: "cameraDepth has no effect without camera2d",
        });
    });
  }
  comp.precomps?.forEach((p, i) => {
    if (!used.has(p.id))
      warnings.push({
        code: "comp-precomp-unused",
        path: ["precomps", i],
        message: `precomp "${p.id}" is never used`,
      });
  });
  return warnings;
}
