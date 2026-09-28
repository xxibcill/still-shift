import { lstat, mkdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { generateSfx } from "../../packages/animation-engine/src/sfx-generation.ts";
import {
  parseSfxRequest,
  requireSfxApiKey,
  SFX_MODEL,
  SfxGenerationError,
  type SfxProviderOptions,
} from "../../packages/animation-engine/src/elevenlabs-sfx.ts";
import { readJsonBody } from "./json-body.ts";

type SfxApiOptions = { root?: string; provider?: SfxProviderOptions };

export const passageSfxApi = (options: SfxApiOptions = {}): Plugin => ({
  name: "still-shift-passage-sfx",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (
        url.pathname !== "/passage-api/sfx" &&
        url.pathname !== "/passage-api/sfx/config"
      )
        return next();
      response.setHeader("Content-Type", "application/json");
      response.setHeader("Cache-Control", "no-store");
      const provider = options.provider ?? {};
      try {
        if (
          request.method === "GET" &&
          url.pathname === "/passage-api/sfx/config"
        ) {
          response.end(
            JSON.stringify({
              provider: "elevenlabs",
              model: SFX_MODEL,
              configured: Boolean(
                (provider.apiKey ?? process.env.ELEVENLABS_API_KEY)?.trim(),
              ),
            }),
          );
          return;
        }
        if (request.method !== "POST" || url.pathname !== "/passage-api/sfx")
          throw new SfxGenerationError("Unsupported SFX endpoint", 405);
        if (request.headers.origin !== `http://${request.headers.host}`)
          throw new SfxGenerationError(
            "SFX generation requires a same-origin request.",
            403,
          );
        if (
          request.headers["content-type"]?.split(";")[0]?.trim() !==
          "application/json"
        )
          throw new SfxGenerationError("SFX generation requires JSON.", 415);
        const body: unknown = await readJsonBody(request, {
          maxBytes: 16_000,
          limitMessage: "SFX request is too large",
        });
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw new SfxGenerationError("Invalid SFX request");
        const { requestId, ...input } = body as Record<string, unknown>;
        if (
          typeof requestId !== "string" ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
            requestId,
          )
        )
          throw new SfxGenerationError("Invalid SFX request ID");
        const settings = parseSfxRequest(input);
        requireSfxApiKey(provider);
        const directory = await generatedAssetsDirectory(
          options.root ?? resolve(import.meta.dirname, "../.."),
        );
        const result = await generateSfx(settings, {
          ...provider,
          outputDir: join(directory, `${settings.id}-${requestId}`),
        });
        response.end(JSON.stringify(result));
      } catch (error) {
        response.statusCode =
          error instanceof SfxGenerationError ? error.status : 400;
        response.end(
          JSON.stringify({
            message:
              error instanceof SfxGenerationError
                ? error.message
                : "Could not read the SFX request or access the generated-assets directory.",
          }),
        );
      }
    });
  },
});

async function generatedAssetsDirectory(root: string): Promise<string> {
  let directory = await realpath(root);
  for (const segment of ["assets", "generated-sfx"]) {
    directory = join(directory, segment);
    await mkdir(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new SfxGenerationError(
        "Generated sound assets require ordinary workspace directories, without symlinks.",
      );
  }
  return directory;
}
