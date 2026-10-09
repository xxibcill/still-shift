import { afterEach, expect, it, vi } from "vitest";
import { compositionSurfaceExchange } from "../../packages/execution-runtime/src/composition-surface-client.ts";

const identity = {
  path: "source:glyph-tint:test",
  key: "sha256:" + "a".repeat(64),
  width: 2,
  height: 2,
  encoding: "rgba8-straight" as const,
};
afterEach(() => vi.unstubAllGlobals());
it("accepts typed capacity responses only after requesting an optional claim", async () => {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ kind: "uncached", reason: "capacity" }), {
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const exchange = compositionSurfaceExchange({
    worker: 0,
    credential: "test",
  });
  await expect(
    exchange.claim({ ...identity, fallback: "uncached" }),
  ).resolves.toEqual({ kind: "uncached", reason: "capacity" });
  await expect(exchange.claim(identity)).rejects.toThrow("invalid lease");
});
it.each(["unknown", null])(
  "rejects malformed capacity reason %s",
  async (reason) => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ kind: "uncached", reason }), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    await expect(
      compositionSurfaceExchange({ worker: 0, credential: "test" }).claim({
        ...identity,
        fallback: "uncached",
      }),
    ).rejects.toThrow("invalid lease");
  },
);
