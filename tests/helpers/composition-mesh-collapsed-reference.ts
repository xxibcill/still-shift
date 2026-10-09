import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import {
  validateComposition,
  type Composition,
  type CompositionLayer,
} from "../../packages/scene-contract/src/index.ts";

type Effect = NonNullable<CompositionLayer["effects"]>[number];
type Kind = "distort.puppet" | "distort.mesh-warp";
type Case = {
  name: string;
  ordinary: CompositionLayer[];
  meshes: CompositionLayer[];
  animated?: boolean;
  generated?: boolean;
};
const collapsedScales: [number, number][] = [
  [0, 0],
  [0, 1],
  [1, 0],
];
function meshEffect(kind: Kind, nonuniform = false, space?: string): Effect {
  return {
    id: "mesh",
    effect: kind,
    ...(space ? { space } : {}),
    params:
      kind === "distort.puppet"
        ? {
            rest: [
              [4, 4],
              [12, 4],
              [8, 12],
            ],
            pins: [
              [4, 4],
              [nonuniform ? 14 : 12, 4],
              [8, 12],
            ],
            refinement: 0,
          }
        : {
            size: [16, 16],
            subdivisions: 4,
            controls: [
              [0, 0],
              [1, 0],
              [nonuniform ? 0.25 : 0, 1],
              [1, 1],
            ],
          },
  };
}
function cases(kind: Kind): Case[] {
  const art: CompositionLayer = {
    id: "art",
    type: "solid",
    size: [16, 16],
    color: "#aa5522",
    transform: { anchor: [0, 0], position: [8, 8] },
  };
  const items: Case[] = [];
  for (const scale of collapsedScales) {
    const owner: CompositionLayer = {
      ...art,
      transform: { ...art.transform, scale },
    };
    items.push({
      name: `owner-${scale}`,
      ordinary: [owner],
      meshes: [{ ...owner, effects: [meshEffect(kind)] }],
    });
    const parent: CompositionLayer = {
      id: "parent",
      type: "null",
      transform: { anchor: [0, 0], scale },
    };
    const inherited = { ...art, parent: "parent" };
    items.push({
      name: `parent-${scale}`,
      ordinary: [parent, inherited],
      meshes: [parent, { ...inherited, effects: [meshEffect(kind)] }],
    });
    const group: CompositionLayer = {
      id: "group",
      type: "group",
      size: [32, 32],
      transform: { anchor: [0, 0], scale },
    };
    const child = { ...art, parent: "group" };
    items.push({
      name: `group-${scale}`,
      ordinary: [group, child],
      meshes: [{ ...group, effects: [meshEffect(kind)] }, child],
    });
    const helper: CompositionLayer = {
      id: "space",
      type: "null",
      transform: { anchor: [0, 0], position: [8, 8] },
    };
    items.push({
      name: `owner-with-independent-space-${scale}`,
      ordinary: [helper, owner],
      meshes: [
        helper,
        { ...owner, effects: [meshEffect(kind, false, "space")] },
      ],
    });
  }
  const rotated: CompositionLayer = {
    ...art,
    transform: { ...art.transform, scale: [0, 1], rotation: 37 },
  };
  items.push({
    name: "rotated-rank-one",
    ordinary: [rotated],
    meshes: [{ ...rotated, effects: [meshEffect(kind)] }],
  });
  const group: CompositionLayer = {
    id: "group",
    type: "group",
    size: [64, 64],
    transform: { anchor: [0, 0] },
    effects: [
      {
        id: "parent-puppet",
        effect: "distort.puppet",
        params: { rest: [[36, 12]], pins: [[36, 12]], refinement: 0 },
      },
    ],
  };
  const sibling: CompositionLayer = {
    ...art,
    id: "sibling",
    parent: "group",
    transform: { anchor: [0, 0], position: [32, 8] },
  };
  const child: CompositionLayer = {
    ...art,
    parent: "group",
    transform: { ...art.transform, scale: [0, 1] },
  };
  items.push({
    name: "nonuniform-child-in-visible-puppet-group",
    ordinary: [group, child, sibling],
    meshes: [group, { ...child, effects: [meshEffect(kind, true)] }, sibling],
  });
  const animated: CompositionLayer = {
    ...art,
    transform: {
      ...art.transform,
      scale: {
        keys: [
          { frame: 0, value: [1, 1] },
          { frame: 1, value: [0, 0] },
          { frame: 2, value: [0, 0] },
          { frame: 3, value: [1, 1] },
        ],
      },
    },
  };
  items.push({
    name: "animated-collapse-and-recovery",
    ordinary: [animated],
    meshes: [{ ...animated, effects: [meshEffect(kind)] }],
    animated: true,
  });
  const rotatedParent: CompositionLayer = {
    id: "rotated-parent",
    type: "null",
    transform: { anchor: [0, 0], scale: [0, 1], rotation: 37 },
  };
  const rotatedChild: CompositionLayer = {
    ...art,
    parent: "rotated-parent",
    transform: { ...art.transform, rotation: 29 },
  };
  items.push({
    name: "rotated-collapsed-parent-and-rotated-child",
    ordinary: [rotatedParent, rotatedChild],
    meshes: [rotatedParent, { ...rotatedChild, effects: [meshEffect(kind)] }],
  });
  items.push({
    name: "rotated-collapsed-descendant-in-visible-puppet-group",
    ordinary: [
      group,
      { ...rotatedParent, parent: "group" },
      rotatedChild,
      sibling,
    ],
    meshes: [
      group,
      { ...rotatedParent, parent: "group" },
      { ...rotatedChild, effects: [meshEffect(kind, true)] },
      sibling,
    ],
  });
  const generator: Effect = {
    id: "radial",
    effect: "light.radial",
    params: { x: 32, y: 32, radius: 24, strength: 0.5, color: "#40a0e0" },
  };
  const empty: CompositionLayer = {
    ...art,
    transform: { ...art.transform, scale: [0, 0] },
  };
  items.push({
    name: "later-scope-generator",
    ordinary: [{ ...empty, effects: [generator] }],
    meshes: [{ ...empty, effects: [meshEffect(kind), generator] }],
    generated: true,
  });
  const space: CompositionLayer = {
    id: "space",
    type: "null",
    transform: { anchor: [0, 0] },
  };
  const externalMesh: Effect = {
    id: "external-mesh",
    effect: kind,
    space: "space",
    params:
      kind === "distort.puppet"
        ? {
            rest: [
              [28, 28],
              [36, 28],
              [32, 36],
            ],
            pins: [
              [28, 28],
              [36, 28],
              [32, 36],
            ],
            refinement: 0,
          }
        : { size: [64, 64], subdivisions: 4 },
  };
  items.push({
    name: "prior-scope-generator-in-external-space",
    ordinary: [space, { ...empty, effects: [generator] }],
    meshes: [space, { ...empty, effects: [generator, externalMesh] }],
    generated: true,
  });
  return items;
}

/** Collapsed owners have no mesh coverage; later effects and recovery still run. */
export function checkCollapsedMeshes() {
  const comp: Composition = {
    schemaVersion: "composition-1",
    id: "collapsed-mesh",
    width: 64,
    height: 64,
    fps: 24,
    frameCount: 4,
    background: null,
    assets: [],
    layers: [],
  };
  const reports = [];
  for (const backend of ["canvas2d", "webgl2"] as const)
    for (const kind of ["distort.puppet", "distort.mesh-warp"] as const)
      for (const item of cases(kind)) {
        const ordinary = { ...comp, layers: item.ordinary };
        const meshes = { ...comp, layers: item.meshes };
        if (
          !validateComposition(ordinary).ok ||
          !validateComposition(meshes).ok
        )
          throw Error(`Invalid collapsed fixture: ${kind}/${item.name}`);
        const assets = { images: new Map(), fonts: new Map() };
        const expected = createCompositionPreview(
          document.createElement("canvas"),
          ordinary,
          assets,
          { backend, preserveAlpha: true },
        );
        const actual = createCompositionPreview(
          document.createElement("canvas"),
          meshes,
          assets,
          { backend, preserveAlpha: true },
        );
        const frames: ReturnType<typeof actual.readPixels>[] = [];
        const coverage: number[] = [];
        try {
          for (
            let frame = 0;
            frame < (item.animated ? comp.frameCount : 1);
            frame++
          ) {
            expected.renderFrame(frame);
            actual.renderFrame(frame);
            const reference = expected.readPixels(),
              pixels = actual.readPixels().slice();
            if (pixels.some((value, i) => value !== reference[i]))
              throw Error(
                `Collapsed mesh differs: ${backend}/${kind}/${item.name}/${frame}`,
              );
            frames.push(pixels);
            coverage.push(
              pixels.filter((value, i) => i % 4 === 3 && value > 0).length,
            );
          }
          if (item.animated) {
            if (
              !coverage[0] ||
              coverage[1] ||
              coverage[2] ||
              coverage[0] !== coverage[3]
            )
              throw Error(`Collapsed mesh did not recover: ${backend}/${kind}`);
            for (const frame of [3, 0, 2, 1, 3]) {
              actual.renderFrame(frame);
              if (
                actual
                  .readPixels()
                  .some((value, i) => value !== frames[frame]![i])
              )
                throw Error(
                  `Collapsed mesh seek differs: ${backend}/${kind}/${frame}`,
                );
            }
          }
          if (item.generated && !coverage[0])
            throw Error(
              `Collapsed mesh suppressed the later generator: ${backend}/${kind}`,
            );
          reports.push({
            backend,
            kind,
            name: item.name,
            frames: frames.length,
            coverage,
            maxDelta: 0,
          });
        } finally {
          actual.dispose();
          expected.dispose();
        }
      }
  return reports;
}
