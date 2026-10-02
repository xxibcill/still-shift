import {
  COMPOSITION_LIMITS,
  StorySceneSchema,
  CompositionMarkerSchema,
  validateComposition,
  type Composition,
  type CompositionLayer,
  type StoryScene,
} from "@still-shift/scene-contract";
import { compileStoryScene, type StoryRenderScene } from "../../story-scene.ts";
import { evaluatePreparedNode } from "../../prepared-scene.ts";
import { passageError, PassageError } from "../../passage-diagnostics.ts";
import { compileStoryPathGeometry } from "./story-path.ts";
import { params, preparedBaseLayer, preparedNodeLayer } from "./prepared.ts";
import { componentCapabilities } from "../../component-capabilities.ts";
import { validateComponentAnnotations } from "../../component-annotations.ts";
import { componentTextLayer } from "./component-text.ts";
import { compileAttachedPathGeometry } from "./commerce-path.ts";

function cameraLayer(
  scene: StoryRenderScene,
  node: StoryRenderScene["nodes"][number],
) {
  return !node.parent && scene.camera
    ? {
        cameraDepth: scene.connectors.some((c) => c.path === node.id)
          ? 0
          : (scene.camera.depth[node.id] ?? 1),
      }
    : {};
}

export const STORY_ADAPTER_VERSION = "story-composition-0.3.0";
function checkSupported(scene: StoryScene) {
  const unsupported = (path: string, feature: string): never =>
    passageError(
      "comp-adapter-unsupported",
      `${feature} is not supported by the first CE4a adapter slice`,
      { path },
    );
  if (scene.frameCount > COMPOSITION_LIMITS.maxKeys)
    passageError(
      "comp-adapter-limit",
      `The first story adapter bakes at most ${COMPOSITION_LIMITS.maxKeys} frames`,
      { path: "frameCount" },
    );
  for (const field of ["spatialPaths", "pathMorphs"] as const)
    if (scene[field]?.length) unsupported(field, field);
  if (scene.typography) unsupported("typography", "Typography scenes");
  if (scene.effects?.length) unsupported("effects", "Pixel effects");
  scene.nodes.forEach((node, i) => {
    const path = `nodes[${i}]`;
    if (
      node.parent &&
      scene.nodes.find((n) => n.id === node.parent)?.type !== "group"
    )
      unsupported(`${path}.parent`, "Parenting to drawable nodes");
    if (node.type === "text") {
      for (const field of [
        "style",
        "spans",
        "decorations",
        "transition",
        "transitions",
        "locale",
        "anchor",
        "wrap",
        "orphanFraction",
        "feather",
        "lineOverlap",
      ] as const)
        if (node[field] !== undefined)
          unsupported(`${path}.${field}`, `Text ${field}`);
    }
  });
}

/** Compile a story recipe to data. Rendering never invokes the family scene evaluator. */
export function storyToComposition(
  source: StoryScene,
  options: { id?: string } = {},
): Composition {
  const input = StorySceneSchema.parse(source);
  checkSupported(input);
  const scene = compileStoryScene(input);
  validateComponentAnnotations(scene);
  const components = componentCapabilities(scene.componentData);
  const layers: CompositionLayer[] = [];
  const ids = new Set(scene.nodes.map((n) => n.id));
  const visit = (parent: string | undefined) => {
    for (const node of scene.nodes.filter((n) => n.parent === parent)) {
      const samples = Array.from({ length: scene.frameCount }, (_, frame) =>
        evaluatePreparedNode(scene, node, frame),
      );
      for (const property of [
        "blur",
        "strokeWidth",
        "trimStart",
        "trimEnd",
        "trimOffset",
      ] as const)
        if (samples.some((sample) => sample[property] !== undefined))
          passageError(
            "comp-adapter-unsupported",
            `Motion ${property} is not supported by the story adapter`,
            { path: `nodes[${scene.nodes.indexOf(node)}].${property}` },
          );
      const componentGeometry =
        node.type === "path"
          ? compileAttachedPathGeometry(scene, node)
          : undefined;
      let layer: CompositionLayer = {
        ...preparedNodeLayer(scene, node, samples, {
          ...(scene.componentData ? { nativeSolids: false } : {}),
          geometry:
            node.type === "path"
              ? compileStoryPathGeometry(scene, node)
              : undefined,
        }),
        ...cameraLayer(scene, node),
      };
      const visibility = components.visibility.find(
        (gate) => gate.target === node.id,
      );
      if (visibility) {
        layer.inPoint = visibility.window.start;
        layer.outPoint = visibility.window.end;
      }
      if (
        node.type === "text" &&
        layer.type === "provider" &&
        (node.textBox ||
          node.container ||
          scene.textAnimators?.some((animator) => animator.node === node.id) ||
          samples.some((s) => s.stateFrom !== undefined))
      )
        layer = componentTextLayer(scene, node, layer, false, samples);
      if (componentGeometry && layer.type === "provider") {
        layer.provider = "commerce.path@1.0.0";
        layer.params = params(
          { ...layer.params, geometry: componentGeometry },
          `nodes[${scene.nodes.indexOf(node)}]`,
          node.id,
        );
      }
      layers.push(layer);
      if (node.type === "path") {
        for (const flow of (scene.flows ?? []).filter(
          (f) => f.path === node.id,
        )) {
          let id = `${node.id}-flow-${flow.id}`;
          while (ids.has(id)) id += "-flow";
          ids.add(id);
          const base = {
            ...preparedBaseLayer(scene, node, samples),
            ...cameraLayer(scene, node),
          };
          const geometry = compileStoryPathGeometry(scene, node);
          layers.push({
            ...base,
            id,
            type: "provider",
            provider: componentGeometry
              ? "component.flow@1.0.0"
              : geometry
                ? "story.flow@1.1.0"
                : "story.flow@1.0.0",
            ...(visibility
              ? {
                  inPoint: visibility.window.start,
                  outPoint: visibility.window.end,
                }
              : {}),
            transform: { ...base.transform, opacity: 1 },
            params: params(
              {
                node,
                ...(componentGeometry
                  ? { geometry: componentGeometry }
                  : geometry
                    ? { geometry }
                    : {}),
                flow,
                // Flow playback uses sample count as its source clock, including the settled tail.
                samples: samples.map(({ reveal, gap }) => ({ reveal, gap })),
              },
              `nodes[${scene.nodes.indexOf(node)}]`,
              node.id,
            ),
          });
        }
      }
      visit(node.id);
    }
  };
  visit(undefined);
  // A legacy path's flow belongs to the same masked root, even at zero path opacity.
  const roots = new Map<string, string>();
  for (const id of new Set(components.masks.map((mask) => mask.target))) {
    const node = scene.nodes.find((node) => node.id === id)!;
    if (node.type !== "path" || !scene.flows?.some((flow) => flow.path === id))
      continue;
    let groupId = `${id}-content`;
    while (ids.has(groupId)) groupId += "-group";
    ids.add(groupId);
    roots.set(id, groupId);
    const children = layers.filter((layer) => layer.source?.id === id);
    const first = layers.indexOf(children[0]!);
    for (const child of children) {
      child.parent = groupId;
      delete child.cameraDepth;
    }
    layers.splice(first, 0, {
      id: groupId,
      type: "group",
      size: [scene.width, scene.height],
      transform: { anchor: [0, 0] },
      ...cameraLayer(scene, node),
    });
  }
  for (const mask of components.masks) {
    const target = layers.find(
      (layer) => layer.id === (roots.get(mask.target) ?? mask.target),
    )!;
    target.trackMatte = {
      layer: roots.get(mask.mask) ?? mask.mask,
      mode: mask.invert ? "alpha-inverted" : "alpha",
    };
  }
  const markers = new Map<
    string,
    NonNullable<Composition["markers"]>[number]
  >();
  const markerIds = new Set(
    scene.motionEvents.flatMap(({ window }) =>
      window.cue &&
      CompositionMarkerSchema.shape.id.safeParse(window.cue).success
        ? [window.cue]
        : [],
    ),
  );
  for (const event of scene.motionEvents) {
    const { cue, start, end } = event.window;
    if (!cue || markers.has(cue)) continue;
    let id = cue;
    if (!CompositionMarkerSchema.shape.id.safeParse(cue).success) {
      let suffix = 1;
      do id = `cue-${suffix++}`;
      while (markerIds.has(id));
      markerIds.add(id);
    }
    markers.set(cue, {
      id,
      label: cue.slice(0, 200),
      frame: start,
      duration: end - start,
    });
  }
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: options.id ?? "story-adapter",
    width: scene.width,
    height: scene.height,
    fps: scene.fps,
    frameCount: scene.frameCount,
    background: scene.background,
    assets: [
      ...scene.assets.map((a) => ({ ...a, type: "image" as const })),
      ...(scene.fonts ?? []).map((a) => ({ ...a, type: "font" as const })),
    ],
    layers: layers.reverse(),
    markers: [...markers.values()],
    ...(scene.camera
      ? {
          camera2d: Object.fromEntries(
            Object.entries(scene.camera).filter(
              ([key]) => key !== "depth" && key !== "cover",
            ),
          ) as Composition["camera2d"],
        }
      : {}),
    ...(scene.format ? { format: scene.format } : {}),
    metadata: params(
      {
        adapter: STORY_ADAPTER_VERSION,
        title: scene.title,
        provenance: scene.provenance ?? "",
        ...(scene.review ? { review: scene.review } : {}),
      },
      "metadata",
    ),
  };
  const validation = validateComposition(composition);
  if (!validation.ok) throw new PassageError(validation.diagnostics);
  return validation.composition;
}
