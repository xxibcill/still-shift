import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CompositionSchema,
  Native3DLayerSchema,
  SolidSceneSchema,
  type Composition,
  type CompositionLayer,
  type MechanismPartFrame,
  type Native3DLayer,
  type Native3DSource,
  type Native3DSourceOverrides,
} from "@still-shift/scene-contract";
import { createTapeHookScene } from "../../packages/animation-engine/src/mechanism/tape-hook.ts";
import { canonicalMechanismJson } from "../../packages/renderer-core/src/mechanism/canonical.ts";
import { prepareNative3DScene } from "../../packages/renderer-core/src/native3d/prepare.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/evaluate.ts";
import type {
  EvaluatedLayerTree,
  EvaluationOptions,
} from "../../packages/renderer-core/src/composition/evaluate/types.ts";
import {
  compositionQualityFrame,
  compositionQualityTree,
} from "../../packages/renderer-core/src/composition/quality-samples.ts";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
import {
  nativeFixtureHash,
  nativeSolidFixture,
} from "../helpers/native3d-fixture.ts";

const world = (edit: Partial<Native3DLayer> = {}) =>
  Native3DLayerSchema.parse({
    id: "world",
    type: "native3d",
    asset: "solid",
    sourceStartFrame: 0,
    sourceFps: 30,
    ...edit,
  });

function document(
  controller = world(),
  source: Native3DSource = nativeSolidFixture(),
  layers: CompositionLayer[] = [],
): Composition {
  return CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "comp",
    width: 320,
    height: 180,
    fps: 30,
    frameCount: 60,
    assets: [
      {
        id: "solid",
        type: "native3d",
        path: "solid.json",
        sha256: nativeFixtureHash,
        format: source.schemaVersion,
      },
    ],
    layers: [controller, ...layers],
  });
}

async function evaluation(
  source: Native3DSource = nativeSolidFixture(),
  variants: Native3DSourceOverrides[] = [],
): Promise<EvaluationOptions> {
  return {
    preparedNative3D: {
      solid: await prepareNative3DScene(source, nativeFixtureHash, {
        variants,
      }),
    },
  };
}

function hashGeometry(source: Native3DSource) {
  source.geometrySha256 =
    "sha256:" +
    createHash("sha256")
      .update(canonicalMechanismJson(source.geometry))
      .digest("hex");
}

/** Alter a settled physical pose, without creating time or identity evidence. */
function movedPose(tree: EvaluatedLayerTree, part: string) {
  const result = structuredClone(tree),
    snapshot = result.layers.find(
      (state) => state.id === "world",
    )!.nativeFrame!;
  const matrix: [...MechanismPartFrame["worldMatrix"]] = [
    ...snapshot.frame.parts[part]!.worldMatrix,
  ];
  matrix[12]! += 0.25;
  snapshot.frame.parts[part]!.worldMatrix = matrix;
  return result;
}

describe("native physical paint motion evidence", () => {
  it("follows real fractional camera motion and random seeks without a false frozen run", async () => {
    const source = nativeSolidFixture(),
      options = await evaluation(source),
      composition = document(
        world({
          cameraKeys: [
            {
              frame: 0,
              position: [0, 0, 10],
              target: [0, 0, 0],
              easing: "linear",
            },
            {
              frame: 59,
              position: [1, 0, 10],
              target: [0, 0, 0],
              easing: "linear",
            },
          ],
        }),
      );
    const a = compositionQualityFrame(composition, 13.25, options),
      b = compositionQualityFrame(composition, 13.5, options);
    expect(
      a.layers.get("world")!.state.nativeFrame!.frame.camera.position[0],
    ).toBeCloseTo(13.25 / 59, 12);
    expect(a.signature).not.toBe(b.signature);
    compositionQualityFrame(composition, 58.75, options);
    compositionQualityFrame(composition, 0, options);
    expect(compositionQualityFrame(composition, 13.25, options).signature).toBe(
      a.signature,
    );
    expect(
      analyzeCompositionQuality(composition, {
        evaluation: options,
      }).diagnostics.map((finding) => finding.code),
    ).not.toContain("frozen-run");
  });

  it("keeps stationary paint stationary across fractional clocks, source time and seed bookkeeping", async () => {
    const options = await evaluation(),
      composition = document(),
      a = compositionQualityFrame(composition, 0, options),
      b = compositionQualityFrame(composition, 28.75, options);
    expect(a.layers.get("world")!.state.nativeFrame!.frameKey).not.toBe(
      b.layers.get("world")!.state.nativeFrame!.frameKey,
    );
    expect(a.signature).toBe(b.signature);
    const retimed = document(
      world({ sourceStartFrame: 77, sourceFps: 60, seed: 99 }),
    );
    expect(compositionQualityFrame(retimed, 11.25, options).signature).toBe(
      a.signature,
    );
    expect(
      analyzeCompositionQuality(composition, { evaluation: options })
        .diagnostics,
    ).toContainEqual(
      expect.objectContaining({ code: "frozen-run", frames: [1, 59] }),
    );
  });

  it.each(["camera", "part", "material", "hidden"] as const)(
    "binds the current saved %s edit while preserving its stationary interval",
    async (kind) => {
      const source = nativeSolidFixture(),
        override: Native3DSourceOverrides =
          kind === "part"
            ? {
                partOverrides: {
                  root: {
                    transform: {
                      ...source.parts[0]!.transform,
                      position: [0.25, 0, 0],
                    },
                  },
                },
              }
            : kind === "material"
              ? {
                  materialOverrides: {
                    paint: { roughness: 0.8, metalness: 0.7, color: "#fedcba" },
                  },
                }
              : {},
        options = await evaluation(source, [override]);
      const baseline = document(),
        current = document(
          world({
            ...override,
            ...(kind === "camera"
              ? { camera: { ...source.camera, fovDegrees: 45 } }
              : {}),
            ...(kind === "hidden" ? { hiddenParts: ["root"] } : {}),
          }),
        );
      const a = compositionQualityFrame(baseline, 7.5, options),
        b = compositionQualityFrame(current, 7.5, options);
      expect(b.signature).not.toBe(a.signature);
      expect(compositionQualityFrame(current, 33.25, options).signature).toBe(
        b.signature,
      );
      const saved = CompositionSchema.parse(
        JSON.parse(JSON.stringify(current)),
      );
      expect(compositionQualityFrame(saved, 7.5, options).signature).toBe(
        b.signature,
      );
    },
  );

  it("uses real current rig mesh matrices and excludes hidden physical rig motion", async () => {
    const source = createTapeHookScene();
    source.rigs[0]!.travelKeys = [
      { frame: 0, value: 0, easing: "linear" },
      { frame: 59, value: 1, easing: "linear" },
    ];
    const options = await evaluation(source),
      visible = document(world(), source),
      a = compositionQualityFrame(visible, 12.25, options),
      b = compositionQualityFrame(visible, 12.5, options);
    const hookA = a.layers.get("world")!.state.nativeFrame!.frame.parts.hook!,
      hookB = b.layers.get("world")!.state.nativeFrame!.frame.parts.hook!;
    expect(hookA.worldMatrix[12]).not.toBe(hookB.worldMatrix[12]);
    expect(a.signature).not.toBe(b.signature);
    const hidden = document(world({ hiddenParts: ["hook"] }), source);
    expect(compositionQualityFrame(hidden, 12.25, options).signature).toBe(
      compositionQualityFrame(hidden, 12.5, options).signature,
    );
  });

  it("ignores meshless part poses and derivable anchors but binds visible mesh poses", async () => {
    const options = await evaluation(),
      composition = document(),
      tree = evaluateComp(composition, 7.25, options),
      baseline = compositionQualityTree(composition, tree, options);
    const empty = movedPose(tree, "child");
    empty.layers[0]!.nativeFrame!.anchors.face!.pixel = [1, 2];
    empty.layers[0]!.nativeFrame!.frame.anchors.face!.world = [1, 2, 3];
    expect(compositionQualityTree(composition, empty, options).signature).toBe(
      baseline.signature,
    );
    expect(
      compositionQualityTree(composition, movedPose(tree, "root"), options)
        .signature,
    ).not.toBe(baseline.signature);
  });

  it("includes a world graphic's meshless physical owner and binding exactly once", async () => {
    const options = await evaluation(),
      artwork: CompositionLayer = {
        id: "art",
        type: "solid",
        size: [40, 20],
        color: "#ffffff",
        native3D: {
          role: "world-graphic",
          sceneLayer: "world",
          part: "child",
          transform: {
            position: [0, 0, 1],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            pivot: [0, 0, 0],
          },
          pixelsPerUnit: 100,
          alphaMode: "opaque",
        },
      },
      composition = document(world(), nativeSolidFixture(), [artwork]),
      tree = evaluateComp(composition, 7.25, options),
      a = compositionQualityTree(composition, tree, options),
      b = compositionQualityTree(
        composition,
        movedPose(tree, "child"),
        options,
      );
    expect(b.layers.get("world")!.signature).toBe(
      a.layers.get("world")!.signature,
    );
    expect(b.layers.get("art")!.matrix).toEqual(a.layers.get("art")!.matrix);
    expect(b.layers.get("art")!.signature).not.toBe(
      a.layers.get("art")!.signature,
    );
    const hidden = structuredClone(tree);
    hidden.layers[0]!.nativeFrame!.frame.parts.child!.visible = false;
    expect(compositionQualityTree(composition, hidden, options).signature).toBe(
      a.signature,
    );
    expect(
      compositionQualityTree(composition, movedPose(hidden, "child"), options)
        .signature,
    ).not.toBe(compositionQualityTree(composition, hidden, options).signature);
    const changed = structuredClone(composition);
    const binding = changed.layers[1]!.native3D!;
    if (binding.role !== "world-graphic")
      throw Error("Expected a world graphic");
    binding.pixelsPerUnit = 200;
    expect(compositionQualityFrame(changed, 7.25, options).signature).not.toBe(
      a.signature,
    );
  });

  it("uses the actual indexed group materials rather than a discarded base material", async () => {
    const source = nativeSolidFixture();
    source.geometry.materials[0] = {
      ...source.geometry.materials[0]!,
      alphaMode: "mask",
      opacity: 0.1,
      alphaCutoff: 0.5,
    };
    source.geometry.materials.push({
      ...source.geometry.materials[0]!,
      id: "survivor",
      alphaMode: "opaque",
      opacity: 1,
    });
    source.geometry.meshes[0]!.indices = [0, 1, 2, 0, 1, 2];
    source.geometry.meshes[0]!.groups = [
      { start: 0, count: 3, materialIndex: 0 },
      { start: 3, count: 3, materialIndex: 1 },
    ];
    hashGeometry(source);
    const discarded: Native3DSourceOverrides = {
      materialOverrides: {
        survivor: { alphaMode: "mask", opacity: 0.1, alphaCutoff: 0.5 },
      },
    };
    const options = await evaluation(SolidSceneSchema.parse(source), [
        discarded,
      ]),
      mixed = document(),
      allDiscarded = document(world(discarded));
    const a = evaluateComp(mixed, 8, options),
      b = evaluateComp(allDiscarded, 8, options);
    expect(
      compositionQualityTree(mixed, movedPose(a, "root"), options).signature,
    ).not.toBe(compositionQualityTree(mixed, a, options).signature);
    expect(
      compositionQualityTree(allDiscarded, movedPose(b, "root"), options)
        .signature,
    ).toBe(compositionQualityTree(allDiscarded, b, options).signature);
  });

  it.each(["geometry", "floor", "lights", "environment", "fog"] as const)(
    "binds current static %s paint through the immutable effective source identity",
    async (kind) => {
      const source = createTapeHookScene(),
        changed = structuredClone(source);
      if (kind === "geometry") changed.geometry.materials[0]!.roughness = 0.19;
      if (kind === "floor")
        changed.parts.find(
          (part) => part.id === "floor",
        )!.transform.position[1] += 0.25;
      if (kind === "lights") changed.lights[0]!.intensity += 0.5;
      if (kind === "environment") changed.profile.environmentIntensity += 0.2;
      if (kind === "fog") changed.profile.fog!.near += 1;
      hashGeometry(changed);
      const composition = document(world(), source),
        before = await evaluation(source),
        after = await evaluation(changed);
      expect(
        compositionQualityFrame(composition, 10.25, after).signature,
      ).not.toBe(compositionQualityFrame(composition, 10.25, before).signature);
      expect(compositionQualityFrame(composition, 11.75, after).signature).toBe(
        compositionQualityFrame(composition, 10.25, after).signature,
      );
    },
  );

  it("requires the matching prepared catalogue for a settled native tree", async () => {
    const options = await evaluation(),
      composition = document(),
      tree = evaluateComp(composition, 10, options);
    expect(() => compositionQualityTree(composition, tree)).toThrow(
      "preparation is required",
    );
    const stale = structuredClone(tree);
    stale.layers[0]!.nativeFrame!.effectiveSceneSha256 =
      "sha256:" + "b".repeat(64);
    expect(() => compositionQualityTree(composition, stale, options)).toThrow(
      "identity differs",
    );
  });

  it("binds the native owning viewport and leaves ordinary signature bytes unchanged by readiness data", async () => {
    const options = await evaluation(),
      composition = document(),
      tree = evaluateComp(composition, 10, options),
      resized = structuredClone(tree);
    resized.layers[0]!.nativeFrame!.viewport.width = 640;
    expect(
      compositionQualityTree(composition, resized, options).signature,
    ).not.toBe(compositionQualityTree(composition, tree, options).signature);
    const ordinary = CompositionSchema.parse({
      schemaVersion: "composition-1",
      id: "ordinary",
      assets: [],
      width: 320,
      height: 180,
      fps: 30,
      frameCount: 60,
      layers: [
        { id: "paint", type: "solid", size: [320, 180], color: "#ffffff" },
      ],
    });
    expect(compositionQualityFrame(ordinary, 12.5, options).signature).toBe(
      compositionQualityFrame(ordinary, 12.5).signature,
    );
    expect(
      compositionQualityTree(ordinary, evaluateComp(ordinary, 12.5)).signature,
    ).toBe(compositionQualityFrame(ordinary, 12.5).signature);
  });
});
