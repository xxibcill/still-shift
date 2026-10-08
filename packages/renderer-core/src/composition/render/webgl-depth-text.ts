import { renderMemory } from "../../managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  resizeRenderMetadata,
} from "../../managed-metadata.ts";

type RendererProbe = {
  managed: boolean;
  extension?: { UNMASKED_RENDERER_WEBGL: number } | null | undefined;
  test?: RegExp | undefined;
};
function clearRendererProbe(value: RendererProbe) {
  value.extension = value.test = undefined;
}

/** Keep the original renderer query and SwiftShader predicate, with pre-query text capacity. */
export function depthSoftwareRenderer(gl: WebGL2RenderingContext) {
  const phase = allocateRenderMetadata<RendererProbe>(
    1024,
    () => ({ managed: renderMemory() !== undefined }),
    false,
    clearRendererProbe,
  );
  try {
    const info = (phase.extension = gl.getExtension(
      "WEBGL_debug_renderer_info",
    ));
    if (!info) return info;
    phase.test = /SwiftShader/;
    const text = allocateRenderMetadata<{ value?: string | undefined }>(
      // The extension returns DOMString; String(string) keeps the same value.
      // The pinned 64-bit V8 profile permits fewer than 2^29 UTF16 units.
      2 * 2 ** 29 + 1024,
      () => ({}),
      false,
      (value) => {
        value.value = undefined;
      },
    );
    try {
      text.value = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
      return phase.test.test(text.value);
    } finally {
      if (phase.managed) releaseRenderMetadata(text);
      else text.value = undefined;
    }
  } finally {
    if (phase.managed) releaseRenderMetadata(phase);
    else clearRendererProbe(phase);
  }
}

/** Retain the actual propagated Error/message until allocator cleanup, preserving native fallback text. */
export function depthProgramDiagnostic(
  gl: WebGL2RenderingContext,
  handle: WebGLShader | WebGLProgram,
  shader: boolean,
) {
  const phase = allocateRenderMetadata<{
    log: string | null | undefined;
    error: Error | undefined;
  }>(
    4 * 2 ** 29 + 1024,
    () => ({ log: undefined, error: undefined }),
    true,
    (value) => {
      value.log = value.error = undefined;
    },
  );
  try {
    phase.log = shader
      ? gl.getShaderInfoLog(handle)
      : gl.getProgramInfoLog(handle);
    phase.error = new Error(
      phase.log ??
        (shader
          ? "Depth shader compilation failed"
          : "Depth shader link failed"),
    );
    phase.log = undefined;
    resizeRenderMetadata(phase, 512 + 2 * phase.error.message.length);
    return phase.error;
  } catch (error) {
    try {
      releaseRenderMetadata(phase);
    } catch {
      /* Preserve original native log/Error factory failure. */
    }
    throw error;
  }
}
