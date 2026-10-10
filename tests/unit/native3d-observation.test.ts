import { describe, expect, it } from "vitest";
import {
  NativeObservedFrameSchema,
  NativeObservedOutputFrameSchema,
} from "../../packages/scene-contract/src/native3d/observation.ts";
import { NativeAppearanceCodeIdentitySchema } from "../../packages/scene-contract/src/native3d/appearance.ts";
const hash = "sha256:" + "a".repeat(64);
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function observation() {
  return {
    version: "native3d-observed-frame-1",
    frameKey: "fixture-frame",
    controller: "world",
    scope: "comp",
    scopeFrame: 1.25,
    sourceFrame: 10.5,
    sourceSha256: hash,
    effectiveSceneSha256: hash,
    geometrySha256: hash,
    appearanceCodeSha256: hash,
    viewport: [0, 0, 320, 180],
    camera: {
      worldMatrix: identity,
      viewMatrix: identity,
      projectionMatrix: identity,
      near: 0.1,
      far: 100,
      aspect: 320 / 180,
      fovDegrees: 40,
    },
    parts: {
      root: {
        localMatrix: identity,
        worldMatrix: identity,
        localVisible: true,
        inheritedVisible: true,
      },
      hook: {
        parent: "root",
        localMatrix: identity,
        worldMatrix: identity,
        localVisible: true,
        inheritedVisible: true,
      },
    },
    anchors: {
      contact: {
        part: "hook",
        world: [0, 1, 0],
        pixel: [160, 90],
        depth: 10,
        visibility: "visible",
        visibilityMethod: "three-physical-mesh-segment",
      },
    },
    pass: { completed: true, calls: 2, triangles: 12 },
  };
}
describe("native render measurement transport", () => {
  it("retains a fractional scope and source clock and nullable projection", () => {
    const value = observation();
    expect(NativeObservedFrameSchema.parse(value).sourceFrame).toBe(10.5);
    expect(
      NativeObservedFrameSchema.safeParse({
        ...value,
        anchors: {
          contact: {
            ...value.anchors.contact,
            pixel: null,
            visibility: "behind-camera",
          },
        },
      }).success,
    ).toBe(true);
  });
  it("rejects measurements with incomplete, nonfinite, or extra matrix entries", () => {
    for (const worldMatrix of [
      identity.slice(1),
      [...identity, 1],
      [...identity.slice(0, 15), NaN],
      [...identity.slice(0, 15), Infinity],
    ]) {
      const value = observation();
      expect(
        NativeObservedFrameSchema.safeParse({
          ...value,
          camera: { ...value.camera, worldMatrix },
        }).success,
      ).toBe(false);
    }
  });
  it("rejects stale topology, incomplete passes and borrowed expected visibility flags", () => {
    const value = observation();
    for (const candidate of [
      {
        ...value,
        parts: {
          ...value.parts,
          root: { ...value.parts.root, parent: "hook" },
        },
      },
      {
        ...value,
        parts: {
          ...value.parts,
          hook: { ...value.parts.hook, parent: "absent" },
        },
      },
      {
        ...value,
        anchors: { contact: { ...value.anchors.contact, part: "absent" } },
      },
      { ...value, pass: { ...value.pass, completed: false } },
      {
        ...value,
        anchors: {
          contact: {
            ...value.anchors.contact,
            visibilityMethod: "native-physical-mesh-segment",
          },
        },
      },
      { ...value, assertions: [{ passed: true }] },
    ])
      expect(NativeObservedFrameSchema.safeParse(candidate).success).toBe(
        false,
      );
  });
  it("rejects mismatched pass dimensions and excessive pixel allocations", () => {
    const value = observation();
    expect(
      NativeObservedFrameSchema.safeParse({
        ...value,
        viewport: [0, 0, 320, 181],
      }).success,
    ).toBe(false);
    expect(
      NativeObservedFrameSchema.safeParse({
        ...value,
        viewport: [0, 0, 8192, 8192],
        camera: { ...value.camera, aspect: 1 },
      }).success,
    ).toBe(false);
  });
  it("requires output-associated contributing passes in contiguous invocation order", () => {
    const pass = { sampleIndex: 0, sampleFrame: 1.25, observed: observation() };
    const value = {
      version: "native3d-observed-output-frame-1",
      outputFrame: 1,
      executionSha256: hash,
      passes: [pass],
    };
    expect(NativeObservedOutputFrameSchema.safeParse(value).success).toBe(true);
    expect(
      NativeObservedOutputFrameSchema.safeParse({
        ...value,
        passes: [pass, pass],
      }).success,
    ).toBe(false);
    expect(
      NativeObservedOutputFrameSchema.safeParse({ ...value, outputFrame: 1.25 })
        .success,
    ).toBe(false);
    expect(
      NativeObservedOutputFrameSchema.safeParse({
        ...value,
        passes: Array.from({ length: 65 }, (_, sampleIndex) => ({
          ...pass,
          sampleIndex,
        })),
      }).success,
    ).toBe(false);
  });
});
describe("appearance source closure", () => {
  const value = {
    runtimeFormat: "source-ts",
    modules: [{ name: "renderer-core/native3d/world.ts", sha256: hash }],
    threeRuntime: {
      version: "0.186.0",
      sources: [{ name: "three/build/three.module.js", sha256: hash }],
    },
  };
  it("pins runtime format, relative unique sorted names and actual source hashes", () => {
    expect(NativeAppearanceCodeIdentitySchema.safeParse(value).success).toBe(
      true,
    );
    for (const modules of [
      [],
      [{ name: "/absolute/world.ts", sha256: hash }],
      [{ name: "../world.ts", sha256: hash }],
      [...value.modules, ...value.modules],
      [
        { name: "z.ts", sha256: hash },
        { name: "a.ts", sha256: hash },
      ],
    ])
      expect(
        NativeAppearanceCodeIdentitySchema.safeParse({ ...value, modules })
          .success,
      ).toBe(false);
    expect(
      NativeAppearanceCodeIdentitySchema.safeParse({
        ...value,
        threeRuntime: { ...value.threeRuntime, version: "0.185.0" },
      }).success,
    ).toBe(false);
    expect(
      NativeAppearanceCodeIdentitySchema.safeParse({
        ...value,
        runtimeFormat: "source-ts-or-installed",
      }).success,
    ).toBe(false);
  });
});
