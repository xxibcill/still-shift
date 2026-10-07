import { checkNativeEffectRendering } from "./composition-color-effect-reference.ts";
export function checkSampledBlurRendering(
  selectedKinds?: Parameters<typeof checkNativeEffectRendering>[1],
) {
  return checkNativeEffectRendering(
    {
      "blur.radial": [
        {},
        { angle: 45, center: [0.3, 0.6], samples: 8 },
        {
          angle: {
            keys: [
              { frame: 0, value: -40 },
              { frame: 11, value: 40 },
            ],
          },
          samples: 16,
        },
      ],
      "blur.zoom": [
        {},
        { amount: 0.65, center: [0.3, 0.6], samples: 8 },
        {
          amount: {
            keys: [
              { frame: 0, value: -0.6 },
              { frame: 11, value: 0.6 },
            ],
          },
          samples: 16,
        },
      ],
      "blur.lens": [
        {},
        { radius: 7, samples: 8 },
        {
          radius: {
            keys: [
              { frame: 0, value: 0 },
              { frame: 11, value: 10 },
            ],
          },
          samples: 16,
        },
      ],
    },
    selectedKinds,
  );
}

export function checkSampledBlurLimits(
  selectedKinds?: Parameters<typeof checkNativeEffectRendering>[1],
) {
  return checkNativeEffectRendering(
    {
      "blur.radial": [{ angle: 180, center: [0, 1], samples: 64 }],
      "blur.zoom": [{ amount: 1, center: [1, 0], samples: 64 }],
      "blur.lens": [{ radius: 1000, samples: 64 }],
    },
    selectedKinds,
  );
}
