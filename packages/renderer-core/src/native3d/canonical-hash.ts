import { canonicalMechanismJson } from "../mechanism/canonical.ts";

/** IO preparation only. Pure frame evaluation never performs crypto work. */
export async function hashNativeData(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalMechanismJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
