import { z } from "zod";
import {
  CompositionNodeMemory,
  compositionNodeJsonSize,
} from "@still-shift/execution-runtime/export";
import type { CompositionLayer, BezierPath } from "@still-shift/scene-contract";
import { BlenderProjectedAnchorSchema } from "./blender-capture-contract.ts";
import type { compileBlenderEpisode } from "./blender-episode-compile.ts";
import {
  checkBlenderEpisodePlates,
  type BlenderEpisodePlates,
} from "./blender-episode-plates.ts";
import type { BlenderProductionIdentity } from "./blender-production-identity.ts";
import {
  readProductionJSON,
  productionOwnedPath,
} from "./production-queue-files.ts";

type Compiled = ReturnType<typeof compileBlenderEpisode>;
const frameSchema = z
  .object({
    anchors: z.record(z.string(), BlenderProjectedAnchorSchema),
    partVisibility: z.record(z.string(), z.boolean()),
  })
  .strict();
export type BlenderAnchorFrames = readonly z.infer<typeof frameSchema>[];
const observedSchema = z.object({
  anchors: z.record(z.string(), BlenderProjectedAnchorSchema),
  parts: z
    .array(z.object({ name: z.string(), visible: z.boolean() }))
    .max(2048),
});
/** Retain only authenticated projection/flag data under the caller's allowance. */
export async function readBlenderEpisodeAnchorFrames(
  compiled: Compiled,
  map: BlenderEpisodePlates,
  identity: BlenderProductionIdentity,
  root: string,
  nodeMemory: CompositionNodeMemory,
  signal?: AbortSignal,
) {
  if (!compiled.plan.callouts.length)
    return { frames: [] as BlenderAnchorFrames, release: () => {} };
  const owner = new CompositionNodeMemory(nodeMemory);
  try {
    await checkBlenderEpisodePlates(
      map,
      compiled,
      identity,
      root,
      owner,
      signal,
    );
    owner.reserve(compiled.frameCount * 8192);
    const parts = new Set(compiled.plan.callouts.map((c) => c.part)),
      cache = new Map<string, z.infer<typeof frameSchema>>(),
      frames: z.infer<typeof frameSchema>[] = [];
    for (const frame of map.frames) {
      signal?.throwIfAborted();
      let value = cache.get(frame.observation.sha256);
      if (!value) {
        const loaded = await readProductionJSON(
          await productionOwnedPath(root, frame.observation.path),
          observedSchema,
          owner,
          2 * 1024 * 1024,
          signal,
        );
        try {
          if (loaded.sha256 !== frame.observation.sha256)
            throw Error(
              "Native callout observation changed after authentication",
            );
          value = {
            anchors: loaded.value.anchors,
            partVisibility: Object.fromEntries(
              loaded.value.parts
                .filter((p) => parts.has(p.name))
                .map((p) => [p.name, p.visible]),
            ),
          };
          cache.set(frame.observation.sha256, value);
        } finally {
          loaded.release();
        }
      }
      frames.push(value);
    }
    return {
      frames: frames as BlenderAnchorFrames,
      release: () => owner.dispose(),
    };
  } catch (error) {
    owner.dispose();
    throw error;
  }
}

/** Flat sequence overlays follow actual same-state native projections. */
export function composeBlenderCallouts(
  compiled: Compiled,
  input?: BlenderAnchorFrames,
): CompositionLayer[] {
  const { plan } = compiled;
  if (!plan.callouts.length) return [];
  compositionNodeJsonSize(input, 0, "native-callout-projections", 1024 * 1024);
  const frames = z.array(frameSchema).length(compiled.frameCount).parse(input),
    layers: CompositionLayer[] = [];
  for (const callout of plan.callouts) {
    const position: [number, number] = [
        callout.position[0] * plan.width,
        callout.position[1] * plan.height,
      ],
      fontSize = Math.round(plan.width * 0.0389),
      width = plan.width * 0.24,
      height = fontSize * 2.7;
    const start: [number, number] = [position[0], position[1] + height / 2],
      keys: { frame: number; value: BezierPath; interpolation: "hold" }[] = [];
    let previous = "";
    for (let frame = callout.start; frame < callout.endExclusive; frame++) {
      const value = frames[frame]!,
        anchor = value.anchors[callout.anchor];
      if (!anchor || !anchor.inFrame || !value.partVisibility[callout.part])
        throw Error(
          `Native callout ${callout.id} lacks an in-frame rendered part/anchor at frame ${frame}`,
        );
      const path: BezierPath = {
          closed: false,
          vertices: [start, anchor.pixel],
        },
        serialized = JSON.stringify(path);
      if (serialized !== previous)
        keys.push({ frame, value: path, interpolation: "hold" });
      previous = serialized;
    }
    const common = {
      inPoint: callout.start,
      outPoint: callout.endExclusive,
      startFrame: 0,
      metadata: {
        nativeCallout: {
          id: callout.id,
          text: callout.text,
          part: callout.part,
          anchor: callout.anchor,
          shot: callout.shot,
          scope:
            "Captured projection/render flags; no inferred occlusion or surface contact",
        },
      },
    };
    layers.push({
      ...common,
      id: "callout-text-" + callout.id,
      type: "text",
      text: callout.text,
      textRole: "label",
      fontAsset: "episode-font",
      fontSize,
      color: callout.color,
      align: "center",
      anchor: "top",
      size: [width, height],
      textBox: { locale: plan.locale, maxLines: 2, lineHeight: 1.15 },
      transform: {
        anchor: [0, 0],
        position: [position[0] - width / 2, position[1] - height / 2],
      },
    });
    layers.push({
      ...common,
      id: "callout-panel-" + callout.id,
      type: "shape",
      transform: { position },
      contents: [
        {
          id: "panel",
          type: "rect",
          size: [width + 20, height + 12],
          roundness: 8,
        },
        { id: "fill", type: "fill", color: "#07121df2" },
      ],
    });
    layers.push({
      ...common,
      id: "callout-leader-" + callout.id,
      type: "shape",
      contents: [
        {
          id: "leader",
          type: "path",
          path: keys.length === 1 ? keys[0]!.value : { keys },
        },
        {
          id: "stroke",
          type: "stroke",
          color: callout.color,
          width: Math.max(2, plan.width / 360),
          cap: "round",
        },
      ],
    });
  }
  return layers;
}
