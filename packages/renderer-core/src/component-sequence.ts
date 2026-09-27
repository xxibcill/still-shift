import {
  ComponentDefinitionSchema,
  type ComponentDefinition,
} from "../../scene-contract/src/components.ts";
import { ComponentDataV3Schema } from "../../scene-contract/src/component-data.ts";
import {
  instantiateComponent,
  validateInstances,
  type ComponentInstanceOptions,
} from "./component-instances.ts";
import {
  validateCommerceClock,
  type CommerceClock,
} from "./commerce-composition.ts";

export type ComponentClip = ComponentInstanceOptions & {
  definition: ComponentDefinition;
  duration: number;
};
export type ComponentSequenceClock = CommerceClock & {
  /** Omit to require that the sequence fits both scene consumers. */
  consumer?: "commerce" | "story";
};

/** Local definitions are expanded once. Explicit starts can create gaps or overlap. */
export function sequenceComponents(
  clock: ComponentSequenceClock,
  clips: ComponentClip[],
) {
  validateCommerceClock(clock);
  if (
    !clips.length ||
    clips.length > 32 ||
    new Set(clips.map((c) => c.id)).size !== clips.length
  )
    throw new Error("Sequence needs 1–32 clips with unique IDs");
  let cursor = 0;
  const counts = {
    nodes: 0,
    commerceEvents: 0,
    storyMoves: 0,
    annotations: 0,
    values: 0,
    bindings: 0,
    states: 0,
    cuts: 0,
    travels: 0,
    visibility: 0,
    pins: 0,
    textFits: 0,
    masks: 0,
  };
  const add = (key: keyof typeof counts, amount: number, limit: number) => {
    counts[key] += amount;
    if (counts[key] > limit)
      throw new Error(`${key} count ${counts[key]} exceeds ${limit}`);
  };
  const instances = clips.map((clip) => {
    try {
      const start = clip.start ?? cursor;
      if (
        !Number.isInteger(start) ||
        start < 0 ||
        !Number.isInteger(clip.duration) ||
        clip.duration < 1 ||
        start + clip.duration > clock.frameCount
      )
        throw new Error("Clip window must fit the timeline");
      cursor = start + clip.duration;
      const definition = ComponentDefinitionSchema.parse(clip.definition);
      const data = ComponentDataV3Schema.parse({
        ...definition.componentData,
        schemaVersion: "scene-components-3",
      });
      for (const item of [
        ...definition.motions,
        ...data.values,
        ...data.travels,
      ])
        if (item.window.end >= clip.duration)
          throw new Error("Local behavior exceeds clip duration: " + item.id);
      if (data.states.some((s) => s.cuts.some((c) => c.frame >= clip.duration)))
        throw new Error("Local cut exceeds clip duration");
      if (data.visibility.some((g) => g.window.end > clip.duration))
        throw new Error("Local visibility exceeds clip duration");
      const cues = new Set([
        ...definition.motions.map((m) => m.window.cue ?? m.id),
        ...data.values.map((v) => v.window.cue ?? v.id),
        ...data.travels.map((t) => t.window.cue ?? t.id),
        ...data.visibility.map((g) => g.window.cue ?? g.id),
        ...data.states.flatMap((s) => s.cuts.map((c) => c.id)),
      ]);
      const local = new Set(definition.nodes.map((n) => n.id));
      for (const node of definition.nodes) {
        if (node.parent && !local.has(node.parent))
          throw new Error("Clip requires independent scene roots: " + node.id);
        if (
          !node.parent &&
          !data.visibility.some((g) => g.target === node.id)
        ) {
          const base = "lifetime-" + node.id;
          let cue = base;
          for (let suffix = 2; cues.has(cue); suffix++)
            cue = base + "-" + suffix;
          cues.add(cue);
          data.visibility.push({
            id: cue,
            target: node.id,
            window: { start: 0, end: clip.duration },
          });
        }
      }
      const instance = instantiateComponent(
        ComponentDefinitionSchema.parse({
          ...definition,
          schemaVersion: "component-3",
          componentData: data,
        }),
        {
          id: clip.id,
          start,
          ...(clip.offset ? { offset: clip.offset } : {}),
          ...(clip.external ? { external: clip.external } : {}),
        },
      );
      if (instance.componentData.schemaVersion !== "scene-components-3")
        throw new Error("Sequence requires v3 component data");
      const expanded = instance.componentData;
      add("nodes", instance.nodes.length, 200);
      if (clock.consumer !== "story")
        add(
          "commerceEvents",
          instance.motions.reduce(
            (count, motion) => count + (motion.property === "scale" ? 2 : 1),
            0,
          ),
          100,
        );
      if (clock.consumer !== "commerce")
        add("storyMoves", instance.motions.length, 40);
      add("annotations", expanded.annotations.length, 40);
      add("values", expanded.values.length, 40);
      add("bindings", expanded.bindings.length, 80);
      add("states", expanded.states.length, 100);
      add(
        "cuts",
        expanded.states.reduce((count, state) => count + state.cuts.length, 0),
        100,
      );
      add("travels", expanded.travels.length, 32);
      add("visibility", expanded.visibility.length, 100);
      add("pins", expanded.pins.length, 32);
      add("textFits", expanded.textFits.length, 32);
      add("masks", expanded.masks.length, 16);
      return instance;
    } catch (error) {
      throw new Error(
        "Sequence clip " +
          clip.id +
          ": " +
          (error instanceof Error ? error.message : String(error)),
        { cause: error },
      );
    }
  });
  const owned = new Set(instances.flatMap((i) => i.nodes.map((n) => n.id)));
  for (const clip of clips)
    for (const target of Object.values(clip.external ?? {}))
      if (owned.has(target))
        throw new Error(
          "Sequence clip " + clip.id + " references another clip: " + target,
        );
  validateInstances(clock, instances);
  return instances;
}
