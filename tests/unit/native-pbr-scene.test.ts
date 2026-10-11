import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  MechanismSceneV3Schema,
  NativePbrResourceReferenceSchema,
} from "../../packages/scene-contract/src/native3d/scene-v3.ts";
import { Native3DSourceVersionsSchema } from "@still-shift/scene-contract";
import { prepareNative3DSceneV3 } from "../../packages/renderer-core/src/native3d/prepare-v3.ts";
import { evaluateMechanismFrameV2 } from "../../packages/renderer-core/src/mechanism/evaluate-v2.ts";
import { gltfJsonHash } from "../../packages/animation-engine/src/mechanism/gltf-identity.ts";
import { nativePbrSceneFixture } from "../helpers/native-pbr-scene-fixture.ts";
describe("explicit rigid PBR source3", () => {
  it("retains named imported hierarchy, tangents and linear PBR factors without altering old parsers", () => {
    const input = nativePbrSceneFixture(),
      source = MechanismSceneV3Schema.parse(input);
    expect(source).toMatchObject({
      schemaVersion: "mechanism-scene-3",
      units: { kind: "meter", scaleToMeters: 1 },
      parts: input.parts,
      geometry: {
        schemaVersion: "solid-geometry-2",
        materials: [{ baseColorFactor: [0.2, 0.4, 0.6, 1] }],
      },
    });
    expect(Native3DSourceVersionsSchema.safeParse(input).success).toBe(false);
    expect(
      MechanismSceneV3Schema.safeParse({
        ...input,
        parts: [...input.parts].reverse(),
      }).success,
    ).toBe(true);
    expect(
      JSON.stringify(
        z.toJSONSchema(MechanismSceneV3Schema, { unrepresentable: "any" }),
      ),
    ).not.toContain('"const":"ratchet"');
  });
  it("drives the imported lever with the existing hinge evaluator under random/reverse seeks", async () => {
    const input = nativePbrSceneFixture(),
      prepared = await prepareNative3DSceneV3(input, gltfJsonHash(input));
    const sample = (frame: number) =>
      evaluateMechanismFrameV2(prepared.evaluation, {
        frame,
        width: 320,
        height: 180,
        rigControls: {
          "lever.hinge": {
            type: "hinge",
            keys: [
              { frame: 0, value: 0 },
              { frame: 10, value: Math.PI / 2 },
            ],
          },
        },
      });
    const neutral = sample(0),
      rotated = sample(10);
    expect(neutral.anchors["lever.tip"]!.world).toEqual([5, 4, 0]);
    expect(rotated.anchors["lever.tip"]!.world[0]).toBeCloseTo(3, 12);
    expect(rotated.anchors["lever.tip"]!.world[1]).toBeCloseTo(2, 12);
    const expected = new Map(
      [0, 2.5, 5, 10].map((frame) => [frame, sample(frame)]),
    );
    expect(sample(5).anchors["lever.tip"]!.world[0]).toBeCloseTo(
      5 - Math.SQRT2,
      12,
    );
    expect(sample(5).anchors["lever.tip"]!.world[1]).toBeCloseTo(
      2 + Math.SQRT2,
      12,
    );
    for (const frame of [5, 0, 10, 2.5, 10, 0])
      expect(sample(frame)).toEqual(expected.get(frame));
    expect(sample(10)).toEqual(rotated);
    expect(sample(0)).toEqual(neutral);
    expect(prepared.source.geometry.meshes[0]!.tangents).toEqual(
      input.geometry.meshes[0]!.tangents,
    );
  });
  it("rejects stale geometry and conflicting/reference-cyclic rigid writers", async () => {
    const input = nativePbrSceneFixture();
    await expect(
      prepareNative3DSceneV3(
        { ...input, geometrySha256: "sha256:" + "0".repeat(64) },
        gltfJsonHash(input),
      ),
    ).rejects.toMatchObject({
      diagnostics: [{ code: "comp-native3d-checksum", path: "geometrySha256" }],
    });
    expect(
      MechanismSceneV3Schema.safeParse({
        ...input,
        rigs: [...input.rigs, { ...input.rigs[0], id: "duplicate" }],
      }).success,
    ).toBe(false);
    expect(
      MechanismSceneV3Schema.safeParse({
        ...input,
        rigs: [{ ...input.rigs[0], referencePart: "node.1" }],
      }).success,
    ).toBe(false);
  });
});

describe("source3 rigid resource boundary", () => {
  it.each([
    "/surface.rgba",
    "../surface.rgba",
    "./surface.rgba",
    "maps//surface.rgba",
    "C:\\surface.rgba",
    "https://example.test/surface.rgba",
    "%2e%2e/surface.rgba",
    "surface.rgba?query",
    "surface.rgba#fragment",
    "surface\0.rgba",
  ])("rejects unsafe local reference %s before I/O", (path) => {
    const result = NativePbrResourceReferenceSchema.safeParse({
      image: "image.0",
      path,
      bytes: 4,
      sha256: "sha256:" + "a".repeat(64),
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.path).toEqual(["path"]);
  });
  it("locates missing, duplicate and mismatched binary manifests", () => {
    const input = nativePbrSceneFixture(),
      sha256 = "sha256:" + "a".repeat(64),
      geometry = {
        ...input.geometry,
        images: [
          {
            id: "image.0",
            sourceSha256: sha256,
            pixelSha256: sha256,
            width: 1,
            height: 1,
            encoding: "rgba8-straight-top-left-1",
          },
        ],
      },
      reference = { image: "image.0", path: "surface.rgba", bytes: 4, sha256 },
      source = {
        ...input,
        geometry,
        geometrySha256: gltfJsonHash(geometry),
        resources: [reference],
      };
    expect(MechanismSceneV3Schema.safeParse(source).success).toBe(true);
    for (const resources of [
      [],
      [reference, reference],
      [{ ...reference, bytes: 8 }],
      [{ ...reference, sha256: "sha256:" + "b".repeat(64) }],
      [{ ...reference, image: "unknown" }],
    ]) {
      const result = MechanismSceneV3Schema.safeParse({ ...source, resources });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(
          result.error.issues.some((issue) => issue.path[0] === "resources"),
        ).toBe(true);
    }
  });
  it("reuses slider and spring-return motion without deforming imported meshes", async () => {
    const input = {
        ...nativePbrSceneFixture(),
        rigs: [
          {
            id: "lever.slider",
            type: "slider",
            movingPart: "node.1",
            referencePart: "node.0",
            axis: [1, 0, 0],
            range: [0, 2],
            neutral: 0,
          },
          {
            id: "lever.return",
            type: "spring-return",
            targetRig: "lever.slider",
            restValue: 0,
            returnFrames: 10,
            easing: "linear",
          },
        ],
      },
      prepared = await prepareNative3DSceneV3(input, gltfJsonHash(input));
    const sample = (frame: number) =>
      evaluateMechanismFrameV2(prepared.evaluation, {
        frame,
        width: 320,
        height: 180,
        rigControls: {
          "lever.return": {
            type: "spring-return",
            states: [
              { frame: 0, phase: "held", value: 2 },
              { frame: 5, phase: "released", value: 2, stopValue: 0 },
            ],
          },
        },
      });
    const expected = new Map([
      [0, [7, 4, 0]],
      [5, [7, 4, 0]],
      [10, [6, 4, 0]],
      [15, [5, 4, 0]],
    ]);
    for (const frame of [15, 0, 10, 5, 15, 0])
      expect(sample(frame).anchors["lever.tip"]!.world).toEqual(
        expected.get(frame),
      );
    expect(prepared.source.geometry).toEqual(input.geometry);
  });
});
