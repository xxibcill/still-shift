import { describe, expect, it } from "vitest";
import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import {
  compositionExposureFrames,
  evaluateCompositionExposure,
} from "../../packages/renderer-core/src/composition/evaluate/exposure.ts";

const fixture = (velocity = 4): Composition => ({
  schemaVersion: "composition-1",
  id: "adaptive",
  width: 400,
  height: 100,
  fps: 30,
  frameCount: 60,
  assets: [],
  motionBlur: {
    enabled: true,
    shutterAngle: 360,
    shutterPhase: 0,
    samples: 16,
    adaptive: true,
  },
  layers: [
    {
      id: "moving",
      type: "solid",
      size: [10, 10],
      color: "#ffffff",
      motionBlur: true,
      transform: {
        anchor: [0, 0],
        position: {
          x: {
            keys: [
              { frame: 0, value: 10 },
              { frame: 59, value: 10 + 59 * velocity, interpolation: "linear" },
            ],
          },
          y: 20,
        },
      },
    },
  ],
});
const exposed = (doc: Composition, frame = 10) => [
  ...evaluateCompositionExposure(doc, frame),
];
const count = (doc: Composition, frame = 10) =>
  compositionExposureFrames(doc, frame).length;

describe("deterministic adaptive shutter sampling", () => {
  it("uses screen velocity and actual shutter width within the configured cap", () => {
    for (const [angle, expected] of [
      [90, 2],
      [180, 3],
      [360, 5],
      [720, 9],
    ]) {
      const doc = fixture();
      doc.motionBlur!.shutterAngle = angle!;
      expect(count(doc)).toBe(expected);
      const positions = exposed(doc).map(
        (tree) => tree.layers[0]!.screenMatrix[4],
      );
      expect(Math.max(...positions) - Math.min(...positions)).toBeCloseTo(
        (((4 * angle!) / 360) * (expected! - 1)) / expected!,
        8,
      );
    }
    expect(count(fixture(400))).toBe(16);
    expect(count(fixture(4.0001))).toBe(6);
  });
  it("centers a stationary one-sample shutter on its phase", () => {
    const doc = fixture(0);
    doc.motionBlur!.shutterPhase = 90;
    expect(compositionExposureFrames(doc, 10)).toEqual([10.25]);
    expect(exposed(doc)[0]!.layers[0]!.transform.position).toEqual([10, 20]);
    const held = fixture();
    held.layers[0]!.holdFrame = 7.5;
    expect(compositionExposureFrames(held, 10)).toEqual([10]);
  });
  it("retains the exact fixed midpoint array when adaptive is disabled", () => {
    const doc = fixture();
    doc.motionBlur!.adaptive = false;
    doc.motionBlur!.shutterPhase = 37;
    doc.motionBlur!.shutterAngle = 317;
    expect(compositionExposureFrames(doc, 10)).toEqual(
      Array.from(
        { length: 16 },
        (_, i) => 10 + (((i + 0.5) / 16 - 0.5) * 317) / 360 + 37 / 360,
      ),
    );
    const absent = structuredClone(doc);
    delete absent.motionBlur!.adaptive;
    expect(compositionExposureFrames(absent, 10)).toEqual(
      compositionExposureFrames(doc, 10),
    );
  });
  it("remains independent of evaluation history and seek order", () => {
    const doc = fixture();
    for (const frame of [10, 22, 8, 55, 10, 8]) {
      expect(compositionExposureFrames(doc, frame)).toEqual(
        compositionExposureFrames(structuredClone(doc), frame),
      );
      expect(exposed(doc, frame)).toEqual(exposed(structuredClone(doc), frame));
    }
  });
  it("uses the cap at linear-segment boundaries rather than missing short motion", () => {
    const doc = fixture();
    doc.layers[0]!.startFrame = 10;
    doc.layers[0]!.stretch = 0.01;
    doc.layers[0]!.transform!.position = {
      x: {
        keys: [
          { frame: 5, value: 10 },
          { frame: 6, value: 40, interpolation: "linear" },
        ],
      },
      y: 20,
    };
    expect(count(doc)).toBe(16);
  });
  it("combines nested screen translations through a static rotated host", () => {
    const doc = fixture(3),
      child = doc.layers[0]!;
    delete child.motionBlur;
    doc.precomps = [
      {
        id: "source",
        width: 400,
        height: 100,
        frameCount: 60,
        layers: [child],
      },
    ];
    doc.layers = [
      {
        id: "host",
        type: "precomp",
        comp: "source",
        motionBlur: true,
        transform: {
          anchor: [0, 0],
          rotation: 90,
          position: {
            x: 0,
            y: {
              keys: [
                { frame: 0, value: 0 },
                { frame: 59, value: 59, interpolation: "linear" },
              ],
            },
          },
        },
      },
    ];
    expect(count(doc)).toBe(5);
    const points = exposed(doc).map(
      (tree) => tree.layers[0]!.precomp!.layers[0]!.screenMatrix[4],
    );
    expect(Math.max(...points) - Math.min(...points)).toBeCloseTo(
      (3 * 4) / 5,
      8,
    );
  });
  it("retains the cap for changing appearance and nonlinear/procedural inputs", () => {
    const cases: ((doc: Composition) => void)[] = [
      (doc) => {
        (doc.layers[0] as Extract<CompositionLayer, { type: "solid" }>).color =
          {
            keys: [
              { frame: 0, value: "#ffffff" },
              { frame: 59, value: "#000000", interpolation: "linear" },
            ],
          };
      },
      (doc) => {
        doc.layers[0]!.transform!.opacity = {
          keys: [
            { frame: 0, value: 0 },
            { frame: 59, value: 1, interpolation: "linear" },
          ],
        };
      },
      (doc) => {
        doc.layers[0]!.transform!.rotation = {
          keys: [
            { frame: 0, value: 0 },
            { frame: 59, value: 90, interpolation: "linear" },
          ],
        };
      },
      (doc) => {
        doc.layers[0]!.posterizeFps = 12;
      },
      (doc) => {
        doc.layers[0]!.effects = [
          { id: "blur", effect: "blur.gaussian", params: { radius: 3 } },
        ];
      },
      (doc) => {
        doc.expressions = {
          "moving.transform.position.x": { source: "value+sin(time)*10" },
        };
      },
      (doc) => {
        doc.layers[0]!.transform!.position = {
          x: {
            keys: [
              { frame: 0, value: 0 },
              { frame: 59, value: 100, interpolation: "ease" },
            ],
          },
          y: 20,
        };
      },
    ];
    for (const modify of cases) {
      const doc = fixture();
      modify(doc);
      expect(count(doc)).toBe(16);
    }
  });
  it("ignores opted-out pixel motion when determining the selected exposure velocity", () => {
    const doc = fixture(0);
    doc.layers.push({
      ...structuredClone(fixture(40).layers[0]!),
      id: "sharp",
      motionBlur: false,
    });
    expect(count(doc)).toBe(1);
    expect(exposed(doc)[0]!.layers[1]!.transform.position[0]).toBe(410);
  });
  it("preserves caller scope overrides and falls back at a source edge", () => {
    const doc = fixture(3),
      child = doc.layers[0]!;
    delete child.motionBlur;
    doc.precomps = [
      {
        id: "source",
        width: 400,
        height: 100,
        frameCount: 12,
        layers: [child],
      },
    ];
    doc.layers = [
      { id: "host", type: "precomp", comp: "source", motionBlur: true },
    ];
    expect(count(doc, 11)).toBe(16);
    const options = { scopeTimes: { host: 5 } };
    expect(compositionExposureFrames(doc, 10, options)).toEqual([10]);
    expect(
      [...evaluateCompositionExposure(doc, 10, options)][0]!.layers[0]!.precomp!
        .time,
    ).toBe(5);
  });
});
