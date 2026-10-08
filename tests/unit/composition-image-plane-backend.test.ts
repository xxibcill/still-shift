import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { CompositionSchema } from "@still-shift/scene-contract";
import { buildRenderGraph, evaluateComp } from "@still-shift/renderer-core";
import {
  executeGraph,
  type RenderBackend,
} from "../../packages/renderer-core/src/composition/render/backend.ts";
import { renderCompositionExposure } from "../../packages/renderer-core/src/composition/render/exposure.ts";
import { compileComposition } from "../../packages/renderer-core/src/composition/evaluate/compile.ts";

function backend(): RenderBackend {
  return {
    version: "test",
    createSurface: (width, height) => ({ width, height }),
    releaseSurface: vi.fn(),
    clear: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    drawText: vi.fn(),
    drawShape: vi.fn(),
    drawProvider: vi.fn(),
    composite: vi.fn(),
    applyEffects: vi.fn(),
    applyMask: vi.fn(),
    applyMatte: vi.fn(),
    lerp: vi.fn(),
    readPixels: () => new Uint8ClampedArray(),
    beginFrame: vi.fn(),
    accumulateExposure: vi.fn((_target, count, draw) => {
      for (let index = 0; index < count; index++) draw(index);
    }),
  };
}

for (const name of ["native-depth", "linear-image-plane"]) {
  const fixture = () =>
    CompositionSchema.parse(
      JSON.parse(
        readFileSync(
          `benchmarks/fixtures/composition/ce4d/${name}.json`,
          "utf8",
        ),
      ),
    );
  it(`${name} rejects an unsupported 2D backend before touching the target`, () => {
    const comp = fixture(),
      target = { width: comp.width, height: comp.height };
    const unsupported = backend(),
      graph = buildRenderGraph(comp, evaluateComp(comp, 0));
    expect(compileComposition(comp).spatialScopes.size).toBe(0);
    expect(() => executeGraph(unsupported, graph, target)).toThrow(
      /requires? the composition WebGL2 backend/,
    );
    expect(unsupported.beginFrame).not.toHaveBeenCalled();
    expect(unsupported.clear).not.toHaveBeenCalled();
    expect(unsupported.drawImage).not.toHaveBeenCalled();
  });
  it(`${name} preflights shutter samples before accumulation`, () => {
    const comp = fixture();
    comp.motionBlur = {
      enabled: true,
      samples: 4,
      shutterAngle: 180,
      shutterPhase: 0,
    };
    comp.layers[0]!.motionBlur = true;
    const unsupported = backend();
    expect(() =>
      renderCompositionExposure(
        unsupported,
        { width: comp.width, height: comp.height },
        comp,
        10,
      ),
    ).toThrow(/requires? the composition WebGL2 backend/);
    expect(unsupported.accumulateExposure).not.toHaveBeenCalled();
    expect(unsupported.clear).not.toHaveBeenCalled();
  });
  it(`${name} checks its local surface budget before drawing on a supported backend`, () => {
    const comp = fixture();
    if (
      comp.layers[0]!.type !== "depth-image" &&
      comp.layers[0]!.type !== "image"
    )
      throw new Error("Missing image fixture");
    comp.layers[0]!.size = [7680, 4320];
    const supported = { ...backend(), drawDepthImage: vi.fn() };
    expect(() =>
      renderCompositionExposure(
        supported,
        { width: comp.width, height: comp.height },
        comp,
        0,
      ),
    ).toThrow(/128 MiB/);
    expect(supported.clear).not.toHaveBeenCalled();
  });
}
