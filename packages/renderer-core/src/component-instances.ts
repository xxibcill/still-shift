import {
  ComponentDefinitionSchema,
  type ComponentDefinition,
} from "../../scene-contract/src/components.ts";
import { ComponentIdSchema } from "../../scene-contract/src/component-data.ts";
import {
  CommerceSceneSchema,
  type CommerceScene,
} from "../../scene-contract/src/commerce.ts";
import {
  StorySceneSchema,
  type StoryScene,
} from "../../scene-contract/src/story.ts";
import {
  mergeCommerceFragments,
  validateCommerceClock,
  type CommerceClock,
} from "./commerce-composition.ts";
import { compileStoryScene } from "./story-scene.ts";
import { compileCommerceScene } from "./commerce-scene.ts";
import {
  assembleComponentData,
  componentCapabilities,
  mergeComponentData,
} from "./component-capabilities.ts";

export type ComponentInstance = Omit<
  ComponentDefinition,
  "schemaVersion" | "externals"
>;
export type ComponentInstanceOptions = {
  id: string;
  offset?: [number, number];
  start?: number;
  external?: Record<string, string>;
};

export function instantiateComponent(
  input: ComponentDefinition,
  options: ComponentInstanceOptions,
): ComponentInstance {
  const definition = ComponentDefinitionSchema.parse(input),
    id = ComponentIdSchema.parse(options.id);
  const start = options.start ?? 0,
    offset = options.offset ?? [0, 0];
  if (
    !Number.isInteger(start) ||
    start < 0 ||
    offset.length !== 2 ||
    !offset.every(Number.isFinite)
  )
    throw new Error(
      "Component instance needs integer start and finite placement",
    );
  const local = new Set(definition.nodes.map((n) => n.id));
  if (local.size !== definition.nodes.length)
    throw new Error("Duplicate component node");
  if (
    new Set(definition.externals).size !== definition.externals.length ||
    definition.externals.some((ref) => local.has(ref))
  )
    throw new Error(
      "Component external aliases must be unique and distinct from local nodes",
    );
  for (const alias of definition.externals)
    if (!Object.hasOwn(options.external ?? {}, alias))
      throw new Error("Missing external component target: " + alias);
  for (const alias of Object.keys(options.external ?? {}))
    if (!definition.externals.includes(alias))
      throw new Error("Unknown external component alias: " + alias);
  const reference = (ref: string): string => {
    if (local.has(ref)) return `${id}__${ref}`;
    if (definition.externals.includes(ref))
      return ComponentIdSchema.parse(options.external![ref]);
    throw new Error("Unknown component reference: " + ref);
  };
  const roots = new Set(
    definition.nodes
      .filter((n) => !n.parent || !local.has(n.parent))
      .map((n) => n.id),
  );
  const window = <
    T extends {
      start: number;
      end: number;
      cue?: string | undefined;
      weight?: { frame: number; value: number }[] | undefined;
    },
  >(
    w: T,
    cue: string,
  ) => ({
    ...w,
    start: w.start + start,
    end: w.end + start,
    cue: `${id}__${cue}`,
    ...(w.weight
      ? {
          weight: w.weight.map((key) => ({ ...key, frame: key.frame + start })),
        }
      : {}),
  });
  const motionIds = new Set(definition.motions.map((m) => m.id));
  if (motionIds.size !== definition.motions.length)
    throw new Error("Duplicate component motion ID");
  const features = componentCapabilities(definition.componentData);
  for (const item of [
    ...features.visibility,
    ...features.pins,
    ...features.textFits,
    ...features.masks,
  ])
    if (!local.has(item.target))
      throw new Error(
        "Component relationship must own a local target: " + item.target,
      );
  const cues = [
    ...definition.motions,
    ...features.values,
    ...features.travels,
    ...features.visibility,
  ].map((item) => item.window.cue ?? item.id);
  cues.push(...features.states.flatMap((s) => s.cuts.map((c) => c.id)));
  if (new Set(cues).size !== cues.length)
    throw new Error("Duplicate component cue ID");
  const nodes = definition.nodes.map((node) => ({
    ...node,
    id: reference(node.id),
    ...(node.parent ? { parent: reference(node.parent) } : {}),
    ...(roots.has(node.id)
      ? { x: node.x + offset[0], y: node.y + offset[1] }
      : {}),
  }));
  const motions = definition.motions.map((m) => {
    if (!local.has(m.node))
      throw new Error("Component motion must own a local node: " + m.node);
    return {
      ...m,
      id: `${id}__${m.id}`,
      node: reference(m.node),
      window: window(m.window, m.window.cue ?? m.id),
      to:
        m.to +
        (roots.has(m.node) &&
        (m.property === "x" || m.property === "y") &&
        (m.window.blend === "replace" ||
          (!m.window.blend && (m.window.layer ?? "action") === "action"))
          ? offset[m.property === "x" ? 0 : 1]
          : 0),
    };
  });
  const componentData = assembleComponentData(
    definition.componentData.schemaVersion,
    {
      annotations: features.annotations.map((a) => ({
        ...a,
        path: reference(a.path),
        points: a.points.map((p) => ({ ...p, node: reference(p.node) })),
        protect: a.protect.map(reference),
      })),
      values: features.values.map((v) => ({
        ...v,
        id: `${id}__${v.id}`,
        window: window(v.window, v.window.cue ?? v.id),
      })),
      bindings: features.bindings.map((b) => ({
        ...b,
        value: `${id}__${b.value}`,
        target: reference(b.target),
        ...(b.kind === "property" &&
        roots.has(b.target) &&
        (b.property === "x" || b.property === "y")
          ? {
              output: b.output.map(
                (v) => v + offset[b.property === "x" ? 0 : 1],
              ) as [number, number],
            }
          : {}),
      })),
      states: features.states.map((s) => ({
        ...s,
        id: `${id}__${s.id}`,
        target: reference(s.target),
        cuts: s.cuts.map((c) => ({
          ...c,
          id: `${id}__${c.id}`,
          frame: c.frame + start,
        })),
      })),
      travels: features.travels.map((t) => ({
        ...t,
        id: `${id}__${t.id}`,
        target: reference(t.target),
        path: reference(t.path),
        window: window(t.window, t.window.cue ?? t.id),
      })),
      visibility: features.visibility.map((g) => ({
        ...g,
        id: `${id}__${g.id}`,
        target: reference(g.target),
        window: window(g.window, g.window.cue ?? g.id),
      })),
      pins: features.pins.map((p) => ({
        ...p,
        id: `${id}__${p.id}`,
        target: reference(p.target),
        anchor: { ...p.anchor, node: reference(p.anchor.node) },
      })),
      textFits: features.textFits.map((f) => ({
        ...f,
        target: reference(f.target),
      })),
      masks: features.masks.map((m) => ({
        ...m,
        target: reference(m.target),
        mask: reference(m.mask),
      })),
    },
  );
  return {
    nodes,
    assets: definition.assets,
    fonts: definition.fonts,
    motions,
    componentData,
    exports: Object.fromEntries(
      Object.entries(definition.exports).map(([name, ref]) => [
        name,
        reference(ref),
      ]),
    ),
    bounds: {
      ...definition.bounds,
      x: definition.bounds.x + offset[0],
      y: definition.bounds.y + offset[1],
    },
  };
}

export function repeatComponent(
  clock: CommerceClock,
  definition: ComponentDefinition,
  options: {
    ids: string[];
    start?: number;
    stagger?: number;
    offsets?: [number, number][];
    external?: Record<string, string>;
  },
) {
  const stagger = options.stagger ?? 0;
  if (
    !Number.isInteger(stagger) ||
    stagger < 0 ||
    !options.ids.length ||
    new Set(options.ids).size !== options.ids.length
  )
    throw new Error("Repeat needs unique IDs and nonnegative integer stagger");
  if (options.offsets && options.offsets.length !== options.ids.length)
    throw new Error("Repeat placement count must match instances");
  if (options.ids.length * definition.nodes.length > 200)
    throw new Error("Component instances exceed 200 nodes");
  const instances = options.ids.map((id, i) =>
    instantiateComponent(definition, {
      id,
      start: (options.start ?? 0) + i * stagger,
      ...(options.offsets ? { offset: options.offsets[i]! } : {}),
      ...(options.external ? { external: options.external } : {}),
    }),
  );
  validateInstances(clock, instances);
  return instances;
}
export function validateInstances(
  clock: CommerceClock,
  instances: ComponentInstance[],
) {
  validateCommerceClock(clock);
  for (const instance of instances) {
    const features = componentCapabilities(instance.componentData);
    if (features.visibility.some((g) => g.window.end > clock.frameCount))
      throw new Error("Component visibility exceeds timeline");
    if (
      features.states.some((s) =>
        s.cuts.some((c) => c.frame >= clock.frameCount),
      )
    )
      throw new Error("Component state cut exceeds timeline");
    for (const motion of [
      ...instance.motions,
      ...features.values,
      ...features.travels,
    ])
      if (motion.window.end >= clock.frameCount)
        throw new Error("Component motion exceeds timeline: " + motion.id);
  }
  if (instances.reduce((count, i) => count + i.nodes.length, 0) > 200)
    throw new Error("Component instances exceed 200 nodes");
}
export function addCommerceComponents(
  source: CommerceScene,
  instances: ComponentInstance[],
): CommerceScene {
  validateInstances(source, instances);
  const fragment = mergeCommerceFragments(source, [
    source,
    ...instances.map((i) => ({
      nodes: i.nodes,
      assets: i.assets,
      fonts: i.fonts,
      events: i.motions.flatMap((m) =>
        (m.property === "scale"
          ? (["scaleX", "scaleY"] as const)
          : [m.property]
        ).map((property) => ({
          ...(m.window.layer ? { layer: m.window.layer } : {}),
          ...(m.window.blend ? { blend: m.window.blend } : {}),
          ...(m.window.weight ? { weight: m.window.weight } : {}),
          node: m.node,
          property,
          start: m.window.start,
          end: m.window.end,
          to: m.to,
          easing: m.window.easing,
        })),
      ),
    })),
  ]);
  const scene = CommerceSceneSchema.parse({
    ...source,
    ...fragment,
    componentData: mergeComponentData([
      ...(source.componentData ? [source.componentData] : []),
      ...instances.map((instance) => instance.componentData),
    ]),
  });
  compileCommerceScene(scene);
  return scene;
}
export function addStoryComponents(
  source: StoryScene,
  instances: ComponentInstance[],
): StoryScene {
  validateInstances(source, instances);
  const visuals = mergeCommerceFragments(source, [
    { nodes: source.nodes, assets: source.assets, fonts: source.fonts ?? [] },
    ...instances.map((i) => ({
      nodes: i.nodes,
      assets: i.assets,
      fonts: i.fonts,
    })),
  ]);
  const scene = StorySceneSchema.parse({
    ...source,
    nodes: visuals.nodes,
    assets: visuals.assets,
    fonts: visuals.fonts,
    componentData: mergeComponentData([
      ...(source.componentData ? [source.componentData] : []),
      ...instances.map((instance) => instance.componentData),
    ]),
    recipe: {
      ...source.recipe,
      moves: [
        ...source.recipe.moves,
        ...instances.flatMap((i) =>
          i.motions.map((m) => ({
            node: m.node,
            window: m.window,
            to: { [m.property]: m.to },
          })),
        ),
      ],
    },
  });
  compileStoryScene(scene);
  return scene;
}
