import {
  CommerceEventSchema,
  type CommerceEvent,
} from "../../scene-contract/src/commerce.ts";
import {
  validateCommerceClock,
  type CommerceClock,
} from "./commerce-composition.ts";
import type { MotionEasing } from "../../scene-contract/src/motion-easing.ts";

export type MotionWindow = {
  target: string;
  start: number;
  end: number;
  easing?: MotionEasing;
};
function validateWindow(clock: CommerceClock, window: MotionWindow) {
  validateCommerceClock(clock);
  if (
    !Number.isInteger(window.start) ||
    !Number.isInteger(window.end) ||
    window.start < 0 ||
    window.end <= window.start ||
    window.end >= clock.frameCount
  )
    throw new Error("Motion must finish inside the composition timeline");
}

export function buildFloatMotion(
  clock: CommerceClock,
  options: MotionWindow & { restY: number; travel: number; cycles: number },
): CommerceEvent[] {
  validateWindow(clock, options);
  if (
    !Number.isFinite(options.travel) ||
    options.travel < 0 ||
    !Number.isFinite(options.restY)
  )
    throw new Error(
      "Float needs a finite resting position and nonnegative travel",
    );
  if (
    !Number.isInteger(options.cycles) ||
    options.cycles < 1 ||
    options.cycles > 50 ||
    options.end - options.start < options.cycles * 2
  )
    throw new Error(
      "Float requires 1–50 cycles with two frame intervals per cycle",
    );
  return Array.from({ length: options.cycles * 2 }, (_, index) =>
    CommerceEventSchema.parse({
      node: options.target,
      property: "y",
      start:
        options.start +
        Math.round(
          ((options.end - options.start) * index) / (options.cycles * 2),
        ),
      end:
        options.start +
        Math.round(
          ((options.end - options.start) * (index + 1)) / (options.cycles * 2),
        ),
      to: options.restY - (index % 2 === 0 ? options.travel : 0),
      easing: "smoothstep",
    }),
  );
}

type Endpoint = { from?: number; to: number };
function propertyMotion(
  clock: CommerceClock,
  window: MotionWindow,
  property: CommerceEvent["property"],
  endpoint: Endpoint,
): CommerceEvent {
  validateWindow(clock, window);
  const values = [
    endpoint.to,
    ...(endpoint.from === undefined ? [] : [endpoint.from]),
  ];
  if (
    (property === "opacity" || property === "reveal") &&
    values.some((value) => value < 0 || value > 1)
  )
    throw new Error(`${property} must stay between zero and one`);
  return CommerceEventSchema.parse({
    node: window.target,
    property,
    start: window.start,
    end: window.end,
    ...endpoint,
    easing: window.easing ?? "out-cubic",
  });
}

/** Each specified axis owns its track; omitted axes stay untouched. */
export function buildTranslateMotion(
  clock: CommerceClock,
  options: MotionWindow & { x?: Endpoint; y?: Endpoint },
): CommerceEvent[] {
  if (!options.x && !options.y)
    throw new Error("Translate needs at least one axis");
  return (["x", "y"] as const).flatMap((axis) =>
    options[axis] ? [propertyMotion(clock, options, axis, options[axis]!)] : [],
  );
}
export function buildFadeMotion(
  clock: CommerceClock,
  options: MotionWindow & Endpoint,
): CommerceEvent[] {
  return [
    propertyMotion(clock, options, "opacity", {
      to: options.to,
      ...(options.from === undefined ? {} : { from: options.from }),
    }),
  ];
}

export function buildPathDrawMotion(
  clock: CommerceClock,
  options: MotionWindow & Endpoint,
): CommerceEvent[] {
  return [
    propertyMotion(clock, options, "reveal", {
      to: options.to,
      ...(options.from === undefined ? {} : { from: options.from }),
    }),
  ];
}

/** Both axes share one positive scale, preserving the approved product proportions. */
export function buildScaleMotion(
  clock: CommerceClock,
  options: MotionWindow & Endpoint,
): CommerceEvent[] {
  if (
    [options.to, ...(options.from === undefined ? [] : [options.from])].some(
      (n) => !Number.isFinite(n) || n <= 0 || n > 4,
    )
  )
    throw new Error("Scale must be positive and at most four");
  return ["scaleX", "scaleY"].map((property) =>
    propertyMotion(clock, options, property as CommerceEvent["property"], {
      to: options.to,
      ...(options.from === undefined ? {} : { from: options.from }),
    }),
  );
}
export function buildRotateMotion(
  clock: CommerceClock,
  options: MotionWindow & Endpoint,
): CommerceEvent[] {
  return [
    propertyMotion(clock, options, "rotation", {
      to: options.to,
      ...(options.from === undefined ? {} : { from: options.from }),
    }),
  ];
}
