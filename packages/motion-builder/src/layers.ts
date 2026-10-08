import { anchorPoint, type NamedAnchor } from "./anchors.ts";
import {
  CompositionBehaviourSchema,
  type CompositionBehaviour,
} from "@still-shift/scene-contract";
import type {
  CompositionLayer,
  CompositionAsset,
  Composition,
  Precomp,
  CompositionTransform,
} from "@still-shift/scene-contract";
import {
  Property,
  type Motion,
  type Easing,
  type Value,
} from "./properties.ts";
import type { Duration } from "./timeline.ts";
import {
  sourceLocation,
  type SourceLocation,
  BuilderError,
  recordSource,
} from "./source.ts";
export type Kind = CompositionLayer["type"];
type Native<K extends Kind> = Extract<CompositionLayer, { type: K }>;
type Options<K extends Kind> = Omit<Native<K>, "type" | "id" | "transform">;
export type LayerBehaviourKind = Exclude<
  CompositionBehaviour["type"],
  "follow-through" | "stagger"
>;
type LayerBehaviourOptions<K extends LayerBehaviourKind> = Partial<
  Omit<Extract<CompositionBehaviour, { type: K }>, "type" | "target" | "layer">
> & { property?: string };
export type ImageAsset = Extract<CompositionAsset, { type: "image" }>;
export class Layer<K extends Kind = Kind> {
  readonly draft: Native<K>;
  readonly location: SourceLocation;
  autoId = false;
  inferImageSize = false;
  pendingAnchor: NamedAnchor | undefined;
  imageAsset: ImageAsset | undefined;
  preparedAssets: CompositionAsset[] = [];
  nested: Composition | Precomp | undefined;
  constructor(draft: Native<K>, location = sourceLocation()) {
    if (!/^[a-zA-Z][\w-]*$/.test(draft.id))
      throw new BuilderError(
        "comp-builder-id",
        `Invalid layer id ${draft.id}`,
        location,
      );
    this.draft = draft;
    this.location = location;
    this.draft.transform =
      draft.type === "camera" || draft.type === "light"
        ? { ...draft.transform }
        : {
            anchor: [0, 0],
            position: [0, 0],
            scale: [1, 1],
            rotation: 0,
            opacity: 1,
            ...draft.transform,
          };
  }
  get id(): string {
    return this.draft.id;
  }
  at(x: number, y: number, z?: number): this {
    this.draft.transform!.position = z === undefined ? [x, y] : [x, y, z];
    return this;
  }
  anchor(x: number | NamedAnchor, y?: number): this {
    if (typeof x === "number") {
      this.pendingAnchor = undefined;
      this.draft.transform!.anchor = [x, y ?? x];
    } else {
      if (
        this.inferImageSize ||
        (this.draft.type === "precomp" && !this.nested)
      ) {
        this.pendingAnchor = x;
        return this;
      }
      this.pendingAnchor = undefined;
      const size: [number, number] =
        "size" in this.draft && this.draft.size
          ? this.draft.size
          : this.nested
            ? [this.nested.width, this.nested.height]
            : [0, 0];
      this.draft.transform!.anchor = anchorPoint(x, size);
    }
    return this;
  }
  scale(x: number, y = x, z?: number): this {
    this.draft.transform!.scale = z === undefined ? [x, y] : [x, y, z];
    return this;
  }
  rotate(degrees: number): this {
    this.draft.transform!.rotation = degrees;
    return this;
  }
  opacity(value: number): this {
    this.draft.transform!.opacity = value;
    return this;
  }
  transform(value: CompositionTransform): this {
    if (value.anchor !== undefined) this.pendingAnchor = undefined;
    Object.assign(this.draft.transform!, structuredClone(value));
    return this;
  }
  parent(layer: { id: string } | string): this {
    this.draft.parent = typeof layer === "string" ? layer : layer.id;
    return this;
  }
  with(options: Partial<Omit<Native<K>, "id" | "type">>): this {
    if ("size" in options) this.inferImageSize = false;
    if (options.transform?.anchor !== undefined) this.pendingAnchor = undefined;
    Object.assign(this.draft, structuredClone(options));
    return this;
  }
  path(property: string): string {
    return `${this.id}.${property}`;
  }
  property<V extends Value>(path: string): Property<V> {
    return new Property<V>(this, path);
  }
  get x(): Property<number> {
    return this.property("transform.position.x");
  }
  get y(): Property<number> {
    return this.property("transform.position.y");
  }
  get z(): Property<number> {
    return this.property("transform.position.z");
  }
  get position(): Property<number[]> {
    return this.property("transform.position");
  }
  get scaleX(): Property<number> {
    return this.property("transform.scale.x");
  }
  get scaleY(): Property<number> {
    return this.property("transform.scale.y");
  }
  get rotation(): Property<number> {
    return this.property("transform.rotation");
  }
  get alpha(): Property<number> {
    return this.property("transform.opacity");
  }
  /** Flat-surface receiving is explicit and defaults to false. */
  receiveLight(enabled = true): this {
    this.draft.receivesLight = enabled;
    return this;
  }
  get reveal(): Property<number> {
    return this.property("reveal");
  }
  behaviour<K extends LayerBehaviourKind>(
    type: K,
    options: LayerBehaviourOptions<K> = {},
  ): Motion {
    const site = sourceLocation();
    const { property = "transform.position", ...fields } = options;
    const location =
      type === "auto-orient" || type === "squash-stretch"
        ? { layer: this.id }
        : { target: this.path(property) };
    const defaults =
      type === "anticipation"
        ? { amount: 20, durationFrames: 12 }
        : type === "camera-shake"
          ? { startFrame: 0, amplitude: 2 }
          : {};
    const result = CompositionBehaviourSchema.safeParse({
      type,
      ...location,
      ...defaults,
      ...fields,
    });
    if (!result.success)
      throw new BuilderError(
        "comp-builder-behaviour",
        result.error.issues.map((issue) => issue.message).join("; "),
        site,
      );
    return recordSource<Motion>(
      {
        kind: "clip",
        duration: 0,
        value: { owner: this, behaviour: result.data, location: site },
      },
      site,
    );
  }
  moveTo(value: number[], duration: Duration, easing?: Easing): Motion {
    return this.position.to(value, duration, easing);
  }
  moveBy(value: number[], duration: Duration, easing?: Easing): Motion {
    return this.position.by(value, duration, easing);
  }
  fadeIn(duration: Duration, easing?: Easing): Motion {
    return this.alpha.from(0).to(1, duration, easing);
  }
  fadeOut(duration: Duration, easing?: Easing): Motion {
    return this.alpha.to(0, duration, easing);
  }
}
export function layer<K extends Kind>(draft: Native<K>): Layer<K> {
  return new Layer(draft);
}
export function solid(id: string, options: Options<"solid">): Layer<"solid"> {
  return new Layer({ ...options, type: "solid", id });
}
export function image(
  id: string,
  asset: ImageAsset | string,
  options: Partial<Options<"image">> = {},
): Layer<"image"> {
  const node = new Layer<"image">({
    type: "image",
    id,
    size: typeof asset === "string" ? [1, 1] : [asset.width, asset.height],
    sources: [{ asset: typeof asset === "string" ? asset : asset.id }],
    ...options,
  });
  node.inferImageSize = typeof asset === "string" && options.size === undefined;
  if (typeof asset !== "string") node.imageAsset = asset;
  return node;
}
/** Prepared source/depth assets are registered together; inference is external. */
export function depthImage(
  id: string,
  source: ImageAsset,
  depth: ImageAsset,
  options: Partial<Omit<Options<"depth-image">, "sourceAsset" | "depth">> = {},
): Layer<"depth-image"> {
  const node = new Layer<"depth-image">({
    type: "depth-image",
    id,
    size: [source.width, source.height],
    sourceAsset: source.id,
    depth: {
      asset: depth.id,
      encoding: "r8-unorm",
      width: depth.width,
      height: depth.height,
    },
    overscan: 0.1,
    ...options,
  });
  node.preparedAssets = [source, depth];
  return node;
}
export function text(
  content: string,
  options: Partial<Omit<Options<"text">, "text">> & { id?: string } = {},
): Layer<"text"> {
  const { id = "text", ...fields } = options;
  const node = new Layer({
    type: "text",
    id,
    text: content,
    fontSize: 48,
    color: "#000000",
    ...fields,
  });
  node.autoId = options.id === undefined;
  return node;
}
export function group(id: string, options: Options<"group">): Layer<"group"> {
  return new Layer({ ...options, type: "group", id });
}
export function nullLayer(
  id: string,
  options: Partial<Options<"null">> = {},
): Layer<"null"> {
  return new Layer({ ...options, type: "null", id });
}
export function adjustment(
  id: string,
  options: Options<"adjustment"> = {},
): Layer<"adjustment"> {
  return new Layer({ ...options, type: "adjustment", id });
}
export function provider(
  id: string,
  options: Options<"provider">,
): Layer<"provider"> {
  return new Layer({ ...options, type: "provider", id });
}
export function precomp(
  id: string,
  source: string | Composition | Precomp,
  options: Partial<Options<"precomp">> = {},
): Layer<"precomp"> {
  const node = new Layer({
    type: "precomp",
    id,
    comp: typeof source === "string" ? source : source.id,
    ...options,
  });
  if (typeof source !== "string") node.nested = structuredClone(source);
  return node;
}
export const shape = {
  native: (id: string, options: Options<"shape">): Layer<"shape"> =>
    new Layer({ ...options, type: "shape", id }),
  rect: (
    id: string,
    options: { size: [number, number]; color?: string },
  ): Layer<"solid"> =>
    solid(id, { size: options.size, color: options.color ?? "#000000" }),
};
export function camera(
  id: string,
  options: Options<"camera"> = {},
): Layer<"camera"> {
  return new Layer({ ...options, type: "camera", id });
}
export function light(
  id: string,
  options: Options<"light"> = { lightType: "ambient" },
): Layer<"light"> {
  return new Layer({ ...options, type: "light", id });
}
export function video(
  id: string,
  asset: string,
  options: Partial<Options<"video">> = {},
): Layer<"video"> {
  return new Layer({ type: "video", id, asset, ...options });
}
export function sequence(
  id: string,
  asset: string,
  options: Partial<Options<"sequence">> = {},
): Layer<"sequence"> {
  return new Layer({ type: "sequence", id, asset, ...options });
}
export function audio(
  id: string,
  asset: string,
  options: Partial<Options<"audio">> = {},
): Layer<"audio"> {
  return new Layer({ type: "audio", id, asset, ...options });
}
