import {
  CompositionSchema,
  COMPOSITION_LIMITS,
  type Composition,
  type CompositionAsset,
} from "@still-shift/scene-contract";
import {
  evaluateFrame,
  isFlatPreset,
  type PreviewScene,
  type PreviewPreset,
} from "../../scene.ts";
import { passageError } from "../../passage-diagnostics.ts";
import { baked, params } from "./prepared.ts";
import { DEPTH_IMAGE_SHADER_VERSION } from "../render/webgl-depth-image.ts";

export const DEPTH_ADAPTER_VERSION = "depth-composition-0.1.0";
type ImageAsset = Extract<CompositionAsset, { type: "image" }>;

/** Deterministic preparation choice; identical to the original preview request policy. */
export function resolveDepthPreviewPreset(
  requested: PreviewPreset | "auto",
  seed: number,
  width: number,
  height: number,
  normalizedSourceHash: string,
): PreviewPreset {
  if (
    !/^sha256:[a-f\d]{64}$/.test(normalizedSourceHash) ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff
  )
    passageError(
      "comp-depth-provenance",
      "Depth preset selection requires the verified normalized source SHA-256 and an unsigned 32-bit seed",
      { path: "preset" },
    );
  if (requested !== "auto") return requested;
  if (height > width) return "horizontal_drift";
  const presets: PreviewPreset[] = [
    "slow_push",
    "horizontal_drift",
    "cinematic_float",
  ];
  const prefix = Number.parseInt(normalizedSourceHash.slice(7, 15), 16);
  return presets[((prefix ^ seed) >>> 0) % presets.length]!;
}

export type DepthCompositionOptions = {
  id?: string;
  source: ImageAsset;
  depth?: ImageAsset;
  requestedPreset?: PreviewPreset | "auto";
  requestedIntensity?: "subtle" | "standard" | "strong";
  originalSourceHash?: string;
};

/** Compile prepared motion and verified assets only; never infer or draw a frame here. */
export function depthToComposition(
  scene: PreviewScene,
  options: DepthCompositionOptions,
): Composition {
  if (
    !Number.isInteger(scene.timeline.frameCount) ||
    scene.timeline.frameCount < 1 ||
    scene.timeline.frameCount > COMPOSITION_LIMITS.maxKeys
  )
    passageError(
      "comp-adapter-limit",
      "Depth adapter frame count exceeds the bounded integer-key bake",
      { path: "timeline.frameCount" },
    );
  if (scene.motion.mode === "flat_2d" && !isFlatPreset(scene.motion.preset))
    passageError(
      "comp-depth-provenance",
      "An explicit depth preset cannot silently become a flat mode",
      { path: "motion.mode" },
    );
  if (
    options.originalSourceHash &&
    !/^sha256:[a-f\d]{64}$/.test(options.originalSourceHash)
  )
    passageError(
      "comp-depth-provenance",
      "Original source provenance must be a SHA-256 hash",
      { path: "originalSourceHash" },
    );
  const requested = options.requestedPreset ?? scene.motion.preset;
  const resolved = resolveDepthPreviewPreset(
    requested,
    scene.motion.seed,
    scene.canvas.width,
    scene.canvas.height,
    options.source.sha256,
  );
  if (resolved !== scene.motion.preset)
    passageError(
      "comp-depth-provenance",
      "Prepared depth preset differs from deterministic request resolution",
      { path: "motion.preset" },
    );
  if (
    options.source.width !== scene.source.width ||
    options.source.height !== scene.source.height
  )
    passageError(
      "comp-depth-provenance",
      "Depth adapter requires the actual normalized prepared source dimensions",
      { path: "source" },
    );
  if (scene.motion.mode === "depth" && !options.depth)
    passageError(
      "comp-asset-missing",
      "Explicit depth displacement requires a prepared depth asset",
      { path: "depth" },
    );
  if (
    scene.motion.mode === "fallback_2d" &&
    (!scene.quality?.fallback || !scene.quality.fallbackReason)
  )
    passageError(
      "comp-depth-provenance",
      "A flat fallback requires its explicit preparation/safety diagnostic",
      { path: "quality" },
    );
  const states = Array.from({ length: scene.timeline.frameCount }, (_, frame) =>
    evaluateFrame(scene, frame),
  );
  const motion = {
    scale: baked(states.map((state) => state.scale)),
    offset: {
      x: baked(states.map((state) => state.translationX)),
      y: baked(states.map((state) => state.translationY)),
    },
    roll: baked(states.map((state) => state.rollDegrees)),
  };
  const base = {
    id: "photo",
    size: [scene.canvas.width, scene.canvas.height] as [number, number],
    transform: { anchor: [0, 0] as [number, number] },
    alphaMode: "opaque" as const,
    source: { family: "depth-animation", id: scene.motion.preset },
  };
  const depth = scene.motion.mode === "depth" ? options.depth! : undefined;
  return CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: options.id ?? "depth-preview",
    width: scene.canvas.width,
    height: scene.canvas.height,
    frameCount: scene.timeline.frameCount,
    fps: scene.timeline.fps,
    background: "#141414",
    assets: [options.source, ...(depth ? [depth] : [])],
    layers: [
      depth
        ? {
            ...base,
            type: "depth-image",
            sourceAsset: options.source.id,
            depth: {
              asset: depth.id,
              encoding: "r8-unorm",
              width: depth.width,
              height: depth.height,
            },
            overscan: scene.motion.overscan,
            edgeDamping: scene.motion.preset === "slow_push" ? 0 : 1,
            ...(scene.framing ? { framing: scene.framing.crop } : {}),
            motion: {
              ...motion,
              strength: baked(states.map((state) => state.depthStrength)),
            },
          }
        : {
            ...base,
            type: "image",
            fit: "cover",
            sources: [{ asset: options.source.id }],
            sampling: "linear-srgb",
            plane: {
              overscan: scene.motion.overscan,
              ...(scene.framing ? { framing: scene.framing.crop } : {}),
              motion,
              ...(["panel_reveal", "comparison_step"].includes(
                scene.motion.preset,
              )
                ? {
                    reveal: {
                      mode:
                        scene.motion.preset === "panel_reveal"
                          ? "wipe"
                          : "half-wipe",
                      progress: baked(
                        states.map((state) => state.revealProgress),
                      ),
                    },
                  }
                : {}),
            },
          },
    ],
    metadata: params(
      {
        adapter: DEPTH_ADAPTER_VERSION,
        shader: DEPTH_IMAGE_SHADER_VERSION,
        requestedPreset: requested,
        resolvedPreset: resolved,
        requestedIntensity:
          options.requestedIntensity ?? scene.motion.intensity,
        resolvedMotion: scene.motion,
        framing: scene.framing ?? null,
        quality: scene.quality,
        warnings: scene.warnings,
        sourceHash: options.source.sha256,
        depthHash: depth?.sha256 ?? null,
        originalSourceHash: options.originalSourceHash ?? null,
        sourceRendererVersion: scene.rendererVersion,
        presetVersion: scene.presetVersion,
        clock:
          "integer-frame bake, layer-local held keys; transforms/camera applied once",
        alpha:
          "Prepared legacy source ignores alpha; normalized worker assets already flatten onto white",
      },
      "metadata",
    ),
  });
}
