import { createReadStream } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import type {
  CompositionSurfaceStore,
  CompositionSurfaceIdentity,
} from "./composition-surface-store.ts";

async function readIdentity(
  request: IncomingMessage,
): Promise<CompositionSurfaceIdentity> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8192)
      throw Error("Composition surface claim exceeds its byte limit");
    chunks.push(Buffer.from(chunk));
  }
  const identity: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!identity || typeof identity !== "object" || Array.isArray(identity))
    throw Error("Composition surface claim must be an identity object");
  return identity as CompositionSurfaceIdentity;
}

/** Local, export-owned rendezvous; credentials bind every request to its assigned worker. */
export class CompositionSurfaceBroker {
  private readonly credentials: readonly string[];
  constructor(
    private readonly store: CompositionSurfaceStore,
    credentials: readonly string[],
    private readonly onFailure: (error: unknown) => void,
  ) {
    if (
      !credentials.length ||
      credentials.length > 4 ||
      new Set(credentials).size !== credentials.length ||
      credentials.some((credential) => !/^[a-f0-9-]{36}$/.test(credential))
    )
      throw Error("Composition surface worker credentials are invalid");
    this.credentials = [...credentials];
  }

  async respond(
    route: string,
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    const rawWorker = request.headers["x-composition-cache-worker"];
    const worker =
      typeof rawWorker === "string" && /^(0|[1-3])$/.test(rawWorker)
        ? Number(rawWorker)
        : -1;
    if (
      request.method !== "POST" ||
      worker < 0 ||
      worker >= this.credentials.length ||
      request.headers["x-composition-cache-credential"] !==
        this.credentials[worker]
    ) {
      response.statusCode = 403;
      response.end("Unknown composition surface worker");
      return;
    }
    try {
      if (route === "claim") {
        const claim = await this.store.claim(
          worker,
          await readIdentity(request),
        );
        if (claim.kind === "hit") {
          response.setHeader("Content-Type", "application/octet-stream");
          response.setHeader("Content-Length", claim.file.byteLength);
          response.setHeader(
            "x-composition-cache-checksum",
            claim.file.checksum,
          );
          await pipeline(
            createReadStream(claim.file.path, { highWaterMark: 65536 }),
            response,
          );
        } else {
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify(claim));
        }
        return;
      }
      if (route !== "publish") throw Error("Unknown composition surface route");
      const token = request.headers["x-composition-cache-token"];
      const checksum = request.headers["x-composition-cache-checksum"];
      if (typeof token !== "string" || typeof checksum !== "string")
        throw Error("Composition surface publication headers are missing");
      await this.store.publish(worker, token, request, checksum);
      response.end("stored");
    } catch (error) {
      this.onFailure(error);
      if (!response.headersSent) {
        response.statusCode = 500;
        response.end(error instanceof Error ? error.message : String(error));
      } else response.destroy(error instanceof Error ? error : undefined);
    }
  }
}
