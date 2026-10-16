import { describe, expect, it } from "vitest";
import {
  MechanismSceneV2Schema,
  MechanismSceneSchema,
} from "@still-shift/scene-contract";
import {
  nativeSolidFixture,
  nativeFixtureHash,
} from "../helpers/native3d-fixture.ts";

function fixture() {
  const base = nativeSolidFixture();
  return {
    ...base,
    schemaVersion: "mechanism-scene-2",
    rigs: [
      {
        id: "slide",
        type: "slider",
        movingPart: "child",
        referencePart: "root",
        axis: [1, 0, 0],
        range: [0, 2],
        neutral: 0,
      },
    ],
    teachingShapes: [],
    anchors: base.anchors.map((anchor) => ({
      id: anchor.id,
      role: "proof-target",
      source: {
        kind: "part-local",
        part: anchor.part,
        position: anchor.position,
      },
    })),
    relationships: [],
  };
}

function issues(input: unknown) {
  const result = MechanismSceneV2Schema.safeParse(input);
  if (result.success) throw new Error("Expected rejection");
  return result.error.issues;
}
function expectPath(input: unknown, path: (string | number)[], code: string) {
  expect(issues(input)).toContainEqual(
    expect.objectContaining({ path, params: { diagnosticCode: code } }),
  );
}

/** Declaration fixtures exercise references; they do not claim prepared generator topology. */
function spring(id: string, mesh: string, coilSamples = 64) {
  return {
    id,
    mesh,
    ownerPart: "root",
    topologySha256: nativeFixtureHash,
    generator: "seated-torsion-spring-1",
    seats: ["seatA", "seatB"],
    landmarks: ["seat-a", "seat-b", "coil-a", "coil-b"].map((id) => ({
      id,
      vertexIndices: [0, 1, 2],
    })),
    parameters: {
      coilCenter: [0, 0, 0],
      axis: [1, 0, 0],
      coilRadius: 2,
      wireRadius: 0.2,
      turns: 2,
      pitch: 0.6,
      coilSamples,
      legSamples: 8,
      tubeSides: 3,
      terminalTangents: [
        [0, 1, 0],
        [0, -1, 0],
      ],
    },
  };
}
function springScene() {
  const base = fixture();
  return {
    ...base,
    teachingShapes: [spring("spring", "floor")],
    anchors: [
      ...base.anchors,
      {
        id: "seatA",
        role: "seat",
        source: { kind: "part-local", part: "root", position: [0, 0, 0] },
      },
      {
        id: "seatB",
        role: "seat",
        source: { kind: "part-local", part: "child", position: [0, 2, 0] },
      },
    ],
  };
}

describe("reusable mechanism scene declaration admission", () => {
  it("admits non-E01 geometry and preserves strict legacy tape parsing", () => {
    const scene = MechanismSceneV2Schema.parse(fixture());
    expect(scene.geometry).not.toHaveProperty("dimensions");
    expect(scene.schemaVersion).toBe("mechanism-scene-2");
    expect(MechanismSceneSchema.safeParse(fixture()).success).toBe(false);
    expect(
      MechanismSceneV2Schema.safeParse({ ...fixture(), dimensions: {} })
        .success,
    ).toBe(false);
  });
  it("locates duplicate part writers and missing owner/reference parts", () => {
    const base = fixture();
    expectPath(
      { ...base, rigs: [...base.rigs, { ...base.rigs[0], id: "other" }] },
      ["rigs", 1, "movingPart"],
      "mechanism-control-owner",
    );
    expectPath(
      { ...base, rigs: [{ ...base.rigs[0], referencePart: "missing" }] },
      ["rigs", 0, "referencePart"],
      "mechanism-reference",
    );
    expectPath(
      {
        ...base,
        geometry: {
          ...base.geometry,
          meshes: [{ ...base.geometry.meshes[0], partId: "missing" }],
        },
      },
      ["geometry", "meshes", 0, "partId"],
      "mechanism-reference",
    );
  });
  it("rejects parent/reference dependency cycles and admits an acyclic sibling frame", () => {
    const base = fixture();
    expectPath(
      { ...base, parts: [{ id: "root", parent: "child" }, { id: "child" }] },
      ["rigs", 0, "referencePart"],
      "mechanism-rig-cycle",
    );
    expectPath(
      {
        ...base,
        rigs: [
          ...base.rigs,
          {
            ...base.rigs[0],
            id: "reverse",
            movingPart: "root",
            referencePart: "child",
          },
        ],
      },
      ["rigs", 0, "referencePart"],
      "mechanism-rig-cycle",
    );
    expect(
      MechanismSceneV2Schema.safeParse({
        ...base,
        parts: [...base.parts, { id: "frame", parent: "root" }],
        rigs: [{ ...base.rigs[0], referencePart: "frame" }],
      }).success,
    ).toBe(true);
  });
  it("checks return target kind, rest limits and one return writer", () => {
    const base = fixture();
    const ret = {
      id: "return",
      type: "spring-return",
      targetRig: "slide",
      restValue: 0,
      returnFrames: 12,
      easing: "smoothstep",
    };
    expect(
      MechanismSceneV2Schema.safeParse({ ...base, rigs: [...base.rigs, ret] })
        .success,
    ).toBe(true);
    expectPath(
      { ...base, rigs: [...base.rigs, { ...ret, restValue: 3 }] },
      ["rigs", 1, "restValue"],
      "mechanism-return-range",
    );
    expectPath(
      { ...base, rigs: [...base.rigs, ret, { ...ret, id: "other" }] },
      ["rigs", 2, "targetRig"],
      "mechanism-control-owner",
    );
    expectPath(
      { ...base, rigs: [...base.rigs, { ...ret, targetRig: "return" }] },
      ["rigs", 1, "targetRig"],
      "mechanism-return-target",
    );
  });
  it("locates missing generated landmarks instead of accepting a fixed fallback", () => {
    const base = springScene();
    expect(MechanismSceneV2Schema.safeParse(base).success).toBe(true);
    expectPath(
      {
        ...base,
        anchors: [
          ...base.anchors,
          {
            id: "wrong",
            role: "contact",
            source: {
              kind: "shape-landmark",
              shape: "spring",
              landmark: "tip",
            },
          },
        ],
      },
      ["anchors", 5, "source", "landmark"],
      "mechanism-shape-landmark",
    );
    expectPath(
      {
        ...base,
        teachingShapes: [
          {
            ...base.teachingShapes[0],
            landmarks: [
              { id: "seat-a", vertexIndices: [0, 1, 9] },
              ...base.teachingShapes[0]!.landmarks.slice(1),
            ],
          },
        ],
      },
      ["teachingShapes", 0, "landmarks", 0, "vertexIndices"],
      "mechanism-shape-landmark",
    );
  });
  it("keeps spring seats rigid and changing mesh ownership exclusive", () => {
    const base = springScene();
    expectPath(
      {
        ...base,
        anchors: base.anchors.map((anchor) =>
          anchor.id === "seatB"
            ? {
                ...anchor,
                source: {
                  kind: "shape-landmark",
                  shape: "spring",
                  landmark: "seat-b",
                },
              }
            : anchor,
        ),
      },
      ["teachingShapes", 0, "seats", 1],
      "mechanism-spring-seat",
    );
    expectPath(
      {
        ...base,
        teachingShapes: [
          ...base.teachingShapes,
          { ...base.teachingShapes[0], id: "other" },
        ],
      },
      ["teachingShapes", 1, "mesh"],
      "mechanism-control-owner",
    );
    expectPath(
      {
        ...base,
        teachingShapes: [{ ...base.teachingShapes[0], ownerPart: "child" }],
      },
      ["teachingShapes", 0, "mesh"],
      "mechanism-shape-owner",
    );
  });
  it("enforces the aggregate centerline cap across individually admissible shapes", () => {
    const base = springScene();
    const mesh = { ...base.geometry.meshes[0], id: "otherMesh" };
    const input = {
      ...base,
      geometry: { ...base.geometry, meshes: [...base.geometry.meshes, mesh] },
      teachingShapes: [...base.teachingShapes, spring("other", "otherMesh")],
    };
    expectPath(input, ["teachingShapes"], "mechanism-shape-limit");
    expect(
      MechanismSceneV2Schema.safeParse({
        ...input,
        teachingShapes: [
          spring("spring", "floor", 48),
          spring("other", "otherMesh", 48),
        ],
      }).success,
    ).toBe(true);
  });
  it("checks relationship anchor/part references and ordered ranges", () => {
    const base = fixture();
    const relation = {
      id: "gap",
      type: "signed-gap",
      anchors: ["behind", "face"],
      axisPart: "root",
      axis: [1, 0, 0],
      range: [0, 2],
      tolerance: 1e-8,
    };
    expect(
      MechanismSceneV2Schema.safeParse({ ...base, relationships: [relation] })
        .success,
    ).toBe(true);
    expectPath(
      { ...base, relationships: [{ ...relation, axisPart: "missing" }] },
      ["relationships", 0, "axisPart"],
      "mechanism-reference",
    );
    expectPath(
      {
        ...base,
        relationships: [{ ...relation, anchors: ["behind", "missing"] }],
      },
      ["relationships", 0, "anchors", 1],
      "mechanism-reference",
    );
    expectPath(
      { ...base, relationships: [{ ...relation, range: [2, 0] }] },
      ["relationships", 0, "range"],
      "mechanism-relationship-range",
    );
  });
});
