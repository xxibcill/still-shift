import { describe, expect, it } from "vitest";
import { AnimationEngineError } from "@still-shift/scene-contract";
import {
  applyMechanismFamilyPatch,
  createMechanismFamilyAuthoring,
  inspectMechanismFamilyAuthoring,
  MechanismFamilyPatchSchema,
} from "../../packages/animation-engine/src/mechanism/family-authoring.ts";
import { mechanismPackHash } from "../../packages/animation-engine/src/mechanism/pack-support.ts";
const request = (
  current: ReturnType<typeof createMechanismFamilyAuthoring>,
  operations: unknown[],
) => ({
  schemaVersion: "mechanism-family-patch-1",
  baseRevision: current.document.revision,
  baseHash: current.projectHash,
  operations,
});
describe("revision-aware family authoring", () => {
  it("pins every actual family instance and immutable pack revision", () => {
    for (const family of ["tape-hook", "cable-tie", "clothespeg"] as const) {
      const current = createMechanismFamilyAuthoring(family, "demo");
      expect(current.document.pack).toEqual(current.instance.pack);
      expect(current.projectHash).toBe(mechanismPackHash(current.document));
      expect(
        inspectMechanismFamilyAuthoring(
          JSON.parse(JSON.stringify(current.document)),
        ).instance.sourceSha256,
      ).toBe(current.instance.sourceSha256);
      expect(Object.isFrozen(current.document.input)).toBe(true);
    }
  });
  it("regenerates dimensions across every family while preserving stable identity and the original document", () => {
    for (const [family, id, value] of [
      ["tape-hook", "hookThickness", 0.24],
      ["cable-tie", "pitch", 0.6],
      ["clothespeg", "armLength", 7],
    ] as const) {
      const current = createMechanismFamilyAuthoring(family, "demo"),
        before = JSON.stringify(current.document);
      const result = applyMechanismFamilyPatch(
        current.document,
        request(current, [{ property: "parameter", id, value }]),
      );
      expect(result.document.revision).toBe(1);
      expect(result.document.id).toBe("demo");
      expect(result.document.pack).toEqual(current.document.pack);
      expect(result.sourceSha256).not.toBe(current.instance.sourceSha256);
      expect(result.changedPaths).toEqual([`input.parameters.${id}`]);
      expect(result.cacheEffects.geometry).toBe("regenerate");
      expect(JSON.stringify(current.document)).toBe(before);
    }
  });
  it("preserves mesh buffers for mounted or material edits while invalidating dependent plates", () => {
    const current = createMechanismFamilyAuthoring("tape-hook", "mounted");
    const result = applyMechanismFamilyPatch(
      current.document,
      request(current, [
        { property: "mount", value: { position: [2, 1, 3] } },
        {
          property: "style",
          value: { steelColor: "#8899aa", steelRoughness: 0.7 },
        },
      ]),
    );
    const next = inspectMechanismFamilyAuthoring(result.document);
    expect(next.instance.meshDataSha256).toBe(current.instance.meshDataSha256);
    expect(next.instance.sourceSha256).not.toBe(current.instance.sourceSha256);
    expect(result.cacheEffects.nativePlates).toBe("invalidate-dependent-clips");
  });
  it("rejects stale revision and stale hash independently", () => {
    const current = createMechanismFamilyAuthoring("tape-hook", "demo");
    for (const change of [
      { baseRevision: 1 },
      { baseHash: `sha256:${"1".repeat(64)}` },
    ]) {
      try {
        applyMechanismFamilyPatch(current.document, {
          ...request(current, [
            { property: "parameter", id: "bladeLength", value: 12 },
          ]),
          ...change,
        });
        throw new Error("Unexpected acceptance");
      } catch (error) {
        expect(error).toBeInstanceOf(AnimationEngineError);
        expect((error as AnimationEngineError).context?.diagnosticCode).toBe(
          "mechanism-stale-revision",
        );
      }
    }
  });
  it("rejects unknown targets, duplicate writers, out-of-range dimensions and wrong-family style fields atomically", () => {
    const current = createMechanismFamilyAuthoring("tape-hook", "demo"),
      before = JSON.stringify(current.document);
    for (const ops of [
      [{ property: "parameter", id: "gearCount", value: 4 }],
      [
        { property: "parameter", id: "bladeLength", value: 12 },
        { property: "parameter", id: "bladeLength", value: 14 },
      ],
      [
        { property: "parameter", id: "bladeLength", value: 12 },
        { property: "parameter", id: "hookThickness", value: 99 },
      ],
      [{ property: "style", value: { color: "#ffffff" } }],
    ]) {
      expect(() =>
        applyMechanismFamilyPatch(current.document, request(current, ops)),
      ).toThrow();
      expect(JSON.stringify(current.document)).toBe(before);
    }
  });
  it("rejects both unsupported authoring versions and changed immutable pack references", () => {
    const current = createMechanismFamilyAuthoring("clothespeg", "demo");
    expect(() =>
      inspectMechanismFamilyAuthoring({
        ...current.document,
        schemaVersion: "mechanism-family-authoring-99",
      }),
    ).toThrow("Unsupported");
    expect(() =>
      inspectMechanismFamilyAuthoring({
        ...current.document,
        pack: { ...current.document.pack, version: "2.0.0" },
      }),
    ).toThrow();
    expect(() =>
      applyMechanismFamilyPatch(current.document, {
        ...request(current, []),
        schemaVersion: "mechanism-family-patch-99",
      }),
    ).toThrow("Unsupported");
    expect(() =>
      inspectMechanismFamilyAuthoring({
        ...current.document,
        input: {
          ...current.document.input,
          expectedPack: { ...current.document.pack, variant: "other" },
        },
      }),
    ).toThrow("disagree");
  });
  it("enforces original patch byte/operation limits and rejects revision overflow", () => {
    const current = createMechanismFamilyAuthoring("tape-hook", "demo");
    expect(
      MechanismFamilyPatchSchema.safeParse(
        request(
          current,
          Array.from({ length: 33 }, () => ({ property: "mount", value: {} })),
        ),
      ).success,
    ).toBe(false);
    const oversized = request(
      current,
      Array.from({ length: 32 }, () => ({
        property: "style",
        value: Object.fromEntries(
          Array.from({ length: 5 }, (_, i) => [
            `${i}${"k".repeat(127)}`,
            "v".repeat(64),
          ]),
        ),
      })),
    );
    expect(Buffer.byteLength(JSON.stringify(oversized))).toBeGreaterThan(16384);
    expect(MechanismFamilyPatchSchema.safeParse(oversized).success).toBe(false);
    const exhausted = inspectMechanismFamilyAuthoring({
      ...current.document,
      revision: 2147483647,
    });
    expect(() =>
      applyMechanismFamilyPatch(
        exhausted.document,
        request(exhausted, [
          { property: "parameter", id: "bladeLength", value: 12 },
        ]),
      ),
    ).toThrow();
  });
});
