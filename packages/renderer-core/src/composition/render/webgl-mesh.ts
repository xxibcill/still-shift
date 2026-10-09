import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../managed-metadata.ts";
import {
  allocateRenderPixels,
  renderMemory,
} from "../../managed-memory-context.ts";
import type { WebglDevice, WebglSurface } from "./webgl-device.ts";
const FRAGMENT = `
vec4 meshPixel(ivec2 p) { ivec2 size=textureSize(source,0); if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,size)))return vec4(0.0); return floor(texelFetch(source,p,0)*255.0+0.5); }
void main() {
  vec2 p=uv-0.5, base=floor(p), weight=p-base; ivec2 at=ivec2(base);
  vec4 value=mix(mix(meshPixel(at),meshPixel(at+ivec2(1,0)),weight.x),mix(meshPixel(at+ivec2(0,1)),meshPixel(at+ivec2(1,1)),weight.x),weight.y);
  pixel=floor(value+0.5)/255.0;
}`;
type Work = {
  device: WebglDevice;
  memory: ReturnType<typeof renderMemory>;
  data?: Float32Array<ArrayBuffer> | undefined;
  controls?: WebglSurface | undefined;
  blend?: number[] | undefined;
  enabled?: boolean | undefined;
};
function clear(work: Work) {
  let failure: unknown,
    failed = false;
  const cleanup = (action: () => void) => {
    try {
      action();
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    }
  };
  const gl = work.device.gl,
    blend = work.blend;
  if (blend) {
    cleanup(() => gl.blendEquationSeparate(blend[0]!, blend[1]!));
    cleanup(() =>
      gl.blendFuncSeparate(blend[2]!, blend[3]!, blend[4]!, blend[5]!),
    );
    cleanup(() => (work.enabled ? gl.enable(gl.BLEND) : gl.disable(gl.BLEND)));
  }
  if (work.controls) cleanup(() => work.device.release(work.controls!));
  if (work.data) cleanup(() => work.memory?.release(work.data!.buffer));
  work.data = work.controls = work.blend = undefined;
  if (failed) throw failure;
}
/** Real textured triangles with ordered premultiplied source-over blending. */
export function drawTexturedMesh(
  device: WebglDevice,
  output: WebglSurface,
  input: WebglSurface,
  vertices: Float32Array<ArrayBuffer>,
) {
  if (
    vertices.length % 12 ||
    vertices.length / 12 > 65536 ||
    !vertices.every(Number.isFinite) ||
    output.screen ||
    input === output
  )
    throw Error("comp-webgl-mesh: invalid or excessive triangle data");
  if (!vertices.length) return;
  const work = allocateRenderMetadata<Work>(
    4096,
    () => ({ device, memory: renderMemory() }),
    false,
    clear,
  );
  let failed = false;
  try {
    const count = vertices.length / 4,
      width = Math.min(768, count),
      height = Math.ceil(count / width);
    work.data = allocateRenderPixels(
      width * height * 16,
      () => new Float32Array(width * height * 4),
    );
    work.data.set(vertices);
    work.controls = device.surface(width, height, true);
    device.uploadFloats(work.controls, work.data);
    const gl = device.gl;
    work.enabled = gl.isEnabled(gl.BLEND);
    work.blend = [
      gl.getParameter(gl.BLEND_EQUATION_RGB),
      gl.getParameter(gl.BLEND_EQUATION_ALPHA),
      gl.getParameter(gl.BLEND_SRC_RGB),
      gl.getParameter(gl.BLEND_DST_RGB),
      gl.getParameter(gl.BLEND_SRC_ALPHA),
      gl.getParameter(gl.BLEND_DST_ALPHA),
    ] as number[];
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    device.pass(
      FRAGMENT,
      output,
      [input, work.controls],
      { destinationSize: [output.width, output.height] },
      true,
      undefined,
      undefined,
      count,
    );
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    finish(work, failed);
  }
}
function finish(work: Work, failed: boolean) {
  try {
    if (work.memory) releaseRenderMetadata(work);
    else clear(work);
  } catch (error) {
    if (!failed) throw error;
  }
}
