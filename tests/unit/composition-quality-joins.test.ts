import type { CompositionLayer } from "@still-shift/scene-contract";
import { describe, expect, it, vi } from "vitest";
import type * as evaluate from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
import {
  composition,
  solid,
} from "../../benchmarks/fixtures/composition/ce12/fixtures.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";

const calls = vi.hoisted(() => ({ count: 0 }));
vi.mock(
  "../../packages/renderer-core/src/composition/evaluate/index.ts",
  async (original) => {
    const module = await original<typeof evaluate>();
    return {
      ...module,
      evaluateComp: (...args: Parameters<typeof module.evaluateComp>) => {
        calls.count++;
        return module.evaluateComp(...args);
      },
    };
  },
);

function stretchedSiblings(count: number) {
  const frameCount = 30;
  const layers: CompositionLayer[] = Array.from({ length: count }, (_, i) => ({
    id: `dot-${i}`,
    type: "solid",
    size: [10, 10],
    color: "#ffffff",
    transform: {
      position: {
        keys: Array.from({ length: frameCount * 2 }, (_, frame) => ({
          frame,
          value: [20 + i * 12, 20 + frame * 2] as [number, number],
          interpolation: "linear" as const,
        })),
      },
    },
  }));
  const base = composition([], { frameCount });
  return {
    ...base,
    precomps: [
      {
        id: "inner",
        width: base.width,
        height: base.height,
        frameCount: frameCount * 2,
        layers,
      },
    ],
    layers: [
      {
        id: "host",
        type: "precomp",
        comp: "inner",
        stretch: 1.025,
        transform: { position: [base.width / 2, base.height / 2] },
      },
    ] as CompositionLayer[],
  };
}

describe("fractional key-join discovery", () => {
  it("searches each shared clock once instead of once per layer", () => {
    const evaluations = (count: number) => {
      calls.count = 0;
      analyzeCompositionQuality(stretchedSiblings(count));
      return calls.count;
    };
    expect(evaluations(16)).toBe(evaluations(2));
  });
});

function withSampleCost<T>(cost: number, run: () => T): T {
  const readSize = Object.getOwnPropertyDescriptor(Map.prototype, "size")!.get!;
  const size = vi
    .spyOn(Map.prototype, "size", "get")
    .mockImplementation(function (this: Map<string, unknown>) {
      const sample = this.values().next().value as
        | { signature?: unknown }
        | undefined;
      return typeof sample?.signature === "string" ? cost : readSize.call(this);
    });
  try {
    return run();
  } finally {
    size.mockRestore();
  }
}

describe("shared lint evaluation budget", () => {
  it("rejects velocity probes that exceed capacity after integer sampling fits", () => {
    const input = composition([solid()], { frameCount: 12 });
    // The 12 retained frames fit; the four additional probes per join do not.
    let failure: unknown;
    withSampleCost(100_000, () => {
      try {
        analyzeCompositionQuality(input);
      } catch (error) {
        failure = error;
      }
    });
    expect(passageDiagnostics(failure)).toEqual([
      expect.objectContaining({
        code: "comp-lint-limit",
        severity: "error",
        path: "layers",
      }),
    ]);
  });

  it("allows velocity probes whose combined sample cost stays within capacity", () => {
    expect(() =>
      withSampleCost(38_000, () =>
        analyzeCompositionQuality(composition([solid()], { frameCount: 12 })),
      ),
    ).not.toThrow();
  });

  it("shares capacity between fractional searches and their velocity probes", () => {
    const input = stretchedSiblings(2);
    calls.count = 0;
    analyzeCompositionQuality(input);
    const cost = Math.floor(2_000_000 / calls.count) + 1;
    let failure: unknown;
    withSampleCost(cost, () => {
      try {
        analyzeCompositionQuality(input);
      } catch (error) {
        failure = error;
      }
    });
    expect(passageDiagnostics(failure)).toEqual([
      expect.objectContaining({
        code: "comp-lint-limit",
        severity: "error",
        path: "layers",
      }),
    ]);
  });
});
