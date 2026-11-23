import { passageError } from "../../passage-diagnostics.ts";
import { sourceStagePixels } from "./float-grade.ts";
import type { SceneStage } from "./graph.ts";

/**
 * CG7: a video frame prepared for a color-managed composition, decoded in
 * the page: 16-bit RGBA samples of encoded source RGB over
 * COMPOSITION_SCENE_SAMPLE_RANGE (8 bytes per pixel, counted in
 * `decodedFrameBytes`).
 */
export type SceneFrame = {
  readonly width: number;
  readonly height: number;
  readonly samples: Uint16Array;
};

/**
 * A canonical scene PNG (RGBA16, every row filter 0; its bytes are already
 * verified against the captured SHA-256) → its samples.
 */
export async function decodeSceneFrame(
  bytes: Uint8Array,
  width: number,
  height: number,
  path: string,
): Promise<SceneFrame> {
  const fail = (): never =>
    passageError(
      "comp-media-format",
      "Prepared frame must be canonical RGBA16 PNG",
      {
        path,
      },
    );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [];
  for (let at = 8; at + 12 <= bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (type === "IDAT") parts.push(bytes.subarray(at + 8, at + 8 + length));
    at += length + 12;
  }
  const stream = new Blob(parts as BlobPart[])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  const rows = new Uint8Array(await new Response(stream).arrayBuffer());
  const stride = width * 8 + 1;
  if (rows.length !== stride * height) fail();
  const samples = new Uint16Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    if (rows[y * stride] !== 0) fail();
    const row = y * stride + 1,
      out = y * width * 4;
    for (let i = 0; i < width * 4; i++)
      samples[out + i] = (rows[row + i * 2]! << 8) | rows[row + i * 2 + 1]!;
  }
  return { width, height, samples };
}

/**
 * Source-stage images by frame and stage, a few at a time (a frame pair for
 * blending, its matte and effect-input reuses). Both backends draw from
 * here, so they get the same bytes.
 */
export class SceneImages {
  private readonly cached = new Map<string, HTMLCanvasElement>();
  constructor(
    private readonly make: (width: number, height: number) => HTMLCanvasElement,
    private readonly discard: (canvas: HTMLCanvasElement) => void,
    private readonly limit = 4,
  ) {}
  image(id: string, frame: SceneFrame, stage: SceneStage) {
    const key = `${id}\n${JSON.stringify(stage)}`;
    let canvas = this.cached.get(key);
    if (canvas) {
      this.cached.delete(key);
      this.cached.set(key, canvas);
      return canvas;
    }
    canvas = this.make(frame.width, frame.height);
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(frame.width, frame.height);
    sourceStagePixels(
      frame.samples,
      frame.width,
      frame.height,
      stage,
      image.data,
    );
    ctx.putImageData(image, 0, 0);
    this.cached.set(key, canvas);
    while (this.cached.size > this.limit) {
      const [oldest, old] = this.cached.entries().next().value!;
      this.cached.delete(oldest);
      this.discard(old);
    }
    return canvas;
  }
  dispose() {
    for (const canvas of this.cached.values()) this.discard(canvas);
    this.cached.clear();
  }
}
