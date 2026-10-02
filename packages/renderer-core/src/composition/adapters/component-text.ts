import type {
  CommerceScene,
  StoryScene,
  CompositionLayer,
  PreparedNode,
} from "@still-shift/scene-contract";
import { componentCapabilities } from "../../component-capabilities.ts";
import { componentText } from "../../component-values.ts";
import {
  params,
  trimSettledSamples,
  baked,
  bakedState,
  type Samples,
} from "./prepared.ts";

/** Resolve reusable text content once for commerce and story adapters. */
export function componentTextLayer(
  scene: CommerceScene | StoryScene,
  node: Extract<PreparedNode, { type: "text" }>,
  layer: Extract<CompositionLayer, { type: "provider" }>,
  layoutResolved: boolean,
  samples: Samples,
) {
  const components = componentCapabilities(scene.componentData);
  const fit = [
    ...("textFits" in scene ? (scene.textFits ?? []) : []),
    ...components.textFits,
  ].find((fit) => fit.target === node.id);
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
  const animator = scene.textAnimators?.find(
    (animator) => animator.node === node.id,
  );
  const blends = samples.some((s) => s.stateFrom !== undefined);
  const extended = !!node.container || !!animator || blends;
  const blendWindows = components.states.flatMap((s) =>
    s.target === node.id
      ? s.cuts.flatMap((c) => (c.ramp ? [[c.frame, c.frame + c.ramp]] : []))
      : [],
  );
  return {
    ...layer,
    provider: extended
      ? "commerce.text@1.2.0"
      : fit || numeric
        ? "commerce.text@1.1.0"
        : "commerce.text@1.0.0",
    ...(extended
      ? { state: bakedState(samples.map((s) => Math.round(s.state))) }
      : {}),
    ...(blends
      ? {
          stateFrom: bakedState(
            samples.map((s) => Math.round(s.stateFrom ?? s.state)),
          ),
          stateMix: baked(samples.map((s) => s.stateMix ?? 1)),
        }
      : {}),
    params: params(
      {
        ...layer.params,
        ...(fit
          ? {
              fit: {
                minSize: layoutResolved ? node.fontSize : fit.minSize,
                maxSize: layoutResolved ? node.fontSize : fit.maxSize,
              },
            }
          : {}),
        ...(numeric ? { numeric } : {}),
        ...(animator ? { animator } : {}),
        ...(blendWindows.length ? { blendWindows } : {}),
      },
      `nodes[${scene.nodes.indexOf(node)}]`,
      node.id,
    ),
  };
}
