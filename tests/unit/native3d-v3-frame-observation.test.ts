import { describe, it, expect } from "vitest";
import {
  NativeObservedPbrTextureSchema,
  NativeObservedPbrMeshSchema,
  NativeObservedFrameSchema,
  NativeObservedFrameV2Schema,
  NATIVE3D_OBSERVATION_LIMITS,
} from "@still-shift/scene-contract";
import * as browser from "../../packages/renderer-core/src/native3d/browser.ts";
import * as pure from "../../packages/renderer-core/src/native3d/index.ts";
import { IDENTITY_MATRIX } from "../../packages/renderer-core/src/mechanism/matrix.ts";
const digest = "sha256:" + "a".repeat(64);
const texture = {
  image: "image",
  pixelSha256: digest,
  colorSpace: "srgb",
  samples: 20,
  maxError: 0,
  reference: "native-pbr-current-environment-mips-1",
  levels: [
    {
      level: 0,
      width: 2,
      height: 2,
      storage: "srgb8-alpha8",
      texels: 4,
      samples: 16,
      maxError: 0,
    },
    {
      level: 1,
      width: 1,
      height: 1,
      storage: "srgb8-alpha8",
      texels: 1,
      samples: 4,
      maxError: 0,
    },
  ],
};
describe("explicit rigid PBR observation protocol", () => {
  it("exposes the queued source3 owner and pure independent validator beside original APIs", () => {
    expect(browser.createNativeThreeQueuedFrameObservationV3).toBeTypeOf(
      "function",
    );
    expect(browser.createNativeThreeQueuedFrameObservationV2).toBeTypeOf(
      "function",
    );
    expect(pure.assertNativeObservedFrameV3).toBeTypeOf("function");
  });
  it("admits contiguous full-channel mip receipts and rejects skipped levels and altered storage", () => {
    expect(NativeObservedPbrTextureSchema.safeParse(texture).success).toBe(
      true,
    );
    for (const mutate of [
      (value: typeof texture) => {
        value.levels[1]!.level = 2;
      },
      (value: typeof texture) => {
        value.levels[1]!.storage = "rgba8";
      },
      (value: typeof texture) => {
        value.levels[0]!.samples = 15;
      },
      (value: typeof texture) => {
        value.samples = 19;
      },
      (value: typeof texture) => {
        value.levels[1]!.width = 2;
      },
    ]) {
      const changed = structuredClone(texture);
      mutate(changed);
      expect(NativeObservedPbrTextureSchema.safeParse(changed).success).toBe(
        false,
      );
    }
  });
  it("keeps the existing transfer profile and rejects receipts above it", () => {
    const changed = structuredClone(texture);
    changed.maxError = 0.00010001;
    changed.levels[0]!.maxError = changed.maxError;
    expect(NativeObservedPbrTextureSchema.safeParse(changed).success).toBe(
      false,
    );
  });
  it("allows a verified missing-draw reason without inventing GPU submissions", () => {
    const value = {
      status: "not-drawn",
      part: "part",
      ownerWorldMatrix: IDENTITY_MATRIX,
      reason: "authored-hidden",
    };
    expect(NativeObservedPbrMeshSchema.safeParse(value).success).toBe(true);
    expect(
      NativeObservedPbrMeshSchema.safeParse({ ...value, submissions: [] })
        .success,
    ).toBe(false);
    expect(
      NativeObservedPbrMeshSchema.safeParse({
        ...value,
        reason: "material-disabled",
      }).success,
    ).toBe(false);
  });
  it("preserves strict original protocols and packet/pass bounds", () => {
    expect(
      NativeObservedFrameSchema.safeParse({
        version: "native3d-observed-frame-3",
      }).success,
    ).toBe(false);
    expect(
      NativeObservedFrameV2Schema.safeParse({
        version: "native3d-observed-frame-3",
      }).success,
    ).toBe(false);
    expect(NATIVE3D_OBSERVATION_LIMITS.packetBytes).toBe(1_048_576);
    expect(NATIVE3D_OBSERVATION_LIMITS.passes).toBe(64);
  });
});
