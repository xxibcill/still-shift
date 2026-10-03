import { pointBounds } from "./provider-bounds.ts";
import { preparedProvider } from "../render/providers.ts";
import { z } from "zod";
import {
  COMPOSITION_LIMITS,
  type CommerceScene,
  type StoryScene,
  type PreparedPath,
} from "@still-shift/scene-contract";
import {
  SpatialPathSchema,
  PathMorphSchema,
} from "../../../../scene-contract/src/motion-craft.ts";
import { sampleMotionPath } from "../../motion-appearance.ts";
import { compileStoryFlows, drawStoryFlow } from "../../story-flows.ts";
import { drawPreparedPath } from "../../prepared-path-renderer.ts";
import { passageError } from "../../passage-diagnostics.ts";
import {
  StoryPathParamsSchema,
  StoryFlowParamsSchema,
} from "./story-providers.ts";
import { CommercePathGeometrySchema } from "./commerce-path.ts";
import { StoryPathGeometrySchema, sampleStoryPath } from "./story-path.ts";
import { params } from "./prepared.ts";
import {
  AppearanceSchema,
  appearanceAt,
  paintNode,
  type Appearance,
} from "./appearance.ts";
import type {
  CanvasContentProvider,
  ProviderLayer,
} from "../render/providers.ts";

const fields = {
  geometry: z
    .union([CommercePathGeometrySchema, StoryPathGeometrySchema])
    .optional(),
  motion: z
    .object({
      fps: z.number().positive().max(240),
      frameCount: z.number().int().positive().max(COMPOSITION_LIMITS.maxKeys),
      spatial: SpatialPathSchema.optional(),
      morph: PathMorphSchema.optional(),
    })
    .strict(),
};
export const MotionPathParamsSchema = StoryPathParamsSchema.extend(fields);
export const MotionFlowParamsSchema = StoryFlowParamsSchema.extend(fields);
export const PaintedPathParamsSchema = MotionPathParamsSchema.extend({
  appearance: AppearanceSchema,
});
type PathParams = z.infer<typeof MotionPathParamsSchema>;

function parse<
  T extends typeof MotionPathParamsSchema | typeof MotionFlowParamsSchema,
>(schema: T, layer: ProviderLayer, path: string): z.infer<T> {
  const result = schema.safeParse(layer.params);
  if (!result.success)
    passageError("comp-provider-params", result.error.issues[0]!.message, {
      path: `${path}.params`,
    });
  const data = result.data;
  if (
    [data.motion.spatial, data.motion.morph].some(
      (motion) => motion && motion.node !== data.node.id,
    )
  )
    passageError(
      "comp-provider-params",
      "Motion path geometry must target its own node",
      { path: `${path}.params.motion` },
    );
  const segments = data.motion.spatial?.segments;
  if (
    segments?.some(
      (segment, i) =>
        i > 0 && segment[0].some((v, axis) => v !== segments[i - 1]![3][axis]),
    ) ||
    data.motion.morph?.keys.some(
      (key) => key.frame >= data.motion.frameCount,
    ) ||
    ("flow" in data && data.flow.path !== data.node.id)
  )
    passageError(
      "comp-provider-params",
      "Path joins, morph timing and flow ownership must match the local content",
      { path: `${path}.params.motion` },
    );
  return data as z.infer<T>;
}

export function sampleCompositionMotionPath(
  data: Pick<PathParams, "node" | "geometry" | "motion">,
  frame: number,
  sampleIndex = frame,
) {
  const geometry = data.geometry;
  const node = !geometry
    ? data.node
    : "points" in geometry
      ? {
          ...data.node,
          points:
            geometry.points[Math.min(sampleIndex, geometry.points.length - 1)]!,
        }
      : sampleStoryPath(data.node, geometry, sampleIndex);
  return sampleMotionPath(
    node,
    data.motion.spatial,
    data.motion.morph,
    frame,
    data.motion.fps,
  );
}

/** Cubic and non-overshooting morph geometry stays inside its control-point hull. */
export function motionPathBounds(
  data: Pick<PathParams, "node" | "geometry" | "motion">,
  padding: number,
) {
  const morph = data.motion.morph;
  if (
    morph?.keys.some(({ easing }) =>
      typeof easing === "object"
        ? !("bezier" in easing) ||
          easing.bezier[1] < 0 ||
          easing.bezier[1] > 1 ||
          easing.bezier[3] < 0 ||
          easing.bezier[3] > 1
        : ["out-back", "out-back-soft", "anticipate"].includes(easing ?? ""),
    )
  )
    return undefined;
  const geometry = data.geometry;
  const points = morph
    ? morph.keys.flatMap((key) => key.points)
    : data.motion.spatial
      ? data.motion.spatial.segments.flat()
      : !geometry
        ? data.node.points
        : "points" in geometry
          ? geometry.points.flat()
          : geometry.endpoints.flatMap(
              (_, index) => sampleStoryPath(data.node, geometry, index).points,
            );
  return pointBounds(points, padding);
}

export const MOTION_PATH_PROVIDERS: readonly CanvasContentProvider[] = [
  {
    id: "component.path@1.0.0",
    prepare(layer, _resources, path) {
      const data = parse(MotionPathParamsSchema, layer, path);
      return preparedProvider(
        (ctx, time, _state, sourceTime) => {
          const frame = Math.max(
            0,
            sourceTime === undefined
              ? Math.min(data.motion.frameCount - 1, Math.floor(time))
              : Math.floor(time),
          );
          drawPreparedPath(
            ctx,
            sampleCompositionMotionPath(data, sourceTime ?? frame, frame),
            data.samples[Math.min(frame, data.samples.length - 1)]!,
          );
        },
        {
          boundedCanvas: true,
          bounds: data.samples.some((sample) => sample.pulse > 0)
            ? undefined
            : motionPathBounds(data, Math.max(1, data.node.lineWidth) * 3),
        },
      );
    },
  },
  {
    id: "component.flow@1.1.0",
    prepare(layer, _resources, path) {
      const data = parse(MotionFlowParamsSchema, layer, path);
      const flow = compileStoryFlows([data.flow], data.motion.frameCount)[0]!;
      return preparedProvider(
        (ctx, time, _state, sourceTime) => {
          const frame = Math.max(
            0,
            sourceTime === undefined
              ? Math.min(data.motion.frameCount - 1, Math.floor(time))
              : Math.floor(time),
          );
          drawStoryFlow(
            ctx,
            flow,
            sampleCompositionMotionPath(data, sourceTime ?? frame, frame),
            data.samples[Math.min(frame, data.samples.length - 1)]!,
            sourceTime ?? frame,
            data.motion.frameCount,
          );
        },
        {
          boundedCanvas: true,
          bounds: motionPathBounds(
            data,
            Math.hypot(flow.size, Math.min(2, flow.size)),
          ),
        },
      );
    },
  },
  {
    id: "component.path@1.1.0",
    prepare(layer, _resources, path) {
      const data = parse(PaintedPathParamsSchema, layer, path);
      return preparedProvider(
        (ctx, time, _state, sourceTime) => {
          const frame = Math.max(
            0,
            sourceTime === undefined
              ? Math.min(data.motion.frameCount - 1, Math.floor(time))
              : Math.floor(time),
          );
          const paint = appearanceAt(data.appearance, frame);
          drawPreparedPath(
            ctx,
            paintNode(
              sampleCompositionMotionPath(data, sourceTime ?? frame, frame),
              data.appearance,
              frame,
            ),
            {
              ...data.samples[Math.min(frame, data.samples.length - 1)]!,
              ...(paint.trimStart !== undefined
                ? { trimStart: paint.trimStart }
                : {}),
              ...(paint.trimEnd !== undefined
                ? { trimEnd: paint.trimEnd }
                : {}),
              ...(paint.trimOffset !== undefined
                ? { trimOffset: paint.trimOffset }
                : {}),
            },
          );
        },
        {
          boundedCanvas: true,
          bounds: data.samples.some((sample) => sample.pulse > 0)
            ? undefined
            : motionPathBounds(
                data,
                Math.max(
                  1,
                  Math.abs(data.node.lineWidth),
                  ...(data.appearance.strokeWidth ?? []).map(Math.abs),
                ) * 3,
              ),
        },
      );
    },
  },
];

/** Keep authored cubic segments and morph keys compact instead of baking thousands of vertices. */
export function withMotionPath(
  scene: CommerceScene | StoryScene,
  node: PreparedPath,
  layer: ProviderLayer,
  appearance?: Appearance,
): ProviderLayer {
  const spatial = scene.spatialPaths?.find((path) => path.node === node.id);
  const morph = scene.pathMorphs?.find((path) => path.node === node.id);
  if (!spatial && !morph && !appearance) return layer;
  return {
    ...layer,
    provider:
      "flow" in layer.params
        ? "component.flow@1.1.0"
        : appearance
          ? "component.path@1.1.0"
          : "component.path@1.0.0",
    params: params(
      {
        ...layer.params,
        ...(appearance ? { appearance } : {}),
        motion: {
          fps: scene.fps,
          frameCount: scene.frameCount,
          ...(spatial ? { spatial } : {}),
          ...(morph ? { morph } : {}),
        },
      },
      `nodes[${scene.nodes.indexOf(node)}]`,
      node.id,
    ),
  };
}
