import {
  COMPOSITION_LIMITS,
  CommerceSceneSchema,
  validateComposition,
  type CommerceScene,
  type Composition,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import { compileCommerceScene } from "../../commerce-scene.ts";
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
import { loadPreparedFonts, type LoadedFont } from "../../prepared-fonts.ts";

export const COMMERCE_ADAPTER_VERSION = "commerce-composition-0.6.0";

export type CommerceCompositionOptions = {
  id?: string;
  /** Pinned-font context used before geometry is baked; required for backing panels. */
  textLayout?: {
    context: CanvasRenderingContext2D;
    fonts: Map<string, LoadedFont>;
  };
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
  for (const field of ["spatialPaths", "pathMorphs"] as const)
    if (scene[field]?.length) unsupported(field, field);
  if (scene.typography) unsupported("typography", "Typography scenes");
  scene.effects?.forEach((effect, index) => {
    if (!["drift", "parallax", "overshoot"].includes(effect.type))
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
    if (node.type !== "text") return;
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
  let scene = compileCommerceScene(input);
  const panel = input.textFits?.findIndex((fit) => fit.panel);
  if (panel !== undefined && panel >= 0 && !options.textLayout)
    passageError(
      "comp-adapter-layout-required",
      "Fitted panels require pinned-font measurement; use prepareCommerceComposition or supply textLayout",
      {
        path: `textFits[${panel}].panel`,
      },
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
      for (const property of [
        "blur",
        "strokeWidth",
        "trimStart",
        "trimEnd",
        "trimOffset",
      ] as const)
        if (samples.some((sample) => sample[property] !== undefined))
          unsupported(
            `nodes[${scene.nodes.indexOf(node)}].${property}`,
            `Motion ${property}`,
          );
      // Keep path-based rectangle rasterization and parent transform concatenation.
      let layer = preparedNodeLayer(scene, node, samples, {
        nativeSolids: false,
      });
      const gate = visibility.get(node.id);
      if (gate) {
        layer.inPoint = gate.start;
        layer.outPoint = gate.end;
      }
      if (
        node.type === "text" &&
        layer.type === "provider" &&
        (node.textBox ||
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
    return commerceToComposition(input, {
      ...options,
      textLayout: { context: canvas.getContext("2d")!, fonts },
    });
  } finally {
    canvas.width = canvas.height = 0;
  }
}
