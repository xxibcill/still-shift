import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import type { Composition } from "../../packages/scene-contract/src/index.ts";
export async function checkMeshMemory() {
  const reports = [];
  const comp: Composition = {
    schemaVersion: "composition-1",
    id: "mesh-memory",
    width: 64,
    height: 64,
    fps: 24,
    frameCount: 1,
    assets: [],
    layers: [
      {
        id: "art",
        type: "solid",
        size: [48, 48],
        color: "#b08040",
        transform: { anchor: [0, 0], position: [8, 8] },
        effects: [
          {
            id: "puppet",
            effect: "distort.puppet",
            params: {
              rest: [
                [4, 4],
                [40, 4],
                [24, 40],
              ],
              pins: [
                [4, 4],
                [40, 8],
                [24, 40],
              ],
              refinement: 1,
            },
          },
        ],
      },
    ],
  };
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const mode of ["success", "metadata", "draw-failure"] as const) {
      const memory = new ManagedMemory({
        pixels: 16 * 1024 * 1024,
        metadata: mode === "metadata" ? 1024 * 1024 : 64 * 1024 * 1024,
      });
      const marker = new Error("mesh draw failure");
      let reason: unknown,
        intercepted = false;
      try {
        await withManagedMemory(memory, async () => {
          const canvas = document.createElement("canvas");
          memory.beginScratch();
          const preview = createCompositionPreview(
            canvas,
            comp,
            { images: new Map(), fonts: new Map() },
            { backend, preserveAlpha: true },
          );
          memory.commitScratch();
          const nativePut = CanvasRenderingContext2D.prototype.putImageData;
          const gl =
            backend === "webgl2" ? canvas.getContext("webgl2")! : undefined;
          const nativeDraw = gl?.drawArrays;
          if (mode === "draw-failure") {
            if (gl)
              gl.drawArrays = function (primitive, first, count) {
                if (count > 3) {
                  intercepted = true;
                  throw marker;
                }
                return nativeDraw!.call(gl, primitive, first, count);
              };
            else
              CanvasRenderingContext2D.prototype.putImageData = function () {
                intercepted = true;
                throw marker;
              };
          }
          try {
            memory.beginScratch();
            try {
              preview.renderFrame(0);
            } catch (error) {
              reason = error;
            } finally {
              memory.endScratch();
            }
          } finally {
            CanvasRenderingContext2D.prototype.putImageData = nativePut;
            if (gl && nativeDraw) gl.drawArrays = nativeDraw;
            preview.dispose();
          }
        });
        if (mode === "success" && reason !== undefined) throw reason;
        if (
          mode === "metadata" &&
          !/aggregate worker quota/.test(String(reason))
        )
          throw Error(
            "Mesh metadata admission did not fail before geometry allocation",
          );
        if (mode === "draw-failure" && (!intercepted || reason !== marker))
          throw Error("Mesh draw failure lost its original error");
        const statistics = memory.statistics;
        if (
          statistics.reservations ||
          statistics.current.pixels ||
          statistics.current.metadata
        )
          throw Error(
            `Mesh ${backend}/${mode} retained owners: ${JSON.stringify(statistics)}`,
          );
        reports.push({ backend, mode, statistics });
      } finally {
        memory.dispose();
      }
    }
  return reports;
}
