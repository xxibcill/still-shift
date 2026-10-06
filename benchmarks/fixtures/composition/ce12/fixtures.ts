import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";

export const solid = (
  id = "subject",
  extra: object = {},
): CompositionLayer => ({
  id,
  type: "solid",
  size: [40, 40],
  color: "#efad55",
  transform: { position: [80, 80] },
  ...extra,
});
export const composition = (
  layers: CompositionLayer[],
  extra: object = {},
): Composition => ({
  schemaVersion: "composition-1",
  id: "lint-fixture",
  width: 640,
  height: 360,
  fps: 30,
  frameCount: 90,
  assets: [],
  layers,
  ...extra,
});
const position = (
  start: number,
  easing: "linear" | "smoothstep" | "in-out-cubic" = "smoothstep",
) => ({
  keys: [
    { frame: start, value: [80, 80] },
    { frame: start + 50, value: [200, 80], easing },
  ],
});
export const fixtures = {
  stillness: {
    fail: composition([solid()]),
    pass: composition(
      [solid("subject", { transform: { position: position(0) } })],
      { frameCount: 51 },
    ),
  },
  velocity: {
    fail: composition([
      solid("subject", {
        transform: {
          position: {
            keys: [
              { frame: 0, value: [80, 80] },
              { frame: 20, value: [100, 80], interpolation: "linear" },
              { frame: 40, value: [300, 80], interpolation: "linear" },
            ],
          },
        },
      }),
    ]),
    pass: composition([
      solid("subject", {
        transform: {
          position: {
            keys: [
              { frame: 0, value: [80, 80] },
              { frame: 20, value: [100, 80], smooth: true },
              { frame: 40, value: [300, 80] },
            ],
          },
        },
      }),
    ]),
  },
  easing: {
    fail: composition(
      Array.from({ length: 4 }, (_, i) =>
        solid(`layer-${i}`, {
          transform: { position: position(i * 5, "linear") },
        }),
      ),
    ),
    pass: composition(
      Array.from({ length: 4 }, (_, i) =>
        solid(`layer-${i}`, {
          transform: {
            position: position(i * 5, i % 2 ? "in-out-cubic" : "smoothstep"),
          },
        }),
      ),
    ),
  },
  coStart: {
    fail: composition(
      Array.from({ length: 3 }, (_, i) =>
        solid(`layer-${i}`, { transform: { position: position(0) } }),
      ),
    ),
    pass: composition(
      Array.from({ length: 3 }, (_, i) =>
        solid(`layer-${i}`, { transform: { position: position(i * 5) } }),
      ),
    ),
  },
  reading: {
    fail: composition(
      [
        {
          id: "words",
          type: "text",
          text: "A reader needs time to understand all these words",
          fontSize: 24,
          color: "#ffffff",
          textRole: "body",
        },
      ],
      { frameCount: 15 },
    ),
    pass: composition(
      [
        {
          id: "words",
          type: "text",
          text: "A reader needs time to understand all these words",
          fontSize: 24,
          color: "#ffffff",
          textRole: "body",
        },
      ],
      { frameCount: 150 },
    ),
  },
  framing: {
    fail: composition([
      solid("subject", { transform: { position: [700, 80] } }),
    ]),
    pass: composition([solid()]),
  },
  pops: {
    fail: composition([
      solid("subject", {
        transform: {
          opacity: {
            keys: [
              { frame: 0, value: 1 },
              { frame: 20, value: 0.1, interpolation: "hold" },
            ],
          },
          scale: {
            keys: [
              { frame: 0, value: [1, 1] },
              { frame: 20, value: [2, 2], interpolation: "hold" },
            ],
          },
        },
      }),
    ]),
    pass: composition(
      [
        solid("subject", {
          transform: {
            opacity: {
              keys: [
                { frame: 0, value: 1 },
                { frame: 20, value: 0.1, interpolation: "hold" },
              ],
            },
            scale: {
              keys: [
                { frame: 0, value: [1, 1] },
                { frame: 20, value: [2, 2], interpolation: "hold" },
              ],
            },
          },
        }),
      ],
      { markers: [{ id: "cut", frame: 20, label: "cut" }] },
    ),
  },
};
