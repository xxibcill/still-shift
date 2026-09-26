import type { CommerceScene } from "../../../packages/scene-contract/src/commerce.ts";
import type { BundleFile } from "./commerce-download.ts";

function base64(bytes: Uint8Array) {
  let result = "";
  for (let start = 0; start < bytes.length; start += 8192)
    result += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(result);
}

export function postCommerceExport(scene: CommerceScene, files: BundleFile[]) {
  const dependencies = [...scene.assets, ...scene.fonts].map((asset) => {
    const file = files.find((file) => file.name === asset.path);
    if (!file) throw new Error("Missing export asset: " + asset.path);
    return { id: asset.id, base64: base64(file.bytes) };
  });
  return fetch("/commerce/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Still-Shift": "commerce",
    },
    body: JSON.stringify({ scene, files: dependencies }),
  });
}
