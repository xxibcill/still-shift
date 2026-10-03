import {
  CompositionMarkerSchema,
  type Composition,
} from "@still-shift/scene-contract";

type Window = { cue?: string | undefined; start: number; end: number };
/** Preserve readable cues and provide stable native IDs for arbitrary legacy labels. */
export function compileAdapterMarkers(windows: Window[]) {
  const markers = new Map<
    string,
    NonNullable<Composition["markers"]>[number]
  >();
  const ids = new Set(
    windows.flatMap(({ cue }) =>
      cue && CompositionMarkerSchema.shape.id.safeParse(cue).success
        ? [cue]
        : [],
    ),
  );
  for (const { cue, start, end } of windows) {
    if (!cue || markers.has(cue)) continue;
    let id = cue;
    if (!CompositionMarkerSchema.shape.id.safeParse(cue).success) {
      let suffix = 1;
      do id = `cue-${suffix++}`;
      while (ids.has(id));
      ids.add(id);
    }
    markers.set(cue, {
      id,
      label: cue.slice(0, 200),
      frame: start,
      duration: end - start,
    });
  }
  return {
    markers: [...markers.values()],
    cueIds: new Map([...markers].map(([cue, marker]) => [cue, marker.id])),
  };
}
