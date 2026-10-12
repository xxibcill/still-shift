import { createHash } from "node:crypto";
import type {
  Composition,
  CompositionPreparedNative3DVersions,
} from "@still-shift/scene-contract";
import { canonicalMechanismJson } from "../../renderer-core/src/mechanism/canonical.ts";
export const nativeObservationIdentitySha256 = (value: unknown) =>
  `sha256:${createHash("sha256").update(canonicalMechanismJson(value)).digest("hex")}`;

/** Only declared file locators are omitted; authored recipe and metadata stay bound. */
export function nativeCompositionSha256(composition: Composition): string {
  return nativeObservationIdentitySha256({
    ...composition,
    assets: composition.assets.map((asset) =>
      Object.fromEntries(
        Object.entries(asset).filter(
          ([key]) => key !== "path" && key !== "manifestPath",
        ),
      ),
    ),
  });
}
export function nativePreparedSha256(
  transport: CompositionPreparedNative3DVersions,
): string {
  return nativeObservationIdentitySha256(transport);
}
