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
      // Native-returned DOMString storage is outside application admission until
      // returned; charge its actual retained size before consuming it.
      1024,
      () => ({}),
      false,
      (value) => {
        value.value = undefined;
      },
    );
    try {
      text.value = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
      resizeRenderMetadata(text, 1024 + 2 * text.value.length);
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
    1024,
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
    // The driver owns native query production. Admit retained text and the
    // application Error before constructing it; never reserve V8's maximum string.
    resizeRenderMetadata(phase, 1024 + 4 * (phase.log?.length ?? 32));
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
