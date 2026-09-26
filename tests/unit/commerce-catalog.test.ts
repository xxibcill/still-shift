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
  commerceFormatRegistration,
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

describe("commerce format release registration", () => {
  it("keeps every e-commerce motion format experimental", () => {
    expect(commerceCapabilities.productionFormats).toEqual([]);
    expect(
      commerceFormatRegistration(
        { kind: "recipe", id: "A01" },
        "floating",
        "feed",
      ),
    ).toEqual({ status: "experimental" });
    for (const direction of ["standard", "studio", "editorial"])
      expect(
        commerceFormatRegistration(
          { kind: "recipe", id: "A01" },
          direction,
          "feed",
        ),
      ).toEqual({ status: "experimental" });
    expect(
      commerceFormatRegistration(
        { kind: "recipe", id: "A01" },
        "floating",
        "portrait",
      ),
    ).toEqual({ status: "experimental" });
    for (const format of commerceCatalog.formats)
      expect(
        commerceFormatRegistration(
          { kind: "format", id: format.id },
          "floating",
          "feed",
        ),
      ).toEqual({ status: "experimental" });
  });
  it("rejects duplicate production scopes and unimplemented registrations", () => {
    const candidate = {
      id: "palm-up-product-float",
      version: "1.0",
      name: "Palm-up Product Float",
      selection: { kind: "recipe" as const, id: "A01" },
      artDirection: "floating" as const,
      profile: "feed" as const,
      fixture: "a01-beauty-feed",
      requirements: ["intact product cutout"],
      invariants: ["product stays intact"],
    };
    const duplicate = structuredClone(commerceCapabilities);
    duplicate.productionFormats.push(candidate, {
      ...candidate,
      id: "duplicate",
    });
    expect(
      validateCommerceCapabilities(commerceCatalog, duplicate).join(" "),
    ).toMatch(/Duplicate production/);
    const unsupported = structuredClone(commerceCapabilities);
    unsupported.productionFormats.push({
      ...candidate,
      selection: { kind: "format", id: "P08" },
    });
    expect(
      validateCommerceCapabilities(commerceCatalog, unsupported).join(" "),
    ).toMatch(/requires implemented/);
  });
});
