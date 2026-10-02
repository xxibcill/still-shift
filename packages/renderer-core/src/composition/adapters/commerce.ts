import {
  COMPOSITION_LIMITS,
  CommerceSceneSchema,
  validateComposition,
  type CommerceScene,
  type Composition,
  type CompositionLayer,
  type PreparedNode,
} from "@still-shift/scene-contract";
import { compileCommerceScene } from "../../commerce-scene.ts";
import { componentCapabilities } from "../../component-capabilities.ts";
import { componentText } from "../../component-values.ts";
import { validateAttachedPaths } from "../../commerce-geometry.ts";
import { validateComponentAnnotations } from "../../component-annotations.ts";
import { evaluatePreparedNode } from "../../prepared-scene.ts";
import { passageError, PassageError } from "../../passage-diagnostics.ts";
import { params, preparedNodeLayer, trimSettledSamples } from "./prepared.ts";
import { compileCommercePathGeometry } from "./commerce-path.ts";

export const COMMERCE_ADAPTER_VERSION = "commerce-composition-0.3.0";

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
  if (scene.motionModel) unsupported("motionModel", "Motion-craft scenes");
  if (scene.typography) unsupported("typography", "Typography scenes");
  for (const field of ["textAnimators", "mattes"] as const)
    if (scene[field]?.length) unsupported(field, field);
  scene.textFits?.forEach((fit, index) => {
    if (fit.panel)
      unsupported(`textFits[${index}].panel`, "Fitted panel geometry");
  });
  scene.effects?.forEach((effect, index) => {
    if (!["drift", "parallax", "overshoot"].includes(effect.type))
      unsupported(
        `effects[${index}]`,
        `${effect.type} effects (pending CE6/CE7)`,
      );
  });
  const components = componentCapabilities(scene.componentData);
  if (components.masks.length) unsupported("componentData.masks", "masks");
  scene.nodes.forEach((node, index) => {
    const path = `nodes[${index}]`;
    if (
      node.parent &&
      scene.nodes.find((parent) => parent.id === node.parent)?.type !== "group"
    )
      unsupported(`${path}.parent`, "Parenting to drawable nodes");
    if (node.type !== "text") return;
    for (const field of [
      "container",
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
    if (
      components.states.some(
        (schedule) =>
          schedule.target === node.id && schedule.cuts.some((cut) => cut.ramp),
      )
    )
      unsupported("componentData.states", "Blended text states");
  });
}

function measuredTextLayer(
  scene: CommerceScene,
  node: Extract<PreparedNode, { type: "text" }>,
  layer: Extract<CompositionLayer, { type: "provider" }>,
) {
  const components = componentCapabilities(scene.componentData);
  const fit = [...(scene.textFits ?? []), ...components.textFits].find(
    (fit) => fit.target === node.id,
  );
  const binding = components.bindings.find(
    (binding) => binding.kind === "text" && binding.target === node.id,
  );
  const numeric =
    binding?.kind === "text"
      ? {
          value: components.values.find((value) => value.id === binding.value)!,
          format: binding.format,
          samples: trimSettledSamples(
            Array.from({ length: scene.frameCount }, (_, frame) => ({
              text: componentText(scene, node, frame)!,
            })),
          ).map((sample) => sample.text),
        }
      : undefined;
  return {
    ...layer,
    provider: fit || numeric ? "commerce.text@1.1.0" : "commerce.text@1.0.0",
    params: params(
      {
        ...layer.params,
        ...(fit ? { fit: { minSize: fit.minSize, maxSize: fit.maxSize } } : {}),
        ...(numeric ? { numeric } : {}),
      },
      `nodes[${scene.nodes.indexOf(node)}]`,
      node.id,
    ),
  };
}

/** Compile once to bounded data; rendering never calls the commerce evaluator. */
export function commerceToComposition(
  source: CommerceScene,
  options: { id?: string } = {},
): Composition {
  const input = CommerceSceneSchema.parse(source);
  checkSupported(input);
  const scene = compileCommerceScene(input);
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
      // Keep path-based rectangle rasterization and parent transform concatenation.
      let layer = preparedNodeLayer(scene, node, samples, {
        nativeSolids: false,
      });
      const gate = visibility.get(node.id);
      if (gate) {
        layer.inPoint = gate.start;
        layer.outPoint = gate.end;
      }
      if (node.type === "text" && node.textBox && layer.type === "provider")
        layer = measuredTextLayer(scene, node, layer);
      if (node.type === "path" && layer.type === "provider") {
        const geometry = compileCommercePathGeometry(scene, node);
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
