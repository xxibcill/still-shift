import {
  SfxGenerationRequestSchema,
  type SfxGenerationRequest,
} from "../../scene-contract/src/sfx-generation.ts";

const ENDPOINT =
  "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128";
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const SFX_MODEL = "eleven_text_to_sound_v2";

export class SfxGenerationError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "SfxGenerationError";
  }
}

export type SfxProviderOptions = {
  apiKey?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
};

export function parseSfxRequest(input: unknown): SfxGenerationRequest {
  const parsed = SfxGenerationRequestSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new SfxGenerationError(`Invalid SFX request: ${details}`);
  }
  return parsed.data;
}

export function requireSfxApiKey(options: SfxProviderOptions): string {
  const key = (options.apiKey ?? process.env.ELEVENLABS_API_KEY)?.trim();
  if (!key)
    throw new SfxGenerationError(
      "Set ELEVENLABS_API_KEY on the Still Shift server before generating sound effects.",
      503,
    );
  return key;
}

export async function requestElevenLabsSfx(
  input: unknown,
  options: SfxProviderOptions = {},
): Promise<Uint8Array> {
  const request = parseSfxRequest(input);
  const apiKey = requireSfxApiKey(options);
  const timeout = AbortSignal.timeout(120_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  try {
    const response = await (options.fetch ?? fetch)(ENDPOINT, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: request.prompt,
        model_id: SFX_MODEL,
        duration_seconds: request.durationSeconds,
        prompt_influence: request.promptInfluence,
        loop: request.loop,
      }),
      signal,
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw providerFailure(response.status);
    }
    return await readAudio(response);
  } catch (error) {
    if (error instanceof SfxGenerationError) throw error;
    throw new SfxGenerationError(
      "ElevenLabs request failed or timed out. It was not retried; check your account before starting another paid generation.",
      502,
    );
  }
}

function providerFailure(status: number): SfxGenerationError {
  if (status === 401 || status === 403)
    return new SfxGenerationError(
      "ElevenLabs rejected the server API key or its Sound Effects permission.",
      502,
    );
  if (status === 429)
    return new SfxGenerationError(
      "ElevenLabs quota or rate limit reached. No automatic retry was made.",
      429,
    );
  return new SfxGenerationError(
    `ElevenLabs returned HTTP ${status}. No automatic retry was made.`,
    502,
  );
}

async function readAudio(response: Response): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > MAX_AUDIO_BYTES) {
    await response.body?.cancel();
    throw new SfxGenerationError(
      "Generated audio exceeded the 10 MB download limit.",
      502,
    );
  }
  if (!response.body)
    throw new SfxGenerationError("ElevenLabs returned empty audio.", 502);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AUDIO_BYTES)
        throw new SfxGenerationError(
          "Generated audio exceeded the 10 MB download limit.",
          502,
        );
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (!size)
    throw new SfxGenerationError("ElevenLabs returned empty audio.", 502);
  return Buffer.concat(chunks);
}
