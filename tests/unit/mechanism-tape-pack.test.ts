import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  MechanismPackDocumentSchema,
  MechanismSceneV2Schema,
  MechanismFrameRequestV2Schema,
} from "@still-shift/scene-contract";
import {
  createTapeHookPack,
  inspectTapeHookPack,
  evaluateTapeHookPackFrame,
  type TapeHookPackInstance,
} from "../../packages/animation-engine/src/mechanism/tape-hook-pack.ts";
import { canonicalMechanismJson } from "../../packages/renderer-core/src/mechanism/canonical.ts";
const hash = (value: unknown) =>
  `sha256:${createHash("sha256").update(canonicalMechanismJson(value)).digest("hex")}`;
const request = (frame: number, value: number) =>
  MechanismFrameRequestV2Schema.parse({
    frame,
    width: 320,
    height: 180,
    rigControls: { slider: { type: "slider", value } },
  });
describe("versioned tape pack and metadata", () => {
  it("reports immutable bounded metadata with named targets/detail without mesh/texture payloads", () => {
    const metadata = inspectTapeHookPack();
    expect(metadata.sha256).toBe(hash(metadata.pack));
    expect(Object.isFrozen(metadata.pack.parts[0]!.transform)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(metadata))).toBeLessThanOrEqual(
      32768,
    );
    expect(metadata.pack.cameraTargets.map((t) => t.intent)).toEqual([
      "recognition",
      "contact-approach",
      "macro",
      "aligned-comparison",
      "controlled-orbit",
      "return",
    ]);
    expect(metadata.pack.details.map((d) => d.id)).toEqual(["teaching"]);
    expect(metadata.pack.status).toBe("candidate");
    expect(JSON.stringify(metadata)).not.toMatch(
      /"(?:positions|normals|indices|uvs|pixels)"/,
    );
  });
  it("instantiates two dimensions through the same source2 generator and derives travel from thickness", () => {
    for (const parameters of [
      { hookThickness: 0.18, bladeLength: 10, bladeWidth: 2 },
      { hookThickness: 0.26, bladeLength: 14, bladeWidth: 2.5 },
    ]) {
      const instance = createTapeHookPack({ parameters });
      expect(MechanismSceneV2Schema.parse(instance.scene)).toEqual(
        instance.scene,
      );
      expect(instance.scene.rigs[0]).toMatchObject({
        type: "slider",
        range: [0, parameters.hookThickness],
      });
      expect(instance.scene.pack).toEqual(instance.pack);
      expect(instance.scene.parts.some((p) => p.id === "mount")).toBe(true);
      expect(instance.meshDataSha256).toBe(
        hash({ meshes: instance.scene.geometry.meshes }),
      );
      expect(
        evaluateTapeHookPackFrame(instance, request(0, 0), "outside-pull").check
          .status,
      ).toBe("passed");
      expect(
        evaluateTapeHookPackFrame(
          instance,
          request(1, parameters.hookThickness),
          "inside-push",
        ).check.status,
      ).toBe("passed");
    }
  });
  it("keeps geometry streams unchanged when metal styling changes", () => {
    const plain = createTapeHookPack(),
      styled = createTapeHookPack({
        style: {
          steelColor: "#778899",
          steelMetalness: 0.3,
          steelRoughness: 0.6,
        },
      });
    expect(styled.meshDataSha256).toBe(plain.meshDataSha256);
    expect(styled.scene.geometry.meshes).toEqual(plain.scene.geometry.meshes);
    expect(styled.sourceSha256).not.toBe(plain.sourceSha256);
    expect(styled.pack).toEqual(plain.pack);
  });
  it("keeps mounted contacts and rivets valid under translated/rotated/nonuniform reference transforms and random seeks", () => {
    const instance = createTapeHookPack({
      mount: {
        position: [3, 2, -1],
        rotation: [0.1, 0.2, 0.35],
        scale: [1.1, 0.9, 1],
        pivot: [0, 0, 0],
      },
    });
    for (const [frame, q] of [
      [0, 0],
      [1, 0.18],
      [0.5, 0.09],
      [1, 0.18],
      [0, 0],
    ]) {
      const checked = evaluateTapeHookPackFrame(
        instance,
        request(frame!, q!),
        q === 0 ? "outside-pull" : q === 0.18 ? "inside-push" : "free",
      );
      expect(checked.check.status).toBe("passed");
      expect(
        checked.frame.relationships["rivet.one.fixed"]!.residual,
      ).toBeLessThan(1e-8);
    }
  });
  it("locates invalid parameters, unknown targets/details and stale expected pack revisions", () => {
    try {
      createTapeHookPack({ parameters: { hookThickness: 0.8 } });
      throw Error("Expected rejection");
    } catch (error) {
      expect(String(error)).toContain("hookThickness");
    }
    const receipt = inspectTapeHookPack(),
      invalid = structuredClone(receipt.pack);
    invalid.cameraTargets[0]!.target.id = "missing";
    const parsed = MechanismPackDocumentSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(
        parsed.error.issues.some(
          (i) => i.path.join(".") === "cameraTargets.0.target.id",
        ),
      ).toBe(true);
    expect(() =>
      createTapeHookPack({
        expectedPack: {
          id: "tape-hook",
          version: "1.0.0",
          sha256: hash("stale"),
          variant: "floating-hook",
          detail: "teaching",
        },
      }),
    ).toThrow(/revision/);
  });
  it("rejects wrong travel, moving rivets, contact gaps and changed source identities with location", () => {
    const original = createTapeHookPack();
    const seeded = (edit: (instance: TapeHookPackInstance) => void) => {
      const clone = JSON.parse(
        JSON.stringify(original),
      ) as TapeHookPackInstance;
      edit(clone);
      clone.sourceSha256 = hash(clone.scene);
      return clone;
    };
    const travel = seeded((instance) => {
      const rig = instance.scene.rigs[0]!;
      if (rig.type === "slider") rig.range[1] = 0.2;
    });
    expect(() => evaluateTapeHookPackFrame(travel, request(0, 0))).toThrow(
      /hook thickness/,
    );
    const rivet = seeded((instance) => {
      instance.scene.geometry.meshes.find(
        (mesh) => mesh.id === "rivet-1-stem",
      )!.partId = "hook";
    });
    expect(() => evaluateTapeHookPackFrame(rivet, request(0, 0))).toThrow(
      /attached to the blade/,
    );
    expect(() =>
      evaluateTapeHookPackFrame(original, request(3, 0.09), "outside-pull"),
    ).toThrow(/selected measurement face/i);
    const changed = JSON.parse(
      JSON.stringify(original),
    ) as TapeHookPackInstance;
    changed.scene.seed++;
    expect(() => evaluateTapeHookPackFrame(changed, request(0, 0))).toThrow(
      /source identity/,
    );
  });
});
