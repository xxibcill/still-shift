import { MECHANISM_TEACHING_SHAPE_LIMITS } from "@still-shift/scene-contract";
import {
  allocateRenderPixels,
  renderMemory,
} from "../managed-memory-context.ts";

export interface NativeIndexedColorSubmission {
  readonly mode: number;
  readonly count: number;
  readonly type: number;
  readonly byteOffset: number;
  readonly program: WebGLProgram;
  readonly vao: WebGLVertexArrayObject;
  readonly indexBuffer: WebGLBuffer;
}
export interface NativeUsedAttributeLayout {
  readonly location: number;
  readonly buffer: WebGLBuffer;
  readonly byteLength: number;
  readonly components: 3;
  readonly type: 5126;
  readonly enabled: true;
  readonly normalized: false;
  readonly integer: false;
  readonly divisor: 0;
  readonly stride: 12;
  readonly byteOffset: 0;
}

/** Called inside the owned after-hook, while the submitted program/VAO are still current. */
export function captureNativeUsedIndexedStreams(
  gl: WebGL2RenderingContext,
  submission: NativeIndexedColorSubmission,
  inventory: { readonly vertexCount: number; readonly indexCount: number },
) {
  const { vertexCount, indexCount } = inventory;
  if (
    !Number.isInteger(vertexCount) ||
    vertexCount < 3 ||
    vertexCount > MECHANISM_TEACHING_SHAPE_LIMITS.vertices ||
    !Number.isInteger(indexCount) ||
    indexCount < 3 ||
    indexCount % 3 ||
    indexCount > MECHANISM_TEACHING_SHAPE_LIMITS.triangles * 3
  )
    throw Error(
      "comp-native3d-limit: used stream inventory exceeds the closed profile",
    );
  if (
    submission.mode !== gl.TRIANGLES ||
    submission.type !== gl.UNSIGNED_SHORT ||
    !Number.isInteger(submission.count) ||
    submission.count <= 0 ||
    submission.count % 3 ||
    !Number.isInteger(submission.byteOffset) ||
    submission.byteOffset < 0 ||
    submission.byteOffset % 2 ||
    submission.byteOffset + submission.count * 2 > indexCount * 2
  )
    throw Error(
      "comp-native3d-observation: used submission is not a bounded nonzero indexed triangle draw",
    );
  if (gl.isContextLost())
    throw Error("comp-native3d-observation: used draw context is lost");
  assertNoError(gl);
  if (
    gl.getParameter(gl.CURRENT_PROGRAM) !== submission.program ||
    gl.getParameter(gl.VERTEX_ARRAY_BINDING) !== submission.vao ||
    gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING) !== submission.indexBuffer
  )
    throw Error(
      "comp-native3d-observation: current program/VAO/index buffer differs from the actual submission",
    );
  const previous = gl.getParameter(
    gl.COPY_READ_BUFFER_BINDING,
  ) as WebGLBuffer | null;
  const backing: Uint8Array<ArrayBuffer>[] = [];
  const memory = renderMemory();
  let metadata: ReturnType<NonNullable<typeof memory>["reserve"]> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const bytes of backing) memory?.release(bytes.buffer);
    backing.length = 0;
    metadata?.release();
  };
  function read(buffer: WebGLBuffer, expectedBytes: number) {
    gl.bindBuffer(gl.COPY_READ_BUFFER, buffer);
    const size = gl.getBufferParameter(
      gl.COPY_READ_BUFFER,
      gl.BUFFER_SIZE,
    ) as number;
    if (size !== expectedBytes)
      throw Error(
        "comp-native3d-observation: used buffer byte length differs from the sealed layout",
      );
    assertNoError(gl);
    const bytes = allocateRenderPixels(
      expectedBytes,
      () => new Uint8Array(expectedBytes),
      true,
    );
    backing.push(bytes);
    gl.getBufferSubData(gl.COPY_READ_BUFFER, 0, bytes);
    assertNoError(gl);
    return bytes;
  }
  let result:
    | {
        position: Uint8Array<ArrayBuffer>;
        normal: Uint8Array<ArrayBuffer>;
        indices: Uint8Array<ArrayBuffer>;
        indexBuffer: WebGLBuffer;
        positionLayout: NativeUsedAttributeLayout;
        normalLayout: NativeUsedAttributeLayout;
        dispose: () => void;
      }
    | undefined;
  let failed = false,
    reason: unknown;
  try {
    metadata = memory?.reserve("metadata", 4096, dispose, true);
    const layouts = ["position", "normal"].map((name) =>
      usedAttribute(gl, submission.program, name),
    );
    const position = read(layouts[0]!.buffer, vertexCount * 12);
    const normal = read(layouts[1]!.buffer, vertexCount * 12);
    const indices = read(submission.indexBuffer, indexCount * 2);
    if (new Uint8Array(new Uint16Array([0x1234]).buffer)[0] !== 0x34)
      throw Error(
        "comp-native3d-observation: native GPU packing is not the admitted little-endian profile",
      );
    result = {
      position,
      normal,
      indices,
      indexBuffer: submission.indexBuffer,
      positionLayout: { ...layouts[0]!, byteLength: position.byteLength },
      normalLayout: { ...layouts[1]!, byteLength: normal.byteLength },
      dispose,
    };
  } catch (error) {
    failed = true;
    reason = error;
  }
  try {
    gl.bindBuffer(gl.COPY_READ_BUFFER, previous);
    assertNoError(gl);
  } catch (error) {
    if (!failed) {
      failed = true;
      reason = error;
    }
  }
  if (failed) {
    try {
      dispose();
    } catch {
      /* Preserve the original read or restoration failure. */
    }
    throw reason;
  }
  return result!;
}

function usedAttribute(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
): Omit<NativeUsedAttributeLayout, "byteLength"> {
  const location = gl.getAttribLocation(program, name);
  if (location < 0)
    throw Error(
      `comp-native3d-observation: ${name} is absent or optimized out of the used program`,
    );
  const activeCount = gl.getProgramParameter(
    program,
    gl.ACTIVE_ATTRIBUTES,
  ) as number;
  if (!Number.isInteger(activeCount) || activeCount < 1 || activeCount > 64)
    throw Error(
      "comp-native3d-observation: used active attribute inventory is invalid",
    );
  let active: WebGLActiveInfo | null = null;
  for (let index = 0; index < activeCount; index++) {
    const attribute = gl.getActiveAttrib(program, index);
    if (attribute?.name === name) {
      active = attribute;
      break;
    }
  }
  const buffer = gl.getVertexAttrib(
    location,
    gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING,
  ) as WebGLBuffer | null;
  if (
    !active ||
    active.type !== gl.FLOAT_VEC3 ||
    active.size !== 1 ||
    !buffer ||
    gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_ENABLED) !== true ||
    gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_SIZE) !== 3 ||
    gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_TYPE) !== gl.FLOAT ||
    gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_NORMALIZED) !== false ||
    gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_INTEGER) !== false ||
    gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_DIVISOR) !== 0 ||
    gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_STRIDE) !== 12 ||
    gl.getVertexAttribOffset(location, gl.VERTEX_ATTRIB_ARRAY_POINTER) !== 0
  )
    throw Error(
      `comp-native3d-observation: used ${name} layout is outside the closed packed profile`,
    );
  assertNoError(gl);
  return {
    location,
    buffer,
    components: 3,
    type: 5126,
    enabled: true,
    normalized: false,
    integer: false,
    divisor: 0,
    stride: 12,
    byteOffset: 0,
  };
}

function assertNoError(gl: WebGL2RenderingContext): void {
  const error = gl.getError();
  if (error !== gl.NO_ERROR)
    throw Error(
      `comp-native3d-observation: GL error ${error} while reading used streams`,
    );
}
