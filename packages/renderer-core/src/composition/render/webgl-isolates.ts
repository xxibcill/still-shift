import type { IsolateOp } from "./graph.ts";
import type { WebglSurface } from "./webgl-device.ts";
import type { WebglVisualKey } from "./webgl-visual-key.ts";

type Entry = { signature: string; surface: WebglSurface; users: number };

/** Retain one latest immutable isolate per layer, bounded independently of the idle pool. */
export class WebglIsolates {
  private readonly entries = new Map<string, Entry>();
  private readonly owned = new Map<WebglSurface, Entry>();
  private bytes = 0;
  constructor(
    private readonly keys: WebglVisualKey,
    private readonly discard: (surface: WebglSurface) => void,
    private readonly limit = 128 * 1024 * 1024,
  ) {}

  private remove(id: string) {
    const entry = this.entries.get(id)!;
    this.entries.delete(id);
    this.owned.delete(entry.surface);
    this.bytes -= entry.surface.width * entry.surface.height * 4;
    this.discard(entry.surface);
  }

  render(op: IsolateOp, like: WebglSurface, draw: () => WebglSurface) {
    const id = `${op.layer}/${like.width}x${like.height}`;
    const signature = this.keys.of([op.ops, op.effects, op.masks, op.matte]);
    const existing = this.entries.get(id);
    if (existing?.signature === signature) {
      existing.users++;
      this.entries.delete(id);
      this.entries.set(id, existing);
      return existing.surface;
    }
    // A nested consumer may still hold this layer's previous surface.
    if (existing?.users) return draw();
    if (existing) this.remove(id);
    const size = like.width * like.height * 4;
    if (size > this.limit) return draw();
    if (!this.makeRoom(size)) return draw();
    const surface = draw();
    // Rendering this isolate can populate the cache with nested isolates.
    if (!this.makeRoom(size)) return surface;
    const entry = { signature, surface, users: 1 };
    this.entries.set(id, entry);
    this.owned.set(surface, entry);
    this.bytes += size;
    return surface;
  }

  private makeRoom(size: number) {
    while (this.bytes + size > this.limit) {
      const unused = [...this.entries].find(([, entry]) => entry.users === 0);
      if (!unused) return false;
      this.remove(unused[0]);
    }
    return true;
  }

  release(surface: WebglSurface) {
    const entry = this.owned.get(surface);
    if (!entry) return false;
    if (entry.users === 0)
      throw new Error("comp-webgl-cache: surface released twice");
    entry.users--;
    return true;
  }

  dispose() {
    for (const id of this.entries.keys()) this.remove(id);
  }
}
