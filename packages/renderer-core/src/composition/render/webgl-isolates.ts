import type { IsolateOp } from "./graph.ts";
import type { WebglSurface } from "./webgl-device.ts";
import type { WebglVisualKey } from "./webgl-visual-key.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  resizeRenderMetadata,
  type ManagedMetadataText,
} from "../../managed-metadata.ts";

type Entry = {
  id: { value: string | undefined };
  signature: ManagedMetadataText;
  surface: WebglSurface;
  users: number;
  removed: boolean;
  discard: boolean;
};

/** Retain one latest immutable isolate per layer, bounded independently of the idle pool. */
export class WebglIsolates {
  private readonly state: {
    entries: Map<string, Entry>;
    owned: Map<WebglSurface, Entry>;
  };
  private bytes = 0;
  private closed = false;
  constructor(
    private readonly keys: WebglVisualKey,
    private readonly discard: (surface: WebglSurface) => void,
    private readonly limit = 128 * 1024 * 1024,
  ) {
    this.state = allocateRenderMetadata(
      512,
      () => ({ entries: new Map(), owned: new Map() }),
      false,
      () => this.clear(true),
    );
  }

  private resize(
    entries = this.state.entries.size,
    owned = this.state.owned.size,
  ) {
    resizeRenderMetadata(this.state, 512 + (entries + owned) * 64);
  }
  private destroy(entry: Entry) {
    if (entry.removed) return;
    entry.removed = true;
    try {
      if (entry.discard) this.discard(entry.surface);
    } finally {
      entry.signature.release();
      releaseRenderMetadata(entry.id);
    }
  }

  private remove(id: string) {
    const entry = this.state.entries.get(id)!;
    this.state.entries.delete(id);
    this.state.owned.delete(entry.surface);
    this.bytes -= entry.surface.width * entry.surface.height * 4;
    try {
      this.destroy(entry);
    } finally {
      releaseRenderMetadata(entry);
    }
    if (!this.closed) this.resize();
  }

  render(op: IsolateOp, like: WebglSurface, draw: () => WebglSurface) {
    if (this.closed) throw Error("WebGL isolate cache is disposed");
    const layer = op.layer;
    const idOwner = allocateRenderMetadata(
      128 + 2 * (layer.length + 64),
      () => ({
        value: `${layer}/${like.width}x${like.height}` as string | undefined,
      }),
      true,
      (value) => {
        value.value = undefined;
      },
    );
    let signature: ManagedMetadataText | undefined,
      input: unknown[] | undefined,
      entry: Entry | undefined;
    let retained = false;
    try {
      const id = idOwner.value!;
      input = allocateRenderMetadata(112, () => [
        op.ops,
        op.effects,
        op.masks,
        op.matte,
        ...(op.lighting ? [op.lighting] : []),
      ]);
      signature = this.keys.metadata(input);
      const existing = this.state.entries.get(id);
      if (existing && existing.signature.value === signature.value) {
        existing.users++;
        this.state.entries.delete(id);
        this.state.entries.set(id, existing);
        return existing.surface;
      }
      // A nested consumer may still hold this layer's previous surface.
      if (existing?.users) return draw();
      if (existing) this.remove(id);
      const size = like.width * like.height * 4;
      if (size > this.limit) return draw();
      if (!this.makeRoom(size)) return draw();
      this.resize(this.state.entries.size + 1, this.state.owned.size + 1);
      entry = allocateRenderMetadata(
        192,
        () => ({
          id: idOwner,
          signature: signature!,
          surface: draw(),
          users: 1,
          removed: false,
          discard: true,
        }),
        true,
        (value) => this.destroy(value),
      );
      // Rendering this isolate can populate the cache with nested isolates.
      if (!this.makeRoom(size)) {
        entry.discard = false;
        const surface = entry.surface;
        releaseRenderMetadata(entry);
        return surface;
      }
      this.resize(this.state.entries.size + 1, this.state.owned.size + 1);
      signature.retain();
      this.state.entries.set(id, entry);
      this.state.owned.set(entry.surface, entry);
      retained = true;
      this.bytes += size;
      return entry.surface;
    } catch (error) {
      if (entry) {
        try {
          this.destroy(entry);
        } catch {
          /* Preserve the original producer/admission error. */
        }
        releaseRenderMetadata(entry);
      }
      try {
        this.resize();
      } catch {
        /* Preserve the original producer/admission error. */
      }
      throw error;
    } finally {
      if (input) releaseRenderMetadata(input);
      if (!retained) {
        signature?.release();
        releaseRenderMetadata(idOwner);
      }
    }
  }

  private makeRoom(size: number) {
    while (this.bytes + size > this.limit) {
      const entries = allocateRenderMetadata(
        32 + this.state.entries.size * 80,
        () => [...this.state.entries],
        false,
        (value) => {
          value.length = 0;
        },
      );
      try {
        const unused = entries.find(([, entry]) => entry.users === 0);
        if (!unused) return false;
        this.remove(unused[0]);
      } finally {
        releaseRenderMetadata(entries);
      }
    }
    return true;
  }

  release(surface: WebglSurface) {
    const entry = this.state.owned.get(surface);
    if (!entry) return false;
    if (entry.users === 0)
      throw new Error("comp-webgl-cache: surface released twice");
    entry.users--;
    return true;
  }

  private clear(close = false) {
    if (this.closed) return;
    if (close) this.closed = true;
    let failed = false,
      reason: unknown;
    for (const id of this.state.entries.keys()) {
      try {
        this.remove(id);
      } catch (error) {
        if (!failed) reason = error;
        failed = true;
      }
    }
    this.state.entries.clear();
    this.state.owned.clear();
    this.bytes = 0;
    if (!this.closed) this.resize();
    if (failed) throw reason;
  }
  dispose() {
    this.clear();
  }
  close() {
    try {
      this.clear(true);
    } finally {
      releaseRenderMetadata(this.state);
    }
  }
}
