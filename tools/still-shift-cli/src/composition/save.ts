import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import {
  PassageError,
  passageDiagnostics,
} from "../../../../packages/renderer-core/src/passage-diagnostics.ts";
import { authoredFontDiagnostics } from "@still-shift/motion";
import {
  AnimationEngineError,
  validateComposition,
  type Composition,
  type CompositionDiagnostic,
} from "@still-shift/scene-contract";
import type { IncomingMessage, ServerResponse } from "node:http";
import { native3DEditDiagnostics } from "../../../../packages/scene-contract/src/composition/native3d-edit.ts";

export class CompositionSaveError extends PassageError {
  readonly status: number;
  readonly code: string;
  constructor(
    status: number,
    code: string,
    message: string,
    diagnostics?: CompositionDiagnostic[],
  ) {
    super(
      diagnostics ?? [{ code, severity: "error", message, path: "document" }],
    );
    this.name = "CompositionSaveError";
    this.message = message;
    this.status = status;
    this.code = code;
  }
}
export function sendCompositionEditError(
  response: ServerResponse,
  error: unknown,
  fallbackPath = "document",
) {
  if (response.headersSent || response.destroyed) return;
  response.statusCode =
    error instanceof CompositionSaveError ? error.status : 500;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(
    JSON.stringify({
      diagnostics: passageDiagnostics(error).map((d) => ({
        ...d,
        path: d.path ?? fallbackPath,
      })),
    }),
  );
}
export function sourceHash(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}
export async function readEditRequest(
  request: IncomingMessage,
): Promise<unknown> {
  const host = request.headers.host ?? "",
    origin = request.headers.origin;
  if (request.method !== "POST")
    throw new CompositionSaveError(405, "comp-edit-method", "Use POST");
  if (
    !/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host) ||
    request.headers["x-still-shift-composition"] !== "1" ||
    (origin && origin !== `http://${host}`)
  )
    throw new CompositionSaveError(
      403,
      "comp-edit-origin",
      "Composition edits require the local preview origin",
    );
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    length += bytes.length;
    if (length > 20 * 1024 * 1024)
      throw new CompositionSaveError(
        413,
        "comp-edit-size",
        "Edit exceeds 20 MiB",
      );
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new CompositionSaveError(400, "comp-edit-json", "Invalid edit JSON");
  }
}
export function editableDocument(
  value: unknown,
  base: Composition,
): Composition {
  const result = validateComposition(value);
  if (!result.ok)
    throw new CompositionSaveError(
      422,
      "comp-edit-validation",
      result.diagnostics
        .map((d) => `${d.code} ${d.path}: ${d.message}`)
        .join("\n"),
      result.diagnostics,
    );
  if (
    JSON.stringify((value as Composition).assets) !==
    JSON.stringify(base.assets)
  )
    throw new CompositionSaveError(
      422,
      "comp-edit-assets",
      "An inspector edit cannot change source asset bindings",
    );
  const fonts = authoredFontDiagnostics(result.composition);
  const native = native3DEditDiagnostics(base, result.composition);
  if (native.length)
    throw new CompositionSaveError(
      422,
      "comp-native3d-topology",
      native
        .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
        .join("\n"),
      native,
    );
  if (fonts.length)
    throw new CompositionSaveError(
      422,
      "comp-edit-font",
      fonts.map((d) => `${d.code}: ${d.message}`).join("\n"),
      fonts,
    );
  return structuredClone(value) as Composition;
}
/** The caller supplies its fixed preview source; no request path is ever used. */
export async function saveCompositionDocument(
  input: string,
  base: Composition,
  expectedHash: string,
  value: unknown,
): Promise<{
  document: Composition;
  sourceSha256: string;
  unchanged: boolean;
}> {
  const document = editableDocument(value, base);
  input = await realpath(input);
  let release: () => Promise<void>;
  try {
    release = await acquireArtifactLock(
      join(dirname(input), `.${basename(input)}.composition-save.lock`),
      dirname(input),
    );
  } catch (error) {
    if (error instanceof AnimationEngineError && error.code === "RENDER_FAILED")
      throw new CompositionSaveError(
        409,
        "comp-edit-conflict",
        `Source save lock is unavailable: ${error.message}; retry after the other preview finishes`,
      );
    throw error;
  }
  try {
    const current = await readFile(input);
    if (sourceHash(current) !== expectedHash)
      throw new CompositionSaveError(
        409,
        "comp-edit-conflict",
        "The source changed on disk; reload before saving",
      );
    if (JSON.stringify(document) === JSON.stringify(base))
      return { document, sourceSha256: expectedHash, unchanged: true };
    const bytes = Buffer.from(JSON.stringify(document, null, 2) + "\n");
    const temporary = join(
      dirname(input),
      `.${basename(input)}.${randomUUID()}.tmp`,
    );
    try {
      const metadata = await stat(input);
      await writeFile(temporary, bytes, {
        flag: "wx",
        mode: metadata.mode & 0o777,
      });
      await chmod(temporary, metadata.mode & 0o777);
      if (sourceHash(await readFile(input)) !== expectedHash)
        throw new CompositionSaveError(
          409,
          "comp-edit-conflict",
          "The source changed while saving; reload before saving",
        );
      await rename(temporary, input);
    } finally {
      await rm(temporary, { force: true });
    }
    return { document, sourceSha256: sourceHash(bytes), unchanged: false };
  } finally {
    await release();
  }
}
