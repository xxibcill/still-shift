import type { Composition } from "../../packages/scene-contract/src/index.ts";
import { sha256Hex } from "../../packages/renderer-core/src/browser-checksum.ts";

export const COMPOSITION_SOURCE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="96"><rect width="160" height="96" fill="#334455"/></svg>';

export async function compositionSourceFixture(
  software: boolean,
  animated: boolean,
) {
  const svg = COMPOSITION_SOURCE_SVG;
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: "source-pixels",
    width: 160,
    height: 96,
    fps: 60,
    frameCount: 8,
    background: null,
    metadata: { storyCameraCover: ["cover"] },
    assets: [
      {
        id: "body",
        type: "font",
        path: "/assets/story-motion/fonts/plex-sans-semibold.ttf",
        sha256:
          "sha256:a20caf8286023a6a7a85e40b1d2a4ae9fc3e3b1f9eda8f4c542dd4986af67bb1",
        weight: "600",
      },
      {
        id: "art",
        type: "image",
        path: "cover.svg",
        sha256:
          "sha256:" + (await sha256Hex(new TextEncoder().encode(svg).buffer)),
        width: 160,
        height: 96,
      },
    ],
    layers: [
      {
        id: "moving",
        type: "solid",
        size: [17, 13],
        color: "#4488bb80",
        transform: {
          anchor: [0, 0],
          position: {
            keys: [
              { frame: 0, value: [2.25, 1.35] },
              { frame: 7, value: [134.45, 51.25] },
            ],
          },
        },
      },
      {
        id: "host",
        type: "precomp",
        comp: "inside",
        transform: { anchor: [0, 0], position: [0.35, 0.25] },
      },
      {
        id: "cover",
        type: "image",
        size: [160, 96],
        fit: "stretch",
        sources: [{ asset: "art" }],
        transform: { anchor: [0, 0] },
      },
    ],
    precomps: [
      {
        id: "inside",
        width: 160,
        height: 96,
        fps: 60,
        frameCount: 8,
        layers: [
          {
            id: "native",
            type: "text",
            text: "AA",
            states: ["AA", "BB"],
            state: 0,
            fontAsset: "body",
            fontSize: 20,
            color: "#d8b46680",
            transform: { position: [8.25, 30.35] },
          },
          {
            id: "provider",
            type: "provider",
            provider: "component.typography@1.1.0",
            assets: ["body"],
            params: {
              node: {
                id: "provider",
                type: "text",
                text: "77",
                fontAsset: "body",
                fontSize: 18,
                color: "#cc8855",
                weight: "normal",
                align: "left",
              },
              samples: [{ state: 0, reveal: 1 }],
              fps: 60,
              frameCount: 8,
              textStyles: {},
              textAnimators: [],
              signals: [],
              textEvents: [],
            },
            transform: { position: [74.45, 30.65] },
          },
        ],
        textAnimators: [
          {
            node: "native",
            unit: "glyph",
            start: 0,
            end: 8,
            stagger: 0,
            selector: { start: 0, end: 1 },
            from: { strokeWidth: 1, stroke: "#113355" },
            to: { strokeWidth: animated ? 0 : 1, stroke: "#113355" },
          },
        ],
      },
    ],
  };
  if (software)
    composition.layers.push({
      id: "software",
      type: "shape",
      contents: [
        { id: "rect", type: "rect", size: [1, 1], position: [155, 91] },
        { id: "fill", type: "fill", color: "#334455" },
      ],
    });
  return { composition, svg };
}
