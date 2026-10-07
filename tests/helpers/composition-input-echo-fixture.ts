import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";

export type InputEchoSourceKind = "solid" | "group" | "precomp" | "collapsed";
export const inputEchoEffects = () => [
  {
    id: "trail",
    effect: "time.echo",
    params: { count: 2, spacing: 2, decay: 0.5 },
  },
];
export function inputEchoComposition(kind: InputEchoSourceKind): Composition {
  const art: CompositionLayer = {
    id: "source",
    type: "solid",
    size: [4, 8],
    color: "#ffffff",
    enabled: false,
    transform: {
      anchor: [0, 0],
      position: {
        x: {
          keys: [
            { frame: 0, value: 0, interpolation: "linear" },
            { frame: 11, value: 44, interpolation: "linear" },
          ],
        },
        y: 8,
      },
    },
    effects: inputEchoEffects(),
  };
  const comp: Composition = {
    schemaVersion: "composition-1",
    id: "input-echo",
    width: 64,
    height: 32,
    fps: 24,
    frameCount: 12,
    assets: [],
    layers: [
      {
        id: "owner",
        type: "solid",
        size: [64, 32],
        color: "#ffffff",
        inPoint: 8,
        effects: [
          {
            id: "map",
            effect: "distort.displacement-map",
            inputs: { map: "source" },
          },
        ],
      },
    ],
  };
  if (kind === "solid") comp.layers.push(art);
  else {
    const child = { ...art, id: "art", enabled: true, effects: [] };
    if (kind === "group")
      comp.layers.push(
        { ...child, parent: "source" },
        {
          id: "source",
          type: "group",
          size: [64, 32],
          enabled: false,
          transform: { anchor: [0, 0] },
          effects: inputEchoEffects(),
        },
      );
    else {
      comp.layers.push({
        id: "source",
        type: "precomp",
        comp: "child",
        enabled: false,
        collapseTransforms: kind === "collapsed",
        transform: { anchor: [0, 0] },
        effects: inputEchoEffects(),
      });
      comp.precomps = [
        { id: "child", width: 64, height: 32, frameCount: 12, layers: [child] },
      ];
    }
  }
  return comp;
}
