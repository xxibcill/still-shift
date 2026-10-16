import type { MechanismPrimitiveInput } from "../../packages/animation-engine/src/mechanism/primitive-mesh.ts";
export function mechanismPrimitiveExamples(): MechanismPrimitiveInput[] {
  const identity = { partId: "root", materialId: "paint" };
  const points: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const holes: [number, number][][] = [
    [
      [-0.35, -0.35],
      [-0.35, 0.35],
      [0.35, 0.35],
      [0.35, -0.35],
    ],
  ];
  return [
    {
      ...identity,
      id: "box",
      kind: "rounded-box",
      size: [2, 0.8, 1],
      radius: 0.15,
    },
    {
      ...identity,
      id: "cylinder",
      kind: "cylinder",
      radiusTop: 0.65,
      radiusBottom: 0.75,
      height: 1.6,
    },
    { ...identity, id: "torus", kind: "torus", radius: 0.8, tubeRadius: 0.18 },
    {
      ...identity,
      id: "profile",
      kind: "extruded-profile",
      points,
      holes,
      depth: 0.3,
    },
    {
      ...identity,
      id: "bevel",
      kind: "extruded-profile",
      points,
      holes,
      depth: 0.3,
      bevel: { size: 0.06, thickness: 0.03, segments: 2 },
    },
    {
      ...identity,
      id: "ribbon",
      kind: "swept-ribbon",
      points: [
        [-1, 0, -0.6],
        [-0.2, 0.25, 0],
        [1, 0.1, 0.4],
      ],
      width: 0.45,
      thickness: 0.08,
      segments: 32,
    },
    {
      ...identity,
      id: "coil",
      kind: "coil",
      radius: 0.9,
      wireRadius: 0.1,
      pitch: 0.35,
      turns: 3.5,
    },
  ];
}
