import { checkNativeEffectRendering } from "./composition-color-effect-reference.ts";
import {
  createCompositionPreview,
  registerCompositionEffect,
} from "../../packages/renderer-core/src/index.ts";
import {
  defineCompositionEffect,
  type Composition,
} from "../../packages/scene-contract/src/index.ts";
const definition = defineCompositionEffect({
  version: "1.0.0",
  properties: {},
  requiresLayers: ["map"],
});
export async function checkEffectInputRendering() {
  const release = registerCompositionEffect({
    id: "test.layer-input",
    definition,
    renderGpu: (context) => context.layers.get("map")!,
    renderCanvas: (context) => context.layers!.get("map")!,
  });
  try {
    const owners = await checkNativeEffectRendering(
      { "test.layer-input": [{}] },
      undefined,
      (comp) => {
        comp.layers.find((l) => l.id === "art")!.effects![0]!.inputs = {
          map: "source",
        };
        comp.layers.push({
          id: "source",
          type: "solid",
          size: [64, 40],
          color: {
            keys: [
              { frame: 0, value: "#ff0000" },
              { frame: 11, value: "#2233ee80" },
            ],
          },
          enabled: false,
          transform: { anchor: [0, 0], position: [16, 14] },
          effects: [{ id: "invert", effect: "color.invert" }],
        });
      },
    );
    const sources = await checkNativeEffectRendering(
      { "test.layer-input": [{}] },
      [
        "solid",
        "image",
        "text",
        "shape",
        "provider",
        "group",
        "precomp",
        "collapsed",
      ],
      (comp) => {
        const source = comp.layers.find((l) => l.id === "art")!;
        source.id = "source";
        source.enabled = false;
        source.effects = [{ id: "invert", effect: "color.invert" }];
        for (const child of comp.layers)
          if (child.parent === "art") child.parent = "source";
        comp.layers.unshift({
          id: "owner",
          type: "solid",
          size: [96, 72],
          color: "#ffffff",
          transform: { anchor: [0, 0] },
          effects: [
            {
              id: "input",
              effect: "test.layer-input",
              inputs: { map: "source" },
            },
          ],
        });
      },
    );
    return {
      owners,
      sources,
      hiddenGroupOracles: checkHiddenInputGroups(),
      scopeClockOracles: checkScopedInputClock(),
    };
  } finally {
    release();
  }
}
function checkHiddenInputGroups() {
  const rows: {
    source: string;
    backend: string;
    active: number[];
    disabled: number[];
  }[] = [];
  for (const source of ["group", "precomp", "nested-group"] as const)
    for (const backend of ["canvas2d", "webgl2"] as const) {
      const comp: Composition = {
        schemaVersion: "composition-1",
        id: "input-group",
        width: 32,
        height: 32,
        fps: 24,
        frameCount: 12,
        background: "#000000",
        assets: [],
        layers: [
          {
            id: "owner",
            type: "solid",
            size: [32, 32],
            color: "#ffffff",
            transform: { anchor: [0, 0] },
            effects: [
              {
                id: "input",
                effect: "test.layer-input",
                inputs: { map: "source" },
              },
            ],
          },
        ],
      };
      if (source === "precomp") {
        comp.precomps = [
          {
            id: "child",
            width: 32,
            height: 32,
            frameCount: 12,
            layers: [
              {
                id: "child",
                type: "solid",
                size: [32, 32],
                color: "#ff0000",
                transform: { anchor: [0, 0] },
              },
            ],
          },
        ];
        comp.layers.push({
          id: "source",
          type: "precomp",
          comp: "child",
          enabled: false,
          transform: { anchor: [0, 0] },
          effects: [{ id: "invert", effect: "color.invert" }],
        });
      } else {
        comp.layers.push({
          id: "source",
          type: "group",
          size: [32, 32],
          enabled: false,
          transform: { anchor: [0, 0] },
          effects: [{ id: "invert", effect: "color.invert" }],
        });
        if (source === "nested-group")
          comp.layers.push({
            id: "nested",
            type: "group",
            size: [32, 32],
            parent: "source",
            transform: { anchor: [0, 0] },
            effects: [{ id: "neutral", effect: "color.exposure" }],
          });
        comp.layers.push({
          id: "child",
          type: "solid",
          parent: source === "nested-group" ? "nested" : "source",
          size: [32, 32],
          color: "#ff0000",
          transform: { anchor: [0, 0] },
        });
      }
      comp.layers.find((layer) => layer.id === "source")!.masks = [
        {
          id: "crop",
          mode: "add",
          path: {
            closed: true,
            vertices: [
              [8, 8],
              [24, 8],
              [24, 24],
              [8, 24],
            ],
          },
        },
      ];
      const preview = createCompositionPreview(
        document.createElement("canvas"),
        comp,
        { images: new Map(), fonts: new Map() },
        { backend },
      );
      let active: number[];
      try {
        preview.renderFrame(0);
        active = Array.from(
          preview
            .readPixels()
            .slice((16 * 32 + 16) * 4, (16 * 32 + 16) * 4 + 4),
        );
        const outside = Array.from(
          preview.readPixels().slice((4 * 32 + 4) * 4, (4 * 32 + 4) * 4 + 4),
        );
        if (outside.some((value, c) => value !== [0, 0, 0, 255][c]))
          throw Error(
            `Input ${source}/${backend} did not retain its mask: ${outside}`,
          );
        if (active.some((v, c) => v !== [0, 255, 255, 255][c]))
          throw Error(
            `Hidden ${source}/${backend} input did not retain source effects: ${active}`,
          );
      } finally {
        preview.dispose();
      }
      comp.layers[0]!.enabled = false;
      const baseline = createCompositionPreview(
        document.createElement("canvas"),
        comp,
        { images: new Map(), fonts: new Map() },
        { backend },
      );
      try {
        baseline.renderFrame(0);
        const disabled = Array.from(
          baseline
            .readPixels()
            .slice((16 * 32 + 16) * 4, (16 * 32 + 16) * 4 + 4),
        );
        if (disabled.some((v, c) => v !== [0, 0, 0, 255][c]))
          throw Error(
            `Input ${source}/${backend} changed ordinary visibility: ${disabled}`,
          );
        rows.push({ source, backend, active, disabled });
      } finally {
        baseline.dispose();
      }
    }
  return rows;
}
function checkScopedInputClock() {
  const comp: Composition = {
    schemaVersion: "composition-1",
    id: "scoped",
    width: 32,
    height: 32,
    fps: 24,
    frameCount: 12,
    background: "#000000",
    assets: [],
    precomps: [
      {
        id: "child",
        width: 32,
        height: 32,
        frameCount: 12,
        layers: [
          {
            id: "owner",
            type: "solid",
            size: [32, 32],
            color: "#ffffff",
            transform: { anchor: [0, 0] },
            effects: [
              {
                id: "input",
                effect: "test.layer-input",
                inputs: { map: "source" },
              },
            ],
          },
          {
            id: "source",
            type: "solid",
            size: [32, 32],
            enabled: false,
            color: {
              keys: [
                { frame: 0, value: "#ff0000" },
                { frame: 11, value: "#0000ff" },
              ],
            },
            transform: { anchor: [0, 0] },
          },
        ],
      },
    ],
    layers: [
      {
        id: "owner",
        type: "precomp",
        comp: "child",
        timeRemap: 11,
        transform: { anchor: [0, 0] },
      },
      {
        id: "source",
        type: "solid",
        size: [32, 32],
        color: "#00ff00",
        enabled: false,
        transform: { anchor: [0, 0] },
      },
    ],
  };
  const rows: { backend: string; frame: number; pixel: number[] }[] = [];
  for (const backend of ["canvas2d", "webgl2"] as const) {
    const preview = createCompositionPreview(
      document.createElement("canvas"),
      comp,
      { images: new Map(), fonts: new Map() },
      { backend },
    );
    try {
      for (const frame of [0, 11, 3]) {
        preview.renderFrame(frame);
        const pixel = Array.from(
          preview
            .readPixels()
            .slice((16 * 32 + 16) * 4, (16 * 32 + 16) * 4 + 4),
        );
        if (pixel.some((v, c) => v !== [0, 0, 255, 255][c]))
          throw Error(
            `Scoped remapped input clock ${backend}/${frame}: ${pixel}`,
          );
        rows.push({ backend, frame, pixel });
      }
    } finally {
      preview.dispose();
    }
  }
  return rows;
}
