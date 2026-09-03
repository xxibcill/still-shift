import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
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
    coverage: {
      reporter: ["text", "json-summary"],
    },
  },
});
