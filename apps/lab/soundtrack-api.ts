import { readFile, realpath } from "node:fs/promises";
import { resolve, relative, join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Plugin } from "vite";
import { z } from "zod";
import { SoundtrackError } from "../../packages/scene-contract/src/soundtrack-project.ts";
import {
  readSoundtrackProject,
  saveSoundtrackEdits,
  soundtrackChecksum,
} from "../../packages/animation-engine/src/soundtrack-project-io.ts";
import {
  renderSoundtrackProject,
  readSoundtrackRender,
} from "../../packages/animation-engine/src/soundtrack-render.ts";
import { readJsonBody } from "./json-body.ts";
import {
  resolveSoundtrackAnchors,
  validateSoundtrackNarration,
} from "../../packages/renderer-core/src/soundtrack-edits.ts";
import { readStoryPassage } from "../../packages/animation-engine/src/story-passage-io.ts";
const requestSchema = z
  .object({
    project: z.string(),
    revision: z.number().int().nonnegative(),
    operations: z.unknown().optional(),
    passage: z.string().optional(),
  })
  .strict();
export const soundtrackApi = (
  workspace = resolve(import.meta.dirname, "../.."),
): Plugin => {
  const file = async (path: string) => {
    const actual = await realpath(resolve(workspace, path));
    const rel = relative(await realpath(workspace), actual);
    if (rel.startsWith("../") || rel === ".." || rel.startsWith("/"))
      throw new Error("Soundtrack files must be inside this workspace");
    return actual;
  };
  return {
    name: "still-shift-soundtrack",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/soundtrack-api/")) return next();
        response.setHeader("Content-Type", "application/json");
        response.setHeader("Cache-Control", "no-store");
        try {
          if (
            request.method === "GET" &&
            url.pathname === "/soundtrack-api/project"
          ) {
            const path = await file(
              url.searchParams.get("path") ??
                "benchmarks/fixtures/composition/ce16/project.json",
            );
            if (extname(path) !== ".json")
              throw new Error("Select a project JSON file");
            response.end(
              JSON.stringify({ project: await readSoundtrackProject(path) }),
            );
            return;
          }
          if (
            request.method === "GET" &&
            url.pathname === "/soundtrack-api/audio"
          ) {
            const project = await readSoundtrackProject(
              await file(url.searchParams.get("project") ?? ""),
            );
            const output = url.searchParams.get("output") ?? "";
            const actual = await file(output),
              allowed = await file("benchmarks/results/soundtrack-api");
            if (!actual.startsWith(allowed + "/"))
              throw new Error("Unknown soundtrack render");
            const manifest = await readSoundtrackRender(actual);
            const snapshot = await readSoundtrackProject(
              join(actual, "project.json"),
            );
            if (JSON.stringify(project) !== JSON.stringify(snapshot))
              throw new SoundtrackError(
                "revision-conflict",
                "Preview belongs to a different saved project; render this revision",
              );
            if (manifest.revision !== project.revision)
              throw new SoundtrackError(
                "revision-conflict",
                "Render this saved revision before previewing",
              );
            const selected =
              manifest.files[url.searchParams.get("track") ?? "master"];
            if (!selected) throw new Error("Unknown rendered stem");
            const path = await file(join(actual, "audio", selected.file));
            if ((await soundtrackChecksum(path)) !== selected.sha256)
              throw new Error("Rendered audio checksum differs");
            response.setHeader("Content-Type", "audio/wav");
            response.end(await readFile(path));
            return;
          }
          if (
            request.method !== "POST" ||
            !["/soundtrack-api/edit", "/soundtrack-api/render"].includes(
              url.pathname,
            )
          )
            throw new Error("Unknown soundtrack endpoint");
          const host = request.headers.host ?? "";
          if (
            !/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host) ||
            request.headers.origin !== "http://" + host
          )
            throw new Error(
              "Soundtrack writes require a same-origin loopback request",
            );
          if (!request.headers["content-type"]?.startsWith("application/json"))
            throw new Error("Use application/json");
          const body = requestSchema.parse(
            await readJsonBody(request, {
              maxBytes: 1_000_000,
              limitMessage: "Edit request exceeds 1 MB",
            }),
          );
          const path = await file(body.project);
          if (url.pathname.endsWith("/edit")) {
            if (body.operations === undefined)
              throw new Error("Missing operations");
            response.end(
              JSON.stringify({
                project: await saveSoundtrackEdits(
                  path,
                  body.revision,
                  body.operations,
                ),
              }),
            );
            return;
          }
          if (body.operations !== undefined)
            throw new Error("Render accepts only saved edits");
          const project = await readSoundtrackProject(path);
          if (body.passage) {
            const passage = await readStoryPassage(await file(body.passage));
            resolveSoundtrackAnchors(project, {
              ...passage,
              fps: passage.plan.fps,
            });
            validateSoundtrackNarration(project, {
              fps: passage.plan.fps,
              sourceStartFrame: passage.plan.sourceStartFrame,
              endFrameExclusive: passage.endFrameExclusive,
              ...(passage.plan.narration
                ? { sha256: passage.plan.narration.sha256 }
                : {}),
            });
          }
          const controller = new AbortController();
          response.once("close", () => {
            if (!response.writableFinished)
              controller.abort(new Error("Preview request disconnected"));
          });
          const output = resolve(
            workspace,
            "benchmarks/results/soundtrack-api",
            randomUUID(),
          );
          const manifest = await renderSoundtrackProject(path, output, {
            stems: true,
            expectedRevision: body.revision,
            signal: controller.signal,
          });
          response.end(
            JSON.stringify({ manifest, output: relative(workspace, output) }),
          );
        } catch (error) {
          const e =
            error instanceof SoundtrackError
              ? error
              : new SoundtrackError(
                  "soundtrack-api",
                  error instanceof Error ? error.message : String(error),
                );
          response.statusCode = e.code === "revision-conflict" ? 409 : 400;
          response.end(
            JSON.stringify({
              error: { code: e.code, message: e.message, context: e.context },
            }),
          );
        }
      });
    },
  };
};
