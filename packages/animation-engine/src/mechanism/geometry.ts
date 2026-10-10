import {
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Matrix4,
  Path,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

import type {
  MechanismGeometry,
  MechanismMaterial,
  MechanismMesh,
  MechanismVector,
} from "@still-shift/scene-contract";

export type GeometryVector3 = MechanismVector;
export type IndexedMechanismMesh = MechanismMesh & {
  uvs: number[];
  groups: { start: number; count: number; materialIndex: number }[];
};
export type { MechanismMaterial };
export type TapeHookGeometryParameters = {
  hookThickness?: number;
  bladeLength?: number;
  bladeWidth?: number;
  scale?: number;
};
export type TapeHookDimensions = {
  [key: string]: number | number[] | GeometryVector3[];
  hookThickness: number;
  hookTravel: number;
  bladeLength: number;
  bladeWidth: number;
  bladeStart: number;
  bladeThickness: number;
  flangeThickness: number;
  slotCenters: number[];
  slotLength: number;
  slotWidth: number;
  slotEndClearance: number;
  rivetStemRadius: number;
  datumMarkerMidpoint: GeometryVector3;
  thicknessMarkerMidpoint: GeometryVector3;
  travelMarkerMidpoint: GeometryVector3;
  scale: number;
};
export type TapeHookGeometry = Omit<
  MechanismGeometry,
  "meshes" | "dimensions"
> & {
  meshes: IndexedMechanismMesh[];
  materials: MechanismMaterial[];
  dimensions: TapeHookDimensions;
};
export type TapeHookMaterialStyle = {
  steelColor?: string;
  steelRoughness?: number;
  steelMetalness?: number;
};

type ModelDimensions = {
  hookThickness: number;
  bladeLength: number;
  bladeWidth: number;
  scale: number;
};
type MeshSpecification = {
  id: string;
  partId: string;
  materialId: string;
  groupMaterialIds?: readonly string[];
  geometry: BufferGeometry;
};
export const TAPE_HOOK_RIVET_MESH_IDS = [
  "rivet-1-stem",
  "rivet-1-cap",
  "rivet-1-ring",
  "rivet-2-stem",
  "rivet-2-cap",
  "rivet-2-ring",
] as const;

/** Explanatory marker hierarchy; each marker geometry remains part-local at the origin. */
export const TAPE_HOOK_MARKER_PARTS = {
  datum: { id: "datum" },
  thickness: { id: "thickness", parent: "hook" },
  travel: { id: "travel", parent: "model" },
} as const;

export const TAPE_HOOK_LIGHTING_PROFILE = {
  background: "#cbd1d1",
  environment: "room",
  environmentIntensity: 0.95,
  toneMapping: "aces-filmic",
  exposure: 1.14,
  shadowMapSize: 2048,
  keyLight: { color: "#fff4dd", intensity: 3.1, position: [-4, 11, 6] },
  fillLight: { color: "#d6e9ff", intensity: 1.2, position: [7, 8, -3] },
  hemisphere: { sky: "#e8f6ff", ground: "#63716e", intensity: 1.15 },
} as const;

const SLOT_CENTERS = [0.72, 1.48];
// The authored source margin was 0.095; widening preserves stem clearance through the bevel.
const SLOT_END_CLEARANCE = 0.115;
const SOURCE_TO_Y_UP = new Matrix4().makeRotationX(-Math.PI / 2);

/** Procedural authored model units, with no manufacturing or simulation claim. */
export function createTapeHookGeometry(
  parameters: TapeHookGeometryParameters = {},
): TapeHookGeometry {
  const model = resolveDimensions(parameters);
  const materials = createTapeHookMaterials();
  const meshes = [
    ...hookMeshes(model),
    ...bladeMeshes(model),
    ...housingMeshes(),
    ...contactMeshes(),
    ...markerMeshes(model),
  ].map((mesh) => serializeMesh(mesh, model.scale, materials));
  return {
    schemaVersion: "mechanism-geometry-1",
    meshes,
    materials,
    dimensions: catalogDimensions(model),
  };
}

/** Appearance is independent of mesh parameters and topology. */
export function createTapeHookMaterials(
  style: TapeHookMaterialStyle = {},
): MechanismMaterial[] {
  const color = style.steelColor ?? "#b7c2c5";
  if (!/^#[\da-f]{6}$/i.test(color))
    throw new RangeError("materials.steel.color must be a six-digit hex color");
  const materials: (Pick<
    MechanismMaterial,
    "id" | "color" | "roughness" | "metalness"
  > &
    Partial<MechanismMaterial>)[] = [
    {
      id: "steel",
      color,
      roughness: bounded(
        style.steelRoughness ?? 0.24,
        0,
        1,
        "materials.steel.roughness",
      ),
      metalness: bounded(
        style.steelMetalness ?? 0.94,
        0,
        1,
        "materials.steel.metalness",
      ),
    },
    { id: "edges", color: "#9daeb3", roughness: 0.31, metalness: 0.85 },
    { id: "rubber", color: "#18272e", roughness: 0.68, metalness: 0.05 },
    { id: "yellow", color: "#efb642", roughness: 0.32, metalness: 0.15 },
    {
      id: "blade",
      color: "#ffffff",
      roughness: 0.31,
      metalness: 0.34,
      texture: { kind: "tape-graduations" },
    },
    {
      id: "wood",
      color: "#dfc29a",
      roughness: 0.76,
      metalness: 0,
      texture: { kind: "wood-grain", seed: 42 },
    },
    { id: "wall", color: "#728d93", roughness: 0.8, metalness: 0 },
    { id: "floor", color: "#b5c1c0", roughness: 0.8, metalness: 0 },
    {
      id: "teal",
      color: "#12b5ab",
      roughness: 0.3,
      metalness: 0.3,
      emissive: "#08776f",
      emissiveIntensity: 0.25,
    },
  ];
  return materials.map((material) => ({
    opacity: 1,
    alphaMode: "opaque",
    alphaCutoff: 0.5,
    side: "front",
    emissive: "#000000",
    emissiveIntensity: 0,
    ...material,
  }));
}

function resolveDimensions(
  parameters: TapeHookGeometryParameters,
): ModelDimensions {
  return {
    hookThickness: bounded(
      parameters.hookThickness ?? 0.18,
      0.04,
      0.35,
      "model.hookThickness",
    ),
    bladeLength: bounded(
      parameters.bladeLength ?? 10,
      4,
      20,
      "model.bladeLength",
    ),
    bladeWidth: bounded(parameters.bladeWidth ?? 2, 1, 3, "model.bladeWidth"),
    scale: bounded(parameters.scale ?? 1, 0.1, 10, "model.scale"),
  };
}

function bounded(
  value: number,
  min: number,
  max: number,
  path: string,
): number {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new RangeError(`${path} must be finite and within [${min}, ${max}]`);
  return value;
}

function catalogDimensions(model: ModelDimensions): TapeHookDimensions {
  const scaled = (value: number) => value * model.scale;
  return {
    hookThickness: scaled(model.hookThickness),
    hookTravel: scaled(model.hookThickness),
    bladeLength: scaled(model.bladeLength),
    bladeWidth: scaled(model.bladeWidth),
    bladeStart: scaled(model.hookThickness + 0.025),
    bladeThickness: scaled(0.06),
    flangeThickness: scaled(0.09),
    slotCenters: SLOT_CENTERS.map(scaled),
    slotLength: scaled(model.hookThickness + SLOT_END_CLEARANCE * 2),
    slotWidth: scaled(0.23),
    slotEndClearance: scaled(SLOT_END_CLEARANCE),
    rivetStemRadius: scaled(0.085),
    datumMarkerMidpoint: [0, scaled(1.375), scaled(1.15)],
    thicknessMarkerMidpoint: [
      scaled(-model.hookThickness / 2),
      scaled(1.18),
      scaled(1.2),
    ],
    travelMarkerMidpoint: [
      scaled(0.72 - model.hookThickness / 2),
      scaled(2.22),
      scaled(0.47),
    ],
    scale: model.scale,
  };
}

function roundedRectangle(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): Path {
  return new Path()
    .moveTo(x + radius, y)
    .lineTo(x + width - radius, y)
    .quadraticCurveTo(x + width, y, x + width, y + radius)
    .lineTo(x + width, y + height - radius)
    .quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    .lineTo(x + radius, y + height)
    .quadraticCurveTo(x, y + height, x, y + height - radius)
    .lineTo(x, y + radius)
    .quadraticCurveTo(x, y, x + radius, y);
}

function hookMeshes(model: ModelDimensions): MeshSpecification[] {
  const thickness = model.hookThickness;
  const width = model.bladeWidth + 0.14;
  const outline = roundedRectangle(-thickness, -width / 2, 2.25, width, 0.065);
  const flange = new Shape(outline.getPoints(16));
  flange.holes = SLOT_CENTERS.map((center) =>
    roundedRectangle(
      center - thickness - SLOT_END_CLEARANCE,
      -0.115,
      thickness + SLOT_END_CLEARANCE * 2,
      0.23,
      0.07,
    ),
  );
  const geometry = new ExtrudeGeometry(flange, {
    depth: 0.09,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.014,
    bevelThickness: 0.014,
    curveSegments: 16,
  }).translate(0, 0, 2.01);
  return [
    { id: "hook-flange", partId: "hook", materialId: "steel", geometry },
    roundedBox(
      "hook-front",
      "hook",
      "steel",
      [thickness, width, 1.65],
      [-thickness / 2, 0, 1.265],
      0.045,
    ),
    roundedBox(
      "hook-fold",
      "hook",
      "steel",
      [thickness + 0.02, width, 0.14],
      [-thickness / 2 + 0.015, 0, 1.99],
      0.055,
    ),
  ];
}

function bladeMeshes(model: ModelDimensions): MeshSpecification[] {
  return [
    {
      id: "blade-curved",
      partId: "blade",
      materialId: "blade",
      groupMaterialIds: ["blade", "edges"],
      geometry: curvedBlade(model),
    },
    ...SLOT_CENTERS.flatMap((center, index) => rivetMeshes(center, index + 1)),
  ];
}

function rivetMeshes(center: number, index: number): MeshSpecification[] {
  return [
    {
      id: `rivet-${index}-stem`,
      partId: "blade",
      materialId: "edges",
      geometry: new CylinderGeometry(0.085, 0.085, 0.24, 24)
        .rotateX(Math.PI / 2)
        .translate(center, 0, 2.005),
    },
    {
      id: `rivet-${index}-cap`,
      partId: "blade",
      materialId: "steel",
      geometry: new SphereGeometry(0.13, 24, 16)
        .scale(1, 1, 0.38)
        .translate(center, 0, 2.15),
    },
    {
      id: `rivet-${index}-ring`,
      partId: "blade",
      materialId: "edges",
      geometry: new TorusGeometry(0.105, 0.009, 8, 24).translate(
        center,
        0,
        2.154,
      ),
    },
  ];
}

/** Solid source markers; the decorative face-glow plane is omitted to preserve physical visibility. */
function markerMeshes(model: ModelDimensions): MeshSpecification[] {
  const thickness = model.hookThickness;
  return [
    markerTube(
      "datum-line",
      "datum",
      [0, -1.15, -0.05],
      [0, -1.15, 2.8],
      0.012,
    ),
    markerTube(
      "thickness-crossbar",
      "thickness",
      [-thickness, -1.2, 1.18],
      [0, -1.2, 1.18],
      0.009,
    ),
    ...[-thickness, 0].map((x, index) =>
      markerTube(
        `thickness-tick-${index + 1}`,
        "thickness",
        [x, -1.2, 1],
        [x, -1.2, 1.36],
        0.009,
      ),
    ),
    markerTube(
      "travel-crossbar",
      "travel",
      [0.72 - thickness, -0.47, 2.22],
      [0.72, -0.47, 2.22],
      0.008,
    ),
    ...[0.72 - thickness, 0.72].map((x, index) =>
      markerTube(
        `travel-tick-${index + 1}`,
        "travel",
        [x, -0.53, 2.22],
        [x, -0.41, 2.22],
        0.008,
      ),
    ),
  ];
}

function markerTube(
  id: string,
  partId: string,
  start: GeometryVector3,
  end: GeometryVector3,
  radius: number,
): MeshSpecification {
  const a = new Vector3(...start),
    b = new Vector3(...end);
  const direction = b.clone().sub(a);
  const midpoint = a.clone().add(b).multiplyScalar(0.5);
  const rotation = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    direction.clone().normalize(),
  );
  return {
    id,
    partId,
    materialId: "teal",
    geometry: new CylinderGeometry(radius, radius, direction.length(), 12)
      .applyQuaternion(rotation)
      .translate(...midpoint.toArray()),
  };
}

function housingMeshes(): MeshSpecification[] {
  const housing = [
    roundedBox(
      "housing-shell",
      "housing",
      "rubber",
      [3.2, 2.65, 3.3],
      [0, 0, 0],
      0.43,
    ),
    roundedBox(
      "housing-inset",
      "housing",
      "yellow",
      [2.65, 2.77, 2.7],
      [0.02, 0, 0.08],
      0.45,
    ),
    roundedBox(
      "housing-base",
      "housing",
      "rubber",
      [2.9, 2.9, 0.42],
      [0, 0, -1.3],
      0.13,
    ),
    roundedBox(
      "housing-lock",
      "housing",
      "rubber",
      [0.58, 1.25, 0.4],
      [-1.4, 0, 0.69],
      0.12,
    ),
  ];
  for (let index = 0; index < 7; index++) {
    housing.push(
      roundedBox(
        `housing-grip-${index + 1}`,
        "housing",
        "edges",
        [0.1, 2.8, 0.055],
        [-0.95 + index * 0.31, 0, -1.49],
        0.014,
      ),
    );
  }
  // Housing vertices remain local to its own pivot; scene placement is a part transform.
  return housing;
}

function contactMeshes(): MeshSpecification[] {
  return [
    roundedBox(
      "contact-board",
      "board",
      "wood",
      [9, 3.2, 2.2],
      [4.5, 0, 0.71],
      0.045,
    ),
    roundedBox("contact-wall", "wall", "wall", [2, 5, 7], [-1, 1, 2], 0.008),
    roundedBox(
      "studio-floor",
      "floor",
      "floor",
      [200, 200, 0.1],
      [0, 0, -1.55],
      0.01,
    ),
  ];
}

function roundedBox(
  id: string,
  partId: string,
  materialId: string,
  size: GeometryVector3,
  position: GeometryVector3,
  radius: number,
): MeshSpecification {
  const safeRadius = Math.min(radius, ...size.map((side) => side * 0.45));
  return {
    id,
    partId,
    materialId,
    geometry: new RoundedBoxGeometry(...size, 3, safeRadius).translate(
      ...position,
    ),
  };
}

/** Closed curved metal: top, underside and four walls, with consistent outward winding. */
function curvedBlade(model: ModelDimensions): BufferGeometry {
  const columns = 80;
  const rows = 24;
  const positions: number[] = [];
  const uvs: number[] = [];
  const topIndices: number[] = [];
  const undersideIndices: number[] = [];
  const wallIndices: number[] = [];
  const surfaceSize = (columns + 1) * (rows + 1);
  for (let side = 0; side < 2; side++) {
    for (let column = 0; column <= columns; column++) {
      for (let row = 0; row <= rows; row++) {
        const normalizedY = -1 + (row / rows) * 2;
        positions.push(
          model.hookThickness + 0.025 + (column / columns) * model.bladeLength,
          (normalizedY * model.bladeWidth) / 2,
          1.91 + 0.075 * (1 - normalizedY * normalizedY) - side * 0.06,
        );
        uvs.push(column / columns, row / rows);
      }
    }
  }
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      const a = column * (rows + 1) + row;
      const b = a + rows + 1;
      topIndices.push(a, b, a + 1, a + 1, b, b + 1);
      undersideIndices.push(
        a + surfaceSize,
        a + 1 + surfaceSize,
        b + surfaceSize,
        a + 1 + surfaceSize,
        b + 1 + surfaceSize,
        b + surfaceSize,
      );
    }
  }
  const boundary = [
    ...Array.from({ length: columns + 1 }, (_, column) => column * (rows + 1)),
    ...Array.from({ length: rows }, (_, row) => columns * (rows + 1) + row + 1),
    ...Array.from(
      { length: columns },
      (_, column) => (columns - 1 - column) * (rows + 1) + rows,
    ),
    ...Array.from({ length: rows - 1 }, (_, row) => rows - 1 - row),
  ];
  for (let index = 0; index < boundary.length; index++) {
    const a = boundary[index]!;
    const b = boundary[(index + 1) % boundary.length]!;
    wallIndices.push(
      a,
      a + surfaceSize,
      b,
      b,
      a + surfaceSize,
      b + surfaceSize,
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex([...topIndices, ...undersideIndices, ...wallIndices]);
  geometry.addGroup(0, topIndices.length, 0);
  geometry.addGroup(topIndices.length, undersideIndices.length, 1);
  geometry.addGroup(
    topIndices.length + undersideIndices.length,
    wallIndices.length,
    1,
  );
  geometry.computeVertexNormals();
  return geometry;
}

function serializeMesh(
  specification: MeshSpecification,
  scale: number,
  materials: readonly MechanismMaterial[],
): IndexedMechanismMesh {
  const original = specification.geometry;
  original.applyMatrix4(SOURCE_TO_Y_UP).scale(scale, scale, scale);
  const indexed = mergeVertices(original, 1e-7);
  indexed.computeBoundingBox();
  const positions = Array.from(indexed.getAttribute("position").array);
  const normals = Array.from(indexed.getAttribute("normal").array);
  const uvs = Array.from(indexed.getAttribute("uv").array);
  const indices = Array.from(indexed.getIndex()!.array);
  const mesh: IndexedMechanismMesh = {
    id: specification.id,
    partId: specification.partId,
    materialId: specification.materialId,
    positions,
    normals,
    uvs,
    indices,
    groups: serializedMaterialGroups(specification, indexed, materials),
    bounds: {
      min: indexed.boundingBox!.min.toArray(),
      max: indexed.boundingBox!.max.toArray(),
    },
  };
  original.dispose();
  indexed.dispose();
  return mesh;
}

/** Explicit authored group IDs map to the global reusable material catalog. */
function serializedMaterialGroups(
  specification: MeshSpecification,
  geometry: BufferGeometry,
  materials: readonly MechanismMaterial[],
): IndexedMechanismMesh["groups"] {
  const materialIndex = (id: string | undefined) => {
    const index = materials.findIndex((material) => material.id === id);
    if (index < 0)
      throw new RangeError(`${specification.id}: unknown group material ${id}`);
    return index;
  };
  const count = geometry.getIndex()!.count;
  if (!specification.groupMaterialIds)
    return [
      {
        start: 0,
        count,
        materialIndex: materialIndex(specification.materialId),
      },
    ];
  let end = 0;
  const groups = geometry.groups.map((group) => {
    if (
      !Number.isInteger(group.start) ||
      !Number.isInteger(group.count) ||
      group.start !== end ||
      group.count <= 0 ||
      group.count % 3 !== 0 ||
      group.start + group.count > count ||
      !Number.isInteger(group.materialIndex) ||
      group.materialIndex === undefined ||
      group.materialIndex < 0 ||
      group.materialIndex >= specification.groupMaterialIds!.length
    )
      throw new RangeError(
        `${specification.id}: invalid authored material group`,
      );
    end = group.start + group.count;
    return {
      start: group.start,
      count: group.count,
      materialIndex: materialIndex(
        specification.groupMaterialIds![group.materialIndex],
      ),
    };
  });
  if (end !== count)
    throw new RangeError(
      `${specification.id}: material groups must cover every triangle`,
    );
  return groups;
}
