import { describe, expect, it, vi } from "vitest";
import { SfxGenerationRequestSchema } from "../../packages/scene-contract/src/sfx-generation.ts";
import { requestElevenLabsSfx } from "../../packages/animation-engine/src/elevenlabs-sfx.ts";

const request = {
  provider: "elevenlabs",
  id: "wood-tap",
  prompt: "A single soft wooden tap, no music",
  durationSeconds: 1,
};

describe("optional ElevenLabs SFX", () => {
  it("validates settings before making a paid request", async () => {
    const fetcher = vi.fn();
    expect(
      SfxGenerationRequestSchema.safeParse({ ...request, durationSeconds: 31 })
        .success,
    ).toBe(false);
    expect(
      SfxGenerationRequestSchema.safeParse({ ...request, id: "../escape" })
        .success,
    ).toBe(false);
    await expect(
      requestElevenLabsSfx(
        { ...request, durationSeconds: 0.1 },
        { apiKey: "secret", fetch: fetcher },
      ),
    ).rejects.toThrow("Invalid SFX request");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires server credentials before calling the provider", async () => {
    const fetcher = vi.fn();
    await expect(
      requestElevenLabsSfx(request, { apiKey: "", fetch: fetcher }),
    ).rejects.toThrow("ELEVENLABS_API_KEY");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends explicit v2 settings and receives binary audio", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    const result = await requestElevenLabsSfx(
      { ...request, loop: true, promptInfluence: 0.7 },
      { apiKey: "secret", fetch: fetcher },
    );
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
    );
    expect(init.headers["xi-api-key"]).toBe("secret");
    expect(JSON.parse(init.body)).toEqual({
      text: request.prompt,
      model_id: "eleven_text_to_sound_v2",
      duration_seconds: 1,
      prompt_influence: 0.7,
      loop: true,
    });
    expect([...result]).toEqual([1, 2, 3]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([401, 429, 500])(
    "does not retry or expose provider response bodies (%s)",
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(
          new Response("private-provider-message secret", { status }),
        );
      const error = await requestElevenLabsSfx(request, {
        apiKey: "secret",
        fetch: fetcher,
      }).catch((error: Error) => error);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain("secret");
      expect(String(error)).not.toContain("private-provider-message");
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("bounds audio downloads and rejects empty responses", async () => {
    for (const response of [
      new Response(new Uint8Array()),
      new Response("x", { headers: { "content-length": "20000000" } }),
    ]) {
      await expect(
        requestElevenLabsSfx(request, {
          apiKey: "secret",
          fetch: vi.fn().mockResolvedValue(response),
        }),
      ).rejects.toThrow("audio");
    }
  });
  it("does not retry ambiguous network failures or expose transport details", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("transport secret"));
    await expect(
      requestElevenLabsSfx(request, { apiKey: "secret", fetch: fetcher }),
    ).rejects.toThrow("not retried");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("bounds streaming responses even without a content-length", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(new Uint8Array(10 * 1024 * 1024 + 1)));
    await expect(
      requestElevenLabsSfx(request, { apiKey: "secret", fetch: fetcher }),
    ).rejects.toThrow("10 MB");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
