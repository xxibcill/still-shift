import {
  BuilderError,
  sourceLocation,
  sourceOf,
  recordSource,
  type SourceLocation,
} from "./source.ts";
export type Duration = number | { seconds: number };
export type Timeline<T> =
  | { kind: "clip"; value: T; duration: Duration }
  | { kind: "seq" | "par"; children: Timeline<T>[] }
  | { kind: "stagger"; children: Timeline<T>[]; offset: Duration }
  | { kind: "delay"; child: Timeline<T>; offset: Duration }
  | { kind: "at"; child: Timeline<T>; marker: string | Duration }
  | {
      kind: "after";
      child: Timeline<T>;
      reference: Timeline<T>;
      offset: Duration;
    };
export const seq = <T>(...children: Timeline<T>[]): Timeline<T> =>
  recordSource(
    {
      kind: "seq",
      children,
    },
    sourceLocation(),
  );
export const par = <T>(...children: Timeline<T>[]): Timeline<T> =>
  recordSource(
    {
      kind: "par",
      children,
    },
    sourceLocation(),
  );
export const stagger = <T>(
  children: Timeline<T>[],
  offset: Duration,
): Timeline<T> =>
  recordSource({ kind: "stagger", children, offset }, sourceLocation());
export const delay = <T>(offset: Duration, child: Timeline<T>): Timeline<T> =>
  recordSource({ kind: "delay", child, offset }, sourceLocation());
export const at = <T>(
  marker: string | Duration,
  child: Timeline<T>,
): Timeline<T> => recordSource({ kind: "at", child, marker }, sourceLocation());
export const after = <T>(
  reference: Timeline<T>,
  offset: Duration,
  child: Timeline<T>,
): Timeline<T> =>
  recordSource({ kind: "after", child, reference, offset }, sourceLocation());

export function frames(
  duration: Duration,
  fps: number,
  site?: SourceLocation,
): number {
  if (
    !Number.isFinite(fps) ||
    fps <= 0 ||
    (typeof duration !== "number" &&
      (!Number.isFinite(duration.seconds) || duration.seconds < 0))
  )
    throw new BuilderError(
      "comp-builder-time",
      "seconds and fps must be finite and nonnegative",
      site,
    );
  const value =
    typeof duration === "number"
      ? duration
      : Math.round(duration.seconds * fps);
  if (!Number.isSafeInteger(value) || value < 0)
    throw new BuilderError(
      "comp-builder-time",
      "durations must be nonnegative integer frames or finite seconds",
      site,
    );
  return value;
}
export type Scheduled<T> = { value: T; start: number; end: number };
export function schedule<T>(
  root: Timeline<T>,
  fps: number,
  markers: ReadonlyMap<string, number>,
): Scheduled<T>[] {
  const origins = new Map<Timeline<T>, () => number>();
  const starts = new Map<Timeline<T>, number>();
  const ends = new Map<Timeline<T>, number>();
  const resolvingStart = new Set<Timeline<T>>();
  const resolvingEnd = new Set<Timeline<T>>();
  const clips: Timeline<T>[] = [];
  const memo = (
    node: Timeline<T>,
    cache: Map<Timeline<T>, number>,
    active: Set<Timeline<T>>,
    calculate: () => number,
  ) => {
    if (cache.has(node)) return cache.get(node)!;
    if (active.has(node))
      throw new BuilderError(
        "comp-builder-time-cycle",
        "timeline references form a cycle",
        sourceOf(node),
      );
    active.add(node);
    const result = calculate();
    active.delete(node);
    cache.set(node, result);
    return result;
  };
  const start = (node: Timeline<T>): number =>
    memo(node, starts, resolvingStart, () => {
      const origin = origins.get(node);
      if (!origin)
        throw new BuilderError(
          "comp-builder-time-reference",
          "after reference is not in this timeline",
          sourceOf(node),
        );
      if (node.kind === "at") {
        if (typeof node.marker !== "string")
          return frames(node.marker, fps, sourceOf(node));
        const result = markers.get(node.marker.replace(/^cue:/, ""));
        if (result === undefined)
          throw new BuilderError(
            "comp-builder-marker",
            `unknown marker ${node.marker}`,
            sourceOf(node),
          );
        return result;
      }
      if (node.kind === "after")
        return end(node.reference) + frames(node.offset, fps, sourceOf(node));
      return origin();
    });
  const end = (node: Timeline<T>): number =>
    memo(node, ends, resolvingEnd, () => {
      if (node.kind === "clip")
        return start(node) + frames(node.duration, fps, sourceOf(node));
      if ("child" in node) return end(node.child);
      return Math.max(start(node), ...node.children.map(end));
    });
  const register = (node: Timeline<T>, origin: () => number) => {
    if (origins.has(node))
      throw new BuilderError(
        "comp-builder-time-reuse",
        "create a fresh animation for each timeline placement",
        sourceOf(node),
      );
    origins.set(node, origin);
    if (node.kind === "clip") clips.push(node);
    else if ("child" in node)
      register(
        node.child,
        () =>
          start(node) +
          (node.kind === "delay"
            ? frames(node.offset, fps, sourceOf(node))
            : 0),
      );
    else
      node.children.forEach((child, index) =>
        register(child, () => {
          if (node.kind === "seq" && index > 0)
            return Math.max(
              start(node),
              ...node.children.slice(0, index).map(end),
            );
          return (
            start(node) +
            (node.kind === "stagger"
              ? index * frames(node.offset, fps, sourceOf(node))
              : 0)
          );
        }),
      );
  };
  register(root, () => 0);
  return clips
    .map((node) => {
      if (node.kind !== "clip")
        throw new BuilderError("comp-builder-time", "Expected clip");
      return { value: node.value, start: start(node), end: end(node) };
    })
    .sort((a, b) => a.start - b.start);
}
