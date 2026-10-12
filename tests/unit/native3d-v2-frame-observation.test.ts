import { describe, expect, it } from "vitest";
import {
  MechanismMatrixSchema,
  NativeObservedFrameSchema,
  NativeObservedFrameV2Schema,
  NativeObservedOutputFrameSchema,
  NativeObservedOutputFrameV2Schema,
} from "@still-shift/scene-contract";
import * as browser from "../../packages/renderer-core/src/native3d/browser.ts";
import {
  assertNativeObservedFrameV2,
  NATIVE_OBSERVED_MATRIX_EPSILON,
  NATIVE_OBSERVED_PIXEL_EPSILON,
} from "../../packages/renderer-core/src/native3d/observed-validation-v2.ts";
import { nativeExpectedShapeLandmarkV2 } from "../../packages/renderer-core/src/native3d/observed-precision-v2.ts";
import { IDENTITY_MATRIX } from "../../packages/renderer-core/src/mechanism/matrix.ts";
import { nativeFrameObservationFixtureV2 } from "../helpers/native3d-frame-observation-fixture.ts";
import { mechanismV2Fixture } from "../helpers/mechanism-v2-fixture.ts";

describe("versioned full native2 observations", () => {
  it("exposes a fixed full-frame browser owner without replacing the original observer", () => {
    expect(browser.createNativeThreeFrameObservationV2).toBeTypeOf("function");
    expect(browser.observeNativeThreeWorld).toBeTypeOf("function");
  });
  it("admits strict full-frame2 and preserves the original v1 rejection boundary", async () => {
    const f = await nativeFrameObservationFixtureV2();
    expect(NativeObservedFrameV2Schema.safeParse(f.observed).success).toBe(
      true,
    );
    expect(NativeObservedFrameSchema.safeParse(f.observed).success).toBe(false);
    expect(
      NativeObservedOutputFrameV2Schema.safeParse({
        version: "native3d-observed-output-frame-2",
        outputFrame: 0,
        executionSha256: f.appearanceCodeSha256,
        passes: [{ sampleIndex: 0, sampleFrame: 0.5, observed: f.observed }],
      }).success,
    ).toBe(true);
    expect(
      NativeObservedOutputFrameSchema.safeParse({
        version: "native3d-observed-output-frame-1",
        outputFrame: 0,
        executionSha256: f.appearanceCodeSha256,
        passes: [{ sampleIndex: 0, sampleFrame: 0.5, observed: f.observed }],
      }).success,
    ).toBe(false);
  });
  it("does not silently admit extra fields, legacy frame keys or wrong finalizer versions", async () => {
    const f = await nativeFrameObservationFixtureV2();
    for (const extra of [
      { frameKey: f.reference.frameKey },
      { finalizerVersion: "native3d-observed-frame-1" },
      { precisionPolicy: "relaxed-matrices" },
    ])
      expect(
        NativeObservedFrameV2Schema.safeParse({ ...f.observed, ...extra })
          .success,
      ).toBe(false);
  });
  it("independently validates the synthetic source pose, used digests and exact quantized landmarks", async () => {
    const f = await nativeFrameObservationFixtureV2();
    await expect(
      assertNativeObservedFrameV2(
        f.variant,
        f.reference,
        f.observed,
        f.appearanceCodeSha256,
      ),
    ).resolves.toEqual(f.observed);
  });
  it("fails wrong source clocks, appearance binding and missing part inventories", async () => {
    const f = await nativeFrameObservationFixtureV2();
    for (const patch of [
      { sourceFrame: 0.75 },
      { appearanceCodeSha256: "sha256:" + "a".repeat(64) },
      { parts: {} },
    ])
      await expect(
        assertNativeObservedFrameV2(
          f.variant,
          f.reference,
          { ...f.observed, ...patch },
          f.appearanceCodeSha256,
        ),
      ).rejects.toThrow();
  });
  it("keeps matrix and pixel tolerances unchanged", async () => {
    expect(NATIVE_OBSERVED_MATRIX_EPSILON).toBe(1e-8);
    expect(NATIVE_OBSERVED_PIXEL_EPSILON).toBe(0.5);
    const f = await nativeFrameObservationFixtureV2(),
      wrong = structuredClone(f.observed);
    const matrix = [...wrong.camera.worldMatrix];
    matrix[12]! += 1e-5;
    wrong.camera.worldMatrix = MechanismMatrixSchema.parse(matrix);
    await expect(
      assertNativeObservedFrameV2(
        f.variant,
        f.reference,
        wrong,
        f.appearanceCodeSha256,
      ),
    ).rejects.toThrow("numeric state");
  });
  it("rejects missing inherited shape IDs with a located validation error", async () => {
    const f = await nativeFrameObservationFixtureV2();
    for (const id of ["constructor", "toString"]) {
      const wrong = structuredClone(f.observed);
      const anchor = Object.values(wrong.anchors).find(
        (anchor) => anchor.source.kind === "shape-landmark",
      )!;
      if (anchor.source.kind !== "shape-landmark")
        throw Error("Expected shape anchor");
      anchor.source.shape = id;
      expect(NativeObservedFrameV2Schema.safeParse(wrong).success).toBe(false);
      await expect(
        assertNativeObservedFrameV2(
          f.variant,
          f.reference,
          wrong,
          f.appearanceCodeSha256,
        ),
      ).rejects.toThrow("invalid observed-frame contract");
    }
  });
  it("rejects an associated but wrong used-GPU digest", async () => {
    const f = await nativeFrameObservationFixtureV2(),
      wrong = structuredClone(f.observed),
      shape = wrong.shapes.pawl!;
    if (shape.status !== "drawn") throw Error("Expected drawn fixture");
    shape.positionSha256 = "sha256:" + "c".repeat(64);
    await expect(
      assertNativeObservedFrameV2(
        f.variant,
        f.reference,
        wrong,
        f.appearanceCodeSha256,
      ),
    ).rejects.toThrow("used-GPU digest");
  });
  it("does not accept copied analytic/corrupted positions under a measured landmark label", async () => {
    const f = await nativeFrameObservationFixtureV2(),
      wrong = structuredClone(f.observed),
      shape = wrong.shapes.pawl!;
    if (shape.status !== "drawn") throw Error("Expected drawn fixture");
    shape.landmarks.tip!.local[0] += 1e-7;
    await expect(
      assertNativeObservedFrameV2(
        f.variant,
        f.reference,
        wrong,
        f.appearanceCodeSha256,
      ),
    ).rejects.toThrow("numeric state");
  });
  it("rejects a changed shape anchor source/method and a forged occlusion witness", async () => {
    const f = await nativeFrameObservationFixtureV2(),
      method = structuredClone(f.observed),
      anchor = method.anchors["pawl.tip"]!;
    if (anchor.status !== "positioned")
      throw Error("Expected positioned fixture");
    anchor.positionMethod = "three-part-local-1";
    expect(NativeObservedFrameV2Schema.safeParse(method).success).toBe(false);
    const occlusion = structuredClone(f.observed),
      point = occlusion.anchors["child.origin"]!;
    if (point.status !== "positioned")
      throw Error("Expected positioned fixture");
    point.visibility = "occluded";
    point.occluderMesh = "foreign.mesh";
    await expect(
      assertNativeObservedFrameV2(
        f.variant,
        f.reference,
        occlusion,
        f.appearanceCodeSha256,
      ),
    ).rejects.toThrow("projection/occlusion");
  });
  it("retains valid constructor IDs in full observations", async () => {
    const source = mechanismV2Fixture();
    source.teachingShapes[0]!.id = "constructor";
    for (const rig of source.rigs)
      if (rig.type === "ratchet") rig.pawlShape = "constructor";
    for (const anchor of source.anchors)
      if (
        anchor.source.kind === "shape-landmark" &&
        anchor.source.shape === "pawl"
      )
        anchor.source.shape = "constructor";
    const f = await nativeFrameObservationFixtureV2(source);
    expect(Object.hasOwn(f.observed.shapes, "constructor")).toBe(true);
    await expect(
      assertNativeObservedFrameV2(
        f.variant,
        f.reference,
        f.observed,
        f.appearanceCodeSha256,
      ),
    ).resolves.toEqual(f.observed);
  });
  it("uses ties-to-even Float32 conversion and a separate authored-coordinate error bound", () => {
    const result = nativeExpectedShapeLandmarkV2(
      [1 + 2 ** -24, 0, 0, 1 + 3 * 2 ** -24, 0, 0],
      { id: "tip", vertexIndices: [0, 1] },
      IDENTITY_MATRIX,
    );
    expect(Math.fround(1 + 2 ** -24)).toBe(1);
    expect(Math.fround(1 + 3 * 2 ** -24)).toBe(1 + 2 ** -22);
    expect(
      Math.abs(result.world[0] - result.analyticWorld[0]),
    ).toBeLessThanOrEqual(result.quantizationBound[0]);
  });
});
