import type {
  CompositionBehaviour,
  CompositionTransform,
} from "@still-shift/scene-contract";
import { type Duration, type Timeline } from "./timeline.ts";
import { BuilderError, sourceLocation, type SourceLocation } from "./source.ts";
export type Value = number | string | number[];
type ScalarKeys = Extract<
  NonNullable<CompositionTransform["rotation"]>,
  { keys: unknown[] }
>;
export type Easing = NonNullable<ScalarKeys["keys"][number]["easing"]>;
export type AnimationKey<V extends Value> = {
  frame: number;
  value: V;
  easing?: Easing;
  interpolation?: "linear" | "hold" | "bezier" | "smooth";
};
export type AnimatedOwner = { id: string };
export type Animation = {
  owner: AnimatedOwner;
  property: string;
  mode: "to" | "by" | "keys";
  from?: Value;
  value?: Value;
  keys?: AnimationKey<Value>[];
  easing?: Easing;
  location: SourceLocation;
};
export type BehaviourCommand = {
  owner: AnimatedOwner;
  behaviour: CompositionBehaviour;
  location: SourceLocation;
};
export type Motion = Timeline<Animation | BehaviourCommand>;
export class Property<V extends Value> {
  readonly owner: AnimatedOwner;
  readonly path: string;
  private readonly initial: V | undefined;
  constructor(owner: AnimatedOwner, path: string, initial?: V) {
    this.owner = owner;
    this.path = path;
    this.initial = initial;
  }
  from(value: V): Property<V> {
    return new Property(this.owner, this.path, value);
  }
  to(value: V, duration: Duration, easing?: Easing): Motion {
    return this.animate("to", value, duration, easing);
  }
  by(value: V, duration: Duration, easing?: Easing): Motion {
    return this.animate("by", value, duration, easing);
  }
  keys(keys: AnimationKey<V>[]): Motion {
    if (!keys.length)
      throw new BuilderError(
        "comp-builder-keys",
        "at least one key is required",
      );
    return {
      kind: "clip",
      duration: keys.at(-1)!.frame,
      value: {
        owner: this.owner,
        property: this.path,
        mode: "keys",
        keys: structuredClone(keys),
        location: sourceLocation(),
      },
    };
  }
  private animate(
    mode: "to" | "by",
    value: V,
    duration: Duration,
    easing?: Easing,
  ): Motion {
    return {
      kind: "clip",
      duration,
      value: {
        owner: this.owner,
        property: this.path,
        mode,
        value,
        ...(this.initial === undefined ? {} : { from: this.initial }),
        ...(easing === undefined ? {} : { easing }),
        location: sourceLocation(),
      },
    };
  }
}
export function readProperty(
  object: Record<string, unknown>,
  path: string,
): unknown {
  let value: unknown = object;
  for (const part of path.split(".")) {
    if (Array.isArray(value) && ["x", "y", "z"].includes(part))
      value = value[["x", "y", "z"].indexOf(part)];
    else
      value =
        typeof value === "object" && value !== null
          ? (value as Record<string, unknown>)[part]
          : undefined;
  }
  return value;
}
export function writeProperty(
  object: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let parent = object;
  for (const part of parts.slice(0, -1)) {
    const old = parent[part];
    if (Array.isArray(old))
      parent[part] = {
        x: old[0],
        y: old[1],
        ...(old.length === 3 ? { z: old[2] } : {}),
      };
    else if (old === undefined) parent[part] = {};
    else if (typeof old !== "object" || old === null || "keys" in old)
      throw new BuilderError(
        "comp-builder-property",
        `cannot split animated property ${part}`,
      );
    parent = parent[part] as Record<string, unknown>;
  }
  parent[parts.at(-1)!] = value;
}
