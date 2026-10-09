import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import type {
  Composition,
  CompositionLayer,
} from "../../packages/scene-contract/src/index.ts";

/** A translated one-pin mesh is independently equivalent to translating the artwork. */
export function checkOffscreenMeshes() {
  const source = document.createElement("canvas");
  source.width = source.height = 16;
  const context = source.getContext("2d")!;
  context.fillStyle = "#aa5522";
  context.fillRect(0, 0, 16, 16);
  const comp: Composition = {
    schemaVersion: "composition-1",
    id: "offscreen-puppet",
    width: 32,
    height: 32,
    fps: 24,
    frameCount: 1,
    background: null,
    assets: [
      {
        id: "art",
        type: "image",
        path: "art.png",
        width: 16,
        height: 16,
        sha256: `sha256:${"0".repeat(64)}`,
      },
    ],
    layers: [],
  };
  const reports = [];
  const render = (
    layers: CompositionLayer[],
    backend: "canvas2d" | "webgl2",
    precomps: Composition["precomps"] = [],
  ) => {
    const preview = createCompositionPreview(
      document.createElement("canvas"),
      { ...comp, layers, precomps },
      { images: new Map([["art", source]]), fonts: new Map() },
      { backend, preserveAlpha: true },
    );
    try {
      preview.renderFrame(0);
      return preview.readPixels().slice();
    } finally {
      preview.dispose();
    }
  };
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const position of [-8, -20, 24])
      for (const delta of [0, 12, -12]) {
        const base: CompositionLayer = {
          id: "art",
          type: "image",
          sources: [{ asset: "art" }],
          fit: "stretch",
          size: [16, 16],
          transform: { anchor: [0, 0], position: [position, 8] },
        };
        const expected = render(
          [
            {
              ...base,
              transform: { anchor: [0, 0], position: [position + delta, 8] },
            },
          ],
          backend,
        );
        const actual = render(
          [
            {
              ...base,
              effects: [
                {
                  id: "puppet",
                  effect: "distort.puppet",
                  params: {
                    rest: [[1, 8]],
                    pins: [[1 + delta, 8]],
                    refinement: 1,
                  },
                },
              ],
            },
          ],
          backend,
        );
        if (actual.some((value, i) => value !== expected[i]))
          throw Error(
            `Offscreen puppet differs: ${backend}/${position}/${delta}`,
          );
        reports.push({
          backend,
          position,
          delta,
          pixels: actual.filter((value, i) => i % 4 === 3 && value > 0).length,
        });
      }
  for (const backend of ["canvas2d", "webgl2"] as const) {
    const child: CompositionLayer = {
      id: "art",
      type: "image",
      sources: [{ asset: "art" }],
      fit: "stretch",
      size: [16, 16],
      parent: "group",
      transform: { anchor: [0, 0], position: [0, 8] },
    };
    const group: CompositionLayer = {
      id: "group",
      type: "group",
      size: [16, 24],
      transform: { anchor: [0, 0], position: [-8, 0], opacity: 0.5 },
    };
    const expected = render(
      [
        {
          ...group,
          transform: { anchor: [0, 0], position: [4, 0], opacity: 0.5 },
        },
        child,
      ],
      backend,
    );
    const actual = render(
      [
        {
          ...group,
          effects: [
            {
              id: "puppet",
              effect: "distort.puppet",
              params: { rest: [[1, 8]], pins: [[13, 8]], refinement: 1 },
            },
          ],
        },
        child,
      ],
      backend,
    );
    if (actual.some((value, i) => value !== expected[i]))
      throw Error(`Offscreen group puppet differs: ${backend}`);
  }
  for (const backend of ["canvas2d", "webgl2"] as const) {
    const puppet = {
      id: "puppet",
      effect: "distort.puppet",
      params: { rest: [[1, 8]], pins: [[1, 8]], refinement: 1 },
    };
    const base: CompositionLayer = {
      id: "art",
      type: "image",
      sources: [{ asset: "art" }],
      size: [16, 16],
      fit: "stretch",
      transform: { anchor: [0, 0], position: [-8, 8] },
    };
    for (const effect of [
      {
        id: "vignette",
        effect: "stylize.vignette",
        params: { radius: [12, 12], amount: 1 },
      },
      {
        id: "grain",
        effect: "stylize.grain",
        params: { amount: 0.5, seed: 7 },
      },
      {
        id: "wipe",
        effect: "transition.linear-wipe",
        params: { progress: 0.75, softness: 0.2 },
      },
    ])
      for (const first of [true, false]) {
        const expected = render([{ ...base, effects: [effect] }], backend);
        const actual = render(
          [{ ...base, effects: first ? [puppet, effect] : [effect, puppet] }],
          backend,
        );
        if (actual.some((value, i) => Math.abs(value - expected[i]!) > 1))
          throw Error(`Scope effect drift: ${backend}/${effect.id}/${first}`);
        reports.push({
          backend,
          position: -8,
          delta: 0,
          pixels: actual.filter((value, i) => i % 4 === 3 && value > 0).length,
        });
      }
    const group: CompositionLayer = {
      id: "group",
      type: "group",
      size: [16, 16],
      effects: [puppet],
    };
    const visible: CompositionLayer = {
      ...base,
      parent: "group",
      transform: { anchor: [0, 0], position: [0, 0] },
    };
    const hidden: CompositionLayer = {
      ...base,
      id: "hidden",
      parent: "group",
      enabled: false,
      transform: { anchor: [0, 0], position: [10000, 0] },
    };
    const a = render([group, visible], backend);
    for (const dormant of [
      hidden,
      {
        ...hidden,
        enabled: true,
        transform: {
          anchor: [0, 0] as [number, number],
          position: [10000, 0] as [number, number],
          opacity: 0,
        },
      },
    ]) {
      const b = render([group, visible, dormant], backend);
      if (a.some((value, i) => value !== b[i]))
        throw Error("Non-painting descendant changed mesh capture");
    }
  }
  for (const backend of ["canvas2d", "webgl2"] as const) {
    const layers: CompositionLayer[] = [
      {
        id: "clip",
        type: "group",
        size: [8, 24],
        clip: true,
        transform: { anchor: [0, 0], position: [5, 0] },
      },
      {
        id: "host",
        type: "precomp",
        comp: "inside",
        collapseTransforms: true,
        parent: "clip",
        transform: { anchor: [0, 0] },
      },
    ];
    const child: CompositionLayer = {
      id: "art",
      type: "image",
      sources: [{ asset: "art" }],
      size: [16, 16],
      fit: "stretch",
      transform: { anchor: [0, 0], position: [-8, 8] },
    };
    const inside = {
      id: "inside",
      width: 32,
      height: 32,
      frameCount: 1,
      layers: [child],
    };
    const expected = render(layers, backend, [inside]);
    const actual = render(layers, backend, [
      {
        ...inside,
        layers: [
          {
            ...child,
            effects: [
              {
                id: "puppet",
                effect: "distort.puppet",
                params: { rest: [[1, 8]], pins: [[1, 8]], refinement: 1 },
              },
            ],
          },
        ],
      },
    ]);
    if (actual.some((value, i) => value !== expected[i]))
      throw Error(`Inherited clip drift: ${backend}`);
  }
  for (const backend of ["canvas2d", "webgl2"] as const) {
    const base: CompositionLayer = {
      id: "art",
      type: "image",
      sources: [{ asset: "art" }],
      size: [16, 16],
      fit: "stretch",
      transform: { anchor: [0, 0], position: [-8, 8] },
    };
    const map: CompositionLayer = {
      id: "map",
      type: "solid",
      size: [32, 32],
      color: "#ffffff80",
      enabled: false,
      transform: { anchor: [0, 0] },
    };
    const wipe = {
      id: "wipe",
      effect: "transition.gradient-wipe",
      inputs: { map: "map" },
      params: { progress: 0.5, softness: 0.8 },
    };
    const puppet = {
      id: "puppet",
      effect: "distort.puppet",
      params: { rest: [[1, 8]], pins: [[1, 8]], refinement: 1 },
    };
    const expected = render([{ ...base, effects: [wipe] }, map], backend);
    for (const effects of [
      [wipe, puppet],
      [puppet, wipe],
    ]) {
      const actual = render([{ ...base, effects }, map], backend);
      if (actual.some((value, i) => Math.abs(value - expected[i]!) > 1))
        throw Error(`Cropped effect input drift: ${backend}`);
    }
    const outside = render(
      [
        {
          ...base,
          effects: [
            {
              id: "clear",
              effect: "transition.linear-wipe",
              params: { progress: 1 },
            },
            {
              ...puppet,
              params: { rest: [[1, 8]], pins: [[13, 8]], refinement: 1 },
            },
          ],
        },
      ],
      backend,
    );
    const clipped = render(
      [
        {
          id: "clip",
          type: "group",
          clip: true,
          size: [8, 16],
          transform: { anchor: [0, 0], position: [4, 8] },
        },
        {
          ...base,
          parent: "clip",
          transform: { anchor: [0, 0], position: [0, 0] },
        },
      ],
      backend,
    );
    if (outside.some((value, i) => value !== clipped[i]))
      throw Error(`Scope window altered offscreen source: ${backend}`);
  }
  return reports;
}
