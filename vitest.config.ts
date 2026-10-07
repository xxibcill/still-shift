import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@still-shift/motion/node": new URL(
        "./packages/motion-builder/src/node.ts",
        import.meta.url,
      ).pathname,
      "@still-shift/motion": new URL(
        "./packages/motion-builder/src/index.ts",
        import.meta.url,
      ).pathname,
      "@still-shift/renderer-core/passage-compositions": new URL(
        "./packages/renderer-core/src/passage-compositions.ts",
        import.meta.url,
      ).pathname,
      "@still-shift/renderer-core/soundtrack": new URL(
        "./packages/renderer-core/src/soundtrack-edits.ts",
        import.meta.url,
      ).pathname,
      "@still-shift/renderer-core": new URL(
        "./packages/renderer-core/src/index.ts",
        import.meta.url,
      ).pathname,
      "@still-shift/animation-engine": new URL(
        "./packages/animation-engine/src/index.ts",
        import.meta.url,
      ).pathname,
      "@still-shift/scene-contract": new URL(
        "./packages/scene-contract/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    benchmark: {
      include: ["benchmarks/**/*.bench.ts"],
    },
    coverage: {
      reporter: ["text", "json-summary"],
    },
  },
});
