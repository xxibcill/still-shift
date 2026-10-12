import { createHash } from "node:crypto";
import {
  MechanismSceneV2Schema,
  MechanismTeachingShapeSchema,
} from "@still-shift/scene-contract";
import {
  createMechanismTeachingTopology,
  mechanismTeachingTopologyDocument,
} from "../../packages/renderer-core/src/mechanism/teaching-topology.ts";
import { createMechanismTeachingMesh } from "../../packages/renderer-core/src/mechanism/teaching-shapes.ts";
import { canonicalMechanismJson } from "../../packages/renderer-core/src/mechanism/canonical.ts";
import { nativeSolidFixture, nativeFixtureHash } from "./native3d-fixture.ts";

/** Real generated neutral topology for two closed teaching shapes; no product-pack claim. */
export function mechanismV2Fixture() {
  const base = nativeSolidFixture();
  const pawlRecipe = {
    generator: "fixed-root-pawl-curve-1" as const,
    parameters: {
      length: 10,
      width: 2,
      thickness: 0.5,
      maxDeflection: 2,
      longitudinalSegments: 8,
    },
  };
  const springRecipe = {
    generator: "seated-torsion-spring-1" as const,
    parameters: {
      coilCenter: [0, 0, 0] as [number, number, number],
      axis: [1, 0, 0] as [number, number, number],
      coilRadius: 2,
      wireRadius: 0.2,
      turns: 2,
      pitch: 0.6,
      coilSamples: 24,
      legSamples: 4,
      tubeSides: 8,
      terminalTangents: [
        [1, 0, 0],
        [1, 0, 0],
      ] as [[number, number, number], [number, number, number]],
    },
  };
  const pawl = MechanismTeachingShapeSchema.parse({
    ...pawlRecipe,
    id: "pawl",
    mesh: "pawl.mesh",
    ownerPart: "root",
    topologySha256: nativeFixtureHash,
    driver: { rig: "latch", channel: "pawlDeflection" },
    landmarks: createMechanismTeachingTopology(pawlRecipe).landmarks,
  });
  const spring = MechanismTeachingShapeSchema.parse({
    ...springRecipe,
    id: "spring",
    mesh: "spring.mesh",
    ownerPart: "root",
    topologySha256: nativeFixtureHash,
    seats: ["seat.a", "seat.b"],
    landmarks: createMechanismTeachingTopology(springRecipe).landmarks,
  });
  const pawlMesh = createMechanismTeachingMesh(pawl, "paint", {
    generator: "fixed-root-pawl-curve-1",
    deflection: 0,
  });
  const springMesh = createMechanismTeachingMesh(spring, "paint", {
    generator: "seated-torsion-spring-1",
    seats: [
      [-4, 0, 0],
      [4, 0, 0],
    ],
    terminalTangents: [
      [1, 0, 0],
      [1, 0, 0],
    ],
  });
  pawl.topologySha256 =
    "sha256:" +
    createHash("sha256")
      .update(
        canonicalMechanismJson(
          mechanismTeachingTopologyDocument(pawl, pawlMesh),
        ),
      )
      .digest("hex");
  spring.topologySha256 =
    "sha256:" +
    createHash("sha256")
      .update(
        canonicalMechanismJson(
          mechanismTeachingTopologyDocument(spring, springMesh),
        ),
      )
      .digest("hex");
  const geometry = {
    ...base.geometry,
    meshes: [...base.geometry.meshes, pawlMesh, springMesh],
  };
  return MechanismSceneV2Schema.parse({
    ...base,
    schemaVersion: "mechanism-scene-2",
    geometry,
    geometrySha256:
      "sha256:" +
      createHash("sha256")
        .update(canonicalMechanismJson(geometry))
        .digest("hex"),
    parts: [
      ...base.parts,
      { id: "jaw", parent: "root" },
      { id: "cable", parent: "root" },
    ],
    rigs: [
      {
        id: "slide",
        type: "slider",
        movingPart: "child",
        referencePart: "root",
        axis: [1, 0, 0],
        range: [0, 10],
        neutral: 0,
      },
      {
        id: "hinge",
        type: "hinge",
        movingPart: "jaw",
        referencePart: "root",
        axis: [0, 0, 1],
        pivot: [0, 0, 0],
        angleRange: [-Math.PI / 2, Math.PI / 2],
        neutralAngle: 0,
      },
      {
        id: "return",
        type: "spring-return",
        targetRig: "slide",
        restValue: 0,
        returnFrames: 10,
        easing: "linear",
      },
      {
        id: "latch",
        type: "ratchet",
        movingPart: "cable",
        referencePart: "root",
        axis: [1, 0, 0],
        range: [0, 4],
        pitch: 1,
        toothCount: 5,
        neutralTooth: 0,
        pawlShape: "pawl",
        pawlTipAnchor: "pawl.tip",
        toothDatumAnchor: "cable.datum",
      },
    ],
    teachingShapes: [pawl, spring],
    anchors: [
      {
        id: "pawl.root",
        role: "proof-target",
        source: { kind: "shape-landmark", shape: "pawl", landmark: "root" },
      },
      {
        id: "pawl.tip",
        role: "contact",
        source: { kind: "shape-landmark", shape: "pawl", landmark: "tip" },
      },
      {
        id: "cable.datum",
        role: "contact",
        source: { kind: "part-local", part: "cable", position: [10, 0, 0] },
      },
      {
        id: "seat.a",
        role: "seat",
        source: { kind: "part-local", part: "root", position: [-4, 0, 0] },
      },
      {
        id: "seat.b",
        role: "seat",
        source: { kind: "part-local", part: "jaw", position: [4, 0, 0] },
      },
      {
        id: "spring.seat.b",
        role: "seat",
        source: { kind: "shape-landmark", shape: "spring", landmark: "seat-b" },
      },
      {
        id: "child.origin",
        role: "annotation",
        source: { kind: "part-local", part: "child", position: [0, 0, 0] },
      },
      {
        id: "jaw.point",
        role: "proof-target",
        source: { kind: "part-local", part: "jaw", position: [1, 0, 0] },
      },
    ],
    relationships: [
      {
        id: "seat.contact",
        type: "coincident",
        anchors: ["seat.b", "spring.seat.b"],
        tolerance: 1e-8,
      },
      {
        id: "engagement",
        type: "engagement",
        rig: "latch",
        pawlTip: "pawl.tip",
        toothDatum: "cable.datum",
        clearance: [0, 0],
        tolerance: 1e-8,
      },
    ],
  });
}
