import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  Native3DLayerSchema,
  Native3DSourceSchema,
  Native3DSourceV2Schema,
  Native3DSourceVersionsSchema,
  NativeFrameSnapshotSchema,
  NativeFrameSnapshotV2Schema,
  NativeFrameSnapshotVersionsSchema,
} from "@still-shift/scene-contract";
import {
  prepareNative3DSceneV2,
  resolveNative3DVariantV2,
} from "../../packages/renderer-core/src/native3d/prepare-v2.ts";
import { sampleNativeFrameV2 } from "../../packages/renderer-core/src/native3d/evaluate-v2.ts";
import { prepareNative3DScene } from "../../packages/renderer-core/src/native3d/prepare.ts";
import { sampleNativeFrame } from "../../packages/renderer-core/src/native3d/evaluate.ts";
import { nativeScreenAnchorsV2 } from "../../packages/renderer-core/src/native3d/visibility-v2.ts";
import { canonicalMechanismJson } from "../../packages/renderer-core/src/mechanism/canonical.ts";
import { mechanismTeachingTopologyDocument } from "../../packages/renderer-core/src/mechanism/teaching-topology.ts";
import { mechanismV2Fixture } from "../helpers/mechanism-v2-fixture.ts";
import {
  nativeFixtureHash,
  nativeSolidFixture,
} from "../helpers/native3d-fixture.ts";

const controller = Native3DLayerSchema.parse({
  id: "world",
  type: "native3d",
  asset: "mechanism",
  sourceStartFrame: 0.25,
  sourceFps: 30,
});
const scope = {
  scope: "comp/instance",
  scopeFrame: 91.5,
  layerTime: 0.5,
  owningScopeFps: 60,
  width: 320,
  height: 180,
};
const hash = (value: unknown) =>
  "sha256:" +
  createHash("sha256").update(canonicalMechanismJson(value)).digest("hex");

describe("native version 2 data adapter", () => {
  it("keeps original source parsers strict and dispatches explicitly by version", () => {
    const source = mechanismV2Fixture();
    expect(Native3DSourceSchema.safeParse(source).success).toBe(false);
    expect(Native3DSourceV2Schema.safeParse(nativeSolidFixture()).success).toBe(
      false,
    );
    expect(Native3DSourceVersionsSchema.parse(source).schemaVersion).toBe(
      "mechanism-scene-2",
    );
    expect(
      Native3DSourceVersionsSchema.parse(nativeSolidFixture()).schemaVersion,
    ).toBe("solid-scene-1");
    expect(
      Native3DSourceVersionsSchema.safeParse({
        ...source,
        schemaVersion: "mechanism-scene-3",
      }).success,
    ).toBe(false);
  });

  it("verifies canonical geometry and topology hashes before preparing a catalogue", async () => {
    const source = mechanismV2Fixture();
    source.geometry.materials[0]!.color = "#ffffff";
    await expect(
      prepareNative3DSceneV2(source, nativeFixtureHash),
    ).rejects.toThrow("canonical hash");
    source.geometrySha256 = hash(source.geometry);
    source.teachingShapes[1]!.topologySha256 = nativeFixtureHash;
    expect(Native3DSourceV2Schema.safeParse(source).success).toBe(true);
    await expect(
      prepareNative3DSceneV2(source, nativeFixtureHash),
    ).rejects.toMatchObject({
      diagnostics: [
        {
          code: "comp-native3d-checksum",
          path: "teachingShapes.1.topologySha256",
        },
      ],
    });
  });

  it("rejects a cryptographically consistent substitute generator topology", async () => {
    const source = mechanismV2Fixture();
    const shape = source.teachingShapes[0]!;
    const mesh = source.geometry.meshes.find((mesh) => mesh.id === shape.mesh)!;
    mesh.indices.splice(
      0,
      3,
      mesh.indices[1]!,
      mesh.indices[2]!,
      mesh.indices[0]!,
    );
    source.geometrySha256 = hash(source.geometry);
    shape.topologySha256 = hash(mechanismTeachingTopologyDocument(shape, mesh));
    await expect(
      prepareNative3DSceneV2(source, nativeFixtureHash),
    ).rejects.toThrow(/topology/i);
  });

  it("shares immutable geometry across order-independent style variants without changing topology", async () => {
    const source = mechanismV2Fixture();
    const variants = [
      { partOverrides: { child: { visible: false } } },
      { materialOverrides: { paint: { color: "#ffffff", metalness: 1 } } },
    ];
    const a = await prepareNative3DSceneV2(source, nativeFixtureHash, {
      variants: [{}, ...variants],
    });
    const b = await prepareNative3DSceneV2(source, nativeFixtureHash, {
      variants: [...variants].reverse(),
    });
    expect(Object.keys(a.variants)).toEqual(Object.keys(b.variants));
    expect(Object.values(a.variants)).toHaveLength(3);
    const base = a.variants[a.baseSourceKey]!;
    for (const variant of Object.values(a.variants)) {
      expect(variant.evaluation.version).toBe("prepared-mechanism-scene-2");
      expect(variant.source.geometry.meshes).toBe(base.source.geometry.meshes);
      expect(variant.meshDataSha256).toBe(base.meshDataSha256);
      expect(
        variant.source.teachingShapes.map((shape) => shape.topologySha256),
      ).toEqual(source.teachingShapes.map((shape) => shape.topologySha256));
      expect(Object.isFrozen(variant.evaluation.teachingShapes)).toBe(true);
    }
    source.geometry.meshes[1]!.positions[0] = 100;
    expect(base.source.geometry.meshes[1]!.positions[0]).not.toBe(100);
  });

  it("rejects static seat relocation against an unchanged neutral spring mesh", async () => {
    await expect(
      prepareNative3DSceneV2(mechanismV2Fixture(), nativeFixtureHash, {
        variants: [
          {
            partOverrides: {
              jaw: {
                transform: {
                  position: [1, 0, 0],
                  rotation: [0, 0, 0],
                  scale: [1, 1, 1],
                  pivot: [0, 0, 0],
                },
              },
            },
          },
        ],
      }),
    ).rejects.toThrow(/neutral/i);
  });

  it("rejects unknown static fields and over-budget catalogues before publication", async () => {
    await expect(
      prepareNative3DSceneV2(mechanismV2Fixture(), nativeFixtureHash, {
        variants: [{ partOverrides: { missing: { visible: false } } }],
      }),
    ).rejects.toThrow("Unknown part override");
    await expect(
      prepareNative3DSceneV2(mechanismV2Fixture(), nativeFixtureHash, {
        variants: Array.from({ length: 64 }, (_, index) => ({
          materialOverrides: { paint: { roughness: index / 64 } },
        })),
      }),
    ).rejects.toThrow("exceed 64");
  });

  it("rejects both writer protocols even when empty and rejects legacy writers on a v2 source", async () => {
    expect(
      Native3DLayerSchema.safeParse({
        ...controller,
        controls: {},
        rigControls: {},
      }).success,
    ).toBe(false);
    const prepared = await prepareNative3DSceneV2(
      mechanismV2Fixture(),
      nativeFixtureHash,
    );
    expect(() =>
      sampleNativeFrameV2(prepared, { ...controller, controls: {} }, scope),
    ).toThrow("require rigControls");
    const legacy = await prepareNative3DScene(
      nativeSolidFixture(),
      nativeFixtureHash,
    );
    expect(() =>
      sampleNativeFrame(legacy, { ...controller, rigControls: {} }, scope),
    ).toThrow("Version 1");
  });

  it("samples fractional local/source clocks and shape streams identically across reverse and random seeks", async () => {
    const prepared = await prepareNative3DSceneV2(
      mechanismV2Fixture(),
      nativeFixtureHash,
    );
    const authored = {
      ...controller,
      rigControls: {
        hinge: {
          type: "hinge" as const,
          keys: [
            { frame: 0, value: 0, easing: "linear" as const },
            { frame: 10, value: 1, easing: "linear" as const },
          ],
        },
        latch: {
          type: "ratchet" as const,
          position: { value: 0.5 },
          latchKeys: [{ frame: 0, state: "engaged" as const }],
        },
      },
    };
    const a = sampleNativeFrameV2(prepared, authored, scope);
    expect(a.sourceFrame).toBe(0.5);
    expect(a.scopeFrame).toBe(91.5);
    expect(a.frame.rigs.hinge).toMatchObject({ angleRadians: 0.05 });
    expect(a.frame.shapeStates.pawl!.stateKey).toBe("pawl:1");
    for (const layerTime of [17.25, 0, 3.125, 1.5, 0.5])
      sampleNativeFrameV2(prepared, authored, { ...scope, layerTime });
    expect(sampleNativeFrameV2(prepared, authored, scope)).toEqual(a);
    expect(
      sampleNativeFrameV2(prepared, authored, {
        ...scope,
        scope: "comp/second",
      }).frameKey,
    ).not.toBe(a.frameKey);
    expect(Object.isFrozen(a.frame.shapeStates.spring!.positions)).toBe(true);
    expect(a.anchors["pawl.tip"]!.visibilityMethod).toBe(
      "native-expected-posed-mesh-segment-2",
    );
  });

  it("requires the exact prepared source/variant association and a fresh revision for static edits", async () => {
    const prepared = await prepareNative3DSceneV2(
      mechanismV2Fixture(),
      nativeFixtureHash,
    );
    const frame = sampleNativeFrameV2(prepared, controller, scope);
    expect(
      resolveNative3DVariantV2({ mechanism: prepared }, frame).sourceKey,
    ).toBe(frame.sourceKey);
    expect(() =>
      resolveNative3DVariantV2(
        { mechanism: prepared },
        { ...frame, geometrySha256: "sha256:" + "b".repeat(64) },
      ),
    ).toThrow("identity");
    expect(() =>
      resolveNative3DVariantV2(
        { mechanism: prepared },
        { ...frame, asset: "constructor" },
      ),
    ).toThrow("Missing");
    expect(() =>
      sampleNativeFrameV2(
        prepared,
        { ...controller, materialOverrides: { paint: { color: "#ffffff" } } },
        scope,
      ),
    ).toThrow("newly prepared");
  });

  it("rejects invalid clocks and viewports without clamping source time", async () => {
    const prepared = await prepareNative3DSceneV2(
      mechanismV2Fixture(),
      nativeFixtureHash,
    );
    expect(() =>
      sampleNativeFrameV2(prepared, controller, {
        ...scope,
        owningScopeFps: 0,
      }),
    ).toThrow("owning clock");
    expect(() =>
      sampleNativeFrameV2(prepared, controller, { ...scope, layerTime: -100 }),
    ).toThrow("source interval");
    expect(() =>
      sampleNativeFrameV2(prepared, controller, {
        ...scope,
        width: 8192,
        height: 8192,
      }),
    ).toThrow("pixel/axis");
  });

  it("keeps snapshot versions strict and rejects swapped clocks, anchors and inventories", async () => {
    const prepared = await prepareNative3DSceneV2(
      mechanismV2Fixture(),
      nativeFixtureHash,
    );
    const frame = sampleNativeFrameV2(prepared, controller, scope);
    expect(NativeFrameSnapshotSchema.safeParse(frame).success).toBe(false);
    expect(NativeFrameSnapshotVersionsSchema.safeParse(frame).success).toBe(
      true,
    );
    for (const invalid of [
      { ...frame, sourceFrame: frame.sourceFrame + 1 },
      {
        ...frame,
        sourceKey: "native3d-source-1:" + "b".repeat(64) + ":" + "c".repeat(64),
      },
      { ...frame, anchors: {} },
      { ...frame, localVisibility: {} },
      {
        ...frame,
        anchors: {
          ...frame.anchors,
          "pawl.tip": { ...frame.anchors["pawl.tip"]!, world: [99, 0, 0] },
        },
      },
      {
        ...frame,
        anchors: {
          ...frame.anchors,
          "pawl.tip": {
            ...frame.anchors["pawl.tip"]!,
            visibility: "occluded",
            occluderMesh: undefined,
          },
        },
      },
    ])
      expect(NativeFrameSnapshotV2Schema.safeParse(invalid).success).toBe(
        false,
      );
  });

  it("uses current posed vertices for visibility and retains inherited hidden parts", async () => {
    const source = mechanismV2Fixture();
    source.camera = {
      ...source.camera,
      position: [8, 0, 10],
      target: [8, 0, 0],
    };
    source.anchors.push({
      id: "probe",
      role: "proof-target",
      source: { kind: "part-local", part: "root", position: [8, 0, -2] },
    });
    const prepared = await prepareNative3DSceneV2(source, nativeFixtureHash);
    const a = sampleNativeFrameV2(prepared, controller, scope);
    expect(a.anchors.probe!.occluderMesh).toBe("pawl.mesh");
    const b = sampleNativeFrameV2(
      prepared,
      {
        ...controller,
        rigControls: {
          latch: {
            type: "ratchet",
            position: { value: 0.5 },
            latchKeys: [{ frame: 0, state: "engaged" }],
          },
        },
      },
      scope,
    );
    expect(b.anchors.probe!.visibility).toBe("visible");
    expect(nativeScreenAnchorsV2(prepared.source, b.frame).probe).toEqual(
      b.anchors.probe,
    );
    const hidden = sampleNativeFrameV2(
      prepared,
      { ...controller, hiddenParts: ["root"] },
      scope,
    );
    expect(hidden.frame.parts.child!.visible).toBe(false);
    expect(hidden.anchors["spring.seat.b"]!.visibility).toBe("hidden-part");
    expect(hidden.localVisibility.child).toBe(true);
  });
});
