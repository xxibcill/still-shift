import type { ManagedMemory, MemoryLease } from "../../managed-memory.ts";
import type { WebglSurface } from "./webgl-device.ts";
import type { CanvasSurface } from "./canvas2d.ts";
import {
  allocateRenderPixels,
  renderMemory,
} from "../../managed-memory-context.ts";
import {
  gradientControls,
  type GradientControls,
  gradientRank,
  gradientUniforms,
  gradientColorTable,
  GRADIENT_RANK_SHADER,
} from "./gradient-controls.ts";
import { compositionEffectDefinition } from "@still-shift/scene-contract";
import type { Rgba } from "../evaluate/types.ts";
import type { RenderEffect } from "./graph.ts";
import type { CompositionEffectPlugin } from "./effect-plugins.ts";

import {
  allocateRenderMetadata,
  allocateManagedRenderMetadata,
  releaseRenderMetadata,
} from "../../managed-metadata.ts";
type Params = Readonly<
  Record<string, number | readonly number[] | readonly (readonly number[])[]>
>;
function colorGradientUniforms(params: Params) {
  const controls = gradientControls(params);
  let result: ReturnType<typeof gradientUniforms> | undefined,
    failed = false,
    failure: unknown;
  try {
    result = gradientUniforms(controls);
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    try {
      releaseRenderMetadata(controls);
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
  }
  if (failed) {
    try {
      if (result) releaseRenderMetadata(result);
    } catch {
      /* Preserve the original producer/controls cleanup error. */
    }
    throw failure;
  }
  return result!;
}
const unit = (v: number) => Math.max(0, Math.min(1, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const n = (p: Params, key: string) => p[key] as number;
const v = (p: Params, key: string) => p[key] as readonly number[];
type ColorPixelWork = {
  rgb?: number[] | undefined;
  output?: number[] | undefined;
  unitOutput?: number[] | undefined;
  hslKeys?: number[] | undefined;
  hslOutput?: number[] | undefined;
  colorOutput?: Rgba | undefined;
  sliceMethod?: ((start?: number, end?: number) => number[]) | undefined;
  sliceArgs?: number[] | undefined;
  mapper?: ((value: number, index: number) => number) | undefined;
  points?: readonly (readonly number[])[] | undefined;
  black?: readonly number[] | undefined;
  white?: readonly number[] | undefined;
  start?: readonly number[] | undefined;
  end?: readonly number[] | undefined;
  first?: readonly number[] | undefined;
  last?: readonly number[] | undefined;
};
type ColorPixelPhase = ColorPixelWork & {
  managed: boolean;
  producer?: (() => Rgba) | undefined;
};
function clearColorPixelWork(work: ColorPixelWork) {
  if (work.rgb) work.rgb.length = 0;
  if (work.output) work.output.length = 0;
  if (work.unitOutput) work.unitOutput.length = 0;
  if (work.hslKeys) work.hslKeys.length = 0;
  if (work.hslOutput) work.hslOutput.length = 0;
  if (work.colorOutput) (work.colorOutput as number[]).length = 0;
  if (work.sliceArgs) work.sliceArgs.length = 0;
  for (const key in work) delete work[key as keyof ColorPixelWork];
}
function clearColorPixelPhase(phase: ColorPixelPhase) {
  clearColorPixelWork(phase);
  for (const key in phase)
    delete (phase as Partial<ColorPixelPhase>)[key as keyof ColorPixelPhase];
}
function colorPixelMapper(
  work: ColorPixelWork | undefined,
  mapper: (value: number, index: number) => number,
) {
  if (work) work.mapper = mapper;
  return mapper;
}
function colorPixelSlice(pixel: Rgba, work: ColorPixelWork) {
  const method = (work.sliceMethod = pixel.slice);
  const args = (work.sliceArgs = [0, 3]);
  return Reflect.apply(method, pixel, args) as number[];
}

function hueSaturation(
  rgb: readonly number[],
  p: Params,
  work?: ColorPixelWork,
): number[] {
  const maximum = Math.max(...rgb),
    minimum = Math.min(...rgb),
    chroma = maximum - minimum;
  let light = (maximum + minimum) / 2;
  let saturation = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * light - 1));
  let hue =
    chroma === 0
      ? 0
      : maximum === rgb[0]
        ? ((rgb[1]! - rgb[2]!) / chroma) % 6
        : maximum === rgb[1]
          ? (rgb[2]! - rgb[0]!) / chroma + 2
          : (rgb[0]! - rgb[1]!) / chroma + 4;
  hue = (((hue / 6 + n(p, "hue") / 360) % 1) + 1) % 1;
  saturation = unit(saturation * (1 + n(p, "saturation") / 100));
  const change = n(p, "lightness") / 100;
  light = unit(light + (change >= 0 ? 1 - light : light) * change);
  const outputChroma = (1 - Math.abs(2 * light - 1)) * saturation;
  const keys = [0, 4, 2];
  if (work) work.hslKeys = keys;
  const result = keys.map(
    colorPixelMapper(
      work,
      (offset) =>
        unit(Math.abs(((hue * 6 + offset) % 6) - 3) - 1) * outputChroma +
        light -
        outputChroma / 2,
    ),
  );
  if (work) work.hslOutput = result;
  return result;
}
/** Recover stored premultiplied bytes, then round straight channels with explicit half-up ties.
 * Canvas readback uses platform unpremultiplication rounding at half-byte boundaries.
 */
export function colorEffectChannel(channel: number, alpha: number): number {
  return alpha
    ? Math.floor((Math.round((channel * alpha) / 255) * 255) / alpha + 0.5) /
        255
    : 0;
}

/** Straight normalized sRGB reference, independent of Canvas raster operations. */
export function colorEffectPixel(
  id: string,
  pixel: Rgba,
  p: Params,
  x: number,
  y: number,
  work?: ColorPixelWork,
): Rgba {
  if (work || !renderMemory())
    return produceColorEffectPixel(id, pixel, p, x, y, work);
  const phase = allocateRenderMetadata<ColorPixelPhase>(
    4096,
    () => ({ managed: true }),
    false,
    clearColorPixelPhase,
  );
  let result: Rgba | undefined,
    failed = false,
    failure: unknown;
  try {
    result = allocateRenderMetadata<Rgba>(
      512,
      (phase.producer = () =>
        produceColorEffectPixel(id, pixel, p, x, y, phase)),
      false,
      (value) => {
        (value as number[]).length = 0;
      },
    );
    phase.colorOutput = undefined;
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    try {
      releaseRenderMetadata(phase);
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
  }
  if (failed) {
    try {
      if (result) releaseRenderMetadata(result);
    } catch {
      /* Preserve the first producer/admission/cleanup error. */
    }
    throw failure;
  }
  return result!;
}
function produceColorEffectPixel(
  id: string,
  pixel: Rgba,
  p: Params,
  x: number,
  y: number,
  work?: ColorPixelWork,
): Rgba {
  const rgb = work ? colorPixelSlice(pixel, work) : pixel.slice(0, 3);
  if (work) work.rgb = rgb;
  let output: number[];
  switch (id) {
    case "color.curves": {
      const points = p.curve as readonly (readonly number[])[];
      if (work) work.points = points;
      output = rgb.map(
        colorPixelMapper(work, (value) => {
          let mapped = points.at(-1)![1]!;
          for (let i = 1; i < points.length; i++) {
            const first = points[i - 1]!,
              last = points[i]!;
            if (value <= last[0]!) {
              mapped = mix(
                first[1]!,
                last[1]!,
                unit((value - first[0]!) / (last[0]! - first[0]!)),
              );
              break;
            }
          }
          return mix(value, mapped, n(p, "amount"));
        }),
      );
      break;
    }
    case "color.levels": {
      const black = n(p, "inputBlack"),
        span = n(p, "inputWhite") - black;
      output = rgb.map(
        colorPixelMapper(work, (value) =>
          mix(
            n(p, "outputBlack"),
            n(p, "outputWhite"),
            Math.pow(
              Math.abs(span) < 1e-7
                ? value >= black
                  ? 1
                  : 0
                : unit((value - black) / span),
              1 / n(p, "gamma"),
            ),
          ),
        ),
      );
      break;
    }
    case "color.tint": {
      const luminance = rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
      const black = v(p, "black");
      if (work) work.black = black;
      const white = v(p, "white");
      if (work) work.white = white;
      const strength = n(p, "amount") * mix(black[3]!, white[3]!, luminance);
      output = rgb.map(
        colorPixelMapper(work, (value, c) =>
          mix(value, mix(black[c]!, white[c]!, luminance), strength),
        ),
      );
      break;
    }
    case "color.hue-saturation":
      output = hueSaturation(rgb, p, work);
      break;
    case "color.exposure":
      output = rgb.map(
        colorPixelMapper(work, (value) =>
          Math.pow(
            unit(value * 2 ** n(p, "exposure") + n(p, "offset")),
            1 / n(p, "gamma"),
          ),
        ),
      );
      break;
    case "color.brightness-contrast": {
      const contrast = n(p, "contrast"),
        factor =
          contrast >= 0 ? 1 / Math.max(0.001, 1 - contrast) : 1 + contrast;
      output = rgb.map(
        colorPixelMapper(
          work,
          (value) => (value - 0.5) * factor + 0.5 + n(p, "brightness"),
        ),
      );
      break;
    }
    case "color.fill":
      output = rgb.map(
        colorPixelMapper(work, (value, c) =>
          mix(value, v(p, "color")[c]!, n(p, "amount") * v(p, "color")[3]!),
        ),
      );
      break;
    case "color.gradient-ramp": {
      const start = v(p, "start");
      if (work) work.start = start;
      const end = v(p, "end");
      if (work) work.end = end;
      const dx = end[0]! - start[0]!,
        dy = end[1]! - start[1]!,
        length = dx * dx + dy * dy;
      const t =
        length === 0
          ? 0
          : unit(((x - start[0]!) * dx + (y - start[1]!) * dy) / length);
      const first = v(p, "startColor");
      if (work) work.first = first;
      const last = v(p, "endColor");
      if (work) work.last = last;
      const strength = n(p, "amount") * mix(first[3]!, last[3]!, t);
      output = rgb.map(
        colorPixelMapper(work, (value, c) =>
          mix(value, mix(first[c]!, last[c]!, t), strength),
        ),
      );
      break;
    }
    case "color.invert":
      output = rgb.map(
        colorPixelMapper(work, (value) =>
          mix(value, 1 - value, n(p, "amount")),
        ),
      );
      break;
    case "color.posterize":
      output = rgb.map(
        colorPixelMapper(
          work,
          (value) =>
            Math.floor(value * (n(p, "levels") - 1) + 0.5) /
            (n(p, "levels") - 1),
        ),
      );
      break;
    default:
      throw Error(`comp-effect-unavailable: unknown color kernel ${id}`);
  }
  if (work) work.output = output;
  const result = [] as unknown as Rgba;
  if (work) work.colorOutput = result;
  const mapped = output.map(colorPixelMapper(work, unit));
  if (work) work.unitOutput = mapped;
  let index = 0;
  for (const value of mapped) result[index++] = value;
  result[index] = pixel[3];
  return result;
}
type ColorGpuEntries = [string, Params[string]][];
type ColorGpuUniforms = Record<string, number | readonly number[]>;
type ColorGpuWork = {
  managed: boolean;
  memory?: ManagedMemory | undefined;
  pixel: ColorPixelWork;
  entryCount: number;
  entryBytes: number;
  entriesLease?: MemoryLease | undefined;
  entriesProducer?: (() => ColorGpuEntries) | undefined;
  handler?: ProxyHandler<Params> | undefined;
  receiver?: Params | undefined;
  enumerationKeys?: (string | symbol)[] | undefined;
  descriptor?: PropertyDescriptor | undefined;
  entries?: ColorGpuEntries | undefined;
  filtered?: ColorGpuEntries | undefined;
  filterCallback?: ((entry: [string, Params[string]]) => boolean) | undefined;
  filterProducer?: (() => ColorGpuEntries) | undefined;
  uniforms?: ColorGpuUniforms | undefined;
  uniformsProducer?: (() => ColorGpuUniforms) | undefined;
  combined?: ColorGpuUniforms | undefined;
  combinedProducer?: (() => ColorGpuUniforms) | undefined;
  gradient?: ReturnType<typeof gradientUniforms> | undefined;
  output?: WebglSurface | undefined;
  transfer?: WebglSurface | undefined;
  inputs?: WebglSurface[] | undefined;
  bytes?: Uint8Array<ArrayBuffer> | undefined;
  pixelLease?: MemoryLease | undefined;
  pixelProducer?: (() => Uint8Array<ArrayBuffer>) | undefined;
  sourcePixel?: Rgba | undefined;
  shader?: string | undefined;
};
function clearColorGpuEntries(entries: ColorGpuEntries) {
  for (let i = 0; i < entries.length; i++) (entries[i] as unknown[]).length = 0;
  entries.length = 0;
}
function clearColorGpuUniforms(uniforms: ColorGpuUniforms) {
  for (const key in uniforms) delete uniforms[key];
}
function clearColorGpuWork(work: ColorGpuWork) {
  let failed = false,
    failure: unknown;
  if (work.combined) {
    try {
      releaseRenderMetadata(work.combined);
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
    clearColorGpuUniforms(work.combined);
  }
  if (work.gradient) {
    try {
      releaseRenderMetadata(work.gradient);
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
  }
  if (work.uniforms) {
    try {
      releaseRenderMetadata(work.uniforms);
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
    clearColorGpuUniforms(work.uniforms);
  }
  if (work.filtered) {
    try {
      releaseRenderMetadata(work.filtered);
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
    work.filtered.length = 0;
  }
  if (work.entries) {
    try {
      releaseRenderMetadata(work.entries);
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
    clearColorGpuEntries(work.entries);
  }
  clearColorPixelWork(work.pixel);
  if (work.sourcePixel) (work.sourcePixel as number[]).length = 0;
  if (work.inputs) work.inputs.length = 0;
  try {
    work.pixelLease?.release();
  } catch (error) {
    if (!failed) {
      failed = true;
      failure = error;
    }
  }
  try {
    if (
      work.bytes &&
      work.memory &&
      !work.memory.owns(work.bytes.buffer) &&
      work.bytes.byteLength
    )
      (
        work.bytes.buffer as ArrayBuffer & {
          transfer(bytes: number): ArrayBuffer;
        }
      ).transfer(0);
  } catch (error) {
    if (!failed) {
      failed = true;
      failure = error;
    }
  }
  if (work.enumerationKeys) work.enumerationKeys.length = 0;
  if (work.descriptor)
    for (const key in work.descriptor)
      delete (work.descriptor as Record<string, unknown>)[key];
  if (work.handler)
    for (const key in work.handler)
      delete (work.handler as Record<string, unknown>)[key];
  for (const key in work)
    delete (work as Partial<ColorGpuWork>)[key as keyof ColorGpuWork];
  if (failed) throw failure;
}
function colorGpuWork(): ColorGpuWork {
  const memory = renderMemory();
  return allocateRenderMetadata<ColorGpuWork>(
    16384,
    () => ({
      managed: !!memory,
      memory,
      pixel: {},
      entryCount: 0,
      entryBytes: 512,
    }),
    false,
    clearColorGpuWork,
  );
}
function finishColorGpuWork(work: ColorGpuWork, failed: boolean) {
  try {
    if (work.managed) releaseRenderMetadata(work);
    else clearColorGpuWork(work);
  } catch (error) {
    if (!failed) throw error;
  }
}
function colorGpuEntries(work: ColorGpuWork, params: Params): ColorGpuEntries {
  if (!work.memory) return (work.entries = Object.entries(params));
  work.handler = {
    ownKeys() {
      return (work.enumerationKeys = Reflect.ownKeys(params));
    },
    getOwnPropertyDescriptor(_target, key) {
      const descriptor = (work.descriptor = Reflect.getOwnPropertyDescriptor(
        params,
        key,
      ));
      // The facade has no properties: only enumerability affects Object.entries.
      if (descriptor) descriptor.configurable = true;
      return descriptor;
    },
    get(_target, key) {
      work.entryCount++;
      work.entryBytes += 256 + 2 * (typeof key === "string" ? key.length : 0);
      work.entriesLease!.resize(work.entryBytes);
      return Reflect.get(params, key, params);
    },
  };
  work.receiver = new Proxy({}, work.handler);
  return allocateManagedRenderMetadata<ColorGpuEntries>(
    work.memory,
    512,
    (work.entriesProducer = () =>
      (work.entries = Object.entries(work.receiver!))),
    false,
    clearColorGpuEntries,
    (lease) => {
      work.entriesLease = lease;
    },
  );
}
function colorGpuUniforms(
  work: ColorGpuWork,
  params: Params,
  definition: NonNullable<ReturnType<typeof compositionEffectDefinition>>,
): ColorGpuUniforms {
  const entries = colorGpuEntries(work, params);
  const count = work.memory ? work.entryCount : entries.length;
  const filtered = allocateRenderMetadata<ColorGpuEntries>(
    512 + 16 * count,
    (work.filterProducer = () =>
      (work.filtered = entries.filter(
        (work.filterCallback = ([name]) =>
          definition.properties[name]!.type !== "curve"),
      ))),
    false,
    (value) => {
      value.length = 0;
    },
  );
  return allocateRenderMetadata<ColorGpuUniforms>(
    512 + 256 * count,
    (work.uniformsProducer = () =>
      (work.uniforms = Object.fromEntries(filtered) as ColorGpuUniforms)),
    false,
    clearColorGpuUniforms,
  );
}
function colorGpuCombined(
  work: ColorGpuWork,
  params: Params,
): ColorGpuUniforms {
  const count = work.memory ? work.entryCount : work.entries!.length;
  return allocateRenderMetadata<ColorGpuUniforms>(
    1536 + 256 * count,
    (work.combinedProducer = () => {
      const result = (work.combined = { ...work.uniforms });
      const gradient = (work.gradient = colorGradientUniforms(params));
      for (const key in gradient) result[key] = gradient[key]!;
      return result;
    }),
    false,
    clearColorGpuUniforms,
  );
}
function colorGpuCurveBytes(work: ColorGpuWork): Uint8Array<ArrayBuffer> {
  if (!work.memory)
    return (work.bytes = allocateRenderPixels(
      1024,
      () => new Uint8Array(1024),
    ));
  const lease = (work.pixelLease = work.memory.reserve("pixels", 1024));
  try {
    work.pixelProducer = () => (work.bytes = new Uint8Array(1024));
    const bytes = work.pixelProducer();
    work.memory.adopt(bytes.buffer, lease, (value) => {
      const backing = value as ArrayBuffer & {
        transfer(bytes: number): ArrayBuffer;
      };
      if (backing.byteLength) backing.transfer(0);
    });
    return bytes;
  } catch (error) {
    try {
      lease.release();
    } catch {
      /* Preserve first factory/adoption error. */
    }
    throw error;
  }
}

type ColorCanvasWork = {
  managed: boolean;
  memory?: ManagedMemory | undefined;
  pixel: ColorPixelWork;
  input?: CanvasSurface | undefined;
  output?: CanvasSurface | undefined;
  image?: ImageData | undefined;
  imageProducer?: (() => ImageData) | undefined;
  backing?: ArrayBuffer | undefined;
  pixelLease?: MemoryLease | undefined;
  gradient?: GradientControls | undefined;
  table?: Uint8Array<ArrayBuffer> | undefined;
  source?: Rgba | undefined;
  gradientKeys?: number[] | undefined;
  gradientMapper?: ((channel: number) => number) | undefined;
  gradientMapped?: number[] | undefined;
  gradientResult?: Rgba | undefined;
};
function clearColorCanvasSample(work: ColorCanvasWork) {
  clearColorPixelWork(work.pixel);
  if (work.source) (work.source as number[]).length = 0;
  if (work.gradientKeys) work.gradientKeys.length = 0;
  if (work.gradientMapped) work.gradientMapped.length = 0;
  if (work.gradientResult) (work.gradientResult as number[]).length = 0;
  work.source =
    work.gradientKeys =
    work.gradientMapped =
    work.gradientResult =
      undefined;
  work.gradientMapper = undefined;
}
function clearColorCanvasWork(work: ColorCanvasWork) {
  let failed = false,
    failure: unknown;
  try {
    work.pixelLease?.release();
  } catch (error) {
    failed = true;
    failure = error;
  }
  try {
    if (work.gradient) releaseRenderMetadata(work.gradient);
  } catch (error) {
    if (!failed) {
      failed = true;
      failure = error;
    }
  }
  try {
    if (
      work.memory &&
      work.backing?.byteLength &&
      !work.memory.owns(work.backing)
    )
      (
        work.backing as ArrayBuffer & { transfer(bytes: number): ArrayBuffer }
      ).transfer(0);
  } catch (error) {
    if (!failed) {
      failed = true;
      failure = error;
    }
  }
  clearColorCanvasSample(work);
  if (work.gradient)
    for (const key in work.gradient)
      delete (work.gradient as Partial<GradientControls>)[
        key as keyof GradientControls
      ];
  for (const key in work)
    delete (work as Partial<ColorCanvasWork>)[key as keyof ColorCanvasWork];
  if (failed) throw failure;
}
function colorCanvasWork(): ColorCanvasWork {
  const memory = renderMemory();
  return allocateRenderMetadata<ColorCanvasWork>(
    16384,
    () => ({ managed: !!memory, memory, pixel: {} }),
    false,
    clearColorCanvasWork,
  );
}
function finishColorCanvasWork(work: ColorCanvasWork, failed: boolean) {
  try {
    if (work.managed) releaseRenderMetadata(work);
    else clearColorCanvasWork(work);
  } catch (error) {
    if (!failed) throw error;
  }
}
function colorCanvasImage(
  work: ColorCanvasWork,
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): ImageData {
  if (!work.memory)
    return (work.image = context.getImageData(0, 0, width, height));
  const lease = (work.pixelLease = work.memory.reserve(
    "pixels",
    Math.abs(width * height) * 4,
  ));
  try {
    work.imageProducer = () =>
      (work.image = context.getImageData(0, 0, width, height));
    const image = work.imageProducer(),
      backing = (work.backing = image.data.buffer as ArrayBuffer);
    work.memory.adopt(backing, lease, (value) => {
      const buffer = value as ArrayBuffer & {
        transfer(bytes: number): ArrayBuffer;
      };
      if (buffer.byteLength) buffer.transfer(0);
    });
    return image;
  } catch (error) {
    try {
      lease.release();
    } catch {
      /* Preserve first native factory/adoption error. */
    }
    throw error;
  }
}

const HSL = `
vec3 adjustHsl(vec3 rgb) {
  float maximum=max(max(rgb.r,rgb.g),rgb.b),minimum=min(min(rgb.r,rgb.g),rgb.b),chroma=maximum-minimum;
  float light=(maximum+minimum)*0.5;
  float sat=chroma==0.0?0.0:chroma/(1.0-abs(2.0*light-1.0));
  float h=chroma==0.0?0.0:maximum==rgb.r?(rgb.g-rgb.b)/chroma:maximum==rgb.g?(rgb.b-rgb.r)/chroma+2.0:(rgb.r-rgb.g)/chroma+4.0;
  h=mod(h/6.0+hue/360.0,1.0);
  sat=clamp(sat*(1.0+saturation/100.0),0.0,1.0);
  float change=lightness/100.0;
  light=clamp(light+(change>=0.0?1.0-light:light)*change,0.0,1.0);
  float c=(1.0-abs(2.0*light-1.0))*sat;
  return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0)*c+light-c*0.5;
}`;
const fragments: Readonly<Record<string, string>> = {
  "color.curves": `result=vec3(
    texelFetch(backdrop,ivec2(int(floor(rgb.r*255.0+0.5)),0),0).r,
    texelFetch(backdrop,ivec2(int(floor(rgb.g*255.0+0.5)),0),0).r,
    texelFetch(backdrop,ivec2(int(floor(rgb.b*255.0+0.5)),0),0).r);`,
  "color.levels": `float span=inputWhite-inputBlack; vec3 corrected;
    if(abs(span)<1e-7) corrected=step(vec3(inputBlack),rgb);
    else corrected=clamp((rgb-inputBlack)/span,0.0,1.0);
    result=mix(vec3(outputBlack),vec3(outputWhite),pow(corrected,vec3(1.0/gamma)));`,
  "color.tint": `float l=dot(rgb,vec3(0.2126,0.7152,0.0722));result=mix(rgb,mix(black.rgb,white.rgb,l),amount*mix(black.a,white.a,l));`,
  "color.hue-saturation": `result=adjustHsl(rgb);`,
  "color.exposure": `result=pow(clamp(rgb*exp2(exposure)+offset,0.0,1.0),vec3(1.0/gamma));`,
  "color.brightness-contrast": `float factor=contrast>=0.0?1.0/max(0.001,1.0-contrast):1.0+contrast;result=(rgb-0.5)*factor+0.5+brightness;`,
  "color.fill": `result=mix(rgb,color.rgb,amount*color.a);`,
  "color.gradient-ramp": `int rank=gradientRank(gl_FragCoord.xy);vec4 ramp=texelFetch(backdrop,ivec2(rank&255,rank>>8),0);result=mix(rgb,ramp.rgb,amount*ramp.a);`,
  "color.invert": `result=mix(rgb,1.0-rgb,amount);`,
  "color.posterize": `result=floor(rgb*(levels-1.0)+0.5)/(levels-1.0);`,
};
const kernels = new Map<string, Readonly<CompositionEffectPlugin>>();
export function colorEffectKernel(
  id: string,
): Readonly<CompositionEffectPlugin> | undefined {
  if (!Object.hasOwn(fragments, id)) return undefined;
  let kernel = kernels.get(id);
  if (kernel) return kernel;
  const definition = compositionEffectDefinition(id)!;
  const declarations = Object.entries(definition.properties)
    .filter(([, property]) => property.type !== "curve")
    .map(
      ([key, property]) =>
        `uniform ${property.type === "scalar" ? "float" : property.type === "vec2" ? "vec2" : "vec4"} ${key};`,
    )
    .join("\n");
  const shader = `${id === "color.gradient-ramp" ? GRADIENT_RANK_SHADER : ""}\n${declarations}\n${id === "color.hue-saturation" ? HSL : ""}\nvoid main(){
    vec4 sourcePixel=texelFetch(source,ivec2(gl_FragCoord.xy),0);
    vec4 stored=floor(sourcePixel*255.0+0.5);
    vec3 rgb=stored.a>0.0?floor(stored.rgb*255.0/stored.a+0.5)/255.0:vec3(0.0), result;
    ${fragments[id]}
    vec3 outputRgbBytes=floor(clamp(result,0.0,1.0)*255.0+0.5)/255.0;
    pixel=bytes(vec4(outputRgbBytes*sourcePixel.a,sourcePixel.a));
  }`;
  kernel = Object.freeze({
    id,
    definition,
    renderGpu(context, input, params) {
      const work = colorGpuWork();
      let failed = false;
      try {
        work.shader = shader;
        const output = (work.output = context.createSurface(
          input.width,
          input.height,
        ));
        const uniforms = colorGpuUniforms(work, params, definition);
        if (id === "color.gradient-ramp") {
          const transfer = (work.transfer = context.createSurface(256, 256));
          context.uploadBytes(transfer, gradientColorTable(params));
          const inputs = (work.inputs = [input, transfer]);
          context.pass(shader, output, inputs, colorGpuCombined(work, params));
        } else if (id === "color.curves") {
          const bytes = colorGpuCurveBytes(work);
          for (let value = 0; value < 256; value++) {
            const result = colorEffectPixel(
              id,
              (work.sourcePixel = [value / 255, value / 255, value / 255, 1]),
              params,
              0,
              0,
              work.pixel,
            );
            try {
              const mapped = result[0];
              bytes[value * 4] = Math.round(mapped * 255);
              bytes[value * 4 + 3] = 255;
            } finally {
              clearColorPixelWork(work.pixel);
              (work.sourcePixel as number[]).length = 0;
              work.sourcePixel = undefined;
            }
          }
          const transfer = (work.transfer = context.createSurface(256, 1));
          context.uploadBytes(transfer, bytes);
          context.pass(
            shader,
            output,
            (work.inputs = [input, transfer]),
            uniforms,
          );
        } else context.pass(shader, output, (work.inputs = [input]), uniforms);
        return output;
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        finishColorGpuWork(work, failed);
      }
    },
    renderCanvas(context, input, params: RenderEffect["params"]) {
      const work = colorCanvasWork();
      let failed = false;
      try {
        work.input = input;
        const output = (work.output = context.createSurface(
          input.width,
          input.height,
        ));
        const image = colorCanvasImage(
          work,
          input.ctx,
          input.width,
          input.height,
        );
        const gradient = (work.gradient =
          id === "color.gradient-ramp" ? gradientControls(params) : undefined);
        const table = (work.table = gradient
          ? gradientColorTable(params)
          : undefined);
        for (let y = 0; y < input.height; y++)
          for (let x = 0; x < input.width; x++) {
            const i = (y * input.width + x) * 4;
            const source = (work.source = [] as unknown as Rgba);
            source[0] = colorEffectChannel(image.data[i]!, image.data[i + 3]!);
            source[1] = colorEffectChannel(
              image.data[i + 1]!,
              image.data[i + 3]!,
            );
            source[2] = colorEffectChannel(
              image.data[i + 2]!,
              image.data[i + 3]!,
            );
            source[3] = image.data[i + 3]! / 255;
            try {
              let result: Rgba;
              if (gradient && table) {
                const index = gradientRank(gradient, x + 0.5, y + 0.5) * 4,
                  strength =
                    ((params.amount as number) * table[index + 3]!) / 255;
                const keys = (work.gradientKeys = [0, 1, 2]);
                const mapped = (work.gradientMapped = keys.map(
                  (work.gradientMapper = (c) =>
                    unit(
                      source[c]! +
                        (table[index + c]! / 255 - source[c]!) * strength,
                    )),
                ));
                result = work.gradientResult = mapped.concat(source[3]) as Rgba;
              } else
                result = colorEffectPixel(
                  id,
                  source,
                  params,
                  x + 0.5,
                  y + 0.5,
                  work.pixel,
                );
              for (let channel = 0; channel < 4; channel++)
                image.data[i + channel] = Math.round(result[channel]! * 255);
            } finally {
              clearColorCanvasSample(work);
            }
          }
        output.ctx.putImageData(image, 0, 0);
        return output;
      } catch (error) {
        failed = true;
        throw error;
      } finally {
        finishColorCanvasWork(work, failed);
      }
    },
  } satisfies CompositionEffectPlugin);
  kernels.set(id, kernel);
  return kernel;
}
