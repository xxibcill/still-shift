import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import { resolve, relative, join, extname, dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Plugin } from "vite";
import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
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
const rendersRoot = "benchmarks/results/soundtrack-api";
const publishedRender =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const soundtrackApi = (
  workspace = resolve(import.meta.dirname, "../.."),
): Plugin => {
  /** Lab previews are grouped by the real path of the project they render. */
  const rendersFor = (project: string) =>
    resolve(
      workspace,
      rendersRoot,
      createHash("sha256").update(project).digest("hex").slice(0, 16),
    );
  const previewChanges = new Map<string, Promise<unknown>>();
  /** Publication, pruning and Lab edits form one ordered operation per project. */
  const withPreview = async <T>(project: string, change: () => Promise<T>) => {
    const previous = previewChanges.get(project) ?? Promise.resolve();
    const pending = previous
      .catch(() => {})
      .then(async () => {
        const directory = rendersFor(project);
        await mkdir(dirname(directory), { recursive: true });
        // Also protect the shared preview directory from another Lab process.
        const release = await acquireArtifactLock(
          directory + ".lock",
          directory,
        );
        try {
          return await change();
        } finally {
          await release();
        }
      });
    previewChanges.set(project, pending);
    try {
      return await pending;
    } finally {
      if (previewChanges.get(project) === pending)
        previewChanges.delete(project);
    }
  };
  /**
   * The preview endpoint serves only the current saved revision, so renders of
   * earlier revisions are dead weight. Only published renders are removed;
   * in-progress stages and locks belong to their render.
   */
  const pruneRenders = async (project: string, keep?: string) => {
    const directory = rendersFor(project);
    const names = await readdir(directory).catch(() => [] as string[]);
    await Promise.all(
      names
        .filter((name) => publishedRender.test(name) && name !== keep)
        .map((name) =>
          rm(join(directory, name), { recursive: true, force: true }),
        ),
    );
  };
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
            const actual = await file(output).catch(async (error: unknown) => {
                const requested = resolve(workspace, output);
                if (
                  requested.startsWith(resolve(workspace, rendersRoot) + "/") &&
                  !(await lstat(requested).then(
                    () => true,
                    () => false,
                  ))
                )
                  throw new SoundtrackError(
                    "revision-conflict",
                    "This preview was superseded; render the saved revision",
                  );
                throw error;
              }),
              allowed = await file(rendersRoot);
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
            const saved = await withPreview(path, async () => {
              const saved = await saveSoundtrackEdits(
                path,
                body.revision,
                body.operations,
              );
              await pruneRenders(path);
              return saved;
            });
            response.end(JSON.stringify({ project: saved }));
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
          const rendered = await withPreview(path, async () => {
            const id = randomUUID(),
              output = join(rendersFor(path), id);
            const manifest = await renderSoundtrackProject(path, output, {
              stems: true,
              expectedRevision: body.revision,
              signal: controller.signal,
            });
            await pruneRenders(path, id);
            return { manifest, output: relative(workspace, output) };
          });
          response.end(JSON.stringify(rendered));
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
