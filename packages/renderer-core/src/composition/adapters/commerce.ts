import { compileFamilyEffects } from "./effects.ts";
import {
  COMPOSITION_LIMITS,
  CommerceSceneSchema,
  validateComposition,
  type CommerceScene,
  type Composition,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import { compileCommerceScene } from "../../commerce-scene.ts";
import {
  requiresCompositionTextLayout,
  type CompositionTextLayout,
} from "./layout.ts";
import {
  resolveTypographyNodes,
  prepareTypography,
} from "../../typography-renderer.ts";
import { loadTextAnimationFonts } from "../../typography-axes.ts";
import { resolveTextEvents } from "../../typography-events.ts";
import { compileAdapterMarkers } from "./markers.ts";
import { typographyLayer } from "./typography.ts";
import { componentTypographyLayer } from "./numeric-typography.ts";
import { withMotionPath } from "./motion-path.ts";
import { compileAppearance } from "./appearance.ts";
import { componentTextLayer } from "./component-text.ts";
import { componentCapabilities } from "../../component-capabilities.ts";
import { validateAttachedPaths } from "../../commerce-geometry.ts";
import { validateComponentAnnotations } from "../../component-annotations.ts";
import { evaluatePreparedNode } from "../../prepared-scene.ts";
import { passageError, PassageError } from "../../passage-diagnostics.ts";
import { params, preparedNodeLayer } from "./prepared.ts";
import { compileAttachedPathGeometry } from "./commerce-path.ts";
import { prepareCommerceTextFits } from "../../commerce-layout.ts";
import { prepareComponentTextFits } from "../../component-text-fit.ts";
import { loadPreparedFonts } from "../../prepared-fonts.ts";

export const COMMERCE_ADAPTER_VERSION = "commerce-composition-0.16.0";

export type CommerceCompositionOptions = {
  id?: string;
  /** Pinned-font context used before geometry is baked; required for backing panels. */
  textLayout?: CompositionTextLayout;
};

function unsupported(path: string, feature: string): never {
  return passageError(
    "comp-adapter-unsupported",
    `${feature} is not supported by the CE4b adapter`,
    { path },
  );
}

function checkSupported(scene: CommerceScene) {
  if (scene.frameCount > COMPOSITION_LIMITS.maxKeys)
    passageError(
      "comp-adapter-limit",
      `The commerce adapter bakes at most ${COMPOSITION_LIMITS.maxKeys} frames`,
      { path: "frameCount" },
    );
  scene.effects?.forEach((effect, index) => {
    if (
      ![
        "drift",
        "parallax",
        "overshoot",
        "height-shadow",
        "focus-blur",
        "directional-blur",
        "glow",
        "displacement",
        "background-light",
        "particles",
        "grain",
        "light-sweep",
        "echo",
      ].includes(effect.type)
    )
      unsupported(
        `effects[${index}]`,
        `${effect.type} effects (pending CE6/CE7)`,
      );
  });
  scene.nodes.forEach((node, index) => {
    const path = `nodes[${index}]`;
    if (
      node.parent &&
      scene.nodes.find((parent) => parent.id === node.parent)?.type !== "group"
    )
      unsupported(`${path}.parent`, "Parenting to drawable nodes");
    if (node.type !== "text" || scene.typography) return;
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
  });
}

/** Compile once to bounded data; rendering never calls the commerce evaluator. */
export function commerceToComposition(
  source: CommerceScene,
  options: CommerceCompositionOptions = {},
): Composition {
  const input = CommerceSceneSchema.parse(source);
  checkSupported(input);
  let scene = resolveTypographyNodes(compileCommerceScene(input));
  const panel = input.textFits?.findIndex((fit) => fit.panel);
  if (panel !== undefined && panel >= 0 && !options.textLayout)
    passageError(
      "comp-adapter-layout-required",
      "Fitted panels require pinned-font measurement; use prepareCommerceComposition or supply textLayout",
      {
        path: `textFits[${panel}].panel`,
      },
    );
  if (requiresCompositionTextLayout(input) && !options.textLayout)
    passageError(
      "comp-adapter-layout-required",
      "Shaped text fitting requires pinned-font measurement; use prepareCommerceComposition or supply textLayout",
      { path: input.textFits?.length ? "textFits" : "componentData.textFits" },
    );
  if (options.textLayout) {
    const { context, fonts } = options.textLayout;
    scene = prepareComponentTextFits(
      prepareCommerceTextFits(scene, context, fonts),
      context,
      fonts,
    );
  }
  validateAttachedPaths(scene);
  validateComponentAnnotations(scene);
  const visibility = new Map<string, { start: number; end: number }>([
    ...(scene.visibility ?? []).map((gate) => [gate.target, gate] as const),
    ...componentCapabilities(scene.componentData).visibility.map(
      (gate) => [gate.target, gate.window] as const,
    ),
  ]);
  const layers: CompositionLayer[] = [];
  const visit = (parent: string | undefined) => {
    for (const node of scene.nodes.filter((node) => node.parent === parent)) {
      const samples = Array.from({ length: scene.frameCount }, (_, frame) =>
        evaluatePreparedNode(scene, node, frame),
      );
      const appearance = compileAppearance(scene, node, samples);
      // Keep path-based rectangle rasterization and parent transform concatenation.
      let layer =
        node.type === "text" && scene.typography
          ? (componentTypographyLayer(scene, node, samples, appearance) ??
            typographyLayer(scene, node, samples))
          : preparedNodeLayer(scene, node, samples, { nativeSolids: false });
      const gate = visibility.get(node.id);
      if (gate) {
        layer.inPoint = gate.start;
        layer.outPoint = gate.end;
      }
      if (
        node.type === "text" &&
        layer.type === "provider" &&
        !scene.typography &&
        (appearance ||
          node.textBox ||
          node.container ||
          scene.textAnimators?.some((a) => a.node === node.id) ||
          samples.some((s) => s.stateFrom !== undefined))
      )
        layer = componentTextLayer(
          scene,
          node,
          layer,
          !!options.textLayout,
          samples,
          appearance,
        );
      if (node.type === "path" && layer.type === "provider") {
        const geometry = compileAttachedPathGeometry(scene, node);
        if (geometry) {
          layer.provider = "commerce.path@1.0.0";
          layer.params = params(
            { ...layer.params, geometry },
            `nodes[${scene.nodes.indexOf(node)}]`,
            node.id,
          );
        }
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
      visit(node.id);
    }
  };
  visit(undefined);
  for (const mask of [
    ...(scene.mattes ?? []),
    ...componentCapabilities(scene.componentData).masks,
  ]) {
    const target = layers.find((layer) => layer.id === mask.target)!;
    target.trackMatte = {
      layer: mask.mask,
      mode: mask.invert ? "alpha-inverted" : "alpha",
    };
  }
  compileFamilyEffects(scene, layers);
  const { markers, cueIds } = compileAdapterMarkers(
    scene.typography
      ? [
          ...resolveTextEvents(scene).map((event) => ({
            cue: event.id,
            start: event.start,
            end: event.end,
          })),
          ...(scene.textAnimators ?? []),
        ]
      : [],
  );
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: options.id ?? "commerce-adapter",
    width: scene.width,
    height: scene.height,
    fps: scene.fps,
    frameCount: scene.frameCount,
    background: scene.background,
    assets: [
      ...scene.assets.map((asset) => ({ ...asset, type: "image" as const })),
      ...scene.fonts.map((font) => ({ ...font, type: "font" as const })),
    ],
    layers: layers.reverse(),
    ...(markers.length ? { markers } : {}),
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
    metadata: params(
      {
        adapter: COMMERCE_ADAPTER_VERSION,
        title: scene.title,
        provenance: scene.provenance ?? "",
        commerce: scene.metadata,
      },
      "metadata",
    ),
  };
  const result = validateComposition(composition);
  if (!result.ok) throw new PassageError(result.diagnostics);
  return result.composition;
}

/** Browser preparation resolves font-dependent geometry into ordinary composition data. */
export async function prepareCommerceComposition(
  source: CommerceScene,
  assetUrl: (id: string) => string,
  options: Pick<CommerceCompositionOptions, "id"> = {},
): Promise<Composition> {
  const input = CommerceSceneSchema.parse(source);
  const fonts = await loadPreparedFonts(input, assetUrl);
  const canvas = document.createElement("canvas");
  try {
    const context = canvas.getContext("2d")!;
    if (input.typography) {
      const scene = prepareComponentTextFits(
        prepareCommerceTextFits(
          resolveTypographyNodes(compileCommerceScene(input)),
          context,
          fonts,
        ),
        context,
        fonts,
      );
      await loadTextAnimationFonts(scene, fonts);
      // Preserve source-wide typography overflow and raster budgets before its
      // text is distributed among independent native layers and providers.
      prepareTypography(scene, fonts);
    }
    return commerceToComposition(input, {
      ...options,
      textLayout: { context, fonts },
    });
  } finally {
    canvas.width = canvas.height = 0;
  }
}
