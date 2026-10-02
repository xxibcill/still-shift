import {
  COMPOSITION_LIMITS,
  StorySceneSchema,
  ProviderLayerSchema,
  CompositionMarkerSchema,
  validateComposition,
  type Composition,
  type CompositionLayer,
  type PreparedNode,
  type StoryScene,
} from "@still-shift/scene-contract";
import { compileStoryScene, type StoryRenderScene } from "../../story-scene.ts";
import { evaluatePreparedNode } from "../../prepared-scene.ts";
import {
  passageError,
  passageDiagnostics,
  PassageError,
} from "../../passage-diagnostics.ts";

export const STORY_ADAPTER_VERSION = "story-composition-0.1.2";
type Samples = ReturnType<typeof evaluatePreparedNode>[];
function params(value: unknown, path: string, node?: string) {
  const result = ProviderLayerSchema.shape.params.safeParse(
    JSON.parse(JSON.stringify(value)),
  );
  if (!result.success)
    throw new PassageError(
      passageDiagnostics(result.error).map((diagnostic) => ({
        ...diagnostic,
        path: diagnostic.path ? `${path}.${diagnostic.path}` : path,
        ...(node ? { node } : {}),
      })),
    );
  return result.data;
}

/** Providers hold the final sample; trimming only that tail preserves all frame indices. */
function trimSettledSamples<T extends Record<string, number>>(samples: T[]) {
  let end = samples.length;
  const last = samples[end - 1]!;
  while (
    end > 1 &&
    Object.entries(last).every(
      ([key, value]) => samples[end - 2]![key] === value,
    )
  )
    end--;
  return samples.slice(0, end);
}

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
  if (scene.connectors.length) unsupported("connectors", "Attached paths");
  if (scene.textAnimators?.length)
    unsupported("textAnimators", "Text animators");
  scene.nodes.forEach((node, i) => {
    const path = `nodes[${i}]`;
    if (
      node.parent &&
      scene.nodes.find((n) => n.id === node.parent)?.type !== "group"
    )
      unsupported(`${path}.parent`, "Parenting to drawable nodes");
    if (node.type === "rect")
      unsupported(`${path}.type`, "Rounded and stroked rectangles");
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

/** Exact integer-frame keys; constant channels stay compact and inspectable. */
function baked(values: number[]) {
  if (values.every((v) => v === values[0])) return values[0]!;
  return {
    keys: values.map((value, frame) => ({
      frame,
      value,
      interpolation: "hold" as const,
    })),
  };
}

function baseLayer(
  scene: StoryRenderScene,
  node: PreparedNode,
  samples: Samples,
) {
  const anchor: [number, number] = [
    node.width * node.origin[0],
    node.height * node.origin[1],
  ];
  return {
    id: node.id,
    ...(node.parent ? { parent: node.parent } : {}),
    ...(!node.parent && scene.camera
      ? { cameraDepth: scene.camera.depth[node.id] ?? 1 }
      : {}),
    source: { family: "story-scene-1", id: node.id },
    transform: {
      anchor,
      position: {
        x: baked(samples.map((s) => s.x + anchor[0])),
        y: baked(samples.map((s) => s.y + anchor[1])),
      },
      scale: {
        x: baked(samples.map((s) => s.scaleX)),
        y: baked(samples.map((s) => s.scaleY)),
      },
      rotation: baked(samples.map((s) => s.rotation)),
      opacity: baked(samples.map((s) => s.opacity)),
    },
  };
}

function nodeLayer(
  scene: StoryRenderScene,
  node: PreparedNode,
  samples: Samples,
): CompositionLayer {
  const base = baseLayer(scene, node, samples);
  const path = `nodes[${scene.nodes.indexOf(node)}]`;
  switch (node.type) {
    case "image":
      return {
        ...base,
        type: "image",
        size: [node.width, node.height],
        fit: node.fit,
        sources: node.states,
        state: baked(samples.map((s) => Math.round(s.state))),
        rasterize: scene.motionGrammar === "v2" ? "natural-size" : "draw",
        ...(samples.some((s) => s.stateFrom !== undefined)
          ? {
              stateFrom: baked(
                samples.map((s) => Math.round(s.stateFrom ?? s.state)),
              ),
              stateMix: baked(samples.map((s) => s.stateMix ?? 1)),
            }
          : {}),
      };
    case "group":
      return {
        ...base,
        type: "group",
        size: [node.width, node.height],
        clip: node.clip,
      };
    case "path":
      return {
        ...base,
        type: "provider",
        provider: "story.path@1.0.0",
        params: params(
          {
            node,
            samples: trimSettledSamples(
              samples.map(({ reveal, gap, pinch, pulse }) => ({
                reveal,
                gap,
                pinch,
                pulse,
              })),
            ),
          },
          path,
          node.id,
        ),
      };
    case "text":
      return {
        ...base,
        type: "provider",
        provider: "story.text@1.0.0",
        ...(node.fontAsset ? { assets: [node.fontAsset] } : {}),
        usesSystemFonts: !node.fontAsset,
        params: params(
          {
            node,
            samples: trimSettledSamples(
              samples.map(({ reveal, state }) => ({
                reveal,
                state: Math.round(state),
              })),
            ),
          },
          path,
          node.id,
        ),
      };
    default:
      return passageError(
        "comp-adapter-unsupported",
        `Unsupported story node ${node.type}`,
        { path: `nodes.${node.id}` },
      );
  }
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
      layers.push(nodeLayer(scene, node, samples));
      if (node.type === "path") {
        for (const flow of (scene.flows ?? []).filter(
          (f) => f.path === node.id,
        )) {
          let id = `${node.id}-flow-${flow.id}`;
          while (ids.has(id)) id += "-flow";
          ids.add(id);
          const base = baseLayer(scene, node, samples);
          layers.push({
            ...base,
            id,
            type: "provider",
            provider: "story.flow@1.0.0",
            transform: { ...base.transform, opacity: 1 },
            params: params(
              {
                node,
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
