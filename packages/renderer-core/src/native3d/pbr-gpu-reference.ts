import type { TextureBinding } from "./pbr-allocations.ts";
import type { NativePbrImage } from "@still-shift/scene-contract";
import {
  allocateRenderPixels,
  createRenderStorage,
  releaseRenderPixels,
  releaseRenderStorage,
} from "../managed-memory-context.ts";

/** Independent current-context mip derivation; filtering is implementation-dependent in GLES. */
export function createNativePbrGpuReference(
  gl: WebGL2RenderingContext,
  image: NativePbrImage,
  colorSpace: "srgb" | "linear",
  sampler: TextureBinding["sampler"],
  copyPixels: (destination: Uint8Array, offset: number) => void,
) {
  const levels = [{ level: 0, width: image.width, height: image.height }];
  while (
    sampler.minFilter >= 9984 &&
    (levels.at(-1)!.width > 1 || levels.at(-1)!.height > 1)
  ) {
    const previous = levels.at(-1)!;
    levels.push({
      level: levels.length,
      width: Math.max(1, Math.floor(previous.width / 2)),
      height: Math.max(1, Math.floor(previous.height / 2)),
    });
  }
  const bytes = levels.reduce(
    (sum, mip) => sum + mip.width * mip.height * 4,
    0,
  );
  const texture = createRenderStorage(
    bytes,
    () => gl.createTexture(),
    (texture) => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, sampler.minFilter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, sampler.magFilter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, sampler.wrapS);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, sampler.wrapT);
      gl.texStorage2D(
        gl.TEXTURE_2D,
        levels.length,
        colorSpace === "srgb" ? gl.SRGB8_ALPHA8 : gl.RGBA8,
        image.width,
        image.height,
      );
      const rows = Math.min(
        image.height,
        Math.max(1, Math.floor(16384 / image.width)),
      );
      for (let row = 0; row < image.height; row += rows) {
        const count = Math.min(rows, image.height - row),
          pixels = allocateRenderPixels(
            image.width * count * 4,
            () => new Uint8Array(image.width * count * 4),
          );
        try {
          copyPixels(pixels, row * image.width * 4);
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0,
            row,
            image.width,
            count,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixels,
          );
        } finally {
          releaseRenderPixels(pixels);
        }
      }
      if (levels.length > 1) gl.generateMipmap(gl.TEXTURE_2D);
      if (gl.getError() !== gl.NO_ERROR)
        throw Error(
          "comp-native3d-texture: independent mip reference upload failed",
        );
    },
    (texture) => gl.deleteTexture(texture),
    false,
  );
  return {
    texture,
    levels,
    dispose() {
      releaseRenderStorage(texture, (texture) => gl.deleteTexture(texture));
    },
  };
}
