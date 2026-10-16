import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MechanismPackDocumentSchema } from "@still-shift/scene-contract";
import {
  createCableTiePack,
  inspectCableTiePack,
  evaluateCableTiePackFrame,
  CableTiePackParametersSchema,
} from "../../packages/animation-engine/src/mechanism/cable-tie-pack.ts";
import {
  createClothespegPack,
  inspectClothespegPack,
  evaluateClothespegPackFrame,
} from "../../packages/animation-engine/src/mechanism/clothespeg-pack.ts";
import {
  createTapeHookPack,
  inspectTapeHookPack,
  MechanismPackInvariantError,
} from "../../packages/animation-engine/src/mechanism/tape-hook-pack.ts";
import { mechanismPackHash } from "../../packages/animation-engine/src/mechanism/pack-support.ts";
import { prepareMechanismSceneV2 } from "../../packages/renderer-core/src/mechanism/prepare-v2.ts";
import { evaluateMechanismFrameV2 } from "../../packages/renderer-core/src/mechanism/evaluate-v2.ts";
import { mechanismV2Fixture } from "../helpers/mechanism-v2-fixture.ts";
const request = (frame: number) => ({ frame, width: 640, height: 360 });
const mount = {
  position: [8, 3, -4] as [number, number, number],
  rotation: [0.3, -0.2, 0.4] as [number, number, number],
  scale: [1.2, 0.8, 1.1] as [number, number, number],
};
const latch = (position: number) => ({
  ratchet: {
    type: "ratchet" as const,
    position: { value: position },
    latchKeys: [{ frame: 0, state: "engaged" as const }],
  },
});
function sourceWithoutPack(
  scene: ReturnType<typeof createCableTiePack>["scene"],
) {
  const source = { ...scene };
  delete source.pack;
  return source;
}
function locatedFailure(run: () => unknown) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(MechanismPackInvariantError);
    return (error as MechanismPackInvariantError).location;
  }
  throw new Error("Expected a located pack invariant rejection");
}
function invalidMetadata(
  pack: ReturnType<typeof inspectCableTiePack>["pack"],
  path: (string | number)[],
) {
  const result = MechanismPackDocumentSchema.safeParse(pack);
  expect(result.success).toBe(false);
  if (result.success) throw new Error("Expected metadata rejection");
  expect(
    result.error.issues.some(
      (issue) => JSON.stringify(issue.path) === JSON.stringify(path),
    ),
  ).toBe(true);
}
describe("fact-bound reusable pack candidates", () => {
  it("binds actual default scenes, mesh buffers and parameter schema without returning payloads", () => {
    for (const [instance, metadata] of [
      [createTapeHookPack(), inspectTapeHookPack()],
      [createCableTiePack(), inspectCableTiePack()],
      [createClothespegPack(), inspectClothespegPack()],
    ] as const) {
      expect(metadata.pack.status).toBe("candidate");
      expect(metadata.pack.generator.defaultSourceSha256).toBe(
        mechanismPackHash(sourceWithoutPack(instance.scene)),
      );
      expect(instance.pack.sha256).toBe(mechanismPackHash(metadata.pack));
      for (const mesh of instance.scene.geometry.meshes)
        expect(
          metadata.pack.meshes.find((row) => row.id === mesh.id)?.sha256,
        ).toBe(mechanismPackHash(mesh));
      const json = JSON.stringify(metadata);
      expect(Buffer.byteLength(json)).toBeLessThanOrEqual(32768);
      for (const forbidden of [
        "positions",
        "normals",
        "uvs",
        "indices",
        "vertexIndices",
        "pixelData",
      ])
        expect(json).not.toContain(`"${forbidden}"`);
      expect(
        metadata.pack.cameraTargets.map((target) => target.intent),
      ).toHaveLength(6);
      expect(Object.isFrozen(instance.scene)).toBe(true);
    }
    expect(inspectCableTiePack().pack.generator.parameterSchemaSha256).toBe(
      mechanismPackHash(z.toJSONSchema(CableTiePackParametersSchema)),
    );
  });
  it("declares selected variants without a release lever or manufactured peg hinge pin", () => {
    const tie = createCableTiePack(),
      peg = createClothespegPack();
    expect(tie.pack.variant).toBe("outside-serrated-integral-pawl-cutaway");
    expect(
      tie.scene.parts.find((part) => part.id === "pawl.root")?.parent,
    ).toBe("head");
    expect(tie.scene.rigs.some((rig) => rig.type === "hinge")).toBe(false);
    expect(peg.pack.variant).toBe("wood-arms-central-spring-cloth");
    expect(
      peg.scene.geometry.meshes.some((mesh) => /pin|axle/i.test(mesh.id)),
    ).toBe(false);
    expect(peg.scene.teachingShapes[0]!.generator).toBe(
      "seated-torsion-spring-1",
    );
    expect(
      peg.scene.geometry.materials.find((material) => material.id === "wood")
        ?.texture?.kind,
    ).toBe("wood-grain");
  });
  it("keeps the pawl root attached and measures contact only when seated across non-binary pitches and moving mounts", () => {
    for (const pitch of [0.35, 0.48, 0.5, 0.6, 0.7]) {
      const instance = createCableTiePack({
        parameters: { pitch, strapWidth: 1.4, toothCount: 12 },
        mount,
      });
      const neutral = evaluateCableTiePackFrame(instance, request(0)).frame;
      for (const tooth of [0, 1, 5, 11]) {
        const seated = evaluateCableTiePackFrame(instance, {
          ...request(tooth),
          rigControls: latch(tooth * pitch),
        }).frame;
        expect(seated.rigs.ratchet).toMatchObject({
          type: "ratchet",
          phase: "seated",
          toothIndex: tooth,
          pawlDeflection: 0,
        });
        expect(seated.relationships["pawl.tooth.seated"]).toMatchObject({
          required: true,
        });
        expect(
          seated.relationships["pawl.tooth.seated"]!.residual,
        ).toBeLessThan(1e-8);
        expect(seated.shapeStates.pawl!.positions).toEqual(
          neutral.shapeStates.pawl!.positions,
        );
        expect(seated.anchors["pawl.root"]!.world).toEqual(
          neutral.anchors["pawl.root"]!.world,
        );
      }
      const advance = evaluateCableTiePackFrame(instance, {
        ...request(0.5),
        rigControls: latch(pitch / 2),
      }).frame;
      expect(advance.relationships["pawl.tooth.seated"]!.required).toBe(false);
      expect(
        advance.relationships["pawl.tooth.seated"]!.residual,
      ).toBeGreaterThan(0.1);
      expect(advance.shapeStates.pawl!.positions.slice(0, 12)).toEqual(
        neutral.shapeStates.pawl!.positions.slice(0, 12),
      );
      expect(advance.shapeStates.pawl!.normals.slice(0, 12)).toEqual(
        neutral.shapeStates.pawl!.normals.slice(0, 12),
      );
      expect(advance.anchors["pawl.root"]!.world).toEqual(
        neutral.anchors["pawl.root"]!.world,
      );
    }
  });
  it("keeps all-frame contact as the default and retains the inactive relationship measurement", () => {
    const source = mechanismV2Fixture();
    const original = evaluateMechanismFrameV2(prepareMechanismSceneV2(source), {
      ...request(0),
      rigControls: { latch: { ...latch(0.5).ratchet } },
    });
    expect(original.relationships.engagement!.required).toBe(true);
    const relation = source.relationships.find(
      (relation) => relation.type === "engagement",
    )!;
    if (relation.type !== "engagement") throw new Error("Missing engagement");
    relation.requiredAt = "ratchet-seated";
    const prepared = prepareMechanismSceneV2(source);
    const advancing = evaluateMechanismFrameV2(prepared, {
      ...request(0),
      rigControls: { latch: { ...latch(0.5).ratchet } },
    });
    expect(advancing.relationships.engagement!.required).toBe(false);
    expect(advancing.relationships.engagement!.measured).toEqual(
      original.relationships.engagement!.measured,
    );
    expect(advancing.relationships.engagement!.residual).toEqual(
      original.relationships.engagement!.residual,
    );
    const released = evaluateMechanismFrameV2(prepared, {
      ...request(0),
      rigControls: {
        latch: {
          type: "ratchet",
          position: { value: 1 },
          latchKeys: [{ frame: 0, state: "released" }],
        },
      },
    });
    expect(released.relationships.engagement!.required).toBe(false);
    expect(released.relationships.engagement!.residual).toBeGreaterThan(0);
  });
  it("rejects release controls for the non-releasable selected tie, and reverse motion through the generic authored transition guard", () => {
    const instance = createCableTiePack();
    expect(
      locatedFailure(() =>
        evaluateCableTiePackFrame(instance, {
          ...request(0),
          rigControls: {
            ratchet: {
              type: "ratchet",
              position: { value: 0 },
              latchKeys: [{ frame: 0, state: "released" }],
            },
          },
        }),
      ),
    ).toMatchObject({
      code: "mechanism-pack-transition",
      rig: "ratchet",
      path: ["rigControls", "ratchet", "latchKeys"],
    });
    expect(() =>
      evaluateCableTiePackFrame(instance, {
        ...request(0),
        rigControls: {
          ratchet: {
            type: "ratchet",
            position: {
              keys: [
                { frame: 0, value: 1 },
                { frame: 2, value: 0 },
              ],
            },
            latchKeys: [{ frame: 0, state: "engaged" }],
          },
        },
      }),
    ).toThrow(/reverse travel/);
  });
  it("rejects a future release interval through the native source2 compiler, before sampling", () => {
    const tie = createCableTiePack();
    try {
      evaluateMechanismFrameV2(prepareMechanismSceneV2(tie.scene), {
        ...request(0),
        rigControls: {
          ratchet: {
            type: "ratchet",
            position: { value: 0 },
            latchKeys: [
              { frame: 0, state: "engaged" },
              { frame: 4, state: "released" },
              { frame: 9, state: "engaged" },
            ],
          },
        },
      });
      throw new Error("Expected a variant capability rejection");
    } catch (error) {
      expect(error).toMatchObject({
        location: {
          code: "mechanism-ratchet-release",
          path: ["rigControls", "ratchet", "latchKeys", 1, "state"],
          frame: 4,
          interval: { startFrame: 4, endFrameExclusive: 9 },
        },
      });
    }
  });
  it("returns on the cloth before the unloaded rest while both spring seats follow the arms", () => {
    for (const parameters of [
      { armLength: 5, armWidth: 0.6, clothThickness: 0.1 },
      { armLength: 6, armWidth: 0.8, clothThickness: 0.16 },
      { armLength: 8, armWidth: 1.1, clothThickness: 0.3 },
    ]) {
      const instance = createClothespegPack({ parameters, mount });
      const rigControls = {
        "upper.return": {
          type: "spring-return" as const,
          states: [
            { frame: 0, phase: "held" as const, value: 0 },
            { frame: 3, phase: "held" as const, value: -0.16 },
            {
              frame: 6,
              phase: "released" as const,
              value: -0.16,
              stopValue: 0,
            },
          ],
        },
        "lower.return": {
          type: "spring-return" as const,
          states: [
            { frame: 0, phase: "held" as const, value: 0 },
            { frame: 3, phase: "held" as const, value: 0.16 },
            { frame: 6, phase: "released" as const, value: 0.16, stopValue: 0 },
          ],
        },
      };
      for (const frame of [0, 1.5, 3, 6, 8.5, 12, 18, 23]) {
        const evaluated = evaluateClothespegPackFrame(instance, {
          ...request(frame),
          rigControls,
        }).frame;
        expect(
          evaluated.relationships["spring.upper.seated"]!.residual,
        ).toBeLessThan(1e-8);
        expect(
          evaluated.relationships["spring.lower.seated"]!.residual,
        ).toBeLessThan(1e-8);
        expect(
          evaluated.relationships["upper.cloth.gap"]!.residual,
        ).toBeLessThan(1e-8);
        expect(
          evaluated.relationships["lower.cloth.gap"]!.residual,
        ).toBeLessThan(1e-8);
      }
      const contact = evaluateClothespegPackFrame(instance, {
        ...request(18),
        rigControls,
      }).frame;
      expect(contact.rigs["upper.return"]).toMatchObject({
        phase: "contact",
        value: 0,
      });
      expect(contact.rigs["lower.return"]).toMatchObject({
        phase: "contact",
        value: 0,
      });
      const unloaded = instance.scene.rigs.find(
        (rig) => rig.id === "upper.return",
      )!;
      expect(unloaded.type === "spring-return" && unloaded.restValue > 0).toBe(
        true,
      );
      expect(contact.shapeStates.spring!.positions).toEqual(
        instance.scene.geometry.meshes.find(
          (mesh) => mesh.id === "spring.mesh",
        )!.positions,
      );
    }
  });
  it("rejects a pose through the selected cloth with frame and relationship location", () => {
    const instance = createClothespegPack();
    expect(
      locatedFailure(() =>
        evaluateClothespegPackFrame(instance, {
          ...request(7),
          rigControls: { "upper.hinge": { type: "hinge", value: 0.02 } },
        }),
      ),
    ).toMatchObject({
      code: "mechanism-pack-invariant",
      frame: 7,
      relationship: "upper.cloth.gap",
      parts: ["cloth", "upper"],
    });
  });
  it("keeps topology stable across style and prevents stale immutable references", () => {
    for (const create of [createCableTiePack, createClothespegPack]) {
      const first = create(),
        styled = create({ style: { color: "#c35136", roughness: 0.2 } });
      expect(styled.meshDataSha256).toBe(first.meshDataSha256);
      expect(styled.scene.teachingShapes).toEqual(first.scene.teachingShapes);
      expect(styled.sourceSha256).not.toBe(first.sourceSha256);
      expect(create({ expectedPack: first.pack }).pack).toEqual(first.pack);
      expect(
        locatedFailure(() =>
          create({
            expectedPack: { ...first.pack, sha256: `sha256:${"0".repeat(64)}` },
          }),
        ),
      ).toMatchObject({
        code: "mechanism-pack-revision",
        path: ["expectedPack"],
      });
    }
  });
  it("rejects missing shape/landmark, rig, owner, relationship and pose metadata references", () => {
    const base = inspectCableTiePack().pack;
    let pack = structuredClone(base);
    pack.teachingShapes[0]!.mesh = "missing";
    invalidMetadata(pack, ["teachingShapes", 0, "mesh"]);
    pack = structuredClone(base);
    const anchor = pack.anchors.find((anchor) => anchor.id === "pawl.tip")!;
    if (anchor.source.kind === "shape-landmark")
      anchor.source.landmark = "missing";
    invalidMetadata(pack, [
      "anchors",
      pack.anchors.indexOf(anchor),
      "source",
      "landmark",
    ]);
    pack = structuredClone(base);
    pack.teachingShapes[0]!.landmarks[1]!.id = "root";
    invalidMetadata(pack, ["teachingShapes", 0, "landmarks", 1, "id"]);
    pack = structuredClone(base);
    const rig = pack.rigs[0]!;
    if (rig.type === "ratchet") rig.referencePart = "missing";
    invalidMetadata(pack, ["rigs", 0, "referencePart"]);
    pack = structuredClone(base);
    pack.neutralPose[0]!.value = 100;
    invalidMetadata(pack, ["neutralPose", 0, "value"]);
    pack = structuredClone(base);
    const relation = pack.relationships[1]!;
    if (relation.type === "engagement") relation.rig = "missing";
    invalidMetadata(pack, ["relationships", 1, "rig"]);
  });
  it("rejects incorrect neutral metadata even when the substituted pose is in range", () => {
    const pack = structuredClone(inspectCableTiePack().pack);
    pack.neutralPose[0]!.value = 0.5;
    invalidMetadata(pack, ["neutralPose", 0, "value"]);
    const peg = structuredClone(inspectClothespegPack().pack);
    peg.neutralPose.pop();
    invalidMetadata(peg, ["rigs", 1, "id"]);
  });
  it("evaluates fractional cable and peg poses independently of seek history", () => {
    const tie = createCableTiePack({ parameters: { pitch: 0.48 } }),
      peg = createClothespegPack();
    const tieControls = {
      ratchet: {
        type: "ratchet" as const,
        position: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 10, value: 1.44 },
          ],
        },
        latchKeys: [{ frame: 0, state: "engaged" as const }],
      },
    };
    const pegControls = {
      "upper.hinge": {
        type: "hinge" as const,
        keys: [
          { frame: 0, value: 0 },
          { frame: 10, value: -0.16 },
        ],
      },
      "lower.hinge": {
        type: "hinge" as const,
        keys: [
          { frame: 0, value: 0 },
          { frame: 10, value: 0.16 },
        ],
      },
    };
    const expectedTie = evaluateCableTiePackFrame(tie, {
      ...request(4.25),
      rigControls: tieControls,
    });
    const expectedPeg = evaluateClothespegPackFrame(peg, {
      ...request(4.25),
      rigControls: pegControls,
    });
    for (const frame of [10, 0, 7.2, 2.7, 4.25]) {
      evaluateCableTiePackFrame(tie, {
        ...request(frame),
        rigControls: tieControls,
      });
      evaluateClothespegPackFrame(peg, {
        ...request(frame),
        rigControls: pegControls,
      });
    }
    expect(
      evaluateCableTiePackFrame(tie, {
        ...request(4.25),
        rigControls: tieControls,
      }),
    ).toEqual(expectedTie);
    expect(
      evaluateClothespegPackFrame(peg, {
        ...request(4.25),
        rigControls: pegControls,
      }),
    ).toEqual(expectedPeg);
  });
});
