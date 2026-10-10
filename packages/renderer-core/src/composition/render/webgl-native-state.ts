import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../managed-metadata.ts";

type TextureBindings = {
  two: WebGLTexture | null;
  cube: WebGLTexture | null;
  three: WebGLTexture | null;
  array: WebGLTexture | null;
  sampler: WebGLSampler | null;
};
/** Complete WebGL2 state touched by Three, its uploads and public framebuffer transfer. */
export function captureNativeGlState(gl: WebGL2RenderingContext) {
  const units = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS) as number;
  const state = allocateRenderMetadata(
    8192 + units * 256,
    () => {
      const get = (parameter: number) => gl.getParameter(parameter);
      const activeTexture = get(gl.ACTIVE_TEXTURE) as number;
      const textures: TextureBindings[] = [];
      try {
        for (let unit = 0; unit < units; unit++) {
          gl.activeTexture(gl.TEXTURE0 + unit);
          textures.push({
            two: get(gl.TEXTURE_BINDING_2D),
            cube: get(gl.TEXTURE_BINDING_CUBE_MAP),
            three: get(gl.TEXTURE_BINDING_3D),
            array: get(gl.TEXTURE_BINDING_2D_ARRAY),
            sampler: get(gl.SAMPLER_BINDING),
          });
        }
      } finally {
        gl.activeTexture(activeTexture);
      }
      const flags = [
        gl.BLEND,
        gl.CULL_FACE,
        gl.DEPTH_TEST,
        gl.DITHER,
        gl.POLYGON_OFFSET_FILL,
        gl.SAMPLE_ALPHA_TO_COVERAGE,
        gl.SAMPLE_COVERAGE,
        gl.SCISSOR_TEST,
        gl.STENCIL_TEST,
        gl.RASTERIZER_DISCARD,
      ].map((flag) => [flag, gl.isEnabled(flag)] as const);
      const stores = [
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
      ].map((key) => [key, get(key)] as const);
      const drawFramebuffer = get(
        gl.DRAW_FRAMEBUFFER_BINDING,
      ) as WebGLFramebuffer | null;
      const drawBuffers = Array.from(
        { length: drawFramebuffer ? (get(gl.MAX_DRAW_BUFFERS) as number) : 1 },
        (_, index) => get(gl.DRAW_BUFFER0 + index) as number,
      );
      return {
        activeTexture,
        textures,
        flags,
        stores,
        drawBuffers,
        drawFramebuffer,
        readFramebuffer: get(
          gl.READ_FRAMEBUFFER_BINDING,
        ) as WebGLFramebuffer | null,
        readBuffer: get(gl.READ_BUFFER) as number,
        renderbuffer: get(gl.RENDERBUFFER_BINDING) as WebGLRenderbuffer | null,
        vao: get(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null,
        program: get(gl.CURRENT_PROGRAM) as WebGLProgram | null,
        arrayBuffer: get(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null,
        elementBuffer: get(
          gl.ELEMENT_ARRAY_BUFFER_BINDING,
        ) as WebGLBuffer | null,
        packBuffer: get(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer | null,
        unpackBuffer: get(gl.PIXEL_UNPACK_BUFFER_BINDING) as WebGLBuffer | null,
        viewport: Array.from(get(gl.VIEWPORT) as Int32Array),
        scissor: Array.from(get(gl.SCISSOR_BOX) as Int32Array),
        clear: Array.from(get(gl.COLOR_CLEAR_VALUE) as Float32Array),
        colorMask: Array.from(get(gl.COLOR_WRITEMASK) as boolean[]),
        blendColor: Array.from(get(gl.BLEND_COLOR) as Float32Array),
        blendSrcRgb: get(gl.BLEND_SRC_RGB) as number,
        blendDstRgb: get(gl.BLEND_DST_RGB) as number,
        blendSrcAlpha: get(gl.BLEND_SRC_ALPHA) as number,
        blendDstAlpha: get(gl.BLEND_DST_ALPHA) as number,
        blendRgb: get(gl.BLEND_EQUATION_RGB) as number,
        blendAlpha: get(gl.BLEND_EQUATION_ALPHA) as number,
        depthFunc: get(gl.DEPTH_FUNC) as number,
        depthMask: get(gl.DEPTH_WRITEMASK) as boolean,
        depthRange: Array.from(get(gl.DEPTH_RANGE) as Float32Array),
        depthClear: get(gl.DEPTH_CLEAR_VALUE) as number,
        cullFace: get(gl.CULL_FACE_MODE) as number,
        frontFace: get(gl.FRONT_FACE) as number,
        stencilClear: get(gl.STENCIL_CLEAR_VALUE) as number,
        stencilFront: [
          get(gl.STENCIL_FUNC),
          get(gl.STENCIL_REF),
          get(gl.STENCIL_VALUE_MASK),
          get(gl.STENCIL_WRITEMASK),
          get(gl.STENCIL_FAIL),
          get(gl.STENCIL_PASS_DEPTH_FAIL),
          get(gl.STENCIL_PASS_DEPTH_PASS),
        ] as number[],
        stencilBack: [
          get(gl.STENCIL_BACK_FUNC),
          get(gl.STENCIL_BACK_REF),
          get(gl.STENCIL_BACK_VALUE_MASK),
          get(gl.STENCIL_BACK_WRITEMASK),
          get(gl.STENCIL_BACK_FAIL),
          get(gl.STENCIL_BACK_PASS_DEPTH_FAIL),
          get(gl.STENCIL_BACK_PASS_DEPTH_PASS),
        ] as number[],
        polygonFactor: get(gl.POLYGON_OFFSET_FACTOR) as number,
        polygonUnits: get(gl.POLYGON_OFFSET_UNITS) as number,
        lineWidth: get(gl.LINE_WIDTH) as number,
        sampleCoverage: get(gl.SAMPLE_COVERAGE_VALUE) as number,
        sampleInvert: get(gl.SAMPLE_COVERAGE_INVERT) as boolean,
      };
    },
    false,
    (value) => {
      for (const item of Object.values(value))
        if (Array.isArray(item)) item.length = 0;
      value.drawFramebuffer = value.readFramebuffer = null;
      value.renderbuffer = null;
      value.vao = null;
      value.program = null;
      value.arrayBuffer =
        value.elementBuffer =
        value.packBuffer =
        value.unpackBuffer =
          null;
    },
  );
  let released = false;
  return {
    restore() {
      if (released) return;
      let failed = false,
        first: unknown;
      const attempt = (action: () => void) => {
        try {
          action();
        } catch (error) {
          if (!failed) {
            failed = true;
            first = error;
          }
        }
      };
      try {
        attempt(() =>
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER, state.readFramebuffer),
        );
        attempt(() => gl.readBuffer(state.readBuffer));
        attempt(() =>
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, state.drawFramebuffer),
        );
        attempt(() => gl.drawBuffers(state.drawBuffers));
        attempt(() => gl.bindRenderbuffer(gl.RENDERBUFFER, state.renderbuffer));
        attempt(() => gl.bindVertexArray(state.vao));
        attempt(() => gl.useProgram(state.program));
        attempt(() => gl.bindBuffer(gl.ARRAY_BUFFER, state.arrayBuffer));
        attempt(() =>
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.elementBuffer),
        );
        attempt(() => gl.bindBuffer(gl.PIXEL_PACK_BUFFER, state.packBuffer));
        attempt(() =>
          gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, state.unpackBuffer),
        );
        attempt(() =>
          gl.viewport(
            state.viewport[0]!,
            state.viewport[1]!,
            state.viewport[2]!,
            state.viewport[3]!,
          ),
        );
        attempt(() =>
          gl.scissor(
            state.scissor[0]!,
            state.scissor[1]!,
            state.scissor[2]!,
            state.scissor[3]!,
          ),
        );
        attempt(() =>
          gl.clearColor(
            state.clear[0]!,
            state.clear[1]!,
            state.clear[2]!,
            state.clear[3]!,
          ),
        );
        attempt(() =>
          gl.colorMask(
            state.colorMask[0]!,
            state.colorMask[1]!,
            state.colorMask[2]!,
            state.colorMask[3]!,
          ),
        );
        attempt(() =>
          gl.blendColor(
            state.blendColor[0]!,
            state.blendColor[1]!,
            state.blendColor[2]!,
            state.blendColor[3]!,
          ),
        );
        attempt(() =>
          gl.blendFuncSeparate(
            state.blendSrcRgb,
            state.blendDstRgb,
            state.blendSrcAlpha,
            state.blendDstAlpha,
          ),
        );
        attempt(() =>
          gl.blendEquationSeparate(state.blendRgb, state.blendAlpha),
        );
        attempt(() => gl.depthFunc(state.depthFunc));
        attempt(() => gl.depthMask(state.depthMask));
        attempt(() =>
          gl.depthRange(state.depthRange[0]!, state.depthRange[1]!),
        );
        attempt(() => gl.clearDepth(state.depthClear));
        attempt(() => gl.cullFace(state.cullFace));
        attempt(() => gl.frontFace(state.frontFace));
        attempt(() => gl.clearStencil(state.stencilClear));
        for (const [face, values] of [
          [gl.FRONT, state.stencilFront],
          [gl.BACK, state.stencilBack],
        ] as const) {
          attempt(() =>
            gl.stencilFuncSeparate(face, values[0]!, values[1]!, values[2]!),
          );
          attempt(() => gl.stencilMaskSeparate(face, values[3]!));
          attempt(() =>
            gl.stencilOpSeparate(face, values[4]!, values[5]!, values[6]!),
          );
        }
        attempt(() =>
          gl.polygonOffset(state.polygonFactor, state.polygonUnits),
        );
        attempt(() => gl.lineWidth(state.lineWidth));
        attempt(() =>
          gl.sampleCoverage(state.sampleCoverage, state.sampleInvert),
        );
        for (const [flag, enabled] of state.flags) {
          if (enabled) attempt(() => gl.enable(flag));
          else attempt(() => gl.disable(flag));
        }
        for (const [key, value] of state.stores)
          attempt(() => gl.pixelStorei(key, value));
        for (let unit = 0; unit < state.textures.length; unit++) {
          const bindings = state.textures[unit]!;
          attempt(() => gl.activeTexture(gl.TEXTURE0 + unit));
          attempt(() => gl.bindTexture(gl.TEXTURE_2D, bindings.two));
          attempt(() => gl.bindTexture(gl.TEXTURE_CUBE_MAP, bindings.cube));
          attempt(() => gl.bindTexture(gl.TEXTURE_3D, bindings.three));
          attempt(() => gl.bindTexture(gl.TEXTURE_2D_ARRAY, bindings.array));
          attempt(() => gl.bindSampler(unit, bindings.sampler));
        }
        attempt(() => gl.activeTexture(state.activeTexture));
      } finally {
        released = true;
        attempt(() => releaseRenderMetadata(state));
      }
      if (failed) throw first;
    },
  };
}
