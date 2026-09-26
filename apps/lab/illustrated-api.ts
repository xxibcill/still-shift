import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const root = resolve(import.meta.dirname, "../..");
export const illustratedApi = (): Plugin => ({
  name: "still-shift-illustrated-assets",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (!/^\/(illustrated|cinematic|story)\//.test(url.pathname))
        return next();
      const match =
        /^\/(illustrated|cinematic|story)\/(scenes|assets)\/([a-z0-9-]+\.(json|png|svg|otf|ttf))$/.exec(
          url.pathname,
        );
      if (!match) {
        response.statusCode = 404;
        response.end("Unknown illustrated asset");
        return;
      }
      const directory =
        match[1] === "story"
          ? match[2] === "scenes"
            ? "benchmarks/fixtures/story-motion"
            : /\.(otf|ttf)$/.test(match[3]!)
              ? "assets/story-motion/fonts"
              : match[3]!.endsWith(".svg")
                ? "assets/story-motion/art"
                : "assets/history-offstage-v2"
          : match[1] === "cinematic"
            ? match[2] === "scenes"
              ? "benchmarks/fixtures/cinematic-illustrated"
              : match[3]!.startsWith("threshold-")
                ? "assets/cinematic-illustrated/kit-a-threshold"
                : match[3]!.startsWith("vista-")
                  ? "assets/cinematic-illustrated/kit-c-vista"
                  : match[3] === "landscape.png"
                    ? "assets/history-offstage-v2"
                    : "assets/cinematic-illustrated/kit-b-courtyard"
            : match[2] === "scenes"
              ? "benchmarks/fixtures/history-offstage-v2"
              : "assets/history-offstage-v2";
      try {
        const bytes = await readFile(resolve(root, directory, match[3]!));
        response.setHeader(
          "Content-Type",
          (
            {
              json: "application/json",
              png: "image/png",
              svg: "image/svg+xml",
              otf: "font/otf",
              ttf: "font/ttf",
            } as Record<string, string>
          )[match[4]!]!,
        );
        response.end(bytes);
      } catch {
        response.statusCode = 404;
        response.end("Illustrated asset not found");
      }
    });
  },
});
