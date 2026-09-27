import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveCatalogFormatVariant,
  writeResolvedInput,
} from "../../tools/still-shift-cli/src/format-variant.ts";

describe("prepared format variants", () => {
  it("selects catalog-declared portrait scenes", async () => {
    for (const [source, variant] of [
      [
        "history-offstage-v2/chronicle-reveal.json",
        "history-offstage-v2/vertical/chronicle-reveal.json",
      ],
      [
        "cinematic-illustrated/ci-04-rising-vista.json",
        "cinematic-illustrated/vertical/ci-vertical-rising-vista.json",
      ],
      [
        "ecommerce-motion/h01-landscape.json",
        "ecommerce-motion/vertical/h01-portrait.json",
      ],
    ]) {
      const selected = await resolveCatalogFormatVariant(
        `benchmarks/fixtures/${source}`,
        "vertical",
      );
      expect(selected).toContain(`benchmarks/fixtures/${variant}`);
    }
  });

  it("reuses identical resolved input after a failed export", async () => {
    const directory = await mkdtemp(join(tmpdir(), "format-variant-"));
    try {
      const output = join(directory, "clip.mp4");
      const input = { format: "vertical", width: 1080, height: 1920 };
      const first = await writeResolvedInput(output, input);
      expect(await writeResolvedInput(output, input)).toBe(first);
      expect(JSON.parse(await readFile(first, "utf8"))).toEqual(input);
      await expect(
        writeResolvedInput(output, { ...input, height: 1080 }),
      ).rejects.toMatchObject({ code: "SCENE_INVALID" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
