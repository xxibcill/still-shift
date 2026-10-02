import {
  ProviderLayerSchema,
  type CompositionLayer,
  type PreparedNode,
} from "@still-shift/scene-contract";
import type { evaluatePreparedNode } from "../../prepared-scene.ts";
import { passageDiagnostics, PassageError } from "../../passage-diagnostics.ts";
import type { compileStoryPathGeometry } from "./story-path.ts";
import { nodeMatrix } from "../../node-transform.ts";

type PreparedAdapterScene = {
  schemaVersion: string;
  nodes: PreparedNode[];
  motionGrammar?: "v1" | "v2" | undefined;
};
export type Samples = ReturnType<typeof evaluatePreparedNode>[];
export function params(value: unknown, path: string, node?: string) {
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
export function trimSettledSamples<T extends Record<string, number | string>>(
  samples: T[],
) {
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

/** Exact integer-frame keys; constant channels stay compact and inspectable. */
export function baked(values: number[]) {
  if (values.every((v) => v === values[0])) return values[0]!;
  return {
    keys: values.map((value, frame) => ({
      frame,
      value,
      interpolation: "hold" as const,
    })),
  };
}

export function bakedState(values: number[]) {
  const keys = values.flatMap((value, frame) =>
    frame === 0 || value !== values[frame - 1] ? [{ frame, value }] : [],
  );
  return keys.length === 1 ? keys[0]!.value : { keys };
}

function bakedVector(points: [number, number][]) {
  return {
    x: baked(points.map((p) => p[0])),
    y: baked(points.map((p) => p[1])),
  };
}

/** Preserve the legacy compensation when a moving anchor changes the reference point. */
function bakedPlacement(node: PreparedNode, samples: Samples) {
  const anchor: [number, number] = [
    node.width * node.origin[0],
    node.height * node.origin[1],
  ];
  if (!samples.some((s) => s.anchorX !== undefined || s.anchorY !== undefined))
    return {
      anchor,
      position: bakedVector(
        samples.map((s) => [s.x + anchor[0], s.y + anchor[1]]),
      ),
    };
  const poses = samples.map((state) => {
    const anchor: [number, number] = [
      node.width * (state.anchorX ?? node.origin[0]),
      node.height * (state.anchorY ?? node.origin[1]),
    ];
    const [a, b, c, d] = nodeMatrix(node, state);
    const dx = anchor[0] - node.width * node.origin[0];
    const dy = anchor[1] - node.height * node.origin[1];
    const position: [number, number] = [
      state.x + (a - 1) * dx + c * dy + anchor[0],
      state.y + b * dx + (d - 1) * dy + anchor[1],
    ];
    return { anchor, position };
  });
  return {
    anchor: bakedVector(poses.map((p) => p.anchor)),
    position: bakedVector(poses.map((p) => p.position)),
  };
}

export function preparedBaseLayer(
  scene: PreparedAdapterScene,
  node: PreparedNode,
  samples: Samples,
) {
  return {
    id: node.id,
    ...(node.parent ? { parent: node.parent } : {}),
    source: { family: scene.schemaVersion, id: node.id },
    ...(samples.some((sample) => sample.blur !== undefined)
      ? {
          effects: [
            {
              id: "primitiveBlur",
              effect: "blur.primitive",
              params: {
                radius: baked(samples.map((sample) => sample.blur ?? 0)),
              },
            },
          ],
        }
      : {}),
    transform: {
      ...bakedPlacement(node, samples),
      scale: {
        x: baked(samples.map((s) => s.scaleX)),
        y: baked(samples.map((s) => s.scaleY)),
      },
      rotation: baked(samples.map((s) => s.rotation)),
      ...(samples.some((s) => s.skewX !== undefined)
        ? { skewX: baked(samples.map((s) => s.skewX ?? 0)) }
        : {}),
      ...(samples.some((s) => s.skewY !== undefined)
        ? { skewY: baked(samples.map((s) => s.skewY ?? 0)) }
        : {}),
      opacity: baked(samples.map((s) => s.opacity)),
    },
  };
}

export function preparedNodeLayer(
  scene: PreparedAdapterScene,
  node: PreparedNode,
  samples: Samples,
  options: {
    geometry?: ReturnType<typeof compileStoryPathGeometry>;
    nativeSolids?: boolean;
  } = {},
): CompositionLayer {
  const { geometry } = options;
  const base = preparedBaseLayer(scene, node, samples);
  const path = `nodes[${scene.nodes.indexOf(node)}]`;
  switch (node.type) {
    case "image":
      return {
        ...base,
        type: "image",
        size: [node.width, node.height],
        fit: node.fit,
        sources: node.states,
        state: bakedState(samples.map((s) => Math.round(s.state))),
        rasterize: scene.motionGrammar === "v2" ? "natural-size" : "draw",
        ...(samples.some((s) => s.stateFrom !== undefined)
          ? {
              stateFrom: bakedState(
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
    case "rect":
      if (
        options.nativeSolids !== false &&
        node.radius === 0 &&
        (!node.stroke || node.lineWidth === 0) &&
        samples.every((s) => s.reveal === 1)
      )
        return {
          ...base,
          type: "solid",
          size: [node.width, node.height],
          color: node.fill,
        };
      return {
        ...base,
        type: "provider",
        provider: "story.rect@1.0.0",
        params: params(
          {
            node,
            samples: trimSettledSamples(
              samples.map(({ reveal }) => ({ reveal })),
            ),
          },
          path,
          node.id,
        ),
      };
    case "path": {
      return {
        ...base,
        type: "provider",
        provider: geometry ? "story.path@1.1.0" : "story.path@1.0.0",
        params: params(
          {
            node,
            ...(geometry ? { geometry } : {}),
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
    }
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
  }
}
