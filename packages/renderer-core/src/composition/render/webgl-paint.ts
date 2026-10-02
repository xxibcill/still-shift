import type { Bounds } from "../evaluate/types.ts";
import type { WebglBounds } from "./webgl-bounds.ts";
import type { WebglDevice, WebglSurface } from "./webgl-device.ts";
import { unionBounds } from "./webgl-vector-regions.ts";

const PAINT = `uniform vec2 origin; uniform vec2 backdropOrigin; uniform vec4 region;
void main() {
  vec2 p=gl_FragCoord.xy;
  vec4 s=vec4(0.0);
  if(p.x>=region.x && p.y>=region.y && p.x<region.z && p.y<region.w)
    s=floor(texelFetch(source,ivec2(p-origin),0)*255.0+0.5);
  vec4 d=floor(texelFetch(backdrop,ivec2(p-backdropOrigin),0)*255.0+0.5);
  pixel=(s+floor(d*(256.0-s.a)/256.0))/255.0;
}`;

/** Compose prepared primitive bytes with Canvas's integer source-over rounding. */
export class WebglPaint {
  constructor(
    private device: WebglDevice,
    private bounds: WebglBounds,
  ) {}
  hasBackdrop(dst: WebglSurface) {
    return dst.opaque || this.bounds.snapshot(dst) !== null;
  }

  draw(source: WebglSurface, dst: WebglSurface, rect: Bounds) {
    const active = this.device.drawRegion(dst, rect);
    if (!active) return;
    const previous = this.bounds.snapshot(dst);
    const backdrop = dst.screen ? this.device.copyRegion(dst, active) : dst;
    const output = dst.screen
      ? dst
      : this.device.surface(dst.width, dst.height, false, dst.opaque);
    try {
      this.device.pass(
        PAINT,
        output,
        [source, backdrop],
        {
          origin: [rect.left, rect.top],
          backdropOrigin: dst.screen ? [active.left, active.top] : [0, 0],
          region: [rect.left, rect.top, rect.right, rect.bottom],
        },
        false,
        dst.screen ? active : previous ? unionBounds(previous, rect) : rect,
      );
      if (!dst.screen) this.device.swap(dst, output);
      this.bounds.include(dst, rect);
    } finally {
      if (dst.screen) this.device.release(backdrop);
      else this.device.release(output);
    }
  }
}
