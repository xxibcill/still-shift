import { commerceApi } from "./commerce-api.ts";
import { resolve } from "node:path";

import { defineConfig } from "vite";

import { labApi } from "./lab-api.ts";
import { illustratedApi } from "./illustrated-api.ts";
import { passageApi } from "./passage-api.ts";

const root = resolve(import.meta.dirname, "../..");

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [commerceApi(), passageApi(), illustratedApi(), labApi()],
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    fs: { allow: [root] },
  },
});
