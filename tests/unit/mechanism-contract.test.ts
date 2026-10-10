import { describe, expect, it } from "vitest";
import {
  MechanismEpisodeSchema,
  MechanismSceneSchema,
} from "../../packages/scene-contract/src/mechanism/index.ts";

const triangle = {
  id: "rivet",
  partId: "blade",
  materialId: "steel",
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
  indices: [0, 1, 2],
  bounds: { min: [0, 0, 0], max: [1, 1, 0] },
};
function scene() {
  return {
    schemaVersion: "mechanism-scene-1",
    id: "tape",
    geometrySha256: "sha256:" + "a".repeat(64),
    units: { kind: "illustrative", scaleToMeters: 1 },
    coordinateSystem: "right-handed-y-up",
    geometry: {
      schemaVersion: "mechanism-geometry-1",
      meshes: [triangle],
      materials: [
        { id: "steel", color: "#aabbcc", roughness: 0.3, metalness: 1 },
      ],
      dimensions: {
        hookThickness: 0.18,
        hookTravel: 0.18,
        bladeLength: 5,
        bladeWidth: 2,
      },
    },
    parts: [
      { id: "model" },
      { id: "hook", parent: "model" },
      { id: "blade", parent: "model" },
    ],
    rigs: [
      {
        id: "slider",
        type: "tape-hook-slider",
        rootPart: "model",
        hookPart: "hook",
        bladePart: "blade",
        rivetMeshIds: ["rivet"],
        thickness: 0.18,
      },
    ],
    anchors: [
      {
        id: "hook.innerFace",
        part: "hook",
        position: [0, 1.25, 0],
        role: "physical-inner-face",
      },
      {
        id: "hook.outerFace",
        part: "hook",
        position: [-0.18, 1.25, 0],
        role: "physical-outer-face",
      },
    ],
    camera: {
      position: [0, 1.25, 10],
      target: [0, 1.25, 0],
      fovDegrees: 40,
      near: 0.1,
      far: 100,
    },
    profile: {
      toneMapping: "aces-filmic",
      exposure: 1.14,
      output: "srgb-rgba8-straight",
    },
  };
}

describe("bounded shared mechanism contracts", () => {
  it("accepts the rigid indexed catalog without adding renderer-owned geometry", () => {
    const parsed = MechanismSceneSchema.parse(scene());
    expect(parsed.rigs[0]!.thickness).toBe(
      parsed.geometry.dimensions.hookThickness,
    );
    expect(parsed.parts[1]!.transform.position).toEqual([0, 0, 0]);
  });
  it("rejects unknown versions and undeclared material features", () => {
    expect(
      MechanismSceneSchema.safeParse({
        ...scene(),
        schemaVersion: "mechanism-scene-9",
      }).success,
    ).toBe(false);
    const value = scene();
    Object.assign(value.geometry.materials[0]!, { transmission: 0.5 });
    expect(MechanismSceneSchema.safeParse(value).success).toBe(false);
  });
  it("locates invalid topology, bounds, duplicate IDs and resource overflow", () => {
    const topology = scene();
    topology.geometry.meshes[0] = { ...triangle, indices: [0, 1, 3] };
    expect(MechanismSceneSchema.safeParse(topology).success).toBe(false);
    const bounds = scene();
    bounds.geometry.meshes[0] = {
      ...triangle,
      bounds: { min: [0, 0, 0], max: [0.5, 1, 0] },
    };
    expect(MechanismSceneSchema.safeParse(bounds).success).toBe(false);
    const duplicate = scene();
    duplicate.parts.push({ id: "model" });
    expect(MechanismSceneSchema.safeParse(duplicate).success).toBe(false);
    const overflow = scene();
    overflow.parts = Array.from({ length: 129 }, (_, n) => ({
      id: `part${n}`,
    }));
    expect(MechanismSceneSchema.safeParse(overflow).success).toBe(false);
  });
  it("rejects cyclic parents and a rivet placed on the moving hook", () => {
    const cycle = scene();
    cycle.parts[0] = { id: "model", parent: "hook" };
    expect(MechanismSceneSchema.safeParse(cycle).success).toBe(false);
    const movingRivet = scene();
    movingRivet.geometry.meshes[0] = { ...triangle, partId: "hook" };
    expect(MechanismSceneSchema.safeParse(movingRivet).success).toBe(false);
  });
  it("rejects a camera with no view direction or parallel up vector", () => {
    const value = scene();
    value.camera.target = [...value.camera.position];
    expect(MechanismSceneSchema.safeParse(value).success).toBe(false);
    const parallel = scene();
    parallel.camera.position = [0, 10, 0];
    parallel.camera.target = [0, 0, 0];
    expect(MechanismSceneSchema.safeParse(parallel).success).toBe(false);
  });
  it("bounds timed episode dependencies and jointly readable label intervals", () => {
    const episode = {
      schemaVersion: "mechanism-episode-1",
      id: "e01",
      revision: 0,
      scene: "scene",
      font: "font",
      audio: "mix",
      output: { width: 1080, height: 1920, fps: 30, frameCount: 90 },
      dependencies: ["scene", "font", "mix"].map((id) => ({
        id,
        type: id === "scene" ? "scene" : id === "font" ? "font" : "audio",
        path: `assets/${id}`,
        sha256: "sha256:" + "b".repeat(64),
      })),
      shots: [
        {
          id: "contact",
          purpose: "pull-contact",
          startFrame: 0,
          endFrameExclusive: 90,
          labels: [
            {
              id: "pull",
              role: "PULL",
              text: "PULL",
              anchor: "hook.innerFace",
              position: [200, 400],
              readingInterval: { startFrame: 10, endFrameExclusive: 70 },
            },
          ],
        },
      ],
      captions: [
        {
          id: "speech",
          text: "Original supplied speech",
          startFrame: 0,
          endFrameExclusive: 80,
        },
      ],
    };
    expect(MechanismEpisodeSchema.safeParse(episode).success).toBe(true);
    episode.shots[0]!.labels[0]!.readingInterval.endFrameExclusive = 20;
    expect(MechanismEpisodeSchema.safeParse(episode).success).toBe(false);
    expect(
      MechanismEpisodeSchema.safeParse({
        ...episode,
        schemaVersion: "mechanism-episode-2",
      }).success,
    ).toBe(false);
  });
  it("rejects aggregate indexed geometry overflow with a resource diagnostic", () => {
    const value = scene();
    const positions = [
      ...triangle.positions,
      ...Array.from({ length: 49998 * 3 }, () => 0),
    ];
    const normals = Array.from({ length: 50001 }, () => [0, 0, 1]).flat();
    value.geometry.meshes = [
      { ...triangle, id: "rivet", positions, normals },
      { ...triangle, id: "other", positions, normals },
    ];
    const result = MechanismSceneSchema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(
        result.error.issues.some(
          (issue) =>
            issue.code === "custom" &&
            issue.params?.diagnosticCode === "mechanism-resource-limit",
        ),
      ).toBe(true);
  });
});
