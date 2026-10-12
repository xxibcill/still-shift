import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadComposition } from "@still-shift/animation-engine";
import { isNativeObservationRequestV2 } from "@still-shift/execution-runtime/export";
import {
  createNativeObservationRequest,
  createNativeObservationRequestVersions,
} from "../../packages/animation-engine/src/native-observation.ts";
import { createNativeCompositionV2ProofFixture } from "../browser/native3d-composition-v2.ts";
describe("normal explicit native2 request producer", () => {
  it("selects declared2, binds mixed variants and fresh fractional expected passes while original API stays strict1", async () => {
    const { directory } = await createNativeCompositionV2ProofFixture(
      "/private/tmp/still-shift-ms2-producer2-unit-",
    );
    try {
      const loaded = await loadComposition(
        join(directory, "composition.json"),
        "webgl2",
      );
      await expect(createNativeObservationRequest(loaded)).rejects.toThrow(
        "Scene2 export requires",
      );
      const request = await createNativeObservationRequestVersions(loaded);
      expect(request).toBeDefined();
      if (!request || !isNativeObservationRequestV2(request))
        throw Error("Expected explicit execution2");
      expect(
        request.execution.sources.some(
          (source) => source.sourceVersion === "mechanism-scene-2",
        ),
      ).toBe(true);
      expect(
        request.execution.sources.some(
          (source) => source.sourceVersion === "solid-scene-1",
        ),
      ).toBe(true);
      const passes = request.expectedPasses(2);
      expect(passes).toHaveLength(6);
      expect(passes.some((pass) => pass.version === "native3d-frame-2")).toBe(
        true,
      );
      expect(passes.some((pass) => pass.version === "native3d-frame-1")).toBe(
        true,
      );
      expect(
        passes.some(
          (pass) =>
            pass.version === "native3d-frame-2" &&
            !Number.isInteger(pass.sampleFrame),
        ),
      ).toBe(true);
      expect(request.maximumPacketBytes).toBeGreaterThan(0);
      expect(request.maximumPacketBytes).toBeLessThanOrEqual(1048576);
      expect(request.expectedPasses(2)).not.toBe(passes);
      const controller = new AbortController();
      controller.abort(Error("producer2-cancelled"));
      await expect(
        createNativeObservationRequestVersions(loaded, undefined, {
          signal: controller.signal,
        }),
      ).rejects.toThrow("producer2-cancelled");
      await expect(
        createNativeObservationRequestVersions({
          ...loaded,
          nativeAppearanceCodeSha256: `sha256:${"a".repeat(64)}`,
        }),
      ).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("keeps an unused declared2 execution and empty expected coverage version2", async () => {
    const { directory, loaded } = await createNativeCompositionV2ProofFixture(
      "/private/tmp/still-shift-ms2-unused-producer2-unit-",
    );
    try {
      await writeFile(
        join(directory, "unused.json"),
        JSON.stringify({ ...loaded.composition, layers: [] }),
      );
      const unused = await loadComposition(
        join(directory, "unused.json"),
        "webgl2",
      );
      const request = await createNativeObservationRequestVersions(unused);
      if (!request || !isNativeObservationRequestV2(request))
        throw Error("Unused declared2 must stay execution2");
      expect(request.expectedPasses(0)).toEqual([]);
      expect(request.maximumPacketBytes).toBeGreaterThan(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
