import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".pnpm-store/**",
      "apps/**/dist/**",
      ".venv/**",
      "benchmarks/gallery/**",
      "benchmarks/results/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: [
      "packages/renderer-core/src/composition/evaluate/**/*.ts",
      "packages/renderer-core/src/composition/render/{graph,backend,version}.ts",
      "packages/renderer-core/src/{curve,node-transform,motion-sampling,passage-diagnostics,motion-easing}.ts",
    ],
    rules: {
      "no-restricted-globals": [
        "error",
        "window",
        "document",
        "CanvasRenderingContext2D",
        "HTMLCanvasElement",
        "OffscreenCanvas",
        "ImageData",
        "requestAnimationFrame",
        "performance",
        "Date",
      ],
      "no-restricted-imports": [
        "error",
        { patterns: ["node:*", "playwright", "vite", "three"] },
      ],
    },
  },
  {
    files: ["packages/renderer-core/src/composition/evaluate/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["node:*", "playwright", "vite", "three"] },
            {
              group: [
                "../../*",
                "!../../curve.ts",
                "!../../node-transform.ts",
                "!../../motion-sampling.ts",
                "!../../passage-diagnostics.ts",
                "!../../motion-easing.ts",
              ],
              message:
                "Composition evaluation may only import pure renderer helpers.",
            },
          ],
        },
      ],
    },
  },
);
