import { describe, expect, it } from "vitest";
import {
  evaluateMechanismFrame,
  prepareMechanismScene,
  canonicalMechanismJson,
  MechanismFrameResultSchema,
} from "../../packages/renderer-core/src/mechanism/index.ts";

function fixtureInput() {
  return {
    schemaVersion: "mechanism-scene-1",
    id: "tape",
    geometrySha256: "sha256:" + "a".repeat(64),
    coordinateSystem: "right-handed-y-up",
    units: { kind: "illustrative", scaleToMeters: 1 },
    geometry: {
      schemaVersion: "mechanism-geometry-1",
      meshes: [
        {
          id: "rivet",
          partId: "blade",
          materialId: "steel",
          positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
          normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
          indices: [0, 1, 2],
          bounds: { min: [0, 0, 0], max: [1, 1, 0] },
        },
      ],
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
      {
        id: "behind",
        part: "blade",
        position: [0, 1.25, 20],
        role: "proof-target",
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
function fixture() {
  return prepareMechanismScene(fixtureInput());
}
const sample = (contactMode: "free" | "pull" | "push", frame = 30) => ({
  frame,
  width: 1080,
  height: 1920,
  controls: {
    slider: {
      contactMode,
      travelKeys: [
        { frame: 0, value: 0, easing: "linear" as const },
        { frame: 60, value: 1, easing: "linear" as const },
      ],
    },
  },
});

describe("pure tape-hook frame evaluation", () => {
  it("derives half travel from thickness and keeps rivets fixed to the blade", () => {
    const result = evaluateMechanismFrame(fixture(), sample("free"));
    expect(result.rigs.slider!.q).toBe(0.09);
    expect(result.parts.hook!.worldMatrix[12]).toBe(0.09);
    expect(result.parts.blade!.worldMatrix[12]).toBe(0);
    expect(result.assertions.every((assertion) => assertion.passed)).toBe(true);
  });
  it("holds the selected physical face at the independently calculated datum", () => {
    const pulled = evaluateMechanismFrame(fixture(), sample("pull"));
    expect(pulled.parts.model!.worldMatrix[12]).toBe(-0.09);
    expect(pulled.anchors["hook.innerFace"]!.world[0]).toBe(0);
    const pushed = evaluateMechanismFrame(fixture(), sample("push"));
    expect(pushed.parts.model!.worldMatrix[12]).toBe(0.09);
    expect(pushed.anchors["hook.outerFace"]!.world[0]).toBe(0);
    expect(pushed.rigs.slider!.measurementMode).toBe("inside");
  });
  it("projects the forward datum to the exact canvas center without claiming occlusion", () => {
    const result = evaluateMechanismFrame(fixture(), sample("pull"));
    expect(result.anchors["hook.innerFace"]!.pixel).toEqual([540, 960]);
    expect(result.anchors["hook.innerFace"]!.projectionVisibility).toBe(
      "in-frame",
    );
    expect(result.anchors.behind!.projectionVisibility).toBe("behind-camera");
    expect(result.anchors.behind!.pixel).toBeNull();
  });
  it("preserves exact output for forward, reverse and random seeks and never mutates inputs", () => {
    const scene = fixture(),
      before = JSON.stringify(scene);
    const frames = [0, 7, 30, 46, 60],
      expected = frames.map((frame) =>
        evaluateMechanismFrame(scene, sample("pull", frame)),
      );
    for (const order of [
      [60, 46, 30, 7, 0],
      [30, 0, 60, 7, 46],
    ])
      for (const frame of order)
        expect(evaluateMechanismFrame(scene, sample("pull", frame))).toEqual(
          expected[frames.indexOf(frame)],
        );
    expect(JSON.stringify(scene)).toBe(before);
  });
  it("rejects out-of-range controls and unknown rig writers with located errors", () => {
    const request = sample("free");
    request.controls.slider.travelKeys[1]!.value = 1.01;
    expect(() => evaluateMechanismFrame(fixture(), request)).toThrow();
    expect(() =>
      evaluateMechanismFrame(fixture(), {
        ...sample("free"),
        controls: { foreign: sample("free").controls.slider },
      }),
    ).toThrow(/foreign/);
  });
  it("uses independent authored hierarchy and rotation expectations for physical contact", () => {
    const input = fixtureInput();
    Object.assign(input.parts[0]!, {
      transform: {
        position: [3, 4, 0],
        rotation: [0, 0, Math.PI / 2],
        scale: [2, 3, 1],
      },
    });
    const result = evaluateMechanismFrame(
      prepareMechanismScene(input),
      sample("pull"),
    );
    const actual = result.anchors["hook.innerFace"]!.world;
    expect(actual[0]).toBeCloseTo(-0.75, 12);
    expect(actual[1]).toBeCloseTo(4, 12);
    expect(result.parts.blade!.worldMatrix[13]).toBeCloseTo(3.82, 12);
    expect(result.assertions.every((assertion) => assertion.passed)).toBe(true);
  });
  it("matches an independent perspective formula and inherits hidden-parent visibility", () => {
    const camera = {
      position: [-1, 1.25, 10] as [number, number, number],
      target: [-1, 1.25, 0] as [number, number, number],
      fovDegrees: 40,
      near: 0.1,
      far: 100,
    };
    const result = evaluateMechanismFrame(fixture(), {
      ...sample("free", 0),
      camera,
    });
    expect(result.anchors["hook.innerFace"]!.pixel![0]).toBeCloseTo(
      540 + 96 / Math.tan(Math.PI / 9),
      10,
    );
    expect(result.anchors["hook.innerFace"]!.pixel![1]).toBe(960);
    const hidden = evaluateMechanismFrame(fixture(), {
      ...sample("free"),
      hiddenParts: ["model"],
    });
    expect(hidden.parts.hook!.visible).toBe(false);
    expect(hidden.anchors["hook.innerFace"]!.projectionVisibility).toBe(
      "hidden-part",
    );
    expect(
      evaluateMechanismFrame(fixture(), {
        ...sample("pull"),
        camera: { ...camera, far: 5 },
      }).anchors["hook.innerFace"]!.projectionVisibility,
    ).toBe("clipped");
  });
  it("samples absolute camera and travel keys with endpoint and smoothstep semantics", () => {
    const request = {
      ...sample("free", 15),
      cameraKeys: [
        {
          frame: 0,
          position: [0, 1.25, 10] as [number, number, number],
          target: [0, 1.25, 0] as [number, number, number],
        },
        {
          frame: 60,
          position: [8, 1.25, 10] as [number, number, number],
          target: [8, 1.25, 0] as [number, number, number],
        },
      ],
    };
    const result = evaluateMechanismFrame(fixture(), request);
    expect(result.camera.position[0]).toBe(1.25);
    expect(result.rigs.slider!.q).toBe(0.045);
    expect(
      evaluateMechanismFrame(fixture(), { ...request, frame: 90 }).camera
        .position[0],
    ).toBe(8);
    expect(
      evaluateMechanismFrame(fixture(), { ...request, frame: 60 }).rigs.slider!
        .q,
    ).toBe(0.18);
  });
  it("prepares an immutable clone once and validates bounded supplied frame metadata", () => {
    const input = fixtureInput(),
      prepared = prepareMechanismScene(input);
    input.geometry.meshes[0]!.positions[0] = 100;
    expect(prepared.scene.geometry.meshes[0]!.positions[0]).toBe(0);
    expect(Object.isFrozen(prepared.scene.geometry.meshes[0]!.positions)).toBe(
      true,
    );
    const frame = evaluateMechanismFrame(prepared, sample("push"));
    expect(MechanismFrameResultSchema.safeParse(frame).success).toBe(true);
    const malformed = structuredClone(frame);
    malformed.rigs.slider!.q = 0.08;
    expect(MechanismFrameResultSchema.safeParse(malformed).success).toBe(false);
  });
  it("canonically binds JSON key order while rejecting non-JSON and cyclic input", () => {
    expect(canonicalMechanismJson({ b: [2, 1], a: { z: false, x: 0 } })).toBe(
      '{"a":{"x":0,"z":false},"b":[2,1]}',
    );
    expect(canonicalMechanismJson({ a: { x: 0, z: false }, b: [2, 1] })).toBe(
      canonicalMechanismJson({ b: [2, 1], a: { z: false, x: 0 } }),
    );
    expect(() => canonicalMechanismJson({ a: Infinity })).toThrow(/finite/);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => canonicalMechanismJson(cycle)).toThrow(/cycles/);
  });
});
