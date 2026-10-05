import type {
  BezierPath,
  CompositionBehaviour,
  CompositionTransform,
} from "@still-shift/scene-contract";
import { type Duration, type Timeline } from "./timeline.ts";
import { BuilderError, sourceLocation, type SourceLocation } from "./source.ts";
export type Value = number | string | number[] | BezierPath;
type ScalarKeys = Extract<
  NonNullable<CompositionTransform["rotation"]>,
  { keys: unknown[] }
>;
export type Easing = NonNullable<ScalarKeys["keys"][number]["easing"]>;
export type AnimationKey<V extends Value> = {
  frame: number;
  value: V;
  easing?: Easing;
  interpolation?: "linear" | "hold" | "ease" | "bezier" | "smooth";
  smooth?: boolean;
  bezier?: [number, number, number, number];
  in?: { ease: number; speed?: number | number[]; spatialSpeed?: number };
  out?: { ease: number; speed?: number | number[]; spatialSpeed?: number };
  spatialIn?: number[];
  spatialOut?: number[];
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
export type AnimationClip = Extract<Timeline<Animation>, { kind: "clip" }>;
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
  to(value: V, duration: Duration, easing?: Easing): AnimationClip {
    return this.animate("to", value, duration, easing);
  }
  by(value: V, duration: Duration, easing?: Easing): AnimationClip {
    return this.animate("by", value, duration, easing);
  }
  keys(keys: AnimationKey<V>[]): AnimationClip {
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
  ): AnimationClip {
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
