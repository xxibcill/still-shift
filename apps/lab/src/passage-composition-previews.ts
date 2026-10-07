import type { Composition } from "@still-shift/scene-contract";
import {
  createCompositionPreview,
  type CompositionResources,
} from "../../../packages/renderer-core/src/index.ts";

type Preview = ReturnType<typeof createCompositionPreview>;
type Entry = { composition: Composition; resources: CompositionResources };
type Slot = {
  canvas: HTMLCanvasElement;
  entry: Entry | undefined;
  preview: Preview | undefined;
};

/** A handoff paints two beats; reuse their GPU canvases across every other beat. */
export function createWebglPassagePreviews() {
  const slots: Slot[] = [];
  const entries = new Set<Entry>();
  let disposed = false;

  function clear(slot: Slot) {
    slot.preview?.dispose();
    slot.preview = undefined;
    slot.entry = undefined;
  }

  function acquire(entry: Entry) {
    const index = slots.findIndex((slot) => slot.entry === entry);
    const slot =
      index >= 0
        ? slots.splice(index, 1)[0]!
        : slots.length < 2
          ? {
              canvas: document.createElement("canvas"),
              entry: undefined,
              preview: undefined,
            }
          : slots.shift()!;
    slots.push(slot);
    if (slot.entry !== entry) {
      clear(slot);
      slot.preview = createCompositionPreview(
        slot.canvas,
        entry.composition,
        entry.resources,
        {
          backend: "webgl2",
        },
      );
      slot.entry = entry;
    }
    return slot;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    entries.clear();
    for (const slot of slots) {
      clear(slot);
      // Deleting GL resources does not release Chromium's active-context budget.
      slot.canvas
        .getContext("webgl2")
        ?.getExtension("WEBGL_lose_context")
        ?.loseContext();
      slot.canvas.width = slot.canvas.height = 0;
    }
    slots.length = 0;
  }

  return {
    create(
      target: HTMLCanvasElement,
      composition: Composition,
      resources: CompositionResources,
    ) {
      if (disposed) throw new Error("Passage previews have been disposed");
      const context = target.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas 2D is unavailable");
      const entry = { composition, resources };
      // Validate fonts/providers during preparation, before an edited passage is installed.
      acquire(entry);
      entries.add(entry);
      return {
        renderFrame(frame: number) {
          if (!entries.has(entry))
            throw new Error("Passage preview has been disposed");
          const slot = acquire(entry);
          const report = slot.preview!.renderFrame(frame);
          context.drawImage(slot.canvas, 0, 0);
          return report;
        },
        dispose() {
          if (!entries.delete(entry)) return;
          const slot = slots.find((slot) => slot.entry === entry);
          if (slot) clear(slot);
          if (!entries.size) dispose();
        },
      };
    },
    dispose,
  };
}
