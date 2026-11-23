/**
 * Shared by `comp probe` (CG3) and `comp grade key` (CG6): load a
 * composition for an in-browser measurement, and render one layer isolated
 * from the others.
 */
import type { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import {
  PassageError,
  type PassageDiagnostic,
} from "@still-shift/renderer-core";
import {
  AnimationEngineError,
  type Composition,
} from "@still-shift/scene-contract";
import { loadComposition } from "./composition-render.ts";

/** `loadComposition`, with validation diagnostics thrown as a PassageError. */
export function loadMeasuredComposition(
  input: string,
  backend: "canvas2d" | "webgl2",
  options: {
    nodeMemory: CompositionNodeMemory;
    cacheDirectory?: string | undefined;
    signal?: AbortSignal | undefined;
  },
) {
  return loadComposition(input, backend, {
    nodeMemory: options.nodeMemory,
    ...(options.cacheDirectory
      ? { cacheDirectory: options.cacheDirectory }
      : {}),
    ...(options.signal ? { signal: options.signal } : {}),
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
}

/**
 * Layers kept when isolating a layer: the layer, its parent chain and, for a
 * group, its content (every layer with the group in its parent chain).
 */
export function isolatedLayerIds(comp: Composition, id: string) {
  const layer = comp.layers.find((l) => l.id === id)!;
  const parentOf = new Map(comp.layers.map((l) => [l.id, l.parent]));
  const keep = new Set<string>([layer.id]);
  for (let parent = layer.parent; parent; parent = parentOf.get(parent))
    keep.add(parent);
  if (layer.type === "group")
    for (const candidate of comp.layers)
      for (let parent = candidate.parent; parent; parent = parentOf.get(parent))
        if (parent === layer.id) {
          keep.add(candidate.id);
          break;
        }
  return keep;
}

type Layer = Composition["layers"][number];

/**
 * The composition with `edit` applied to every layer kept for `id` and,
 * unless `isolate` is false, every other layer disabled (with `isolate`
 * false, every layer is kept and edited).
 */
export function isolateLayer(
  comp: Composition,
  id: string,
  isolate: boolean | undefined,
  edit: (layer: Layer) => Layer = (layer) => layer,
): Composition {
  const keep = isolatedLayerIds(comp, id);
  return {
    ...comp,
    layers: comp.layers.map((l) =>
      isolate === false || keep.has(l.id)
        ? edit(l)
        : ({ ...l, enabled: false } as Layer),
    ),
  };
}

/**
 * CG6: the composition that shows what a `grade.key` on `id` reads, the
 * layer's own straight value: `id` isolated (as `isolateLayer`) with
 * `effects` as its stack, the layer and its parents fully opaque with the
 * normal blend, and no background, so pixels outside the layer stay
 * transparent. Used by `comp grade key` (the matte) and `comp probe` (key
 * suggestions).
 */
export function keyInputComposition(
  comp: Composition,
  id: string,
  isolate: boolean | undefined,
  effects: NonNullable<Layer["effects"]>,
): Composition {
  const parentOf = new Map(comp.layers.map((l) => [l.id, l.parent]));
  const opaque = new Set<string>();
  for (let at: string | undefined = id; at; at = parentOf.get(at))
    opaque.add(at);
  return {
    ...isolateLayer(comp, id, isolate, (l) => {
      const shown = opaque.has(l.id)
        ? ({
            ...l,
            transform: { ...l.transform, opacity: 1 },
            blendMode: undefined,
          } as Layer)
        : l;
      return l.id === id ? ({ ...shown, effects } as Layer) : shown;
    }),
    background: null,
  };
}
