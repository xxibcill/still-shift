// Small authoring helpers for the fashion-reel title grammar in
// skills/design-editorial-titles. They only wrap existing composition
// features (held stroke animators, text animators, light effects, native
// shapes, markers); they hold no footage analysis and no taste. Each
// candidate still chooses every font, colour, size and position itself.
import { shape } from "@still-shift/motion";
import type { Composition } from "@still-shift/scene-contract";

type Builder = {
  textAnimator(value: NonNullable<Composition["textAnimators"]>[number]): void;
  marker(
    id: string,
    frame: number,
    options?: { duration?: number; label?: string },
  ): void;
};
type Properties = NonNullable<Composition["textAnimators"]>[number]["from"];

/** Entrance / hold / exit windows in frames, from seconds. */
export function beats(
  fps: number,
  frames: number,
  build: { start: number; end: number },
  exit: number | undefined,
) {
  const at = (seconds: number) => Math.round(seconds * fps);
  const gone = frames;
  const exitStart = exit === undefined ? frames : at(exit);
  return {
    fps,
    at,
    buildStart: at(build.start),
    buildEnd: at(build.end),
    exitStart,
    gone,
  };
}

/** Markers the check script reads to pick entrance, hold and exit frames. */
export function markBeats(
  c: Builder,
  b: ReturnType<typeof beats>,
  label = "Title",
) {
  c.marker("build", b.buildStart, {
    duration: b.buildEnd - b.buildStart,
    label: `${label} builds`,
  });
  const holdEnd = b.exitStart < b.gone ? b.exitStart : b.gone;
  c.marker("hold", b.buildEnd, {
    duration: holdEnd - b.buildEnd,
    label: `${label} held`,
  });
  if (b.exitStart < b.gone)
    c.marker("exit", b.exitStart, {
      duration: b.gone - b.exitStart,
      label: `${label} exits`,
    });
}

/**
 * Static glyph outline: a stroke animator held at its end state (`from` ==
 * `to`), confirmed by the ET7a mapping probe. The stroke is drawn behind the
 * fill, so `width` is roughly twice the visible outline.
 */
export function outline(
  c: Builder,
  node: string,
  color: string,
  width: number,
) {
  c.textAnimator({
    node,
    unit: "line",
    start: 0,
    end: 1,
    stagger: 0,
    selector: { start: 0, end: 1 },
    from: { stroke: color, strokeWidth: width },
    to: { stroke: color, strokeWidth: width },
  });
}

/** Word, glyph or line entrance from `from` to rest. */
export function enter(
  c: Builder,
  node: string,
  start: number,
  options: {
    unit?: "word" | "glyph" | "line";
    duration?: number;
    stagger?: number;
    from: Properties;
    order?: "forward" | "reverse" | "center-out";
    anchor?: "glyph" | "word" | "line" | "all";
  },
) {
  const unit = options.unit ?? "word";
  c.textAnimator({
    node,
    unit,
    start,
    end: start + (options.duration ?? 8),
    stagger: options.stagger ?? 0,
    selector: { start: 0, end: 1, order: options.order ?? "forward" },
    anchor: options.anchor ?? (unit === "line" ? "line" : unit),
    from: options.from,
    layer: "action",
  });
}

/**
 * Rest values of the animator properties an exit can start from. Colours,
 * stroke width, axes and leading have no rest value that matches every
 * layer, so an exit that changes them must spell out its own `from`.
 */
const REST = {
  opacity: 1,
  scale: 1,
  offset: [0, 0],
  rotation: 0,
  blur: 0,
  tracking: 0,
  skew: 0,
  baselineShift: 0,
} as const;

/** Exit from rest to `to`, held afterwards. */
export function leave(
  c: Builder,
  node: string,
  start: number,
  end: number,
  to: Properties,
  options: { unit?: "word" | "glyph" | "line"; stagger?: number } = {},
) {
  const unit = options.unit ?? "line";
  const from = Object.fromEntries(
    Object.keys(to).map((key) => {
      if (!Object.hasOwn(REST, key))
        throw new Error(
          `leave(${node}): no rest value for "${key}"; use a text animator with an explicit from`,
        );
      const rest = REST[key as keyof typeof REST];
      return [key, Array.isArray(rest) ? [...rest] : rest];
    }),
  ) as Properties;
  c.textAnimator({
    node,
    unit,
    start,
    end,
    stagger: options.stagger ?? 0,
    selector: { start: 0, end: 1, order: "reverse" },
    anchor: unit === "line" ? "line" : unit,
    from,
    to,
    layer: "response",
  });
}

/** Drop shadow for display type (not credited by contrast lint). */
export const dropShadow = (
  color: string,
  offset: [number, number] = [0, 6],
  blur = 10,
  opacity = 0.8,
) => ({
  id: "shadow",
  effect: "light.drop-shadow" as const,
  params: { offset, blur, opacity, color },
});

/**
 * Coloured halo. `light.glow` has no colour (it brightens the layer's own
 * pixels), so a coloured glow is a zero-offset drop shadow.
 */
export const halo = (color: string, blur = 16, opacity = 0.9) =>
  dropShadow(color, [0, 0], blur, opacity);

/** Four-point sparkle star, a native shape. */
export function sparkle(
  id: string,
  x: number,
  y: number,
  radius: number,
  color: string,
) {
  return shape
    .native(id, {
      contents: [
        {
          id: "star",
          type: "polystar",
          kind: "star",
          points: 4,
          outerRadius: radius,
          innerRadius: radius * 0.22,
        },
        { id: "fill", type: "fill", color },
      ],
    })
    .at(x, y);
}

const TREATED_DISPLAY =
  "Display type legible by its outline, shadow or halo: the contrast mask " +
  "counts an outline ring as glyph pixels and compares it, like the fill, " +
  "with the footage directly behind, and credits no shadow or halo. G1 " +
  "(ET3-D1) allows large display text below 3:1; the agent checked the hold " +
  "frames at phone scale.";

/**
 * Saved lint policy waiving `text-contrast` for treated display layers only.
 * Labels are never waived: they get a box instead.
 */
export function displayWaivers(layers: string[]) {
  return {
    readingPolicy: {
      textLegibility: {
        waivers: layers.map((layer) => ({
          layer,
          reason: TREATED_DISPLAY,
          codes: ["text-contrast" as const],
        })),
      },
    },
  };
}
