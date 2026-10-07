import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { CompositionSchema } from "@still-shift/scene-contract";
for (const name of [
  "affine",
  "perspective",
  "checker-perspective",
  "clipping",
  "content",
  "parents",
  "focus",
  "group-mask",
  "scopes",
  "exposure",
]) {
  it(`validates native camera scene ${name} and pinned resources`, () => {
    const file = resolve(`benchmarks/fixtures/composition/ce8/${name}.json`),
      doc = CompositionSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    expect(doc.frameCount).toBe(32);
    for (const asset of doc.assets) {
      const bytes = readFileSync(resolve(dirname(file), asset.path));
      expect(`sha256:${createHash("sha256").update(bytes).digest("hex")}`).toBe(
        asset.sha256,
      );
    }
  });
}
