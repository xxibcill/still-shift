import { readFile, realpath } from "node:fs/promises";
import { resolve, relative, extname, dirname } from "node:path";
import type { Plugin } from "vite";

import { prepareStoryPassageInput } from "../../packages/animation-engine/src/story-passage-io.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";

const root = resolve(import.meta.dirname, "../..");
async function workspaceFile(path: string) {
  const actual = await realpath(resolve(root, path));
  const rel = relative(await realpath(root), actual);
  if (rel === ".." || rel.startsWith("../") || rel.startsWith("/"))
    throw new Error("Passage files must be inside this workspace");
  return actual;
}
function packet(
  passage: Awaited<ReturnType<typeof prepareStoryPassageInput>>,
  file: string,
) {
  for (const beat of passage.plan.beats)
    beat.template = resolve(dirname(file), beat.template);
  const templates = Object.fromEntries(
    [...passage.templates].map(([key, value]) => [
      resolve(dirname(file), key),
      value,
    ]),
  );
  return { plan: passage.plan, templates, diagnostics: passage.diagnostics };
}
export const passageApi = (): Plugin => ({
  name: "still-shift-passage-authoring",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (!url.pathname.startsWith("/passage-api/")) return next();
      try {
        if (
          request.method === "POST" &&
          url.pathname === "/passage-api/prepare"
        ) {
          let body = "";
          for await (const chunk of request) {
            body += String(chunk);
            if (body.length > 2_000_000)
              throw new Error("Passage plan exceeds the import limit");
          }
          const input = JSON.parse(body) as {
            plan: unknown;
            basePath?: string;
          };
          const file = resolve(root, input.basePath ?? "imported-plan.json");
          await workspaceFile(dirname(file));
          const passage = await prepareStoryPassageInput(
            input.plan,
            file,
            undefined,
            workspaceFile,
          );
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify(packet(passage, file)));
          return;
        }
        if (request.method !== "GET")
          throw new Error("Unknown passage endpoint");
        const file = await workspaceFile(
          url.searchParams.get("path") ??
            "benchmarks/fixtures/story-authoring/linked-comparison.json",
        );
        if (url.pathname === "/passage-api/asset") {
          const types: Record<string, string> = {
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".otf": "font/otf",
            ".ttf": "font/ttf",
            ".wav": "audio/wav",
            ".mp3": "audio/mpeg",
          };
          const type = types[extname(file)];
          if (!type) throw new Error("Unsupported passage asset");
          response.setHeader("Content-Type", type);
          response.end(await readFile(file));
          return;
        }
        if (url.pathname !== "/passage-api/load" || extname(file) !== ".json")
          throw new Error("Unknown passage endpoint");
        const input: unknown = JSON.parse(await readFile(file, "utf8"));
        const passage = await prepareStoryPassageInput(
          input,
          file,
          undefined,
          workspaceFile,
        );
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(packet(passage, file)));
      } catch (error) {
        response.statusCode = 400;
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({ diagnostics: passageDiagnostics(error) }),
        );
      }
    });
  },
});
