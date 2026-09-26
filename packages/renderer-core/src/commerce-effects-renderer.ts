import { nodeMatrix } from "./node-transform.ts";
import type { CommerceRenderScene } from "./commerce-scene.ts";
import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import type { EffectOf } from "../../scene-contract/src/commerce-effects.ts";
import { evaluatePreparedNodeAtTime } from "./prepared-scene.ts";
import {
  effectPhase,
  effectProgress,
  exposureFrames,
  seededRandom,
  isEffectActive,
} from "./commerce-effect-motion.ts";

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
function paintLight(
  ctx: CanvasRenderingContext2D,
  effect: EffectOf<"background-light">,
  frame: number,
  width: number,
  height: number,
) {
  const x = effect.x + Math.sin(effectPhase(effect, frame)) * effect.travel;
  const gradient = ctx.createRadialGradient(
    x,
    effect.y,
    0,
    x,
    effect.y,
    effect.radius,
  );
  gradient.addColorStop(0, effect.color);
  gradient.addColorStop(1, effect.color + "00");
  ctx.save();
  ctx.globalAlpha = effect.strength;
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
function paintParticles(
  ctx: CanvasRenderingContext2D,
  effect: EffectOf<"particles">,
  frame: number,
  width: number,
  height: number,
) {
  const random = seededRandom(effect.seed);
  const progress = effectProgress(effect, frame) * effect.cycles;
  ctx.save();
  ctx.fillStyle = effect.color;
  for (let index = 0; index < effect.count; index++) {
    const x = random() * width,
      offset = random(),
      radius = effect.radius * (0.35 + random() * 0.65),
      sway = 10 + random() * 30;
    const phase = (offset + progress) % 1;
    ctx.globalAlpha = effect.opacity * Math.sin(phase * Math.PI) ** 2;
    ctx.beginPath();
    ctx.arc(
      x + Math.sin(phase * Math.PI * 2) * sway,
      height * (1 - phase),
      radius,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}
function paintGrain(
  ctx: CanvasRenderingContext2D,
  effect: EffectOf<"grain">,
  frame: number,
  grain: Surface,
  width: number,
  height: number,
) {
  const random = seededRandom(effect.seed + Math.floor(frame) * 7919);
  const pixels = grain.ctx.createImageData(
    grain.canvas.width,
    grain.canvas.height,
  );
  for (let index = 0; index < pixels.data.length; index += 4) {
    const value = random() < 0.5 ? 0 : 255;
    pixels.data[index] = value;
    pixels.data[index + 1] = value;
    pixels.data[index + 2] = value;
    pixels.data[index + 3] = Math.round(random() * effect.amount * 255);
  }
  grain.ctx.putImageData(pixels, 0, 0);
  ctx.save();
  ctx.fillStyle = ctx.createPattern(grain.canvas, "repeat")!;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/** Deterministic, full-canvas effect buffers preserve occlusion and allow blur outside node bounds. */
export function createCommerceEffectsRenderer(
  scene: CommerceRenderScene,
  paint: Paint,
) {
  const effects = scene.effects ?? [];
  const maskIds = new Set(scene.mattes?.map((m) => m.mask) ?? []);
  const roots = scene.nodes.filter(
    (node) => !node.parent && !maskIds.has(node.id),
  );
  const layer = surface(scene.width, scene.height),
    scratch = surface(scene.width, scene.height);
  const sample = surface(scene.width, scene.height),
    accumulation = surface(scene.width, scene.height);
  const grain = surface(128, 128);
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
    clear(scratch);
    const ctx = scratch.ctx,
      state = evaluatePreparedNodeAtTime(scene, node, frame);
    const [rx, ry, rw, rh] = effect.region;
    ctx.save();
    ctx.transform(...nodeMatrix(node, state));
    ctx.beginPath();
    ctx.rect(
      rx * node.width,
      ry * node.height,
      rw * node.width,
      rh * node.height,
    );
    ctx.clip();
    const progress = (1 - Math.cos(effectPhase(effect, frame))) / 2;
    const center =
      (rx - effect.width + (rw + effect.width * 2) * progress) * node.width;
    const radius = effect.width * node.width;
    const gradient = ctx.createLinearGradient(
      center - radius,
      0,
      center + radius,
      0,
    );
    gradient.addColorStop(0, "#FFFFFF00");
    gradient.addColorStop(0.5, "#FFFFFF");
    gradient.addColorStop(1, "#FFFFFF00");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, node.width, node.height);
    ctx.restore();
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(layer.canvas, 0, 0);
    layer.ctx.save();
    layer.ctx.globalCompositeOperation = "source-atop";
    layer.ctx.globalAlpha = effect.strength;
    layer.ctx.drawImage(scratch.canvas, 0, 0);
    layer.ctx.restore();
  }
  function glow(effect: EffectOf<"glow">) {
    if (!effect.intensity || !effect.radius) return;
    clear(scratch);
    const pixels = layer.ctx.getImageData(0, 0, scene.width, scene.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const luminance =
        (0.2126 * pixels.data[i]! +
          0.7152 * pixels.data[i + 1]! +
          0.0722 * pixels.data[i + 2]!) /
        255;
      pixels.data[i + 3] = Math.round(
        pixels.data[i + 3]! *
          Math.max(
            0,
            (luminance - effect.threshold) /
              Math.max(0.001, 1 - effect.threshold),
          ),
      );
    }
    scratch.ctx.putImageData(pixels, 0, 0);
    layer.ctx.save();
    layer.ctx.globalCompositeOperation = "screen";
    layer.ctx.globalAlpha = effect.intensity;
    layer.ctx.filter = `blur(${effect.radius}px)`;
    layer.ctx.drawImage(scratch.canvas, 0, 0);
    layer.ctx.restore();
  }
  function directional(effect: EffectOf<"directional-blur">) {
    if (effect.length === 0) return;
    const sum = new Float32Array(scene.width * scene.height * 4);
    for (let i = 0; i < effect.samples; i++) {
      clear(scratch);
      const distance = ((i + 0.5) / effect.samples - 0.5) * effect.length;
      scratch.ctx.drawImage(
        layer.canvas,
        Math.cos((effect.angle * Math.PI) / 180) * distance,
        Math.sin((effect.angle * Math.PI) / 180) * distance,
      );
      const pixels = scratch.ctx.getImageData(
        0,
        0,
        scene.width,
        scene.height,
      ).data;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const alpha = pixels[offset + 3]! / 255;
        sum[offset] = sum[offset]! + pixels[offset]! * alpha;
        sum[offset + 1] = sum[offset + 1]! + pixels[offset + 1]! * alpha;
        sum[offset + 2] = sum[offset + 2]! + pixels[offset + 2]! * alpha;
        sum[offset + 3] = sum[offset + 3]! + alpha;
      }
    }
    const output = layer.ctx.createImageData(scene.width, scene.height);
    for (let offset = 0; offset < sum.length; offset += 4) {
      const alpha = sum[offset + 3]!;
      if (alpha === 0) continue;
      output.data[offset] = Math.round(sum[offset]! / alpha);
      output.data[offset + 1] = Math.round(sum[offset + 1]! / alpha);
      output.data[offset + 2] = Math.round(sum[offset + 2]! / alpha);
      output.data[offset + 3] = Math.round((alpha * 255) / effect.samples);
    }
    clear(layer);
    layer.ctx.putImageData(output, 0, 0);
  }

  function displace(effect: EffectOf<"displacement">, frame: number) {
    if (effect.amount === 0) return;
    clear(scratch);
    const phase = effectPhase(effect, frame);
    for (let y = 0; y < scene.height; y++) {
      const shift =
        Math.sin((y / effect.wavelength) * Math.PI * 2 + phase) * effect.amount;
      scratch.ctx.drawImage(
        layer.canvas,
        0,
        y,
        scene.width,
        1,
        shift,
        y,
        scene.width,
        1,
      );
    }
    clear(layer);
    layer.ctx.drawImage(scratch.canvas, 0, 0);
  }
  function drawRoot(
    ctx: CanvasRenderingContext2D,
    node: PreparedNode,
    frame: number,
  ) {
    if (evaluatePreparedNodeAtTime(scene, node, frame).opacity <= 0) return;
    const treatments = effects.filter(
      (effect) =>
        isEffectActive(effect, frame) &&
        "target" in effect &&
        effect.target === node.id,
    );
    const matte = scene.mattes?.find((m) => m.target === node.id);
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
          directional(effect);
          break;
        case "glow":
          glow(effect);
          break;
        case "light-sweep":
          lightSweep(effect, node, frame);
          break;
        case "displacement":
          displace(effect, frame);
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
      layer.ctx.save();
      layer.ctx.globalCompositeOperation = matte.invert
        ? "destination-out"
        : "destination-in";
      layer.ctx.drawImage(scratch.canvas, 0, 0);
      layer.ctx.restore();
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
        paintLight(ctx, effect, frame, scene.width, scene.height);
      if (effect.type === "particles")
        paintParticles(ctx, effect, frame, scene.width, scene.height);
    }
    for (const node of roots) drawRoot(ctx, node, frame);
    for (const effect of effects)
      if (effect.type === "grain" && isEffectActive(effect, frame))
        paintGrain(
          ctx,
          effect,
          frame - (effect.active?.start ?? 0),
          grain,
          scene.width,
          scene.height,
        );
    ctx.restore();
  }
  return {
    render(ctx: CanvasRenderingContext2D, frame: number) {
      if (!blur || blur.shutterAngle === 0) {
        renderSample(ctx, frame);
        return;
      }
      let samples = exposureFrames(
        frame,
        scene.frameCount,
        blur.shutterAngle,
        blur.samples,
      );
      // Exposure never crosses explicit sequence cuts: hold the edge pose within this shot.
      const cuts = [
        0,
        scene.frameCount,
        ...(scene.visibility ?? []).flatMap((v) => [v.start, v.end]),
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
        !scene.mattes?.length &&
        !scene.attachments?.length &&
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
