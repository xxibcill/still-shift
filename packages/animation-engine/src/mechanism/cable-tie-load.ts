import { MechanismTransformSchema } from "@still-shift/scene-contract";
import {
  matrixFromTransform,
  transformPoint,
} from "../../../renderer-core/src/mechanism/matrix.ts";
import { transformMechanismDirectionV2 } from "../../../renderer-core/src/mechanism/matrix-v2.ts";
import { normalize } from "../../../renderer-core/src/mechanism/shape-math.ts";
import type {
  MechanismSceneV2,
  MechanismVector,
} from "@still-shift/scene-contract";
import type { CableTiePackParameters } from "./cable-tie-pack.ts";
import {
  createPackScene,
  createPackTeachingShape,
  offsetPackMesh,
} from "./pack-support.ts";
import { createMechanismPrimitiveGeometry } from "./primitive-mesh.ts";
import type { MechanismPrimitiveInput } from "./primitive-mesh.ts";

/** Patent 3,872,547 Figures10/11 qualitative load path. Dimensions, contact
 * constraint and compliance are authored teaching choices, not measured data. */
export function createLoadResponsiveCableScene(
  base: MechanismSceneV2,
  parameters: CableTiePackParameters,
) {
  const { pitch, strapWidth, toothCount } = parameters;
  const tilt = 0.12,
    stopRadius = 0.08;
  const pawlSeat: MechanismVector = [-0.05, 0.35, 0];
  const pawlTransform = MechanismTransformSchema.parse({
      rotation: [0, 0, tilt],
    }),
    pawlMatrix = matrixFromTransform(pawlTransform),
    posedSeat = transformPoint(pawlMatrix, pawlSeat),
    posedTangent = normalize(
      transformMechanismDirectionV2(pawlMatrix, [1, 0, 0]),
    );
  const rootSeat: MechanismVector = [-0.3, 0.35, 0];
  const meshes: MechanismPrimitiveInput[] = [
    {
      id: "strap.body",
      partId: "strap",
      materialId: "nylon",
      kind: "rounded-box",
      size: [(toothCount + 2) * pitch, 0.18, strapWidth],
      radius: 0.02,
      segments: 2,
    },
    {
      id: "pawl.body",
      partId: "pawl",
      materialId: "pawl",
      kind: "extruded-profile",
      depth: strapWidth * 0.8,
      points: [
        [0, 0],
        [0.1, 0.18],
        [pitch - 0.08, 0.18],
        [pitch, 0],
        [pitch + 0.1, 0.18],
        [pitch + 0.3, 0.18],
        [pitch + 0.3, 0.4],
        [-0.05, 0.4],
        [-0.05, 0.18],
      ],
    },
    {
      id: "pawl.stop",
      partId: "pawl",
      materialId: "pawl",
      kind: "extruded-profile",
      depth: strapWidth * 0.8,
      points: Array.from(
        { length: 17 },
        (_, i) =>
          [
            pitch + 0.22 + stopRadius * Math.cos(Math.PI + (i * Math.PI) / 16),
            0.18 + stopRadius * Math.sin(Math.PI + (i * Math.PI) / 16),
          ] as [number, number],
      ),
    },
    {
      id: "head.back",
      partId: "head",
      materialId: "nylon",
      kind: "rounded-box",
      size: [1.8, 0.95, 0.18],
      radius: 0.04,
      segments: 2,
    },
    {
      id: "head.webRoot",
      partId: "head",
      materialId: "nylon",
      kind: "rounded-box",
      size: [0.15, 0.5, strapWidth + 0.3],
      radius: 0.015,
      segments: 2,
    },
    {
      id: "head.stopLedge",
      partId: "head",
      materialId: "nylon",
      kind: "extruded-profile",
      depth: strapWidth + 0.3,
      points: [
        [pitch + 0.08, 0.05],
        [pitch + 0.575, 0.05],
        [pitch + 0.575, 0.1],
        [pitch + 0.08, 0.1],
      ],
    },
    {
      id: "head.guide",
      partId: "head",
      materialId: "nylon",
      kind: "rounded-box",
      size: [1.8, 0.12, strapWidth + 0.3],
      radius: 0.02,
      segments: 2,
    },
  ];
  for (let i = 0; i < toothCount; i++) {
    const x = i * pitch;
    meshes.push({
      id: `strap.tooth.${i}`,
      partId: "strap",
      materialId: "nylon",
      kind: "extruded-profile",
      depth: strapWidth * 0.85,
      points: [
        [x - 0.2, -0.1],
        [x - 0.08, 0],
        [x + 0.08, 0],
        [x + 0.15, -0.1],
      ],
    });
  }
  const nylon = base.geometry.materials.find((m) => m.id === "nylon")!;
  const geometry = createMechanismPrimitiveGeometry({
    meshes,
    materials: [nylon, { ...nylon, id: "pawl", color: "#c2a15d" }],
  });
  geometry.meshes = geometry.meshes.map((mesh) =>
    offsetPackMesh(
      mesh,
      mesh.id === "strap.body"
        ? [((toothCount - 1) * pitch) / 2, -0.19, 0]
        : mesh.id === "head.back"
          ? [0.45, 0.225, -strapWidth / 2 - 0.16]
          : mesh.id === "head.webRoot"
            ? [-0.375, 0.5, 0]
            : mesh.id === "head.guide"
              ? [0.45, -0.34, 0]
              : [
                  0,
                  0,
                  mesh.partId === "pawl"
                    ? -strapWidth * 0.4
                    : mesh.id === "head.stopLedge"
                      ? -(strapWidth + 0.3) / 2
                      : -strapWidth * 0.425,
                ],
    ),
  );
  const web = createPackTeachingShape(
    {
      id: "hinge.web",
      mesh: "hinge.web.mesh",
      ownerPart: "head",
      generator: "seated-flexible-web-1",
      seats: ["head.hingeSeat", "pawl.hingeSeat"],
      parameters: {
        width: strapWidth * 0.7,
        thickness: 0.018,
        widthAxis: [0, 0, 1],
        minSpan: 0.08,
        maxSpan: 0.4,
        longitudinalSegments: 16,
        terminalTangents: [
          [1, 0, 0],
          [1, 0, 0],
        ],
      },
    },
    "pawl",
    {
      generator: "seated-flexible-web-1",
      seats: [rootSeat, posedSeat],
      terminalTangents: [[1, 0, 0], posedTangent],
    },
  );
  geometry.meshes.push(web.mesh);
  const rigid = (
    id: string,
    part: string,
    position: MechanismVector,
    role: "contact" | "seat" | "proof-target" = "contact",
  ) => ({ id, role, source: { kind: "part-local" as const, part, position } });
  const stopX = pitch + 0.22;
  return createPackScene({
    id: "cable-tie-hinged-load-stop-pack",
    geometry,
    parts: [
      base.parts.find((p) => p.id === "mount")!,
      { id: "model", parent: "mount" },
      { id: "head", parent: "model" },
      { id: "strap", parent: "model" },
      { id: "pawl", parent: "model", transform: { rotation: [0, 0, tilt] } },
    ],
    rigs: [
      {
        id: "load",
        type: "load-seat",
        movingPart: "pawl",
        reactionPart: "strap",
        referencePart: "model",
        reactionAxis: [1, 0, 0],
        normalAxis: [0, 1, 0],
        pivot: [pitch + 0.4, 0.4, 0],
        contactPoint: [0, 0, 0],
        maxForceNewtons: 30,
        complianceMetersPerNewton: 0.0001,
        maxTravelMeters: 0.0008,
        seatingAngleRadians: -tilt,
      },
    ],
    teachingShapes: [web.declaration],
    anchors: [
      rigid("pawl.primaryTooth", "pawl", [0, 0, 0]),
      rigid("strap.primaryTooth", "strap", [0, 0, 0]),
      rigid("pawl.secondaryTooth", "pawl", [pitch, 0, 0]),
      rigid("strap.secondaryTooth", "strap", [pitch, 0, 0]),
      rigid("pawl.stopFoot", "pawl", [stopX, 0.1, 0]),
      rigid("head.stopSurface", "head", [stopX, 0.1, 0]),
      rigid("head.hingeSeat", "head", rootSeat, "seat"),
      rigid("pawl.hingeSeat", "pawl", pawlSeat, "seat"),
      {
        id: "hinge.fixedEnd",
        role: "proof-target",
        source: {
          kind: "shape-landmark",
          shape: "hinge.web",
          landmark: "seat-a",
        },
      },
      {
        id: "hinge.movingEnd",
        role: "proof-target",
        source: {
          kind: "shape-landmark",
          shape: "hinge.web",
          landmark: "seat-b",
        },
      },
    ],
    relationships: [
      {
        id: "primary.contact",
        type: "coincident",
        anchors: ["pawl.primaryTooth", "strap.primaryTooth"],
        tolerance: 1e-8,
      },
      {
        id: "secondary.gap",
        type: "signed-gap",
        anchors: ["strap.secondaryTooth", "pawl.secondaryTooth"],
        axisPart: "model",
        axis: [0, 1, 0],
        range: [0, pitch * Math.sin(tilt)],
        tolerance: 1e-8,
      },
      {
        id: "stop.gap",
        type: "signed-gap",
        anchors: ["head.stopSurface", "pawl.stopFoot"],
        axisPart: "model",
        axis: [0, 1, 0],
        range: [0, stopX * Math.sin(tilt) + 0.1 * (Math.cos(tilt) - 1)],
        tolerance: 1e-8,
      },
      {
        id: "hinge.root.attached",
        type: "coincident",
        anchors: ["head.hingeSeat", "hinge.fixedEnd"],
        tolerance: 1e-8,
      },
      {
        id: "hinge.pawl.attached",
        type: "coincident",
        anchors: ["pawl.hingeSeat", "hinge.movingEnd"],
        tolerance: 1e-8,
      },
    ],
    camera: {
      position: [0.3, 1.2, 4],
      target: [0.3, 0.15, 0],
      fovDegrees: 38,
      near: 0.1,
      far: 100,
    },
  });
}
