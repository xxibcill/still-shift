import { resolve } from "node:path";

import { defineConfig } from "vite";

import { labApi } from "./lab-api.ts";

const root = resolve(import.meta.dirname, "../..");

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [labApi()],
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    fs: { allow: [root] },
  },
});
