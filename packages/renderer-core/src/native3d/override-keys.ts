import {
  Native3DSourceOverridesSchema,
  Native3DSourceOverridesV2Schema,
} from "@still-shift/scene-contract";
import type { Native3DSourceOverrides } from "@still-shift/scene-contract";
import { canonicalMechanismJson } from "../mechanism/canonical.ts";

function normalizedOverridesKey(parsed: Native3DSourceOverrides): string {
  const normalized: Native3DSourceOverrides = {};
  for (const field of ["partOverrides", "materialOverrides"] as const) {
    const entries = Object.entries(parsed[field] ?? {})
      .filter(([, value]) => Object.keys(value).length > 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    if (entries.length)
      Object.assign(normalized, { [field]: Object.fromEntries(entries) });
  }
  return canonicalMechanismJson(normalized);
}
export function native3DOverridesKey(
  input: Native3DSourceOverrides = {},
): string {
  return normalizedOverridesKey(Native3DSourceOverridesSchema.parse(input));
}
export function native3DOverridesKeyV2(
  input: Native3DSourceOverrides = {},
): string {
  return normalizedOverridesKey(Native3DSourceOverridesV2Schema.parse(input));
}
