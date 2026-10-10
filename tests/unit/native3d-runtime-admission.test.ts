import { describe, expect, it } from "vitest";
import { createNativeDepthRuntime } from "../../packages/renderer-core/src/composition/render/webgl-native-depth.ts";
import type { WebglDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";

describe("native runtime setup admission cleanup", () => {
  for (const rejected of ["metadata", "pixels"] as const)
    it(`retires earlier ownership when resolve ${rejected} admission rejects before GL`, async () => {
      const memory = new ManagedMemory({
        metadata: rejected === "metadata" ? 262144 + 4095 : 1024 * 1024,
        pixels: rejected === "pixels" ? 119 : 1024 * 1024,
      });
      const accesses: string[] = [];
      const gl = new Proxy(
        {},
        {
          get(_target, key) {
            accesses.push(String(key));
            throw Error("Unexpected GL access before admission");
          },
        },
      ) as WebGL2RenderingContext;
      const device = { gl } as WebglDevice;
      try {
        await withManagedMemory(memory, async () => {
          expect(() => createNativeDepthRuntime(device, {})).toThrow(
            `Composition managed ${rejected} exceed their aggregate worker quota`,
          );
          expect(accesses).toEqual([]);
          // Assert before allocator disposal can hide a leaked retained owner.
          expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
          expect(memory.statistics.reservations).toBe(0);
          expect(memory.statistics.peak.metadata).toBe(
            rejected === "metadata" ? 262144 : 266240,
          );
          expect(memory.statistics.peak.pixels).toBe(0);
        });
      } finally {
        memory.dispose();
      }
    });
});
