import {
  COMPOSITION_LIMITS,
  StorySceneSchema,
  validateComposition,
  type Composition,
  type CompositionLayer,
  type StoryScene,
} from "@still-shift/scene-contract";
import { compileStoryScene, type StoryRenderScene } from "../../story-scene.ts";
import { samplePreparedFamilyState as evaluatePreparedNodeAtTime } from "./family-state.ts";
import { passageError, PassageError } from "../../passage-diagnostics.ts";
import { compileStoryPathGeometry } from "./story-path.ts";
import {
  params,
  preparedBaseLayer,
  preparedNodeLayer,
  type Samples,
} from "./prepared.ts";
import { prepareComponentTextFits } from "../../component-text-fit.ts";
import { loadPreparedFonts } from "../../prepared-fonts.ts";
import { componentCapabilities } from "../../component-capabilities.ts";
import { validateComponentAnnotations } from "../../component-annotations.ts";
import {
  requiresCompositionTextLayout,
  type CompositionTextLayout,
} from "./layout.ts";
import {
  prepareTypography,
  resolveTypographyNodes,
} from "../../typography-renderer.ts";
import { loadTextAnimationFonts } from "../../typography-axes.ts";
import { validateTypographySafeArea } from "../../typography-safe-area.ts";
import { resolveTextEvents } from "../../typography-events.ts";
import { compileAdapterMarkers } from "./markers.ts";
import { typographyLayer } from "./typography.ts";
import { componentTypographyLayer } from "./numeric-typography.ts";
import { withMotionPath } from "./motion-path.ts";
import { compileAppearance } from "./appearance.ts";
import { componentTextLayer } from "./component-text.ts";
import { compileAttachedPathGeometry } from "./commerce-path.ts";
import { sourceExposureTimeline } from "../../commerce-exposure.ts";
import { compileFamilyEffects } from "./effects.ts";
import { compileFamilyExposure } from "./exposure.ts";

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

export type StoryCompositionOptions = {
  id?: string;
  textLayout?: CompositionTextLayout;
};

export const STORY_ADAPTER_VERSION = "story-composition-0.10.1";
function checkSupported(scene: StoryScene) {
  if (scene.frameCount > COMPOSITION_LIMITS.maxKeys)
    passageError(
      "comp-adapter-limit",
      `The first story adapter bakes at most ${COMPOSITION_LIMITS.maxKeys} frames`,
      { path: "frameCount" },
    );
}

/** Compile a story recipe to data. Rendering never invokes the family scene evaluator. */
export function storyToComposition(
  source: StoryScene,
  options: StoryCompositionOptions = {},
): Composition {
  const input = StorySceneSchema.parse(source);
  checkSupported(input);
  let scene = resolveTypographyNodes(compileStoryScene(input));
  if (requiresCompositionTextLayout(input) && !options.textLayout)
    passageError(
      "comp-adapter-layout-required",
      "Shaped text fitting requires pinned-font measurement; use prepareStoryComposition or supply textLayout",
      { path: "componentData.textFits" },
    );
  if (options.textLayout)
    scene = prepareComponentTextFits(
      scene,
      options.textLayout.context,
      options.textLayout.fonts,
    );
  return compiledStoryToComposition(scene, options);
}

/** Preparation-only entry point for an already compiled, measured recipe scene. */
export function compiledStoryToComposition(
  scene: StoryRenderScene,
  options: Pick<StoryCompositionOptions, "id"> = {},
  window?: readonly [number, number],
): Composition {
  if (!window) checkSupported(scene);
  if (
    window &&
    (!Number.isInteger(window[0]) ||
      !Number.isInteger(window[1]) ||
      window[0] < 0 ||
      window[1] <= window[0] ||
      window[1] > scene.frameCount)
  )
    passageError("comp-adapter-limit", "Invalid native source sample window", {
      path: "frameCount",
    });
  validateComponentAnnotations(scene, window);
  const components = componentCapabilities(scene.componentData);
  const layers: CompositionLayer[] = [];
  const exposure = compileFamilyExposure(scene, window);
  const times =
    (window ? sourceExposureTimeline(scene, window).times : exposure?.times) ??
    Array.from({ length: scene.frameCount }, (_, frame) => frame);
  if (times.length > COMPOSITION_LIMITS.maxKeys)
    passageError(
      "comp-adapter-limit",
      "The native sample window exceeds the key limit",
      { path: "frameCount" },
    );
  const ids = new Set(scene.nodes.map((n) => n.id));
  const visit = (parent: string | undefined) => {
    for (const node of scene.nodes.filter((n) => n.parent === parent)) {
      const samples: Samples = times.map((time) =>
        evaluatePreparedNodeAtTime(scene, node, time),
      );
      if (exposure || window) samples.times = times;
      const appearance = compileAppearance(scene, node, samples);
      const componentGeometry =
        node.type === "path"
          ? compileAttachedPathGeometry(
              scene,
              node,
              exposure || window ? times : undefined,
            )
          : undefined;
      let layer: CompositionLayer = {
        ...(node.type === "text" && scene.typography
          ? (componentTypographyLayer(scene, node, samples, appearance) ??
            typographyLayer(scene, node, samples))
          : preparedNodeLayer(scene, node, samples, {
              ...(scene.componentData || appearance
                ? { nativeSolids: false }
                : {}),
              geometry:
                node.type === "path"
                  ? compileStoryPathGeometry(
                      scene,
                      node,
                      exposure || window ? times : undefined,
                    )
                  : undefined,
            })),
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
        !scene.typography &&
        (appearance ||
          node.textBox ||
          node.container ||
          scene.textAnimators?.some((animator) => animator.node === node.id) ||
          samples.some((s) => s.stateFrom !== undefined))
      )
        layer = componentTextLayer(
          scene,
          node,
          layer,
          false,
          samples,
          appearance,
        );
      if (componentGeometry && layer.type === "provider") {
        layer.provider = "commerce.path@1.0.0";
        layer.params = params(
          { ...layer.params, geometry: componentGeometry },
          `nodes[${scene.nodes.indexOf(node)}]`,
          node.id,
        );
      }
      if (node.type === "path" && layer.type === "provider")
        layer = withMotionPath(scene, node, layer, appearance);
      if (node.type === "rect" && layer.type === "provider" && appearance) {
        layer.provider = "component.rect@1.0.0";
        layer.params = params(
          { ...layer.params, appearance },
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
          const geometry = compileStoryPathGeometry(
            scene,
            node,
            exposure || window ? times : undefined,
          );
          layers.push(
            withMotionPath(scene, node, {
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
                  interpolateColors: !!scene.motionModel,
                  // Flow playback uses sample count as its source clock, including the settled tail.
                  samples: samples.map(({ reveal, gap }) => ({ reveal, gap })),
                },
                `nodes[${scene.nodes.indexOf(node)}]`,
                node.id,
              ),
            }),
          );
        }
      }
      visit(node.id);
    }
  };
  visit(undefined);
  // A legacy path's flow shares its root's treatments, even at zero path opacity.
  const roots = new Map<string, string>();
  for (const id of new Set([
    ...components.masks.map((mask) => mask.target),
    ...(scene.effects ?? []).flatMap((effect) =>
      "target" in effect ? [effect.target] : [],
    ),
  ])) {
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
  compileFamilyEffects(
    scene,
    layers,
    roots,
    exposure || window ? times : undefined,
  );
  if (exposure || window)
    for (const layer of layers) {
      layer.sampleTimes = times;
      if (exposure) layer.motionBlur = true;
    }
  const { markers, cueIds } = compileAdapterMarkers([
    ...scene.motionEvents.map((event) => event.window),
    ...(scene.typography
      ? [
          ...resolveTextEvents(scene).map((event) => ({
            cue: event.id,
            start: event.start,
            end: event.end,
          })),
          ...(scene.textAnimators ?? []),
        ]
      : []),
  ]);
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
    ...(exposure ? { motionBlur: exposure.motionBlur } : {}),
    ...(scene.typography
      ? {
          ...(scene.textStyles ? { textStyles: scene.textStyles } : {}),
          ...(scene.textAnimators
            ? {
                textAnimators: scene.textAnimators
                  .filter((animator) =>
                    layers.some(
                      (layer) =>
                        layer.id === animator.node && layer.type === "text",
                    ),
                  )
                  .map((animator) => ({
                    ...animator,
                    ...(animator.cue ? { cue: cueIds.get(animator.cue)! } : {}),
                  })),
              }
            : {}),
          ...(scene.signals ? { signals: scene.signals } : {}),
        }
      : {}),
    markers,
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
        ...(scene.camera?.cover?.length
          ? {
              storyCameraCover: scene.camera.cover.filter(
                (id) =>
                  scene.nodes.find((node) => node.id === id)?.type === "image",
              ),
            }
          : {}),
        ...(scene.review ? { review: scene.review } : {}),
      },
      "metadata",
    ),
  };
  const validation = validateComposition(composition);
  if (!validation.ok) throw new PassageError(validation.diagnostics);
  return validation.composition;
}

/** Browser preparation measures shaped component fits using verified fonts. */
export async function prepareStoryComposition(
  source: StoryScene,
  assetUrl: (id: string) => string,
  options: Pick<StoryCompositionOptions, "id"> = {},
): Promise<Composition> {
  const input = StorySceneSchema.parse(source);
  const fonts = await loadPreparedFonts(input, assetUrl);
  const canvas = document.createElement("canvas");
  try {
    const context = canvas.getContext("2d")!;
    if (input.typography) {
      const scene = prepareComponentTextFits(
        resolveTypographyNodes(compileStoryScene(input)),
        context,
        fonts,
      );
      await loadTextAnimationFonts(scene, fonts);
      validateTypographySafeArea(scene, prepareTypography(scene, fonts));
    }
    return storyToComposition(input, {
      ...options,
      textLayout: { context, fonts },
    });
  } finally {
    canvas.width = canvas.height = 0;
  }
}
