import {
  isKeyed,
  shapeFields,
  type ShapeContent,
  type ShapeField,
} from "@still-shift/scene-contract";
import { scalar, vector, color, path } from "../evaluate/sample.ts";
import type { ShapeGeometryBudget } from "./budget.ts";
import type { SampledShapeContent } from "./types.ts";

function sampledFields(
  type: string,
  source: Record<string, unknown>,
  time: number,
  fps: number,
  budget: ShapeGeometryBudget,
) {
  const sampled: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(shapeFields(type))) {
    const value = source[key];
    switch (descriptor.type) {
      case "scalar":
        sampled[key] = scalar(value, time, fps, descriptor.default);
        break;
      case "vec2":
        sampled[key] = vector(value, time, fps, descriptor.default);
        break;
      case "color":
        sampled[key] = color(value ?? descriptor.default, time, fps);
        break;
      case "path": {
        const sourcePath = isKeyed(value) ? value.keys[0]!.value : value;
        budget.paths();
        budget.vertices(
          (sourcePath as { vertices: unknown[] }).vertices.length * 3,
        );
        sampled[key] = path(value as Parameters<typeof path>[0], time, fps);
        break;
      }
    }
    clampField(sampled, key, descriptor, budget);
  }
  return sampled;
}

/** Key overshoot is bounded just like driven native fields, before geometry work. */
export function clampField(
  source: Record<string, unknown>,
  key: string,
  descriptor: ShapeField,
  budget: ShapeGeometryBudget,
) {
  const value = source[key];
  if (descriptor.type === "color") {
    source[key] = (value as number[]).map((n) => {
      if (!Number.isFinite(n))
        budget.fail(
          "comp-shape-value",
          "Sampled shape colors must remain finite",
        );
      return Math.max(0, Math.min(1, n));
    });
  } else if (descriptor.type === "scalar" || descriptor.type === "vec2") {
    const clamp = (n: number) => {
      if (!Number.isFinite(n))
        budget.fail(
          "comp-shape-value",
          "Sampled shape values must remain finite",
        );
      return Math.max(descriptor.min, Math.min(descriptor.max, n));
    };
    source[key] =
      descriptor.type === "scalar"
        ? clamp(value as number)
        : (value as number[]).map(clamp);
  }
}

const STATIC = [
  "kind",
  "rule",
  "cap",
  "join",
  "miterLimit",
  "dashes",
  "style",
  "gradient",
  "mode",
  "order",
  "seed",
  "smooth",
] as const;

/** Samples only the explicit registry and static shape fields, never opaque metadata. */
export function sampleShapes(
  contents: readonly ShapeContent[],
  time: number,
  fps: number,
  budget: ShapeGeometryBudget,
): SampledShapeContent[] {
  budget.vertices(contents.length);
  return contents.map((content) => {
    const location = budget.located({
      path: `${budget.location.path ?? ""}.contents[${content.id}]`,
    });
    const fields = sampledFields(content.type, content, time, fps, location);
    const result: Record<string, unknown> = {
      id: content.id,
      type: content.type,
      ...fields,
    };
    for (const key of STATIC) {
      const value = (content as Record<string, unknown>)[key];
      if (value !== undefined)
        result[key] = Array.isArray(value) ? [...value] : value;
    }
    if (content.type === "zig-zag" && content.points !== undefined)
      result.points = content.points;
    if (content.type === "group") {
      result.contents = sampleShapes(content.contents, time, fps, location);
      result.transform = sampledFields(
        "transform",
        content.transform ?? {},
        time,
        fps,
        location,
      );
    } else if (content.type === "repeater") {
      result.transform = sampledFields(
        "repeater-transform",
        content.transform ?? {},
        time,
        fps,
        location,
      );
    } else if (
      content.type === "gradient-fill" ||
      content.type === "gradient-stroke"
    ) {
      result.stops = content.stops.map((stop) => ({
        id: stop.id,
        ...sampledFields("stop", stop, time, fps, location),
      }));
    }
    // Registry-driven conversion is the single authored-to-numeric boundary.
    return result as SampledShapeContent;
  });
}

export function clampShapes(
  contents: SampledShapeContent[],
  budget: ShapeGeometryBudget,
) {
  for (const content of contents) {
    const location = budget.located({
      path: `${budget.location.path ?? ""}.contents[${content.id}]`,
    });
    for (const [key, descriptor] of Object.entries(shapeFields(content.type)))
      clampField(content, key, descriptor, location);
    if (content.type === "group" || content.type === "repeater") {
      const type =
        content.type === "group" ? "transform" : "repeater-transform";
      for (const [key, descriptor] of Object.entries(shapeFields(type)))
        clampField(content.transform, key, descriptor, location);
      if (content.type === "group") clampShapes(content.contents, location);
    } else if (
      content.type === "gradient-fill" ||
      content.type === "gradient-stroke"
    ) {
      for (const stop of content.stops)
        for (const [key, descriptor] of Object.entries(shapeFields("stop")))
          clampField(stop, key, descriptor, location);
    }
  }
}

/** Bound the pre-constraint history copy before allocating it. No opaque data is present. */
export function cloneShapes(
  contents: SampledShapeContent[],
  budget: ShapeGeometryBudget,
): SampledShapeContent[] {
  const pending: unknown[] = [contents];
  while (pending.length) {
    const value = pending.pop();
    if (Array.isArray(value)) {
      budget.vertices(value.length);
      pending.push(...value);
    } else if (value && typeof value === "object") {
      const values = Object.values(value);
      budget.vertices(values.length);
      pending.push(...values);
    }
  }
  return structuredClone(contents);
}
