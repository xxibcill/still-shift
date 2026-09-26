import { format } from "prettier";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";
import { imageSize } from "image-size";
import {
  COMPONENT_DEMOS,
  defaultComponentDemo,
} from "../packages/scene-contract/src/commerce-components.ts";
import { buildCommerceComponentDemo } from "../packages/renderer-core/src/commerce-component-demos.ts";
import { prepareCommerceShadow } from "../packages/animation-engine/src/commerce-shadow.ts";
import { DEFAULT_SHADOW_TEXTURE } from "../packages/renderer-core/src/shadow-texture.ts";
const root = resolve("benchmarks/fixtures/ecommerce-motion/atoms");
const writeJson = async (name: string, value: unknown) =>
  writeFile(
    resolve(root, name),
    await format(JSON.stringify(value), { parser: "json", printWidth: 80 }),
  );
await mkdir(resolve(root, "assets"), { recursive: true });
const checksum = (bytes: Uint8Array) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
const productPath = resolve(
  "assets/ecommerce-motion/beauty-floating-product-v1.png",
);
const fontPath = resolve("assets/ecommerce-motion/fonts/noto-sans-thai.ttf");
const [productBytes, fontBytes] = await Promise.all([
  readFile(productPath),
  readFile(fontPath),
]);
const size = imageSize(productBytes);
const shadow = await prepareCommerceShadow(DEFAULT_SHADOW_TEXTURE);
await writeFile(resolve(root, shadow.asset.path), shadow.bytes);
await writeJson("shadow-preparation.json", shadow.preparation);
const assets = {
  product: {
    id: "product-image",
    path: relative(root, productPath),
    sha256: checksum(productBytes),
    width: size.width,
    height: size.height,
  },
  font: {
    id: "commerce-font",
    path: relative(root, fontPath),
    sha256: checksum(fontBytes),
    weight: "400" as const,
  },
  shadow: shadow.asset,
};
for (const demo of COMPONENT_DEMOS) {
  const options = defaultComponentDemo(demo.id);
  await writeJson(demo.id + ".demo.json", options);
  await writeJson(
    demo.id + ".json",
    buildCommerceComponentDemo(options, assets),
  );
}
await writeJson("catalog.json", COMPONENT_DEMOS);
console.log(
  `Prepared ${COMPONENT_DEMOS.length} Experimental component examples.`,
);
