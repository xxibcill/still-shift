import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { CommerceSceneSchema } from "../../packages/scene-contract/src/commerce.ts";
import { buildCommerceScene } from "../../packages/renderer-core/src/commerce-scene.ts";
const directory = resolve("benchmarks/fixtures/ecommerce-motion");
describe("component extraction preserves saved commerce scenes", () => {
  for (const filename of readdirSync(directory).filter((name) =>
    name.endsWith(".brief.json"),
  )) {
    it(filename, () => {
      const briefBytes = readFileSync(resolve(directory, filename));
      const brief = JSON.parse(briefBytes.toString("utf8"));
      const original = CommerceSceneSchema.parse(
        JSON.parse(
          readFileSync(
            resolve(directory, filename.replace(".brief", "")),
            "utf8",
          ),
        ),
      );
      const rebuilt = buildCommerceScene(brief, {
        product: original.assets[0]!,
        font: original.fonts[0]!,
        ...(original.assets[1] ? { backdrop: original.assets[1] } : {}),
      });
      const { briefChecksum, ...metadata } = original.metadata;
      if (briefChecksum)
        expect(briefChecksum).toBe(
          `sha256:${createHash("sha256").update(briefBytes).digest("hex")}`,
        );
      expect(rebuilt).toEqual({ ...original, metadata });
    });
  }
});
