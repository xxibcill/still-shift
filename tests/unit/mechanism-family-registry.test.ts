import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  inspectMechanismFamilyRegistry,
  mechanismFamilySchemas,
  MECHANISM_FAMILY_REGISTRY_VERSION,
} from "../../packages/animation-engine/src/mechanism/family-registry.ts";
import {
  createTapeHookPack,
  TapeHookPackInputSchema,
} from "../../packages/animation-engine/src/mechanism/tape-hook-pack.ts";
import {
  createCableTiePack,
  CableTiePackInputSchema,
} from "../../packages/animation-engine/src/mechanism/cable-tie-pack.ts";
import {
  createClothespegPack,
  ClothespegPackInputSchema,
} from "../../packages/animation-engine/src/mechanism/clothespeg-pack.ts";
import { mechanismPackHash } from "../../packages/animation-engine/src/mechanism/pack-support.ts";

describe("mechanism family registry", () => {
  it("discovers all three candidates without promoting their support status", () => {
    const registry = inspectMechanismFamilyRegistry();
    expect(registry.entries.map((entry) => entry.id)).toEqual([
      "tape-hook",
      "cable-tie",
      "clothespeg",
    ]);
    expect(
      registry.entries.every((entry) => entry.status === "candidate"),
    ).toBe(true);
    expect(Object.isFrozen(registry.entries[0]!.metadata.pack)).toBe(true);
  });
  it("binds every schema and default example to the actual immutable generator metadata", () => {
    for (const entry of inspectMechanismFamilyRegistry().entries) {
      const schema =
        mechanismFamilySchemas[
          entry.parameterSchema as keyof typeof mechanismFamilySchemas
        ];
      expect(mechanismPackHash(z.toJSONSchema(schema))).toBe(
        entry.parameterSchemaSha256,
      );
      const parameterDocument = z.toJSONSchema(schema);
      expect(Object.keys(parameterDocument.properties ?? {}).sort()).toEqual(
        entry.parameters.map((p) => p.id).sort(),
      );
      for (const parameter of entry.parameters) {
        const field = parameterDocument.properties![parameter.id]!;
        expect(field).toMatchObject({
          minimum: parameter.minimum,
          maximum: parameter.maximum,
          default: parameter.default,
        });
      }
      expect(mechanismPackHash(entry.metadata.pack)).toBe(
        entry.reference.sha256,
      );
    }
  });
  it("runs every documented minimal example through its actual family generator", () => {
    for (const entry of inspectMechanismFamilyRegistry().entries) {
      const input = entry.examples[0]!.input;
      const instance =
        entry.id === "tape-hook"
          ? createTapeHookPack(TapeHookPackInputSchema.parse(input))
          : entry.id === "cable-tie"
            ? createCableTiePack(CableTiePackInputSchema.parse(input))
            : createClothespegPack(ClothespegPackInputSchema.parse(input));
      expect(instance.pack).toEqual(entry.reference);
      expect(mechanismPackHash(instance.scene)).toBe(instance.sourceSha256);
    }
  });
  it("selects only the named family and keeps every metadata receipt within its established allowance", () => {
    for (const family of ["tape-hook", "cable-tie", "clothespeg"] as const) {
      const registry = inspectMechanismFamilyRegistry({
        schemaVersion: MECHANISM_FAMILY_REGISTRY_VERSION,
        family,
      });
      expect(registry.entries).toHaveLength(1);
      const entry = registry.entries[0]!;
      expect(
        Buffer.byteLength(JSON.stringify(entry.metadata)),
      ).toBeLessThanOrEqual(32768);
      expect(JSON.stringify(entry.metadata)).not.toContain('"positions"');
      expect(entry.controls.map((c) => c.id)).toEqual(
        entry.metadata.pack.rigs.map((r) => r.id),
      );
    }
  });
  it("rejects unknown family, protocol version and selector properties with located diagnostics", () => {
    for (const [input, path] of [
      [{ schemaVersion: "mechanism-family-registry-9" }, "schemaVersion"],
      [
        { schemaVersion: MECHANISM_FAMILY_REGISTRY_VERSION, family: "gear" },
        "family",
      ],
    ] as const) {
      try {
        inspectMechanismFamilyRegistry(input);
        throw new Error("Unexpected acceptance");
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
        expect((error as z.ZodError).issues[0]!.path).toContain(path);
      }
    }
    expect(() =>
      inspectMechanismFamilyRegistry({
        schemaVersion: MECHANISM_FAMILY_REGISTRY_VERSION,
        meshBuffers: true,
      }),
    ).toThrow();
  });
  it("exposes strict input schemas that enforce existing revisions and parameter bounds", () => {
    for (const entry of inspectMechanismFamilyRegistry().entries) {
      const schema =
        mechanismFamilySchemas[
          entry.inputSchema as keyof typeof mechanismFamilySchemas
        ];
      expect(schema.safeParse({ unknown: true }).success).toBe(false);
      const parameter = entry.parameters[0]!;
      expect(
        schema.safeParse({
          parameters: { [parameter.id]: parameter.maximum + 1 },
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          expectedPack: { ...entry.reference, version: "99" },
        }).success,
      ).toBe(false);
    }
  });
});
