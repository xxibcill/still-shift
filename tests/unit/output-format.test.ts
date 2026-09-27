import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMMERCE_PROFILES,
  CommerceSceneSchema,
  CinematicSceneSchema,
  formatSize,
  OUTPUT_FORMATS,
  OutputFormatSchema,
  PreparedAnimationResultSchema,
  PreparedSceneSchema,
  StorySceneSchema,
} from "@still-shift/scene-contract";

const fixture = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

const sceneFixtures = [
  {
    schema: PreparedSceneSchema,
    path: "benchmarks/fixtures/history-offstage-v2/access-pressure.json",
  },
  {
    schema: StorySceneSchema,
    path: "benchmarks/fixtures/story-motion/unequal-margins.json",
  },
  {
    schema: CinematicSceneSchema,
    path: "benchmarks/fixtures/cinematic-illustrated/ci-04-rising-vista.json",
  },
] as const;

describe("output format contract", () => {
  it("shares exact landscape and vertical sizes with the commerce portrait alias", () => {
    expect(OutputFormatSchema.options).toEqual(["landscape", "vertical"]);
    expect(formatSize("landscape")).toEqual({ width: 1920, height: 1080 });
    expect(formatSize("vertical")).toEqual({ width: 1080, height: 1920 });
    expect(COMMERCE_PROFILES.landscape).toBe(OUTPUT_FORMATS.landscape);
    expect(COMMERCE_PROFILES.portrait).toBe(OUTPUT_FORMATS.vertical);
    expect(COMMERCE_PROFILES.square).toEqual({ width: 1080, height: 1080 });
    expect(COMMERCE_PROFILES.feed).toEqual({ width: 1080, height: 1350 });
  });

  it.each(sceneFixtures)(
    "preserves the parsed landscape shape and validates $path",
    ({ schema, path }) => {
      const input = fixture(path);
      const landscape = schema.parse(input);
      expect(landscape).not.toHaveProperty("format");
      expect(landscape.width).toBe(1920);
      expect(landscape.height).toBe(1080);

      const vertical = schema.parse({
        ...input,
        format: "vertical",
        width: 1080,
        height: 1920,
      });
      expect(vertical.format).toBe("vertical");

      expect(
        schema.safeParse({ ...input, width: 1080, height: 1920 }).success,
      ).toBe(false);
      expect(schema.safeParse({ ...input, format: "vertical" }).success).toBe(
        false,
      );
      expect(
        schema.safeParse({
          ...input,
          format: "vertical",
          width: 1920,
          height: 1920,
        }).success,
      ).toBe(false);
    },
  );

  it("keeps portrait commerce fixtures valid without adding a format field", () => {
    const portrait = CommerceSceneSchema.parse(
      fixture("benchmarks/fixtures/ecommerce-motion/h01-portrait.json"),
    );
    expect(portrait.metadata.profile).toBe("portrait");
    expect([portrait.width, portrait.height]).toEqual([1080, 1920]);
    expect(portrait).not.toHaveProperty("format");
  });

  it("validates illustrated result dimensions using the same optional format", () => {
    const hash = `sha256:${"a".repeat(64)}`;
    const result = {
      schemaVersion: "illustrated-result-1",
      status: "rendered",
      preset: "access_pressure",
      fps: 24,
      durationMs: 7000,
      frameCount: 168,
      outputPath: "out.mp4",
      sceneManifestPath: "out.scene.json",
      checksums: { source: hash, scene: hash, output: hash },
      metrics: {
        frameCount: 168,
        durationMs: 7000,
        width: 1920,
        height: 1080,
        totalWallMs: 1,
      },
    };
    expect(
      PreparedAnimationResultSchema.parse(result).metrics,
    ).not.toHaveProperty("format");
    expect(
      PreparedAnimationResultSchema.safeParse({
        ...result,
        metrics: {
          ...result.metrics,
          format: "vertical",
          width: 1080,
          height: 1920,
        },
      }).success,
    ).toBe(true);
    expect(
      PreparedAnimationResultSchema.safeParse({
        ...result,
        metrics: { ...result.metrics, format: "vertical" },
      }).success,
    ).toBe(false);
  });
});
