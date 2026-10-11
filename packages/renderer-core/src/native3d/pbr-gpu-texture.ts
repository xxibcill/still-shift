import type { NativePbrImage } from "@still-shift/scene-contract";
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
/** Actual GPU storage and transfer function, mip0 only. Returns hashes/counts, never image payloads. */
export function verifyNativePbrGpuTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  image: NativePbrImage,
  colorSpace: "srgb" | "linear",
  pixelsMatch: (actual: Uint8Array, offset: number) => boolean,
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
  };
  const framebuffer = gl.createFramebuffer(),
    output = gl.createTexture(),
    vao = gl.createVertexArray(),
    program = gl.createProgram();
  let vertex: WebGLShader | undefined, fragment: WebGLShader | undefined;
  try {
    if (!framebuffer || !output || !vao || !program)
      throw Error(
        "comp-native3d-limit: cannot allocate GPU texture verification resources",
      );
    vertex = shader(
      gl,
      gl.VERTEX_SHADER,
      "#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}",
    );
    fragment = shader(
      gl,
      gl.FRAGMENT_SHADER,
      "#version 300 es\nprecision highp float;uniform sampler2D inputMap;uniform ivec2 startPixel;out vec4 color;void main(){color=texelFetch(inputMap,startPixel+ivec2(gl_FragCoord.xy),0);}",
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
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw Error("comp-native3d-texture: verification program did not link");
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.CULL_FACE);
    gl.colorMask(true, true, true, true);
    const width = image.width,
      rows = Math.min(image.height, Math.max(1, Math.floor(16384 / width)));
    gl.bindTexture(gl.TEXTURE_2D, output);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, rows);
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
      gl.getUniformLocation(program, "inputMap"),
      saved.active - gl.TEXTURE0,
    );
    let samples = 0,
      maxError = 0;
    for (let row = 0; row < image.height; row += rows) {
      const count = Math.min(rows, image.height - row),
        values = new Float32Array(width * count * 4);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0,
      );
      const pixels = new Uint8Array(width * count * 4);
      gl.readPixels(0, row, width, count, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      if (!pixelsMatch(pixels, row * width * 4))
        throw Error(
          "comp-native3d-checksum: actual GPU texture pixels differ from the manifest",
        );
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        output,
        0,
      );
      gl.viewport(0, 0, width, count);
      gl.uniform2i(gl.getUniformLocation(program, "startPixel"), 0, row);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0, 0, width, count, gl.RGBA, gl.FLOAT, values);
      for (let offset = 0; offset < values.length; offset++) {
        const encoded = pixels[offset]!,
          expected =
            colorSpace === "srgb" && offset % 4 !== 3
              ? linear(encoded)
              : encoded / 255,
          error = Math.abs(values[offset]! - expected);
        if (!Number.isFinite(values[offset]) || error > 0.0001)
          throw Error(
            "comp-native3d-texture: actual GPU transfer function differs from the role",
          );
        maxError = Math.max(maxError, error);
        samples++;
      }
    }
    if (gl.getError() !== gl.NO_ERROR)
      throw Error("comp-native3d-texture: GPU verification raised a GL error");
    return {
      image: image.id,
      pixelSha256: image.pixelSha256,
      colorSpace,
      samples,
      maxError,
      mipLevel: 0,
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
    gl.deleteProgram(program);
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    gl.deleteVertexArray(vao);
    gl.deleteTexture(output);
    gl.deleteFramebuffer(framebuffer);
  }
}
