import type { CompositionBlendMode } from "@still-shift/scene-contract";
import type { Canvas2dBackend, CanvasSurface } from "./canvas2d.ts";
import {
  decodeLinearPixel,
  encodeLinearPixel,
  createLinearBlendKernel,
  createLinearLerpKernel,
} from "./linear-color.ts";
/** Layer boundaries use linear light; intrinsic source paints retain their authored encoding. */
export function installCanvasLinear(
  backend: Canvas2dBackend,
  initial: boolean,
) {
  const raw = { ...backend };
  let linear = initial,
    painting = 0;
  const active = () => linear && !painting;
  const premul = (pixels: Uint8ClampedArray) => {
    for (let i = 0; i < pixels.length; i += 4) {
      const a = pixels[i + 3]!;
      for (let c = 0; c < 3; c++)
        pixels[i + c] = Math.round((pixels[i + c]! * a) / 255);
    }
    return pixels;
  };
  const write = (surface: CanvasSurface, image: ImageData) => {
    for (let i = 0; i < image.data.length; i += 4) {
      const a = image.data[i + 3]!;
      for (let c = 0; c < 3; c++)
        image.data[i + c] = a ? Math.round((image.data[i + c]! * 255) / a) : 0;
    }
    surface.ctx.putImageData(image, 0, 0);
  };
  const composite = (
    source: CanvasSurface,
    dst: CanvasSurface,
    mode: CompositionBlendMode,
    opacity: number,
  ) => {
    const output = dst.ctx.getImageData(0, 0, dst.width, dst.height),
      src = premul(raw.readPixels(source)),
      bytes = premul(output.data);
    const blend = createLinearBlendKernel(mode, opacity);
    for (let i = 0; i < bytes.length; i += 4) blend(src, i, bytes, i, bytes, i);
    write(dst, output);
  };
  const stage = (
    dst: CanvasSurface,
    mode: CompositionBlendMode,
    paint: (source: CanvasSurface) => void,
  ) => {
    const source = raw.createSurface(dst.width, dst.height, dst.rasterMode);
    try {
      painting++;
      try {
        paint(source);
      } finally {
        painting--;
      }
      composite(source, dst, mode, 1);
    } finally {
      raw.releaseSurface(source);
    }
  };
  backend.beginFrame = (root) => {
    linear =
      (root.colorSpace ?? (initial ? "linear-srgb" : "srgb")) === "linear-srgb";
    raw.beginFrame?.(root);
  };
  backend.fillRect = (
    dst,
    m,
    w,
    h,
    color,
    opacity,
    mode,
    clips,
    transforms,
    blur,
  ) => {
    if (!active())
      return raw.fillRect(
        dst,
        m,
        w,
        h,
        color,
        opacity,
        mode,
        clips,
        transforms,
        blur,
      );
    stage(dst, mode, (source) =>
      raw.fillRect(
        source,
        m,
        w,
        h,
        color,
        opacity,
        "normal",
        clips,
        transforms,
        blur,
      ),
    );
  };
  backend.drawImage = (
    dst,
    content,
    m,
    opacity,
    mode,
    clips,
    transforms,
    blur,
  ) => {
    if (!active())
      return raw.drawImage(
        dst,
        content,
        m,
        opacity,
        mode,
        clips,
        transforms,
        blur,
      );
    stage(dst, mode, (source) =>
      raw.drawImage(
        source,
        content,
        m,
        opacity,
        "normal",
        clips,
        transforms,
        blur,
      ),
    );
  };
  backend.drawText = (
    dst,
    content,
    m,
    opacity,
    mode,
    clips,
    transforms,
    blur,
  ) => {
    if (!active())
      return raw.drawText(
        dst,
        content,
        m,
        opacity,
        mode,
        clips,
        transforms,
        blur,
      );
    stage(dst, mode, (source) =>
      raw.drawText(
        source,
        content,
        m,
        opacity,
        "normal",
        clips,
        transforms,
        blur,
      ),
    );
  };
  backend.drawShape = (
    dst,
    content,
    m,
    opacity,
    mode,
    clips,
    transforms,
    blur,
  ) => {
    if (!active())
      return raw.drawShape(
        dst,
        content,
        m,
        opacity,
        mode,
        clips,
        transforms,
        blur,
      );
    stage(dst, mode, (source) =>
      raw.drawShape(
        source,
        content,
        m,
        opacity,
        "normal",
        clips,
        transforms,
        blur,
      ),
    );
  };
  backend.drawProvider = (
    dst,
    content,
    m,
    opacity,
    mode,
    clips,
    transforms,
    blur,
  ) => {
    if (!active())
      return raw.drawProvider(
        dst,
        content,
        m,
        opacity,
        mode,
        clips,
        transforms,
        blur,
      );
    stage(dst, mode, (source) =>
      raw.drawProvider(
        source,
        content,
        m,
        opacity,
        "normal",
        clips,
        transforms,
        blur,
      ),
    );
  };
  backend.fillRects = (dst, ops) => {
    if (!active()) return raw.fillRects!(dst, ops);
    for (const op of ops)
      backend.fillRect(
        dst,
        op.matrix,
        op.content.width,
        op.content.height,
        op.content.color,
        op.opacity,
        op.blend,
        op.clips,
        op.transforms,
        op.paintBlur,
      );
  };
  backend.composite = (src, dst, mode, opacity, m, clips, transforms, blur) => {
    if (!active())
      return raw.composite(src, dst, mode, opacity, m, clips, transforms, blur);
    const source = raw.createSurface(dst.width, dst.height, dst.rasterMode);
    try {
      raw.composite(src, source, "normal", 1, m, clips, transforms, blur);
      composite(source, dst, mode, opacity);
    } finally {
      raw.releaseSurface(source);
    }
  };
  backend.lerp = (dst, src, coverage, opacity) => {
    if (!active()) return raw.lerp(dst, src, coverage, opacity);
    const output = dst.ctx.getImageData(0, 0, dst.width, dst.height),
      bytes = premul(output.data),
      source = premul(raw.readPixels(src)),
      mask = raw.readPixels(coverage),
      scale = Math.round(Math.max(0, Math.min(1, opacity)) * 255) + 1;
    const mix = createLinearLerpKernel();
    for (let i = 0; i < bytes.length; i += 4)
      mix(
        source,
        i,
        bytes,
        i,
        Math.floor((mask[i + 3]! * scale) / 256),
        bytes,
        i,
      );
    write(dst, output);
  };
  let accumulation: Uint32Array | undefined;
  backend.accumulateExposure = (target, count, draw) => {
    if (!linear || count === 1)
      return raw.accumulateExposure(target, count, draw);
    const length = target.width * target.height * 4;
    if (accumulation?.length !== length) accumulation = new Uint32Array(length);
    else accumulation.fill(0);
    const words = new Uint32Array(4);
    let output: ImageData | undefined;
    for (let sample = 0; sample < count; sample++) {
      draw(sample);
      output = target.ctx.getImageData(0, 0, target.width, target.height);
      premul(output.data);
      for (let i = 0; i < length; i += 4) {
        decodeLinearPixel(output.data, i, words);
        for (let c = 0; c < 4; c++)
          accumulation[i + c] = accumulation[i + c]! + words[c]!;
      }
    }
    for (let i = 0; i < length; i += 4) {
      for (let c = 0; c < 4; c++)
        words[c] = Math.round(accumulation[i + c]! / count);
      encodeLinearPixel(words, 0, output!.data, i);
    }
    write(target, output!);
  };
  backend.dispose = () => {
    accumulation = undefined;
    raw.dispose();
  };
}
