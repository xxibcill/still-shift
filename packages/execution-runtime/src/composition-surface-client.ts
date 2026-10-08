import { frameUploadBody } from "./composition-frame-capture.ts";
import type {
  CompositionSurfaceExchange,
  CompositionSurfaceClaim,
} from "@still-shift/renderer-core";
import { readRenderResponsePixels } from "@still-shift/renderer-core";

/** Binary bodies are awaited during preparation; graph execution stays synchronous. */
export function compositionSurfaceExchange(options: {
  worker: number;
  credential: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): CompositionSurfaceExchange {
  const headers = {
    "x-composition-cache-worker": String(options.worker),
    "x-composition-cache-credential": options.credential,
  };
  const endpoint = options.baseUrl ?? "/_export/surface";
  async function request(
    route: string,
    body: string | Uint8Array<ArrayBuffer>,
    extra: Record<string, string> = {},
  ) {
    const response = await fetch(`${endpoint}/${route}`, {
      method: "POST",
      headers: { ...headers, ...extra },
      body: typeof body === "string" ? body : await frameUploadBody(body),
      signal: options.signal ?? null,
    });
    if (!response.ok)
      throw Error(
        `Composition surface ${route} failed: ${await response.text()}`,
      );
    return response;
  }
  return {
    async claim(identity) {
      const response = await request("claim", JSON.stringify(identity), {
        "Content-Type": "application/json",
      });
      if (response.headers.get("Content-Type") === "application/octet-stream") {
        const checksum = response.headers.get("x-composition-cache-checksum");
        if (!checksum)
          throw Error("Composition surface response has no checksum");
        const expected =
          identity.width *
          identity.height *
          (identity.encoding === "rgba32f-premultiplied" ? 16 : 4);
        if (response.headers.get("Content-Length") !== String(expected))
          throw Error(
            "Composition surface response storage exceeds its contract",
          );
        const bytes = new Uint8Array(
          await readRenderResponsePixels(response, expected),
        );
        return { kind: "hit", bytes, checksum };
      }
      const claim = (await response.json()) as CompositionSurfaceClaim;
      if (claim.kind !== "lease" && claim.kind !== "uncached")
        throw Error("Composition surface response has an invalid lease");
      return claim;
    },
    async publish(token, pixels, checksum) {
      await request("publish", pixels.bytes, {
        "x-composition-cache-token": token,
        "x-composition-cache-checksum": checksum,
      });
    },
  };
}
