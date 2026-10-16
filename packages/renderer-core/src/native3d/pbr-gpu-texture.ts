import type { TextureBinding } from "./pbr-allocations.ts";
import type { NativePbrImage } from "@still-shift/scene-contract";
import { createNativePbrGpuReference } from "./pbr-gpu-reference.ts";
import {
  allocateRenderPixels,
  createRenderStorage,
  releaseRenderPixels,
  releaseRenderStorage,
} from "../managed-memory-context.ts";
const linear = (value: number) => {
  value /= 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
function shader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader)
    throw Error(
      "comp-native3d-limit: cannot allocate texture verification shader",
    );
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    throw Error("comp-native3d-texture: verification shader did not compile");
  }
  return shader;
}
/** Complete used mip storage and transfer, with independent current-environment derivation. */
export function verifyNativePbrGpuTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  image: NativePbrImage,
  colorSpace: "srgb" | "linear",
  pixelsMatch: (actual: Uint8Array, offset: number) => boolean,
  sampler: TextureBinding["sampler"],
  copyPixels: (destination: Uint8Array, offset: number) => void,
) {
  if (!gl.getExtension("EXT_color_buffer_float"))
    throw Error(
      "comp-native3d-texture: float texture verification is unavailable",
    );
  const saved = {
    program: gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null,
    vao: gl.getParameter(
      gl.VERTEX_ARRAY_BINDING,
    ) as WebGLVertexArrayObject | null,
    active: gl.getParameter(gl.ACTIVE_TEXTURE) as number,
    texture: gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null,
    read: gl.getParameter(
      gl.READ_FRAMEBUFFER_BINDING,
    ) as WebGLFramebuffer | null,
    draw: gl.getParameter(
      gl.DRAW_FRAMEBUFFER_BINDING,
    ) as WebGLFramebuffer | null,
    viewport: gl.getParameter(gl.VIEWPORT) as Int32Array,
    blend: gl.isEnabled(gl.BLEND),
    depth: gl.isEnabled(gl.DEPTH_TEST),
    scissor: gl.isEnabled(gl.SCISSOR_TEST),
    cull: gl.isEnabled(gl.CULL_FACE),
    mask: gl.getParameter(gl.COLOR_WRITEMASK) as boolean[],
    readBuffer: gl.getParameter(gl.READ_BUFFER) as number,
    packBuffer: gl.getParameter(
      gl.PIXEL_PACK_BUFFER_BINDING,
    ) as WebGLBuffer | null,
    unpackBuffer: gl.getParameter(
      gl.PIXEL_UNPACK_BUFFER_BINDING,
    ) as WebGLBuffer | null,
    sampler: gl.getParameter(gl.SAMPLER_BINDING) as WebGLSampler | null,
    pixelStore: [
      gl.PACK_ALIGNMENT,
      gl.PACK_ROW_LENGTH,
      gl.PACK_SKIP_PIXELS,
      gl.PACK_SKIP_ROWS,
      gl.UNPACK_ALIGNMENT,
      gl.UNPACK_ROW_LENGTH,
      gl.UNPACK_IMAGE_HEIGHT,
      gl.UNPACK_SKIP_PIXELS,
      gl.UNPACK_SKIP_ROWS,
      gl.UNPACK_SKIP_IMAGES,
      gl.UNPACK_FLIP_Y_WEBGL,
      gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
      gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
    ].map(
      (parameter) => [parameter, Number(gl.getParameter(parameter))] as const,
    ),
  };
  const width = image.width,
    rows = Math.min(image.height, Math.max(1, Math.floor(16384 / width)));
  let objects:
    | {
        framebuffer: WebGLFramebuffer | null;
        output: WebGLTexture | null;
        vao: WebGLVertexArrayObject | null;
        program: WebGLProgram | null;
      }
    | undefined;
  let reference: ReturnType<typeof createNativePbrGpuReference> | undefined;
  let vertex: WebGLShader | undefined, fragment: WebGLShader | undefined;
  try {
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
    gl.bindSampler(saved.active - gl.TEXTURE0, null);
    for (const [parameter] of saved.pixelStore)
      gl.pixelStorei(
        parameter,
        parameter === gl.PACK_ALIGNMENT || parameter === gl.UNPACK_ALIGNMENT
          ? 1
          : parameter === gl.UNPACK_COLORSPACE_CONVERSION_WEBGL
            ? gl.NONE
            : 0,
      );
    reference = createNativePbrGpuReference(
      gl,
      image,
      colorSpace,
      sampler,
      copyPixels,
    );
    objects = createRenderStorage(
      width * rows * 16,
      () => ({
        framebuffer: gl.createFramebuffer(),
        output: gl.createTexture(),
        vao: gl.createVertexArray(),
        program: gl.createProgram(),
      }),
      (objects) => {
        if (
          !objects.framebuffer ||
          !objects.output ||
          !objects.vao ||
          !objects.program
        )
          throw Error(
            "comp-native3d-limit: cannot allocate GPU texture verification resources",
          );
        gl.bindTexture(gl.TEXTURE_2D, objects.output);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, rows);
      },
      (objects) => {
        gl.deleteProgram(objects.program);
        gl.deleteVertexArray(objects.vao);
        gl.deleteTexture(objects.output);
        gl.deleteFramebuffer(objects.framebuffer);
      },
      false,
    );
    const { framebuffer, output, vao, program } = objects;
    vertex = shader(
      gl,
      gl.VERTEX_SHADER,
      "#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}",
    );
    fragment = shader(
      gl,
      gl.FRAGMENT_SHADER,
      "#version 300 es\nprecision highp float;uniform sampler2D inputMap;uniform ivec2 startPixel;uniform ivec2 inputSize;uniform int mipLevel;out vec4 color;void main(){color=all(equal(textureSize(inputMap,mipLevel),inputSize))?texelFetch(inputMap,startPixel+ivec2(gl_FragCoord.xy),mipLevel):vec4(-1.0);}",
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw Error(
        "comp-native3d-texture: actual map cannot be read as an RGBA attachment",
      );
    gl.attachShader(program!, vertex);
    gl.attachShader(program!, fragment);
    gl.linkProgram(program!);
    if (!gl.getProgramParameter(program!, gl.LINK_STATUS))
      throw Error("comp-native3d-texture: verification program did not link");
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.CULL_FACE);
    gl.colorMask(true, true, true, true);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      output,
      0,
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw Error("comp-native3d-texture: verification target is incomplete");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(
      gl.getUniformLocation(program!, "inputMap"),
      saved.active - gl.TEXTURE0,
    );
    let samples = 0,
      maxError = 0;
    const levels = [];
    for (const mip of reference.levels) {
      const storage =
        colorSpace === "srgb" ? ("srgb8-alpha8" as const) : ("rgba8" as const);
      for (const input of [texture, reference.texture]) {
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          input,
          mip.level,
        );
        if (
          gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
        )
          throw Error(
            `comp-native3d-texture: mip ${mip.level} is absent or incomplete`,
          );
        for (const [parameter, expected] of [
          [gl.FRAMEBUFFER_ATTACHMENT_RED_SIZE, 8],
          [gl.FRAMEBUFFER_ATTACHMENT_GREEN_SIZE, 8],
          [gl.FRAMEBUFFER_ATTACHMENT_BLUE_SIZE, 8],
          [gl.FRAMEBUFFER_ATTACHMENT_ALPHA_SIZE, 8],
          [gl.FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE, gl.UNSIGNED_NORMALIZED],
          [
            gl.FRAMEBUFFER_ATTACHMENT_COLOR_ENCODING,
            colorSpace === "srgb" ? gl.SRGB : gl.LINEAR,
          ],
        ] as const)
          if (
            gl.getFramebufferAttachmentParameter(
              gl.FRAMEBUFFER,
              gl.COLOR_ATTACHMENT0,
              parameter,
            ) !== expected
          )
            throw Error(
              `comp-native3d-texture: mip ${mip.level} GPU storage differs from ${storage}`,
            );
      }
      let levelError = 0;
      gl.uniform1i(gl.getUniformLocation(program!, "mipLevel"), mip.level);
      gl.uniform2i(
        gl.getUniformLocation(program!, "inputSize"),
        mip.width,
        mip.height,
      );
      const tileRows = Math.min(
        rows,
        mip.height,
        Math.max(1, Math.floor(16384 / mip.width)),
      );
      for (let row = 0; row < mip.height; row += tileRows) {
        const count = Math.min(tileRows, mip.height - row),
          length = mip.width * count * 4;
        let pixels: Uint8Array | undefined,
          expectedPixels: Uint8Array | undefined,
          values: Float32Array | undefined;
        try {
          pixels = allocateRenderPixels(length, () => new Uint8Array(length));
          expectedPixels = allocateRenderPixels(
            length,
            () => new Uint8Array(length),
          );
          values = allocateRenderPixels(
            length * 4,
            () => new Float32Array(length),
          );
          for (const [input, bytes] of [
            [texture, pixels],
            [reference.texture, expectedPixels],
          ] as const) {
            gl.framebufferTexture2D(
              gl.FRAMEBUFFER,
              gl.COLOR_ATTACHMENT0,
              gl.TEXTURE_2D,
              input,
              mip.level,
            );
            if (
              gl.checkFramebufferStatus(gl.FRAMEBUFFER) !==
              gl.FRAMEBUFFER_COMPLETE
            )
              throw Error(
                `comp-native3d-texture: mip ${mip.level} is absent or incomplete`,
              );
            gl.readPixels(
              0,
              row,
              mip.width,
              count,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              bytes,
            );
          }
          if (
            (mip.level === 0 && !pixelsMatch(pixels, row * mip.width * 4)) ||
            pixels.some((value, index) => value !== expectedPixels![index])
          )
            throw Error(
              `comp-native3d-checksum: actual GPU mip ${mip.level} pixels differ from immutable source derivation`,
            );
          gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            output,
            0,
          );
          gl.viewport(0, 0, mip.width, count);
          gl.uniform2i(gl.getUniformLocation(program!, "startPixel"), 0, row);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.readPixels(0, 0, mip.width, count, gl.RGBA, gl.FLOAT, values);
          for (let offset = 0; offset < values.length; offset++) {
            const encoded = pixels[offset]!,
              expected =
                colorSpace === "srgb" && offset % 4 !== 3
                  ? linear(encoded)
                  : encoded / 255,
              error = Math.abs(values[offset]! - expected);
            if (!Number.isFinite(values[offset]) || error > 0.0001)
              throw Error(
                `comp-native3d-texture: actual mip ${mip.level} size/transfer function differs from the role`,
              );
            levelError = Math.max(levelError, error);
            samples++;
          }
        } finally {
          releaseRenderPixels(values);
          releaseRenderPixels(expectedPixels);
          releaseRenderPixels(pixels);
        }
      }
      maxError = Math.max(maxError, levelError);
      levels.push({
        ...mip,
        storage,
        texels: mip.width * mip.height,
        samples: mip.width * mip.height * 4,
        maxError: levelError,
      });
    }
    if (gl.getError() !== gl.NO_ERROR)
      throw Error("comp-native3d-texture: GPU verification raised a GL error");
    return {
      image: image.id,
      pixelSha256: image.pixelSha256,
      colorSpace,
      samples,
      maxError,
      reference: "native-pbr-current-environment-mips-1" as const,
      levels,
    };
  } finally {
    gl.useProgram(saved.program);
    gl.bindVertexArray(saved.vao);
    gl.activeTexture(saved.active);
    gl.bindTexture(gl.TEXTURE_2D, saved.texture);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, saved.read);
    gl.readBuffer(saved.readBuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, saved.draw);
    gl.viewport(
      ...(saved.viewport as unknown as [number, number, number, number]),
    );
    gl.colorMask(...(saved.mask as [boolean, boolean, boolean, boolean]));
    for (const [cap, enabled] of [
      [gl.BLEND, saved.blend],
      [gl.DEPTH_TEST, saved.depth],
      [gl.SCISSOR_TEST, saved.scissor],
      [gl.CULL_FACE, saved.cull],
    ] as const) {
      if (enabled) gl.enable(cap);
      else gl.disable(cap);
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, saved.packBuffer);
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, saved.unpackBuffer);
    gl.bindSampler(saved.active - gl.TEXTURE0, saved.sampler);
    for (const [parameter, value] of saved.pixelStore)
      gl.pixelStorei(parameter, value);
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    if (objects)
      releaseRenderStorage(objects, (objects) => {
        gl.deleteProgram(objects.program);
        gl.deleteVertexArray(objects.vao);
        gl.deleteTexture(objects.output);
        gl.deleteFramebuffer(objects.framebuffer);
      });
    reference?.dispose();
  }
}
