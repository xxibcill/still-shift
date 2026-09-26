import source from "../../../catalogs/ecommerce-motion/source/v1.0/library_data.json" with { type: "json" };
import capabilities from "../../../catalogs/ecommerce-motion/capabilities.json" with { type: "json" };
import {
  CommerceCatalogSchema,
  CommerceCapabilitiesSchema,
  validateCommerceCapabilities,
  type CommerceSelection,
} from "./commerce-catalog.ts";

export const commerceCatalog = CommerceCatalogSchema.parse(source);
export const commerceCapabilities =
  CommerceCapabilitiesSchema.parse(capabilities);
const issues = validateCommerceCapabilities(
  commerceCatalog,
  commerceCapabilities,
);
if (issues.length) throw new Error(issues.join("; "));

export function requireCommerceCapability(selection: CommerceSelection) {
  const records =
    selection.kind === "format"
      ? commerceCapabilities.formats
      : commerceCapabilities.recipes;
  const capability = records.find((entry) => entry.id === selection.id);
  if (!capability)
    throw new Error("Unknown commerce selection: " + selection.id);
  if (!capability.implementation)
    throw new Error(
      selection.id + " is reference only; rendering is not implemented.",
    );
  return capability;
}
