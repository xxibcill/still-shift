import { inspectMechanismProductionCapabilities } from "../../packages/animation-engine/src/mechanism/production-registry.ts";
import { mechanismProductionMeasurementUnit } from "../../packages/animation-engine/src/mechanism/production-qa-contract.ts";
import { describe, expect, it } from "vitest";
import type { NativeObservedOutputFrameV2 } from "@still-shift/scene-contract";
import {
  createClothespegPack,
  inspectClothespegPack,
  evaluateClothespegPackFrame,
  ClothespegPackInputSchema,
} from "../../packages/animation-engine/src/mechanism/clothespeg-pack.ts";
import { inspectMechanismFamilyRegistry } from "../../packages/animation-engine/src/mechanism/family-registry.ts";
import { MechanismProductionQASampler } from "../../packages/animation-engine/src/mechanism/production-qa-sampling.ts";
import { Matrix4 } from "three";
import {
  createMechanismFamilyAuthoring,
  applyMechanismFamilyPatch,
  inspectMechanismFamilyAuthoring,
} from "../../packages/animation-engine/src/mechanism/family-authoring.ts";
import { transformPoint } from "../../packages/renderer-core/src/mechanism/matrix.ts";
const variant = "ideal-lever-press-points" as const;
const hash = "sha256:" + "1".repeat(64),
  binding = {
    inputSha256: hash,
    outputSha256: hash,
    codeSha256: hash,
    profileSha256: hash,
  },
  evidence = { path: "original-native.json", sha256: hash };
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function momentPlan(direction: [number, number, number] = [0, -1, 0]) {
  return {
    schemaVersion: "mechanism-production-qa-plan-1",
    measurements: ["near", "far"].flatMap((id) =>
      [
        "required-force-newtons",
        "signed-arm-meters",
        "balance-residual-newton-meters",
      ].map((quantity) => ({
        measurement: id + "." + quantity,
        kind: "static-moment-balance",
        quantity,
        model: {
          id,
          pivotAnchor: "lever.pivot",
          applicationAnchor: "press." + id,
          referencePart: "model",
          axis: [0, 0, 1],
          forceDirection: direction,
          resistingTorque: { value: 10, unit: "N*mm" },
        },
      })),
    ),
    registrations: ["near", "far"].map((id) => ({
      schemaVersion: "mechanism-semantic-registration-1",
      id: "ideal." + id,
      description:
        "Sampled ideal force from original native anchors and prescribed resistance",
      domain: "mechanical",
      method: "sampled-numeric-range",
      requireEveryOutputFrame: true,
      rules: [
        {
          measurement: id + ".required-force-newtons",
          range: [0.1, 2],
          unit: "N",
          rig: "upper.hinge",
          parts: ["upper", "press." + id],
          relationship: null,
        },
      ],
    })),
    warningBindings: [],
  };
}
function analyticScene() {
  const scene = structuredClone(createClothespegPack().scene);
  delete scene.pack;
  scene.anchors.push(
    ...["near", "far"].map((id, index) => ({
      id: "press." + id,
      role: "proof-target" as const,
      source: {
        kind: "part-local" as const,
        part: "upper",
        position: [index ? 2.4 : 1, 0.8, 0] as [number, number, number],
      },
    })),
    {
      id: "lever.pivot",
      role: "proof-target",
      source: { kind: "part-local", part: "model", position: [0, 0, 0] },
    },
  );
  scene.parts.push(
    ...["near", "far"].map((id) => ({
      ...structuredClone(scene.parts[0]!),
      id: "press." + id,
      parent: "upper",
    })),
  );
  return scene;
}
function observed(frame: number, near = 1, far = 2.4) {
  // Bounded numeric selector fixtures only; actual native closure is verified separately.
  return {
    version: "native3d-observed-output-frame-2",
    outputFrame: frame,
    passes: [
      {
        observed: {
          version: "native3d-observed-frame-2",
          parts: {
            mount: { worldMatrix: identity },
            model: { worldMatrix: identity },
          },
          anchors: {
            "lever.pivot": { status: "positioned", world: [0, 0, 0] },
            "press.near": { status: "positioned", world: [near, 0.8, 0] },
            "press.far": { status: "positioned", world: [far, 0.8, 0] },
          },
        },
      },
    ],
  } as unknown as NativeObservedOutputFrameV2;
}
function assertClosed(mesh: { positions: number[]; indices: number[] }) {
  const edges = new Map<string, number>();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const points = mesh.indices
      .slice(i, i + 3)
      .map((index) =>
        JSON.stringify(mesh.positions.slice(index * 3, index * 3 + 3)),
      );
    for (let j = 0; j < 3; j++) {
      const edge = [points[j]!, points[(j + 1) % 3]!].sort().join("|");
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  expect([...edges.values()].every((count) => count === 2)).toBe(true);
}
describe("distinct peg press-point asset", () => {
  it("preserves the default and provides separate pads, anchors, metadata and discovery", () => {
    expect(createClothespegPack().sourceSha256).toBe(
      "sha256:f2d265adfc6d94480063abfb7a82a4cbec36111299025bd49156e1281143939e",
    );
    expect(inspectClothespegPack().sha256).toBe(
      "sha256:1d6050d5ac18a16722e3766bf8da86a4f0c418012d50e3a15a6eeadd1b7ac281",
    );
    expect(createClothespegPack({ variant: "notched-line" }).sourceSha256).toBe(
      "sha256:1937a914b366842ed133932040dc4fd041a98854d7b6626bfea489a7a67daf90",
    );
    expect(inspectClothespegPack("notched-line").sha256).toBe(
      "sha256:7698b6a3f64781495f27fc0358b8c24b87213845d0da4033e111ad69acb7723f",
    );
    const candidate = createClothespegPack({ variant }),
      metadata = inspectClothespegPack(variant);
    expect(
      candidate.scene.parts
        .filter((p) => p.id.startsWith("press."))
        .map((p) => p.id),
    ).toEqual(["press.near", "press.far"]);
    expect(
      candidate.scene.geometry.meshes.filter((m) => m.id.startsWith("press."))
        .length,
    ).toBe(2);
    expect(metadata.pack.factualVariant.id).toBe(variant);
    expect(metadata.pack.status).toBe("candidate");
    expect(metadata.sha256).not.toBe(inspectClothespegPack().sha256);
    expect(
      metadata.pack.cameraTargets.find((t) => t.id === "macro")!.target.id,
    ).toBe("press.far");
    const registry = inspectMechanismFamilyRegistry({
      schemaVersion: "mechanism-family-registry-1",
      family: "clothespeg",
    }).entries[0]!;
    expect(registry.examples.map((e) => e.id)).toContain("ideal-lever");
  });
  it.each([5, 6, 8])(
    "retains physical pad attachment and opening clearance at armLength %s",
    (armLength) => {
      const candidate = createClothespegPack({
        variant,
        parameters: { armLength },
      });
      for (const mesh of candidate.scene.geometry.meshes.filter((m) =>
        m.id.startsWith("press."),
      )) {
        assertClosed(mesh);
        expect(mesh.bounds.max[1]).toBeCloseTo(0.1, 7);
        const part = candidate.scene.parts.find((p) => p.id === mesh.partId)!,
          scale = armLength / 6,
          slope = (0.8 * scale - 0.92) / (3.6 * scale),
          angle = part.transform.rotation[2];
        for (let index = 0; index < mesh.positions.length; index += 3) {
          const [x, y] = mesh.positions.slice(index, index + 3);
          if (y !== 0) continue;
          const upperX = part.transform.position[0] + x! * Math.cos(angle),
            upperY = part.transform.position[1] + x! * Math.sin(angle);
          expect(
            Math.abs(upperY - (0.92 + slope * (upperX + 0.8 * scale))),
          ).toBeLessThan(2e-7);
        }
      }
      for (const angle of [0, -0.08, -0.18]) {
        const frame = evaluateClothespegPackFrame(candidate, {
          frame: 0,
          width: 640,
          height: 360,
          rigControls: {
            "upper.hinge": { type: "hinge", value: angle },
            "lower.hinge": { type: "hinge", value: -angle },
          },
        }).frame;
        for (const id of ["press.near", "press.far"]) {
          const part = frame.parts[id]!,
            actual = frame.anchors[id]!.world;
          expect(actual).toEqual(transformPoint(part.worldMatrix, [0, 0.1, 0]));
          expect(part.parent).toBe("upper");
        }
        expect(frame.anchors["press.far"]!.world[0]).toBeGreaterThan(
          frame.anchors["press.near"]!.world[0],
        );
        const upperMesh = candidate.scene.geometry.meshes.find(
          (m) => m.id === "upper.arm",
        )!;
        for (let i = 0; i < upperMesh.positions.length; i += 3) {
          const local = upperMesh.positions.slice(i, i + 3) as [
            number,
            number,
            number,
          ];
          if (local[0] >= (0.5 * armLength) / 6)
            expect(
              transformPoint(frame.parts.upper!.worldMatrix, local)[1],
            ).toBeGreaterThan(0);
        }
      }
    },
  );
});
describe("press-point authoring guards", () => {
  it("retains strict parameters, CAS revisions and cloth contact stops", () => {
    expect(
      ClothespegPackInputSchema.safeParse({
        variant,
        parameters: { lineRadius: 0.1 },
      }).success,
    ).toBe(false);
    expect(() =>
      createClothespegPack({
        variant,
        expectedPack: createClothespegPack().pack,
      }),
    ).toThrow(/variant|revision/);
    const current = createMechanismFamilyAuthoring("clothespeg", "lever", {
        variant,
      }),
      changed = applyMechanismFamilyPatch(current.document, {
        schemaVersion: "mechanism-family-patch-1",
        baseRevision: current.document.revision,
        baseHash: current.projectHash,
        operations: [{ property: "parameter", id: "armLength", value: 8 }],
      });
    const inspected = inspectMechanismFamilyAuthoring(changed.document);
    expect(inspected.instance.pack).toEqual(current.instance.pack);
    expect(inspected.instance.sourceSha256).not.toBe(
      current.instance.sourceSha256,
    );
    expect(() =>
      evaluateClothespegPackFrame(createClothespegPack({ variant }), {
        frame: 0,
        width: 640,
        height: 360,
        rigControls: {
          "upper.hinge": { type: "hinge", value: 0.001 },
          "lower.hinge": { type: "hinge", value: -0.001 },
        },
      }),
    ).toThrow(/relationship/);
  });
});
describe("ideal force selectors from original native evidence", () => {
  it("publishes the same bounded model counts, quantities and units as execution", () => {
    const capability = inspectMechanismProductionCapabilities().staticMoment;
    expect(capability.limits.models).toBe(16);
    expect(capability.assumption).toBe(
      "fixed-axis-rigid-arm-prescribed-resistance-1",
    );
    for (const quantity of capability.quantities) {
      const selector = {
        ...momentPlan().measurements[0]!,
        quantity: quantity.quantity,
      };
      expect(
        mechanismProductionMeasurementUnit(
          selector as Parameters<typeof mechanismProductionMeasurementUnit>[0],
        ),
      ).toBe(quantity.unit);
    }
  });

  it("preserves models, calibration, per-frame forces, units and original evidence", () => {
    const sampler = new MechanismProductionQASampler(
      momentPlan(),
      analyticScene(),
      2,
    );
    sampler.observe(observed(0), evidence);
    sampler.observe(observed(1, 1.2, 2.6), evidence);
    const result = sampler.finish(binding);
    expect(
      result.rawSamples[0]!.measurements["near.required-force-newtons"],
    ).toBe(1);
    expect(
      result.rawSamples[0]!.measurements["far.required-force-newtons"],
    ).toBeCloseTo(1 / 2.4, 12);
    expect(
      result.rawSamples[1]!.measurements["near.required-force-newtons"],
    ).toBeCloseTo(1 / 1.2, 12);
    expect(result.rawSamples[0]!.measurements["near.signed-arm-meters"]).toBe(
      -0.01,
    );
    expect(
      result.rawSamples[0]!.measurements["near.balance-residual-newton-meters"],
    ).toBeCloseTo(0, 12);
    expect(result.rawSamples[1]!.evidence.path).toBe(
      "original-native.json#outputFrame=1",
    );
    expect(result.assertions.slice(1).every((a) => a.status === "passed")).toBe(
      true,
    );
    expect(sampler.program.measurements[1]).toMatchObject({
      kind: "static-moment-balance",
      model: { resistingTorque: { value: 10, unit: "N*mm" } },
    });
  });
  it("reports missing/degenerate observations instead of inventing an input force", () => {
    const sampler = new MechanismProductionQASampler(
      momentPlan(),
      analyticScene(),
      1,
    );
    sampler.observe(observed(0, 0), evidence);
    const result = sampler.finish(binding);
    expect(
      result.rawSamples[0]!.measurements["near.required-force-newtons"],
    ).toBeUndefined();
    expect(result.assertions[1]!.findings[0]).toMatchObject({
      code: "semantic-measurement-missing",
      frame: 0,
      unit: "N",
    });
  });
  it("uses captured reference directions and calibrated transformed geometry", () => {
    const scene = analyticScene(),
      packet = observed(0),
      actual = packet.passes[0]!.observed,
      matrix = new Matrix4()
        .makeRotationZ(0.7)
        .multiply(new Matrix4().makeScale(2, 2, 2));
    matrix.setPosition(3, 5, 7);
    const reference = actual.parts.model!;
    reference.worldMatrix = matrix.elements as typeof reference.worldMatrix;
    for (const anchor of Object.values(actual.anchors))
      if (anchor.status === "positioned")
        anchor.world = transformPoint(
          actual.parts.model!.worldMatrix,
          anchor.world,
        );
    scene.units.scaleToMeters = 0.02;
    const sampler = new MechanismProductionQASampler(momentPlan(), scene, 1);
    sampler.observe(packet, evidence);
    const values = sampler.finish(binding).rawSamples[0]!.measurements;
    expect(values["near.required-force-newtons"]).toBeCloseTo(0.25, 12);
    expect(values["far.required-force-newtons"]).toBeCloseTo(1 / 9.6, 12);
  });
  it("leaves missing positions and an opposing force direction as explicit missing findings", () => {
    const packet = observed(0);
    delete packet.passes[0]!.observed.anchors["press.near"];
    for (const [plan, source] of [
      [momentPlan(), packet],
      [momentPlan([0, 1, 0]), observed(0)],
    ] as const) {
      const sampler = new MechanismProductionQASampler(
        plan,
        analyticScene(),
        1,
      );
      sampler.observe(source, evidence);
      expect(sampler.finish(binding).assertions[1]!.findings[0]).toMatchObject({
        code: "semantic-measurement-missing",
        frame: 0,
      });
    }
  });
  it("rejects absent references, wrong units, conflicting models and excessive model counts before traversal", () => {
    const scene = analyticScene(),
      plan = momentPlan();
    expect(
      () =>
        new MechanismProductionQASampler(plan, createClothespegPack().scene, 1),
    ).toThrow(/absent/);
    const wrongUnit = structuredClone(plan);
    wrongUnit.registrations[0]!.rules[0]!.unit = "scene-unit";
    expect(() => new MechanismProductionQASampler(wrongUnit, scene, 1)).toThrow(
      /unit/,
    );
    const conflict = structuredClone(plan);
    conflict.measurements[1]!.model.resistingTorque.value = 11;
    expect(() => new MechanismProductionQASampler(conflict, scene, 1)).toThrow(
      /model/,
    );
    const excessive = {
      ...plan,
      registrations: [],
      measurements: Array.from({ length: 17 }, (_, index) => ({
        ...plan.measurements[0]!,
        measurement: "force" + index,
        model: { ...plan.measurements[0]!.model, id: "model" + index },
      })),
    };
    expect(() => new MechanismProductionQASampler(excessive, scene, 1)).toThrow(
      /model/,
    );
  });
});
