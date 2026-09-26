import { describe, expect, it } from "vitest";
import source from "../../catalogs/ecommerce-motion/source/v1.0/library_data.json" with { type: "json" };
import {
  CommerceCatalogSchema,
  validateCommerceCapabilities,
} from "../../packages/scene-contract/src/commerce-catalog.ts";
import {
  commerceCatalog,
  commerceCapabilities,
  requireCommerceCapability,
} from "../../packages/scene-contract/src/commerce-library.ts";

describe("commerce catalog import", () => {
  it("preserves all source records and linked IDs", () => {
    expect(commerceCatalog.formats).toHaveLength(40);
    expect(commerceCatalog.techniques).toHaveLength(12);
    expect(commerceCatalog.recipes).toHaveLength(8);
    expect(commerceCatalog.references).toHaveLength(16);
    expect(commerceCatalog.formats.filter((f) => f.single)).toHaveLength(26);
    expect(
      validateCommerceCapabilities(commerceCatalog, commerceCapabilities),
    ).toEqual([]);
  });

  it("rejects duplicate identifiers and broken reference links", () => {
    const duplicate = structuredClone(source);
    duplicate.formats[1]!.id = duplicate.formats[0]!.id;
    expect(CommerceCatalogSchema.safeParse(duplicate).success).toBe(false);
    const broken = structuredClone(source);
    broken.formats[0]!.refs.push("R99");
    expect(CommerceCatalogSchema.safeParse(broken).success).toBe(false);
    const recipe = structuredClone(source);
    recipe.recipes[0]!.formats = "H01 + H99";
    expect(CommerceCatalogSchema.safeParse(recipe).success).toBe(false);
  });

  it("requires explicit coverage and never infers turntable support from orbit graphics", () => {
    const incomplete = structuredClone(commerceCapabilities);
    incomplete.formats.pop();
    expect(
      validateCommerceCapabilities(commerceCatalog, incomplete),
    ).not.toEqual([]);
    expect(() =>
      requireCommerceCapability({ kind: "format", id: "P08" }),
    ).toThrow(/reference only/i);
    expect(() =>
      requireCommerceCapability({ kind: "recipe", id: "A08" }),
    ).toThrow(/reference only/i);
    expect(
      requireCommerceCapability({ kind: "format", id: "H03" }).implementation,
    ).toBe("H03");
    expect(
      requireCommerceCapability({ kind: "recipe", id: "A01" }).implementation,
    ).toBe("A01");
  });
});
