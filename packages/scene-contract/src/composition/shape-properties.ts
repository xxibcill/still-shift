import type { PropertyPathSegment } from "./property-path.ts";

export type ShapeField =
  | { type: "scalar"; default: number; min: number; max: number }
  | { type: "vec2"; default: [number, number]; min: number; max: number }
  | { type: "color"; default: string }
  | { type: "path"; default: undefined };

const number = (value = 0, min = -1_000_000, max = 1_000_000): ShapeField => ({
  type: "scalar",
  default: value,
  min,
  max,
});
const vector = (
  value: [number, number] = [0, 0],
  min = -1_000_000,
  max = 1_000_000,
): ShapeField => ({ type: "vec2", default: value, min, max });
const opacity = () => number(1, 0, 1);
const color: ShapeField = { type: "color", default: "#ffffff" };
const transform = {
  anchor: vector(),
  position: vector(),
  scale: vector([1, 1], -1000, 1000),
  rotation: number(),
  skewX: number(0, -85, 85),
  skewY: number(0, -85, 85),
  opacity: opacity(),
};
const stroke = {
  opacity: opacity(),
  width: number(1, 0),
  dashOffset: number(),
  pinch: number(0, 0, 1),
  pinchAt: number(0.5, 0, 1),
  pinchWidth: number(0.15, 0.001, 1),
};
const gradient = { opacity: opacity(), start: vector(), end: vector() };
const fields: Readonly<Record<string, Readonly<Record<string, ShapeField>>>> = {
  transform,
  "repeater-transform": Object.fromEntries(
    Object.entries(transform).filter(([name]) => name !== "opacity"),
  ),
  stop: { offset: number(0, 0, 1), color },
  rect: {
    position: vector(),
    size: vector([0, 0], 0),
    roundness: number(0, 0),
  },
  ellipse: { position: vector(), size: vector([0, 0], 0) },
  polystar: {
    position: vector(),
    rotation: number(),
    points: number(5, 2, 256),
    outerRadius: number(0, 0),
    innerRadius: number(0, 0),
    outerRoundness: number(0, 0, 1),
    innerRoundness: number(0, 0, 1),
  },
  path: { path: { type: "path", default: undefined } },
  fill: { color, opacity: opacity() },
  stroke: { color, ...stroke },
  "gradient-fill": gradient,
  "gradient-stroke": { ...gradient, ...stroke },
  "trim-paths": {
    start: number(0, 0, 1),
    end: number(1, 0, 1),
    offset: number(),
  },
  repeater: {
    copies: number(0, 0, 256),
    offset: number(),
    startOpacity: opacity(),
    endOpacity: opacity(),
  },
  "offset-path": { amount: number() },
  "round-corners": { radius: number(0, 0) },
  "wiggle-paths": {
    size: number(0, 0),
    detail: number(1, 0, 64),
    frequency: number(1, 0, 100),
    evolution: number(),
  },
  "zig-zag": { size: number(0, 0), ridges: number(1, 0, 128) },
  "pucker-bloat": { amount: number(0, -1, 1) },
  twist: { angle: number(), center: vector() },
};
const EMPTY: Readonly<Record<string, ShapeField>> = Object.freeze({});

for (const collection of Object.values(fields)) {
  for (const descriptor of Object.values(collection)) {
    if (Array.isArray(descriptor.default)) Object.freeze(descriptor.default);
    Object.freeze(descriptor);
  }
  Object.freeze(collection);
}
Object.freeze(fields);

/** Only declared native fields are animatable; metadata is deliberately opaque. */
export function shapeFields(
  type: string,
): Readonly<Record<string, ShapeField>> {
  return Object.hasOwn(fields, type) ? fields[type]! : EMPTY;
}

type ShapeObject = { id: string; type: string; [key: string]: unknown };
export type ShapePropertyLocation = {
  owner: Record<string, unknown>;
  key: string;
  descriptor: ShapeField;
  component?: number;
  type: ShapeField["type"];
  /** Relative to the layer; public ID selectors are translated into actual indices. */
  jsonPath: (string | number)[];
};

/** One locator for authored and sampled trees, including nested groups and stops. */
export function locateShapeProperty(
  contents: readonly ShapeObject[],
  segments: readonly PropertyPathSegment[],
): ShapePropertyLocation | undefined {
  const [selector, ...tail] = segments;
  if (selector?.name !== "contents" || selector.index === undefined)
    return undefined;
  const index = contents.findIndex((content) => content.id === selector.index);
  const content = contents[index];
  if (!content) return undefined;
  const route: (string | number)[] = ["contents", index];
  if (tail[0]?.name === "contents") {
    if (content.type !== "group") return undefined;
    const child = locateShapeProperty(content.contents as ShapeObject[], tail);
    return child
      ? { ...child, jsonPath: [...route, ...child.jsonPath] }
      : undefined;
  }
  let owner: Record<string, unknown> = content;
  let type = content.type;
  let rest = tail;
  const head = rest[0];
  if (head?.name === "transform" && head.index === undefined) {
    if (type !== "group" && type !== "repeater") return undefined;
    type = type === "repeater" ? "repeater-transform" : "transform";
    owner = (content.transform as Record<string, unknown> | undefined) ?? {};
    route.push("transform");
    rest = rest.slice(1);
  } else if (head?.name === "stops" && head.index !== undefined) {
    if (type !== "gradient-fill" && type !== "gradient-stroke")
      return undefined;
    const stops = content.stops as ShapeObject[];
    const stop = stops.findIndex((value) => value.id === head.index);
    if (stop < 0) return undefined;
    owner = stops[stop]!;
    type = "stop";
    route.push("stops", stop);
    rest = rest.slice(1);
  }
  const [property, component, ...extra] = rest;
  if (!property || property.index !== undefined || extra.length)
    return undefined;
  const declared = shapeFields(type);
  if (!Object.hasOwn(declared, property.name)) return undefined;
  const descriptor = declared[property.name]!;
  route.push(property.name);
  if (!component)
    return {
      owner,
      key: property.name,
      descriptor,
      type: descriptor.type,
      jsonPath: route,
    };
  if (component.index !== undefined) return undefined;
  const names =
    descriptor.type === "vec2"
      ? ["x", "y"]
      : descriptor.type === "color"
        ? ["r", "g", "b", "a"]
        : [];
  const axis = names.indexOf(component.name);
  if (axis < 0) return undefined;
  return {
    owner,
    key: property.name,
    descriptor,
    type: "scalar",
    component: axis,
    jsonPath: [...route, component.name],
  };
}
