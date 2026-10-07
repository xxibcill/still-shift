import { checkNativeEffectRendering } from "./composition-color-effect-reference.ts";
const animation = {
  keys: [
    { frame: 0, value: 0 },
    { frame: 11, value: 1 },
  ],
};
export async function checkTransitionEffectRendering(
  selectedKinds?: Parameters<typeof checkNativeEffectRendering>[1],
) {
  const matrix = await checkNativeEffectRendering(
    {
      "transition.linear-wipe": [
        {},
        { progress: 0.45, angle: 35, softness: 0.3 },
        { progress: animation, angle: -90 },
      ],
      "transition.radial-wipe": [
        {},
        { progress: 0.6, angle: -35, softness: 0.25, center: [0.2, 0.6] },
        { progress: animation, angle: 90 },
      ],
      "transition.venetian-blinds": [
        {},
        { progress: 0.35, angle: 23, softness: 0.3, width: 11 },
        { progress: animation, angle: 90, width: 8 },
      ],
      "transition.block-dissolve": [
        {},
        {
          progress: 0.55,
          softness: 0.2,
          width: 7,
          height: 11,
          seed: 2147483647,
        },
        { progress: animation, width: 8, height: 8, seed: 99 },
      ],
    },
    selectedKinds,
  );
  return {
    ...matrix,
    coverageOracles: checkTransitionCoverageOracles(),
    mapChains: checkTransitionMapRendering(),
  };
}

import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import {
  compositionEffectDefinition,
  type Composition,
} from "../../packages/scene-contract/src/index.ts";
import { transitionCoverage } from "../../packages/renderer-core/src/composition/render/transition-effects.ts";
function checkTransitionCoverageOracles() {
  const rows: { effect: string; case: number; maxDelta: number }[] = [];
  for (const effect of [
    "transition.linear-wipe",
    "transition.radial-wipe",
    "transition.venetian-blinds",
    "transition.block-dissolve",
  ]) {
    const defaults = Object.fromEntries(
      Object.entries(compositionEffectDefinition(effect)!.properties).map(
        ([name, p]) => [name, p.default],
      ),
    );
    for (const [variant, controls] of [
      { progress: 0 },
      { progress: 1 },
      { progress: 0.5 },
      { progress: 0.35, softness: 0.3 },
    ].entries()) {
      const params = { ...defaults, ...controls };
      const comp: Composition = {
        schemaVersion: "composition-1",
        id: "coverage",
        width: 65,
        height: 49,
        fps: 24,
        frameCount: 1,
        background: "#000000",
        assets: [],
        layers: [
          {
            id: "art",
            type: "solid",
            size: [65, 49],
            color: "#ffffff",
            transform: { anchor: [0, 0] },
            effects: [{ id: "wipe", effect, params }],
          },
        ],
      };
      let maxDelta = 0;
      for (const backend of ["canvas2d", "webgl2"] as const) {
        const preview = createCompositionPreview(
          document.createElement("canvas"),
          comp,
          { images: new Map(), fonts: new Map() },
          { backend },
        );
        try {
          preview.renderFrame(0);
          const bytes = preview.readPixels();
          for (let y = 0; y < 49; y++)
            for (let x = 0; x < 65; x++) {
              const expected = Math.round(
                transitionCoverage(
                  effect,
                  params as Record<string, number | readonly number[]>,
                  x + 0.5,
                  y + 0.5,
                  65,
                  49,
                ) * 255,
              );
              const index = (y * 65 + x) * 4;
              for (let channel = 0; channel < 4; channel++)
                maxDelta = Math.max(
                  maxDelta,
                  Math.abs(
                    bytes[index + channel]! - (channel === 3 ? 255 : expected),
                  ),
                );
            }
        } finally {
          preview.dispose();
        }
      }
      if (maxDelta > 1)
        throw Error(
          `Transition coverage oracle ${effect}/${variant}: ${maxDelta}`,
        );
      rows.push({ effect, case: variant, maxDelta });
    }
  }
  return rows;
}

/** A one-byte coverage error in a translucent map must not shift the final image. */
export function checkTransitionMapRendering() {
  const rows = [];
  for (const progress of [0, 1 - 233 / 255, 0.5, 1]) {
    const comp: Composition = {
      schemaVersion: "composition-1",
      id: "transition-map-chain",
      width: 128,
      height: 16,
      fps: 24,
      frameCount: 4,
      assets: [],
      background: "#000000",
      layers: [
        {
          id: "stripes",
          type: "precomp",
          comp: "stripes",
          transform: { anchor: [0, 0] },
          effects: [
            {
              id: "displace",
              effect: "distort.displacement-map",
              inputs: { map: "map" },
              params: { amount: [1000, 0], channelX: 0 },
            },
          ],
        },
        {
          id: "map",
          type: "solid",
          enabled: false,
          size: [128, 16],
          color: "#5a000011",
          transform: { anchor: [0, 0] },
          effects: [
            {
              id: "wipe",
              effect: "transition.venetian-blinds",
              params: { width: 1, angle: 0, softness: 1, progress },
            },
          ],
        },
      ],
      precomps: [
        {
          id: "stripes",
          width: 128,
          height: 16,
          frameCount: 4,
          layers: Array.from({ length: 32 }, (_, stripe) => ({
            id: `stripe${stripe}`,
            type: "solid" as const,
            size: [4, 16] as [number, number],
            color: stripe % 2 ? "#000000" : "#ffffff",
            transform: {
              anchor: [0, 0] as [number, number],
              position: [stripe * 4, 0] as [number, number],
            },
          })),
        },
      ],
    };
    const reference = createCompositionPreview(
      document.createElement("canvas"),
      comp,
      { images: new Map(), fonts: new Map() },
    );
    const gpu = createCompositionPreview(
      document.createElement("canvas"),
      comp,
      { images: new Map(), fonts: new Map() },
      { backend: "webgl2" },
    );
    let maxDelta = 0;
    try {
      for (const frame of [0, 3, 1, 0]) {
        reference.renderFrame(frame);
        gpu.renderFrame(frame);
        const expected = reference.readPixels(),
          actual = gpu.readPixels();
        for (let i = 0; i < actual.length; i++)
          maxDelta = Math.max(maxDelta, Math.abs(actual[i]! - expected[i]!));
      }
      if (maxDelta > 1)
        throw Error(
          `Transition displacement-map chain exceeds software parity: ${maxDelta}`,
        );
      rows.push({ progress, frames: 4, maxDelta });
    } finally {
      reference.dispose();
      gpu.dispose();
    }
  }
  return rows;
}
