import type { Composition } from "@still-shift/scene-contract";
import {
  canonicalProperty,
  propertyJsonPath,
  readProperty,
  writeProperty,
} from "./property-access.ts";
import type { SourceTrack } from "./source-map.ts";
import { BuilderError } from "./source.ts";
import { type Animation, type Value, type AnimationKey } from "./properties.ts";
import type { Scheduled } from "./timeline.ts";
const overlaps = (a: string, b: string) =>
  a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
const isStaticValue = (value: unknown): value is Value =>
  value !== undefined &&
  value !== null &&
  (typeof value !== "object" || Array.isArray(value) || "vertices" in value);
export function applyAnimations(
  clips: Scheduled<Animation>[],
  layers: ReadonlyMap<string, Record<string, unknown>>,
  composition: Composition,
): SourceTrack[] {
  const sources: SourceTrack[] = [];
  const placed: Scheduled<Animation>[] = [];
  const tracks = new Map<string, AnimationKey<Value>[]>();
  for (const clip of clips) {
    const { start, end } = clip;
    const animation = {
      ...clip.value,
      property: canonicalProperty(
        composition,
        clip.value.owner.id,
        clip.value.property,
        clip.value.location,
      ),
    };
    const normalized = { ...clip, value: animation };
    const object = layers.get(animation.owner.id);
    if (!object)
      throw new BuilderError(
        "comp-builder-owner",
        `Layer ${animation.owner.id} was not added`,
        animation.location,
      );
    if (end > composition.frameCount)
      throw new BuilderError(
        "comp-builder-duration",
        `Animation ends at ${end}, beyond ${composition.frameCount}`,
        animation.location,
      );
    if (animation.mode !== "keys" && end <= start)
      throw new BuilderError(
        "comp-builder-duration",
        "An interpolated animation needs at least one frame",
        animation.location,
      );
    const mixed = placed.find(
      (previous) =>
        previous.value.owner === animation.owner &&
        previous.value.property !== animation.property &&
        overlaps(previous.value.property, animation.property),
    );
    if (mixed)
      throw new BuilderError(
        "comp-builder-property-mix",
        `Use whole-vector animations or separate axes consistently for ${animation.owner.id}.${animation.property}`,
        animation.location,
      );
    const conflict = placed.find(
      (previous) =>
        previous.value.owner === animation.owner &&
        overlaps(previous.value.property, animation.property) &&
        ((previous.start < end && previous.end > start) ||
          (previous.start === previous.end && previous.start === start)),
    );
    if (conflict)
      throw new BuilderError(
        "comp-builder-conflict",
        `${animation.owner.id}.${animation.property} overlaps ${conflict.value.location.file}:${conflict.value.location.line}`,
        animation.location,
      );
    placed.push(normalized);
    const target = `${animation.owner.id}.${animation.property}`;
    const keys = tracks.get(target) ?? [];
    const first = keys.length;
    const staticValue = readProperty(object, animation.property);
    const initial = keys.at(-1)?.value ?? animation.from ?? staticValue;
    if (!isStaticValue(initial))
      throw new BuilderError(
        "comp-builder-property",
        `Set a static initial value for ${target} before scheduling it`,
        animation.location,
      );
    const from = animation.from ?? initial;
    const append = (key: AnimationKey<Value>) => {
      const previous = keys.at(-1);
      if (previous?.frame === key.frame) {
        if (JSON.stringify(previous.value) !== JSON.stringify(key.value))
          throw new BuilderError(
            "comp-builder-conflict",
            `${target} assigns different values at frame ${key.frame}`,
            animation.location,
          );
        if (key.out !== undefined) previous.out = key.out;
        if (key.spatialOut !== undefined) previous.spatialOut = key.spatialOut;
        return;
      }
      if (previous && previous.frame > key.frame)
        throw new BuilderError(
          "comp-builder-key-order",
          `${target} key frames must increase`,
          animation.location,
        );
      keys.push(key);
    };
    if (animation.mode === "keys") {
      if (!keys.length && start + animation.keys![0]!.frame > 0)
        append({ frame: 0, value: from });
      for (const [index, key] of animation.keys!.entries())
        append({
          ...key,
          frame: start + key.frame,
          ...(index === 0 &&
          keys.length > 0 &&
          keys.at(-1)!.frame < start + key.frame
            ? { interpolation: "hold" as const }
            : {}),
        });
    } else {
      let to = animation.value!;
      if (animation.mode === "by") {
        if (typeof from === "number" && typeof to === "number") to = from + to;
        else if (
          Array.isArray(from) &&
          Array.isArray(to) &&
          from.length === to.length
        ) {
          const delta = to;
          to = from.map((value, index) => value + delta[index]!);
        } else
          throw new BuilderError(
            "comp-builder-value",
            "by requires equal numeric dimensions",
            animation.location,
          );
      }
      if (
        !keys.length &&
        start > 0 &&
        isStaticValue(staticValue) &&
        JSON.stringify(staticValue) !== JSON.stringify(from)
      )
        append({ frame: 0, value: staticValue });
      append({
        frame: start,
        value: from,
        ...(keys.length && keys.at(-1)!.frame < start
          ? { interpolation: "hold" as const }
          : {}),
      });
      append({
        frame: end,
        value: to,
        ...(animation.easing === undefined ? {} : { easing: animation.easing }),
      });
    }
    tracks.set(target, keys);
    if (keys.length > first)
      sources.push({
        layer: animation.owner.id,
        property: propertyJsonPath(object, animation.property),
        first,
        last: keys.length - 1,
        location: animation.location,
      });
  }
  for (const [target, keys] of tracks) {
    const [id, ...parts] = target.split(".");
    writeProperty(layers.get(id!)!, parts.join("."), { keys });
  }
  return sources;
}
