import { z } from "zod";

const text = z.string().trim().min(1);
const formatId = z.string().regex(/^[HPBOSC]\d{2}$/);
const format = z
  .object({
    id: formatId,
    name: text,
    group: text,
    goal: text,
    asset: text,
    single: z.boolean(),
    difficulty: text,
    duration: text,
    look: text,
    motion: z.string().regex(/^T\d{2}$/),
    hook: text,
    body: text,
    close: text,
    care: text,
    keywords: text,
    refs: z.array(z.string().regex(/^R\d{2}$/)),
    basis: text,
    reference_scope: text,
  })
  .strict();
const technique = z
  .object({
    id: z.string().regex(/^T\d{2}$/),
    name: text,
    demo: text,
    description: text,
    mechanics: text,
    caution: text,
  })
  .strict();
const reference = z
  .object({
    id: z.string().regex(/^R\d{2}$/),
    title: text,
    publisher: text,
    type: text,
    url: z.url(),
    study: text,
    related: text,
    verification: text,
    checked: text,
    rights: text,
  })
  .strict();
const recipe = z
  .object({
    id: z.string().regex(/^A\d{2}$/),
    name: text,
    formats: text,
    duration: text,
    hook: text,
    body: text,
    close: text,
    assets: text,
    test: text,
    basis: text,
  })
  .strict();

export const CommerceCatalogSchema = z
  .object({
    title: text,
    version: z.literal("1.0"),
    checked: text,
    formats: z.array(format),
    techniques: z.array(technique),
    references: z.array(reference),
    recipes: z.array(recipe),
  })
  .strict()
  .superRefine((catalog, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const ids = (rows: { id: string }[], name: string) => {
      const values = new Set(rows.map((row) => row.id));
      if (values.size !== rows.length) fail("Duplicate " + name + " ID");
      return values;
    };
    const formats = ids(catalog.formats, "format");
    const techniques = ids(catalog.techniques, "technique");
    const references = ids(catalog.references, "reference");
    ids(catalog.recipes, "recipe");
    for (const item of catalog.formats) {
      if (!techniques.has(item.motion)) fail("Missing technique on " + item.id);
      for (const ref of item.refs)
        if (!references.has(ref))
          fail("Missing reference " + ref + " on " + item.id);
    }
    for (const item of catalog.recipes)
      for (const id of item.formats.split(/\s*\+\s*/))
        if (!formats.has(id)) fail("Missing recipe format " + id);
  });
export type CommerceCatalog = z.infer<typeof CommerceCatalogSchema>;
export const CommercePresetSchema = z.enum(["H03", "H01", "H04", "A01"]);
export const CommerceProfileSchema = z.enum([
  "landscape",
  "portrait",
  "square",
  "feed",
]);
export const CommerceSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("format"), id: formatId }).strict(),
  z
    .object({ kind: z.literal("recipe"), id: z.string().regex(/^A\d{2}$/) })
    .strict(),
]);
export type CommerceSelection = z.infer<typeof CommerceSelectionSchema>;
const capability = z
  .object({
    id: text,
    implementation: CommercePresetSchema.nullable(),
    requirements: z.array(text).min(1),
    profiles: z.array(CommerceProfileSchema),
    durationSeconds: z.tuple([z.number().positive(), z.number().positive()]),
  })
  .strict();
export const CommerceCapabilitiesSchema = z
  .object({
    catalogVersion: z.literal("1.0"),
    defaultStage: z.literal("experimental"),
    productionFormats: z.array(
      z
        .object({
          id: text,
          version: text,
          name: text,
          selection: CommerceSelectionSchema,
          artDirection: z.literal("floating"),
          profile: z.literal("feed"),
          fixture: text,
          requirements: z.array(text).min(1),
          invariants: z.array(text).min(1),
        })
        .strict(),
    ),
    formats: z.array(capability),
    recipes: z.array(capability),
  })
  .strict();
export type CommerceCapabilities = z.infer<typeof CommerceCapabilitiesSchema>;

export function validateCommerceCapabilities(
  catalog: CommerceCatalog,
  capabilities: CommerceCapabilities,
): string[] {
  const errors: string[] = [];
  for (const kind of ["formats", "recipes"] as const) {
    const expected = new Set(catalog[kind].map((item) => item.id));
    const seen = new Set<string>();
    for (const item of capabilities[kind]) {
      if (!expected.has(item.id) || seen.has(item.id))
        errors.push("Unknown or duplicate capability " + item.id);
      seen.add(item.id);
      if (item.implementation && item.implementation !== item.id)
        errors.push("Capability cannot substitute another format: " + item.id);
      if (Boolean(item.implementation) !== Boolean(item.profiles.length))
        errors.push(
          "Only implemented formats declare output profiles: " + item.id,
        );
      if (item.durationSeconds[0] > item.durationSeconds[1])
        errors.push("Invalid duration range on " + item.id);
    }
    for (const id of expected)
      if (!seen.has(id)) errors.push("Missing capability " + id);
  }
  const registrations = new Set<string>();
  const scopes = new Set<string>();
  for (const registration of capabilities.productionFormats) {
    const scope = [
      registration.selection.kind,
      registration.selection.id,
      registration.artDirection,
      registration.profile,
    ].join(":");
    const rows =
      registration.selection.kind === "format"
        ? capabilities.formats
        : capabilities.recipes;
    const implementation = rows.find(
      (row) => row.id === registration.selection.id,
    );
    if (registrations.has(registration.id) || scopes.has(scope))
      errors.push("Duplicate production registration " + registration.id);
    if (
      !implementation?.implementation ||
      !implementation.profiles.includes(registration.profile)
    )
      errors.push(
        "Production registration requires implemented profile support: " +
          registration.id,
      );
    registrations.add(registration.id);
    scopes.add(scope);
  }
  return errors;
}
