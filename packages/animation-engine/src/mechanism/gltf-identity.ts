import { createHash } from "node:crypto";
import { canonicalMechanismJson } from "../../../renderer-core/src/mechanism/canonical.ts";
export const gltfJsonHash = (value: unknown) =>
  `sha256:${createHash("sha256").update(canonicalMechanismJson(value)).digest("hex")}`;
export function freezeGltfAsset<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeGltfAsset(child);
    Object.freeze(value);
  }
  return value;
}
