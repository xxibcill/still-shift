import {
  locateMeshError,
  MESH_DIAGNOSTIC_LOCATION,
} from "../mesh/diagnostics.ts";
import { meshEffectKernel } from "./mesh-effects.ts";
import { drawTexturedMesh } from "./webgl-mesh.ts";
import { releaseRenderPixels } from "../../managed-memory-context.ts";
import { renderMemory } from "../../managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  resizeRenderMetadata,
} from "../../managed-metadata.ts";
import { mapEffectKernel } from "./map-effects.ts";
import { shadowEffectKernel } from "./shadow-effects.ts";
import { radialDistortionKernel } from "./radial-distortion.ts";
import { stylizeEffectKernel } from "./stylize-effects.ts";
import { noiseEffectKernel } from "./noise-effects.ts";
import { warpEffectKernel } from "./warp-effects.ts";
import { sampledBlurKernel } from "./sampled-blur.ts";
import { transitionEffectKernel } from "./transition-effects.ts";
import { colorEffectKernel } from "./color-effects.ts";
import {
  compositionEffectDefinition,
  registerCompositionEffectDefinition,
  type CompositionEffectDefinition,
} from "@still-shift/scene-contract";
import type { RenderEffect } from "./graph.ts";
import type { CanvasSurface } from "./canvas2d.ts";
import type { CanvasEffectContext } from "./effects.ts";
import type { WebglDevice, WebglSurface } from "./webgl-device.ts";

type Parameters = RenderEffect["params"];
export type GpuEffectContext = {
  readonly placement?: RenderEffect["placement"];
  /** Owned readbacks are released when this callback completes. */
  readBytes(input: WebglSurface): Uint8Array<ArrayBuffer>;
  mesh(
    output: WebglSurface,
    input: WebglSurface,
    vertices: Float32Array<ArrayBuffer>,
  ): void;
  readonly layers: ReadonlyMap<string, WebglSurface>;
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
    definition: compositionEffectDefinition(plugin.id)!,
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
  meshEffectKernel(id) ??
  noiseEffectKernel(id) ??
  stylizeEffectKernel(id) ??
  radialDistortionKernel(id) ??
  shadowEffectKernel(id) ??
  mapEffectKernel(id);

type EffectControl<S extends { width: number; height: number }> = {
  managed: boolean;
  readbacks?: Set<Uint8Array<ArrayBuffer>> | undefined;
  surfaces?: EffectSurfaces<S> | undefined;
  inputs?: Map<string, S> | undefined;
  context?: GpuEffectContext | CanvasEffectContext | undefined;
  copy?: S[] | undefined;
  slots?: string[] | undefined;
  input?: S | undefined;
  output?: S | undefined;
};
function clearEffectControl<S extends { width: number; height: number }>(
  phase: EffectControl<S>,
) {
  phase.surfaces?.clearReferences();
  phase.inputs?.clear();
  phase.readbacks?.clear();
  phase.readbacks = undefined;
  if (phase.copy) phase.copy.length = 0;
  if (phase.slots) phase.slots.length = 0;
  if (phase.context) {
    const context = phase.context as unknown as Record<string, unknown>;
    for (const name in context) delete context[name];
  }
  phase.surfaces =
    phase.inputs =
    phase.context =
    phase.copy =
    phase.slots =
      undefined;
  phase.input = phase.output = undefined;
}
function effectControl<S extends { width: number; height: number }>() {
  // Original callback limit is 32 surfaces: Set/snapshot slots, at most 31
  // copied-layer Map entries, and fixed controller/context/function/view refs.
  return allocateRenderMetadata<EffectControl<S>>(
    8192,
    () => ({ managed: renderMemory() !== undefined }),
    false,
    clearEffectControl,
  );
}
function finishEffectControl<S extends { width: number; height: number }>(
  phase: EffectControl<S>,
  primaryFailed: boolean,
) {
  let failed = false,
    first: unknown;
  for (const pixels of phase.readbacks ?? []) {
    try {
      releaseRenderPixels(pixels);
    } catch (error) {
      if (!failed) {
        failed = true;
        first = error;
      }
    }
  }
  phase.readbacks?.clear();
  try {
    phase.surfaces?.dispose();
  } catch (error) {
    if (!failed) {
      failed = true;
      first = error;
    }
  }
  try {
    if (phase.managed) releaseRenderMetadata(phase);
    else clearEffectControl(phase);
  } catch (error) {
    if (!failed) {
      failed = true;
      first = error;
    }
  }
  if (failed && !primaryFailed) throw first;
}
function effectCopy(
  phase: EffectControl<WebglSurface>,
  device: WebglDevice,
  output: WebglSurface,
  source: WebglSurface,
) {
  try {
    device.pass(COPY, output, (phase.copy = [source]));
  } finally {
    if (phase.copy) phase.copy.length = 0;
    phase.copy = undefined;
  }
}

/** A callback owns at most 32 surfaces and 128 MiB (or four full-size frames). */
class EffectSurfaces<S extends { width: number; height: number }> {
  private owned: Set<S> | undefined = new Set<S>();
  private dimensions: number[] | undefined;
  private snapshot: S[] | undefined;
  private pixels = 0;
  private closed = false;
  private readonly maximum: number;
  constructor(
    input: S,
    private allocate: ((width: number, height: number) => S) | undefined,
    private release: ((surface: S) => void) | undefined,
  ) {
    this.maximum = Math.max(32 * 1024 * 1024, input.width * input.height * 4);
  }
  create = (width: number, height: number): S => {
    if (this.closed)
      throw Error("comp-effect-surface: callback controls are disposed");
    try {
      this.dimensions = [width, height];
      if (
        !this.dimensions.every(
          (n) => Number.isSafeInteger(n) && n > 0 && n <= 8192,
        ) ||
        this.owned!.size >= 32 ||
        this.pixels + width * height > this.maximum
      )
        throw Error("comp-effect-surface: scratch surface budget exceeded");
      const surface = this.allocate!(width, height);
      try {
        this.owned!.add(surface);
      } catch (error) {
        try {
          this.owned!.delete(surface);
        } catch {
          /* Preserve original Set insertion failure. */
        }
        try {
          this.release!(surface);
        } catch {
          /* Preserve original Set insertion failure. */
        }
        throw error;
      }
      this.pixels += width * height;
      return surface;
    } finally {
      if (this.dimensions) this.dimensions.length = 0;
      this.dimensions = undefined;
    }
  };
  require(surface: S): void {
    if (!this.owned?.has(surface))
      throw Error(
        "comp-effect-surface: surface must belong to this callback and remain unreleased",
      );
  }
  remove = (surface: S): void => {
    this.require(surface);
    this.owned!.delete(surface);
    this.pixels -= surface.width * surface.height;
    this.release!(surface);
  };
  dispose(): void {
    if (this.closed) return;
    let failed = false,
      first: unknown;
    this.snapshot = [...this.owned!];
    for (const surface of this.snapshot) {
      try {
        this.remove(surface);
      } catch (error) {
        if (!failed) {
          failed = true;
          first = error;
        }
      }
    }
    this.snapshot.length = 0;
    this.snapshot = undefined;
    if (failed) throw first;
  }
  clearReferences(): void {
    this.closed = true;
    this.owned?.clear();
    if (this.dimensions) this.dimensions.length = 0;
    if (this.snapshot) this.snapshot.length = 0;
    this.owned =
      this.dimensions =
      this.snapshot =
      this.allocate =
      this.release =
        undefined;
    this.pixels = 0;
    delete (this as Partial<EffectSurfaces<S>>).create;
    delete (this as Partial<EffectSurfaces<S>>).remove;
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
  layers?: ReadonlyMap<string, WebglSurface>,
): boolean {
  const plugin = checkedPlugin(effect);
  if (!plugin) return false;
  const phase = effectControl<WebglSurface>();
  let failed = false;
  try {
    const surfaces = (phase.surfaces = new EffectSurfaces(
      target,
      (w, h) => device.surface(w, h),
      (s) => device.release(s),
    ));
    const input = (phase.input = surfaces.create(target.width, target.height));
    effectCopy(phase, device, input, target);
    const inputs = (phase.inputs = new Map<string, WebglSurface>());
    for (const slot of plugin.definition.requiresLayers ?? (phase.slots = [])) {
      const source = layers?.get(slot);
      if (
        !source ||
        source.width !== target.width ||
        source.height !== target.height
      )
        throw Error(
          `comp-effect-layer: missing or incompatible input "${slot}"`,
        );
      const copy = surfaces.create(source.width, source.height);
      effectCopy(phase, device, copy, source);
      inputs.set(slot, copy);
    }
    const context: GpuEffectContext = (phase.context = {
      layers: inputs,
      placement: effect.placement,
      readBytes(source) {
        surfaces.require(source);
        if (!phase.readbacks) {
          if (phase.managed) resizeRenderMetadata(phase, 16384);
          phase.readbacks = new Set();
        }
        if (phase.readbacks.size >= 8)
          throw Error("comp-effect-surface: readback budget exceeded");
        const pixels = device.read(source);
        try {
          phase.readbacks.add(pixels);
          return pixels;
        } catch (error) {
          releaseRenderPixels(pixels);
          throw error;
        }
      },
      mesh(output, input, vertices) {
        surfaces.require(output);
        surfaces.require(input);
        drawTexturedMesh(device, output, input, vertices);
      },
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
    });
    const output = (phase.output = plugin.renderGpu(
      context,
      input,
      effect.params,
    ));
    surfaces.require(output);
    if (output.width !== target.width || output.height !== target.height)
      throw Error(
        "comp-effect-surface: output must match the input dimensions",
      );
    effectCopy(phase, device, target, output);
    return true;
  } catch (error) {
    failed = true;
    throw locateMeshError(error, effect[MESH_DIAGNOSTIC_LOCATION]);
  } finally {
    finishEffectControl(phase, failed);
  }
}

/** Transactional reference stage; an absent Canvas implementation is an explicit diagnostic. */
export function renderCanvasEffect(
  context: CanvasEffectContext,
  target: CanvasSurface,
  effect: RenderEffect,
  layers?: ReadonlyMap<string, CanvasSurface>,
): boolean {
  const plugin = checkedPlugin(effect);
  if (!plugin) return false;
  if (!plugin.renderCanvas)
    throw Error(
      `comp-effect-unavailable: ${effect.effect} has no Canvas implementation`,
    );
  const phase = effectControl<CanvasSurface>();
  let failed = false;
  try {
    const surfaces = (phase.surfaces = new EffectSurfaces(
      target,
      (w, h) => context.createSurface(w, h),
      (s) => context.releaseSurface(s),
    ));
    const input = (phase.input = surfaces.create(target.width, target.height));
    input.ctx.drawImage(target.canvas, 0, 0);
    const inputs = (phase.inputs = new Map<string, CanvasSurface>());
    for (const slot of plugin.definition.requiresLayers ?? (phase.slots = [])) {
      const source = layers?.get(slot);
      if (
        !source ||
        source.width !== target.width ||
        source.height !== target.height
      )
        throw Error(
          `comp-effect-layer: missing or incompatible input "${slot}"`,
        );
      const copy = surfaces.create(source.width, source.height);
      copy.ctx.drawImage(source.canvas, 0, 0);
      inputs.set(slot, copy);
    }
    const output = (phase.output = plugin.renderCanvas(
      (phase.context = {
        layers: inputs,
        placement: effect.placement,
        createSurface: surfaces.create,
        releaseSurface: surfaces.remove,
        clear(surface, background) {
          surfaces.require(surface);
          context.clear(surface, background);
        },
      }),
      input,
      effect.params,
    ));
    surfaces.require(output);
    if (output.width !== target.width || output.height !== target.height)
      throw Error(
        "comp-effect-surface: output must match the input dimensions",
      );
    context.clear(target, null);
    target.ctx.drawImage(output.canvas, 0, 0);
    return true;
  } catch (error) {
    failed = true;
    throw locateMeshError(error, effect[MESH_DIAGNOSTIC_LOCATION]);
  } finally {
    finishEffectControl(phase, failed);
  }
}
