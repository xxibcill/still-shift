/** CE4d test-only independent old Canvas oracle, preserved from 0d23767.
 * Frozen CE0 hashes verify this path; production must never import it. */
import {
  paintRadialLight,
  paintRisingParticles,
  paintFilmGrain,
} from "../../packages/renderer-core/src/pixel-generators.ts";
import {
  glow,
  directionalBlur,
  sineDisplacement,
  lightSweep as paintLightSweep,
} from "../../packages/renderer-core/src/pixel-effects.ts";
import type { CinematicRenderScene } from "../../packages/renderer-core/src/cinematic-scene.ts";
import { storyCameraTransform } from "../../packages/renderer-core/src/story-camera.ts";
import { componentMasks, compositeRootMask } from "./legacy-mask-oracle.ts";
import { componentVisibilityCuts } from "../../packages/renderer-core/src/component-visibility.ts";
import { componentStateCuts } from "../../packages/renderer-core/src/component-state.ts";
import { nodeMatrix } from "../../packages/renderer-core/src/node-transform.ts";
import type { StoryRenderScene } from "../../packages/renderer-core/src/story-scene.ts";
import type { CommerceRenderScene } from "../../packages/renderer-core/src/commerce-scene.ts";
import type { PreparedNode } from "../../packages/scene-contract/src/prepared.ts";
import type { EffectOf } from "../../packages/scene-contract/src/commerce-effects.ts";
import { evaluatePreparedNodeAtTime } from "./legacy-recipe-oracle.ts";
import {
  effectPhase,
  effectProgress,
  exposureFrames,
  isEffectActive,
} from "../../packages/renderer-core/src/commerce-effect-motion.ts";

type Surface = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
type Paint = (
  ctx: CanvasRenderingContext2D,
  node: PreparedNode,
  frame: number,
) => void;
function surface(width: number, height: number): Surface {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Commerce effects require Canvas 2D");
  return { canvas, ctx };
}
function clear({ canvas, ctx }: Surface) {
  ctx.resetTransform();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}
function smooth(progress: number) {
  return progress * progress * (3 - 2 * progress);
}
/** Deterministic, full-canvas effect buffers preserve occlusion and allow blur outside node bounds. */
export function createCommerceEffectsRenderer(
  scene: CommerceRenderScene | StoryRenderScene | CinematicRenderScene,
  paint: Paint,
) {
  const effects = scene.effects ?? [];
  const componentScene =
    scene.schemaVersion === "illustrated-scene-2"
      ? {
          nodes: scene.nodes,
          frameCount: scene.timeline.frameCount,
          componentData: undefined,
        }
      : scene;
  const mattes = [
    ...(scene.schemaVersion === "commerce-scene-1" ? (scene.mattes ?? []) : []),
    ...componentMasks(componentScene),
  ];
  const maskIds = new Set(mattes.map((m) => m.mask));
  const flowPathIds = new Set(
    scene.schemaVersion === "story-scene-1"
      ? (scene.compiledFlows?.map((flow) => flow.path) ?? [])
      : [],
  );
  const roots = scene.nodes.filter(
    (node) => !node.parent && !maskIds.has(node.id),
  );
  const layer = surface(scene.width, scene.height),
    scratch = surface(scene.width, scene.height);
  const sample = surface(scene.width, scene.height),
    accumulation = surface(scene.width, scene.height);
  const grain = surface(128, 128);
  const pixelContext = {
    createSurface: () => scratch,
    releaseSurface: () => {},
    clear,
  };
  const blur = effects.find(
    (effect): effect is EffectOf<"motion-blur"> =>
      effect.type === "motion-blur",
  );
  const descendants = (id: string): PreparedNode[] => {
    const ids = new Set([id]);
    for (let pass = 0; pass < scene.nodes.length; pass++)
      for (const node of scene.nodes)
        if (node.parent && ids.has(node.parent)) ids.add(node.id);
    return scene.nodes.filter((node) => ids.has(node.id));
  };
  const trees = new Map(roots.map((node) => [node.id, descendants(node.id)]));
  const pose = (node: PreparedNode, frame: number) =>
    JSON.stringify(
      trees
        .get(node.id)!
        .map((item) => evaluatePreparedNodeAtTime(scene, item, frame)),
    );

  function lightSweep(
    effect: EffectOf<"light-sweep">,
    node: PreparedNode,
    frame: number,
  ) {
    const state = evaluatePreparedNodeAtTime(scene, node, frame);
    const matrix = nodeMatrix(node, state);
    const transforms: (typeof matrix)[] = [];
    if (scene.schemaVersion === "story-scene-1") {
      const camera = storyCameraTransform(scene, node.id, frame);
      transforms.push(
        [1, 0, 0, 1, camera.x, camera.y],
        [camera.scale, 0, 0, camera.scale, 0, 0],
      );
    }
    transforms.push(matrix);
    paintLightSweep(
      pixelContext,
      layer,
      {
        width: node.width,
        height: node.height,
        left: effect.region[0],
        top: effect.region[1],
        regionWidth: effect.region[2],
        regionHeight: effect.region[3],
        band: effect.width,
        progress: (1 - Math.cos(effectPhase(effect, frame))) / 2,
        strength: effect.strength,
      },
      { matrix, transforms },
    );
  }

  function drawRoot(
    ctx: CanvasRenderingContext2D,
    node: PreparedNode,
    frame: number,
  ) {
    if (
      evaluatePreparedNodeAtTime(scene, node, frame).opacity <= 0 &&
      !flowPathIds.has(node.id)
    )
      return;
    const treatments = effects.filter(
      (effect) =>
        isEffectActive(effect, frame) &&
        "target" in effect &&
        effect.target === node.id,
    );
    const matte = mattes.find((m) => m.target === node.id);
    if (
      !matte &&
      !treatments.some((effect) =>
        [
          "echo",
          "glow",
          "light-sweep",
          "focus-blur",
          "displacement",
          "directional-blur",
        ].includes(effect.type),
      )
    ) {
      paint(ctx, node, frame);
      return;
    }
    clear(layer);
    const echo = treatments.find(
      (effect): effect is EffectOf<"echo"> => effect.type === "echo",
    );
    if (echo && echo.decay > 0) {
      const currentPose = pose(node, frame);
      for (let i = echo.count; i >= 1; i--) {
        const previous = Math.max(0, frame - i * echo.spacing);
        if (pose(node, previous) === currentPose) continue;
        layer.ctx.save();
        layer.ctx.globalAlpha = echo.decay ** i;
        paint(layer.ctx, node, previous);
        layer.ctx.restore();
      }
    }
    paint(layer.ctx, node, frame);
    for (const effect of treatments) {
      switch (effect.type) {
        case "directional-blur":
          directionalBlur(pixelContext, layer, effect);
          break;
        case "glow":
          glow(pixelContext, layer, effect);
          break;
        case "light-sweep":
          lightSweep(effect, node, frame);
          break;
        case "displacement":
          sineDisplacement(pixelContext, layer, {
            ...effect,
            phase: effectPhase(effect, frame),
          });
          break;
        case "focus-blur": {
          const p = smooth(effectProgress(effect, frame));
          const radius = effect.radius + (effect.endRadius - effect.radius) * p;
          if (radius <= 0) break;
          clear(scratch);
          scratch.ctx.filter = `blur(${radius}px)`;
          scratch.ctx.drawImage(layer.canvas, 0, 0);
          clear(layer);
          layer.ctx.drawImage(scratch.canvas, 0, 0);
          break;
        }
      }
    }
    if (matte) {
      clear(scratch);
      paint(scratch.ctx, scene.nodes.find((n) => n.id === matte.mask)!, frame);
      compositeRootMask(layer.ctx, scratch.canvas, matte.invert);
    }
    ctx.drawImage(layer.canvas, 0, 0);
  }
  function renderSample(ctx: CanvasRenderingContext2D, frame: number) {
    ctx.save();
    ctx.resetTransform();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
    ctx.fillStyle = scene.background;
    ctx.fillRect(0, 0, scene.width, scene.height);
    for (const effect of effects) {
      if (!isEffectActive(effect, frame)) continue;
      if (effect.type === "background-light")
        paintRadialLight(
          ctx,
          {
            ...effect,
            x: effect.x + Math.sin(effectPhase(effect, frame)) * effect.travel,
          },
          scene.width,
          scene.height,
        );
      if (effect.type === "particles")
        paintRisingParticles(
          ctx,
          {
            ...effect,
            progress: effectProgress(effect, frame) * effect.cycles,
          },
          scene.width,
          scene.height,
        );
    }
    for (const node of roots) drawRoot(ctx, node, frame);
    for (const effect of effects)
      if (effect.type === "grain" && isEffectActive(effect, frame))
        paintFilmGrain(
          ctx,
          { ...effect, evolution: frame - (effect.active?.start ?? 0) },
          grain,
          scene.width,
          scene.height,
        );
    ctx.restore();
  }
  return {
    render(ctx: CanvasRenderingContext2D, frame: number) {
      if (!blur || !isEffectActive(blur, frame) || blur.shutterAngle === 0) {
        renderSample(ctx, frame);
        return;
      }
      let samples = exposureFrames(
        frame,
        scene.timeline.frameCount,
        blur.shutterAngle,
        blur.samples,
      );
      // Exposure never crosses explicit sequence cuts: hold the edge pose within this shot.
      const cuts = [
        0,
        scene.timeline.frameCount,
        ...componentStateCuts(componentScene),
        ...componentVisibilityCuts(componentScene),
        ...(scene.schemaVersion === "commerce-scene-1"
          ? (scene.visibility ?? [])
          : []
        ).flatMap((v) => [v.start, v.end]),
        ...effects.flatMap((e) =>
          e.active ? [e.active.start, e.active.end] : [],
        ),
      ];
      const lower = Math.max(...cuts.filter((c) => c <= frame)),
        upper = Math.min(...cuts.filter((c) => c > frame));
      samples = samples.map((time) =>
        Math.max(lower, Math.min(upper - 1e-7, time)),
      );
      const animatedImageEffects = effects.some((effect) =>
        [
          "light-sweep",
          "focus-blur",
          "echo",
          "grain",
          "particles",
          "background-light",
          "displacement",
        ].includes(effect.type),
      );
      if (
        !("motionModel" in scene && scene.motionModel) &&
        scene.schemaVersion !== "illustrated-scene-2" &&
        !mattes.length &&
        !(
          scene.schemaVersion === "commerce-scene-1" &&
          scene.attachments?.length
        ) &&
        !componentScene.componentData?.annotations.length &&
        !componentScene.componentData?.bindings.some(
          (binding) => binding.kind === "text",
        ) &&
        !animatedImageEffects &&
        roots.every((node) => {
          const current = pose(node, frame);
          return samples.every((time) => pose(node, time) === current);
        })
      ) {
        renderSample(ctx, frame);
        return;
      }
      // Average complete opaque sample frames in display sRGB. This preserves transparent-layer occlusion.
      // Float accumulation avoids the opacity/color drift of 8-bit source-over or additive stacking.
      const output = accumulation.ctx.createImageData(
        scene.width,
        scene.height,
      );
      const sum = new Float32Array(output.data.length);
      for (const time of samples) {
        renderSample(sample.ctx, time);
        const pixels = sample.ctx.getImageData(
          0,
          0,
          scene.width,
          scene.height,
        ).data;
        for (let i = 0; i < pixels.length; i++) sum[i] = sum[i]! + pixels[i]!;
      }
      for (let i = 0; i < sum.length; i++)
        output.data[i] = Math.round(sum[i]! / samples.length);
      accumulation.ctx.putImageData(output, 0, 0);
      ctx.drawImage(accumulation.canvas, 0, 0);
    },
    dispose() {
      for (const buffer of [layer, scratch, sample, accumulation, grain]) {
        buffer.canvas.width = 0;
        buffer.canvas.height = 0;
      }
    },
  };
}

export const createSharedEffectsRenderer = createCommerceEffectsRenderer;
