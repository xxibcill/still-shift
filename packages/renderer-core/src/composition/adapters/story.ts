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

export const STORY_ADAPTER_VERSION = "story-composition-0.2.0";
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
  if (scene.motionModel) unsupported("motionModel", "Motion-craft scenes");
  if (scene.typography) unsupported("typography", "Typography scenes");
  if (scene.componentData) unsupported("componentData", "Reusable components");
  if (scene.effects?.length) unsupported("effects", "Pixel effects");
  if (scene.textAnimators?.length)
    unsupported("textAnimators", "Text animators");
  scene.nodes.forEach((node, i) => {
    const path = `nodes[${i}]`;
    if (
      node.parent &&
      scene.nodes.find((n) => n.id === node.parent)?.type !== "group"
    )
      unsupported(`${path}.parent`, "Parenting to drawable nodes");
    if (node.type === "text") {
      for (const field of [
        "container",
        "textBox",
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
  const layers: CompositionLayer[] = [];
  const ids = new Set(scene.nodes.map((n) => n.id));
  const visit = (parent: string | undefined) => {
    for (const node of scene.nodes.filter((n) => n.parent === parent)) {
      const samples = Array.from({ length: scene.frameCount }, (_, frame) =>
        evaluatePreparedNode(scene, node, frame),
      );
      layers.push({
        ...preparedNodeLayer(scene, node, samples, {
          geometry:
            node.type === "path"
              ? compileStoryPathGeometry(scene, node)
              : undefined,
        }),
        ...cameraLayer(scene, node),
      });
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
            provider: geometry ? "story.flow@1.1.0" : "story.flow@1.0.0",
            transform: { ...base.transform, opacity: 1 },
            params: params(
              {
                node,
                ...(geometry ? { geometry } : {}),
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
