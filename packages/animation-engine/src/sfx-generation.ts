import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { PassageAudioAsset } from "../../scene-contract/src/passage-audio.ts";
import { inspectPassageAudioAsset } from "./passage-audio.ts";
import {
  parseSfxRequest,
  requireSfxApiKey,
  requestElevenLabsSfx,
  SFX_MODEL,
  SfxGenerationError,
  type SfxProviderOptions,
} from "./elevenlabs-sfx.ts";

export type GeneratedSfx = {
  asset: PassageAudioAsset;
  duration: number;
  channels: number;
  manifestPath: string;
};

export async function generateSfx(
  input: unknown,
  options: SfxProviderOptions & { outputDir: string },
): Promise<GeneratedSfx> {
  const request = parseSfxRequest(input);
  requireSfxApiKey(options);
  const outputDir = resolve(options.outputDir);
  await reserveTake(outputDir);
  const save = (name: string, value: unknown) =>
    writeFile(join(outputDir, name), JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
    });
  try {
    await save("request.json", {
      ...request,
      model: SFX_MODEL,
      requestedAt: new Date().toISOString(),
    });
    const bytes = await requestElevenLabsSfx(request, options);
    const path = join(outputDir, "sound.mp3");
    await writeFile(path, bytes, { flag: "wx" });
    const audio = await inspectPassageAudioAsset(path);
    const { id, ...settings } = request;
    const result: GeneratedSfx = {
      asset: {
        id,
        path,
        sha256: audio.sha256,
        generation: {
          ...settings,
          model: SFX_MODEL,
          generatedAt: new Date().toISOString(),
        },
      },
      duration: audio.duration,
      channels: audio.channels,
      manifestPath: join(outputDir, "generation.json"),
    };
    await save("generation.json", result);
    return result;
  } catch (error) {
    const failure =
      error instanceof SfxGenerationError
        ? error
        : new SfxGenerationError(
            "Could not save or verify generated audio.",
            500,
          );
    const message = `${failure.message} Request details and any received audio are saved in ${outputDir}. This take will not be retried automatically.`;
    await save("failure.json", { message }).catch(() => undefined);
    throw new SfxGenerationError(message, failure.status);
  }
}

async function reserveTake(directory: string) {
  try {
    await mkdir(dirname(directory), { recursive: true });
    await mkdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new SfxGenerationError(
        "SFX output directory already exists. Inspect the saved take, or choose a new directory to explicitly generate another.",
        409,
      );
    throw new SfxGenerationError(
      "Cannot create the SFX output directory. No generation was requested.",
      500,
    );
  }
}
