import { describe, expect, it } from "vitest";
import { CompositionSchema } from "@still-shift/scene-contract";
import { prepareNative3DSceneV2 } from "../../packages/renderer-core/src/native3d/prepare-v2.ts";
import { prepareNative3DScene } from "../../packages/renderer-core/src/native3d/prepare.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import {
  nativeInspectorContext,
  editNativeInspector,
} from "../../apps/lab/src/composition-native-edit.ts";
import { mechanismV2Fixture } from "../helpers/mechanism-v2-fixture.ts";
import {
  nativeFixtureHash,
  nativeSolidFixture,
} from "../helpers/native3d-fixture.ts";
function document() {
  return CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "lab2",
    width: 320,
    height: 180,
    fps: 30,
    frameCount: 4,
    assets: [
      {
        id: "mechanism",
        type: "native3d",
        path: "mechanism.json",
        sha256: nativeFixtureHash,
        format: "mechanism-scene-2",
      },
      {
        id: "legacy",
        type: "native3d",
        path: "legacy.json",
        sha256: nativeFixtureHash,
        format: "solid-scene-1",
      },
    ],
    layers: [
      {
        id: "world2",
        outPoint: 2,
        type: "native3d",
        asset: "mechanism",
        sourceStartFrame: 0.25,
        sourceFps: 30,
      },
      {
        id: "world1",
        inPoint: 2,
        type: "native3d",
        asset: "legacy",
        sourceStartFrame: 0,
        sourceFps: 30,
      },
    ],
  });
}
describe("Lab native2 inspector on the accepted mixed catalogue", () => {
  it("resolves source2 in its owning scope and keeps original1 selection explicit", async () => {
    const comp = document(),
      prepared = {
        mechanism: await prepareNative3DSceneV2(
          mechanismV2Fixture(),
          nativeFixtureHash,
        ),
        legacy: await prepareNative3DScene(
          nativeSolidFixture(),
          nativeFixtureHash,
        ),
      },
      options = { preparedNative3D: prepared };
    expect(
      nativeInspectorContext(comp, ["layers", 0], options)!.variant.version,
    ).toBe("prepared-native3d-variant-2");
    expect(
      nativeInspectorContext(comp, ["layers", 1], options)!.variant.version,
    ).toBe("prepared-native3d-variant-1");
    expect(
      evaluateComp(comp, 1.5, options).layers[0]!.nativeFrame?.version,
    ).toBe("native3d-frame-2");
    expect(JSON.stringify(comp)).not.toContain("prepared-native3d");
  });
  it("edits declared camera, part and material data, then requires a freshly prepared effective variant", async () => {
    const comp = document(),
      source = mechanismV2Fixture(),
      prepared = await prepareNative3DSceneV2(source, nativeFixtureHash),
      options = { preparedNative3D: { mechanism: prepared } };
    editNativeInspector(comp, ["layers", 0], options, {
      kind: "camera-fov",
      key: "base",
      value: 55,
    });
    editNativeInspector(comp, ["layers", 0], options, {
      kind: "material-pbr",
      material: "paint",
      metalness: 0.6,
      roughness: 0.4,
    });
    expect(() => nativeInspectorContext(comp, ["layers", 0], options)).toThrow(
      /have not been prepared/,
    );
    const layer = comp.layers[0]!;
    if (layer.type !== "native3d") throw Error("Fixture controller");
    const edited = await prepareNative3DSceneV2(source, nativeFixtureHash, {
      variants: [{ materialOverrides: layer.materialOverrides }],
    });
    const nextOptions = { preparedNative3D: { mechanism: edited } };
    const context = nativeInspectorContext(comp, ["layers", 0], nextOptions)!;
    expect(context.variant.geometrySha256).not.toBe(
      prepared.variants[prepared.baseSourceKey]!.geometrySha256,
    );
    expect(context.variant.meshDataSha256).toBe(
      prepared.variants[prepared.baseSourceKey]!.meshDataSha256,
    );
    editNativeInspector(comp, ["layers", 0], nextOptions, {
      kind: "part-translation",
      part: "root",
      position: [0.2, 0, 0],
    });
    expect(layer.partOverrides?.root?.transform?.position).toEqual([0.2, 0, 0]);
    expect(layer.camera?.fovDegrees).toBe(55);
    expect(() =>
      nativeInspectorContext(comp, ["layers", 0], nextOptions),
    ).toThrow(/have not been prepared/);
  });
  it("locates invalid edits and rejects unknown prepared protocols before selecting a variant", async () => {
    const comp = document(),
      prepared = await prepareNative3DSceneV2(
        mechanismV2Fixture(),
        nativeFixtureHash,
      ),
      options = { preparedNative3D: { mechanism: prepared } };
    expect(() =>
      editNativeInspector(comp, ["layers", 0], options, {
        kind: "part-translation",
        part: "missing",
        position: [0, 0, 0],
      }),
    ).toThrow(/declared physical part/);
    const unknown = JSON.parse(JSON.stringify(prepared));
    unknown.version = "prepared-native3d-scene-4";
    expect(() =>
      nativeInspectorContext(comp, ["layers", 0], {
        preparedNative3D: { mechanism: unknown },
      }),
    ).toThrow(/supported prepared/);
  });
});
