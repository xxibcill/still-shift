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

/** Local definitions are expanded once. Explicit starts can create gaps or overlap. */
export function sequenceComponents(
  clock: CommerceClock,
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
      const local = new Set(definition.nodes.map((n) => n.id));
      for (const node of definition.nodes) {
        if (node.parent && !local.has(node.parent))
          throw new Error("Clip requires independent scene roots: " + node.id);
        if (!node.parent && !data.visibility.some((g) => g.target === node.id))
          data.visibility.push({
            id: "lifetime-" + node.id,
            target: node.id,
            window: { start: 0, end: clip.duration },
          });
      }
      return instantiateComponent(
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
