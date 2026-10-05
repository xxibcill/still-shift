import { stylizeEffectKernel } from "./stylize-effects.ts";
import { noiseEffectKernel } from "./noise-effects.ts";
import { warpEffectKernel } from "./warp-effects.ts";
import { sampledBlurKernel } from "./sampled-blur.ts";
import { transitionEffectKernel } from "./transition-effects.ts";
import { colorEffectKernel } from "./color-effects.ts";
import {
  registerCompositionEffectDefinition,
  type CompositionEffectDefinition,
} from "@still-shift/scene-contract";
import type { RenderEffect } from "./graph.ts";
import type { CanvasSurface } from "./canvas2d.ts";
import type { CanvasEffectContext } from "./effects.ts";
import type { WebglDevice, WebglSurface } from "./webgl-device.ts";

type Parameters = RenderEffect["params"];
export type GpuEffectContext = {
  createSurface(width: number, height: number): WebglSurface;
  releaseSurface(surface: WebglSurface): void;
  /** Upload deterministic byte control data or premultiplied color bytes to an owned texture. */
  uploadBytes(surface: WebglSurface, bytes: Uint8Array<ArrayBuffer>): void;
  /** Premultiplied top-left textures; source/backdrop/coverage/inputN sampler names. */
  pass(
    fragment: string,
    output: WebglSurface,
    inputs: readonly WebglSurface[],
    uniforms?: Record<string, number | readonly number[]>,
  ): void;
};
export type CompositionEffectPlugin = {
  id: string;
  definition: CompositionEffectDefinition;
  renderGpu(
    context: GpuEffectContext,
    input: WebglSurface,
    params: Parameters,
  ): WebglSurface;
  renderCanvas?(
    context: CanvasEffectContext,
    input: CanvasSurface,
    params: Parameters,
  ): CanvasSurface;
};
const plugins = new Map<string, Readonly<CompositionEffectPlugin>>();

/** Install in each rendering host. Documents capture versions, not executable functions. */
export function registerCompositionEffect(
  plugin: CompositionEffectPlugin,
): () => void {
  if (
    typeof plugin.renderGpu !== "function" ||
    (plugin.renderCanvas !== undefined &&
      typeof plugin.renderCanvas !== "function")
  )
    throw Error(
      "comp-effect-registration: a GPU callback and optional Canvas callback are required",
    );
  const releaseDefinition = registerCompositionEffectDefinition(
    plugin.id,
    plugin.definition,
  );
  const registered = Object.freeze({
    ...plugin,
    definition: Object.freeze({ ...plugin.definition }),
  });
  plugins.set(plugin.id, registered);
  return () => {
    if (plugins.get(plugin.id) !== registered) return;
    plugins.delete(plugin.id);
    releaseDefinition();
  };
}
export const compositionEffectPlugin = (id: string) =>
  plugins.get(id) ??
  colorEffectKernel(id) ??
  transitionEffectKernel(id) ??
  sampledBlurKernel(id) ??
  warpEffectKernel(id) ??
  noiseEffectKernel(id) ??
  stylizeEffectKernel(id);

/** A callback owns at most 32 surfaces and 128 MiB (or four full-size frames). */
class EffectSurfaces<S extends { width: number; height: number }> {
  private readonly owned = new Set<S>();
  private pixels = 0;
  private readonly maximum: number;
  constructor(
    input: S,
    private readonly allocate: (width: number, height: number) => S,
    private readonly release: (surface: S) => void,
  ) {
    this.maximum = Math.max(32 * 1024 * 1024, input.width * input.height * 4);
  }
  create = (width: number, height: number): S => {
    if (
      ![width, height].every(
        (n) => Number.isSafeInteger(n) && n > 0 && n <= 8192,
      ) ||
      this.owned.size >= 32 ||
      this.pixels + width * height > this.maximum
    )
      throw Error("comp-effect-surface: scratch surface budget exceeded");
    const surface = this.allocate(width, height);
    this.owned.add(surface);
    this.pixels += width * height;
    return surface;
  };
  require(surface: S): void {
    if (!this.owned.has(surface))
      throw Error(
        "comp-effect-surface: surface must belong to this callback and remain unreleased",
      );
  }
  remove = (surface: S): void => {
    this.require(surface);
    this.owned.delete(surface);
    this.pixels -= surface.width * surface.height;
    this.release(surface);
  };
  dispose(): void {
    for (const surface of [...this.owned]) this.remove(surface);
  }
}
function checkedPlugin(effect: RenderEffect) {
  const plugin = compositionEffectPlugin(effect.effect);
  if (
    plugin &&
    effect.version !== undefined &&
    effect.version !== plugin.definition.version
  )
    throw Error(
      `comp-effect-version: ${effect.effect} differs from its sampled definition`,
    );
  return plugin;
}
const COPY = "void main() {pixel=texelFetch(source,ivec2(gl_FragCoord.xy),0);}";

/** Transactional GPU stage: publish only a valid output; always release scratch textures. */
export function renderGpuEffect(
  device: WebglDevice,
  target: WebglSurface,
  effect: RenderEffect,
): boolean {
  const plugin = checkedPlugin(effect);
  if (!plugin) return false;
  const surfaces = new EffectSurfaces(
    target,
    (w, h) => device.surface(w, h),
    (s) => device.release(s),
  );
  try {
    const input = surfaces.create(target.width, target.height);
    device.pass(COPY, input, [target]);
    const context: GpuEffectContext = {
      createSurface: surfaces.create,
      releaseSurface: surfaces.remove,
      uploadBytes(surface, bytes) {
        surfaces.require(surface);
        if (bytes.length !== surface.width * surface.height * 4)
          throw Error(
            "comp-effect-surface: uploaded bytes must match surface dimensions",
          );
        device.uploadBytes(surface, bytes);
      },
      pass(fragment, output, inputs, uniforms) {
        surfaces.require(output);
        for (const source of inputs) {
          surfaces.require(source);
          if (source === output || source.texture === output.texture)
            throw Error(
              "comp-effect-surface: input and output textures overlap",
            );
        }
        device.pass(fragment, output, inputs, uniforms);
      },
    };
    const output = plugin.renderGpu(context, input, effect.params);
    surfaces.require(output);
    if (output.width !== target.width || output.height !== target.height)
      throw Error(
        "comp-effect-surface: output must match the input dimensions",
      );
    device.pass(COPY, target, [output]);
    return true;
  } finally {
    surfaces.dispose();
  }
}

/** Transactional reference stage; an absent Canvas implementation is an explicit diagnostic. */
export function renderCanvasEffect(
  context: CanvasEffectContext,
  target: CanvasSurface,
  effect: RenderEffect,
): boolean {
  const plugin = checkedPlugin(effect);
  if (!plugin) return false;
  if (!plugin.renderCanvas)
    throw Error(
      `comp-effect-unavailable: ${effect.effect} has no Canvas implementation`,
    );
  const surfaces = new EffectSurfaces(
    target,
    (w, h) => context.createSurface(w, h),
    (s) => context.releaseSurface(s),
  );
  try {
    const input = surfaces.create(target.width, target.height);
    input.ctx.drawImage(target.canvas, 0, 0);
    const output = plugin.renderCanvas(
      {
        createSurface: surfaces.create,
        releaseSurface: surfaces.remove,
        clear(surface, background) {
          surfaces.require(surface);
          context.clear(surface, background);
        },
      },
      input,
      effect.params,
    );
    surfaces.require(output);
    if (output.width !== target.width || output.height !== target.height)
      throw Error(
        "comp-effect-surface: output must match the input dimensions",
      );
    context.clear(target, null);
    target.ctx.drawImage(output.canvas, 0, 0);
    return true;
  } finally {
    surfaces.dispose();
  }
}
