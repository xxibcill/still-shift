import { createReadStream } from "node:fs";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";
import { z } from "zod";
import { CommerceSceneSchema } from "../../packages/scene-contract/src/commerce.ts";
import { PreparedAnimationEngine } from "../../packages/animation-engine/src/prepared-animation-engine.ts";

const root = resolve(import.meta.dirname, "../..");
const MAX_COMMERCE_PAYLOAD_BYTES = 64_000_000;
const payloadSchema = z
  .object({
    scene: CommerceSceneSchema,
    files: z
      .array(
        z
          .object({ id: z.string(), base64: z.string().max(28_000_000) })
          .strict(),
      )
      .min(2)
      .max(14),
  })
  .strict();
async function readPayload(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_COMMERCE_PAYLOAD_BYTES)
      throw new Error("Upload exceeds 64 MB");
    chunks.push(Buffer.from(chunk));
  }
  return payloadSchema.parse(
    JSON.parse(Buffer.concat(chunks).toString("utf8")),
  );
}
export const commerceApi = (): Plugin => {
  let exporting = false;
  return {
    name: "still-shift-commerce",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/commerce/")) return next();
        if (url.pathname === "/commerce/export") {
          if (request.method !== "POST") {
            response.statusCode = 405;
            response.end("POST required");
            return;
          }
          const origin = request.headers.origin;
          if (
            !request.headers.host ||
            (origin && origin !== "http://" + request.headers.host) ||
            request.headers["x-still-shift"] !== "commerce" ||
            !request.headers["content-type"]?.startsWith("application/json")
          ) {
            response.statusCode = 403;
            response.end("Same-origin commerce requests required");
            return;
          }
          if (exporting) {
            response.statusCode = 409;
            response.end("An export is already running");
            return;
          }
          exporting = true;
          let directory: string | undefined;
          try {
            const payload = await readPayload(request);
            const dependencies = [
              ...payload.scene.assets,
              ...payload.scene.fonts,
            ];
            const files = new Map(
              payload.files.map((file) => [file.id, file.base64]),
            );
            if (
              files.size !== dependencies.length ||
              files.size !== payload.files.length ||
              dependencies.some((asset) => !files.has(asset.id))
            )
              throw new Error(
                "Export requires exactly the scene's image and font files",
              );
            directory = await mkdtemp(join(tmpdir(), "still-shift-commerce-"));
            for (const asset of dependencies) {
              const extension = extname(asset.path).toLowerCase();
              if (
                ![".png", ".jpg", ".jpeg", ".webp", ".ttf", ".otf"].includes(
                  extension,
                )
              )
                throw new Error("Unsupported commerce asset extension");
              asset.path = asset.id + extension;
              await writeFile(
                join(directory, asset.path),
                Buffer.from(files.get(asset.id)!, "base64"),
                { flag: "wx" },
              );
            }
            const scenePath = join(directory, "scene.json"),
              outputPath = join(directory, "commerce.mp4");
            await writeFile(scenePath, JSON.stringify(payload.scene));
            await new PreparedAnimationEngine().animate({
              scenePath,
              outputPath,
            });
            response.setHeader("Content-Type", "video/mp4");
            response.setHeader(
              "Content-Disposition",
              'attachment; filename="commerce.mp4"',
            );
            await pipeline(createReadStream(outputPath), response);
          } catch (error) {
            if (response.headersSent) response.destroy();
            else {
              response.statusCode = 422;
              response.setHeader("Content-Type", "application/json");
              response.end(
                JSON.stringify({
                  error: error instanceof Error ? error.message : String(error),
                }),
              );
            }
          } finally {
            if (directory)
              await rm(directory, { recursive: true, force: true });
            exporting = false;
          }
          return;
        }
        if (request.method !== "GET") {
          response.statusCode = 405;
          response.end();
          return;
        }
        const asset =
          /^\/commerce\/assets\/(sample-one\.png|sample-two\.png|beauty-editorial-v1\.png|beauty-cutout-v1\.png|beauty-floating-palm-v1\.png|beauty-floating-product-v1\.png|noto-sans-thai\.ttf|OFL\.txt)$/.exec(
            url.pathname,
          );
        const fixture =
          /^\/commerce\/scenes\/((?:(?:h03|h01|h04|a01)-beauty-feed|(?:h03|h01|h04|a01)-(?:landscape|portrait|square|thai|feed))(?:\.brief)?\.json)$/.exec(
            url.pathname,
          );
        const component =
          /^\/commerce\/components\/((?:product|background|shadow|panel|text|path|float|translate|fade|studio|introduction|callout)(?:\.demo)?\.json|catalog\.json|shadow-preparation\.json|assets\/product-shadow\.png)$/.exec(
            url.pathname,
          );
        const file = component
          ? resolve(
              root,
              "benchmarks/fixtures/ecommerce-motion/atoms",
              component[1]!,
            )
          : asset
            ? resolve(
                root,
                "assets/ecommerce-motion",
                ["noto-sans-thai.ttf", "OFL.txt"].includes(asset[1]!)
                  ? "fonts/" + asset[1]
                  : asset[1]!,
              )
            : fixture
              ? resolve(
                  root,
                  "benchmarks/fixtures/ecommerce-motion",
                  fixture[1]!,
                )
              : undefined;
        if (!file) {
          response.statusCode = 404;
          response.end("Commerce asset not found");
          return;
        }
        try {
          response.setHeader(
            "Content-Type",
            file.endsWith(".json")
              ? "application/json"
              : file.endsWith(".ttf")
                ? "font/ttf"
                : file.endsWith(".txt")
                  ? "text/plain"
                  : "image/png",
          );
          response.end(await readFile(file));
        } catch {
          response.statusCode = 404;
          response.end("Commerce asset not found");
        }
      });
    },
  };
};
