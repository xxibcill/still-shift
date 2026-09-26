import {
  createShadowTexture,
  SHADOW_GENERATOR_VERSION,
  type ShadowTextureSettings,
} from "../../renderer-core/src/shadow-texture.ts";

/** Preparation runs once per visual change; playback consumes only the saved PNG. */
export async function prepareCommerceShadow(
  settings: ShadowTextureSettings,
  path = "assets/product-shadow.png",
) {
  const bytes = createShadowTexture(settings);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes).buffer,
  );
  const sha256 =
    "sha256:" +
    [...new Uint8Array(digest)]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
  return {
    asset: {
      id: "product-shadow-image",
      path,
      sha256,
      width: settings.width,
      height: settings.height,
    },
    bytes,
    preparation: { generator: SHADOW_GENERATOR_VERSION, ...settings },
  };
}
