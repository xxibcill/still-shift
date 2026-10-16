import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, access, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import {
  prepareCompositionAudioSource,
  lintCompositionFile,
} from "@still-shift/animation-engine";
import { mediaFloat32Wave } from "../helpers/composition-media-audio.ts";

it("uses the explicit media cache during lint while preserving a corrupt fallback cache", async () => {
  const root = await mkdtemp(join(tmpdir(), "lint-owned-cache-"));
  const previous = process.env.STILL_SHIFT_COMPOSITION_MEDIA_CACHE;
  const valid = join(root, "valid"),
    fallback = join(root, "fallback");
  try {
    const { wav } = mediaFloat32Wave(1600, 1, () => 0.125);
    await writeFile(join(root, "voice.wav"), wav);
    const asset = {
      id: "voice",
      type: "audio" as const,
      path: "voice.wav",
      sha256: "sha256:" + createHash("sha256").update(wav).digest("hex"),
      sampleRate: 48000 as const,
      sampleCount: 1600,
      channels: 1 as const,
    };
    const prepared = await prepareCompositionAudioSource({
      asset,
      sourceDirectory: root,
      cacheDirectory: valid,
    });
    const corrupt = join(fallback, prepared.key.slice(7));
    await mkdir(corrupt, { recursive: true });
    process.env.STILL_SHIFT_COMPOSITION_MEDIA_CACHE = fallback;
    const input = join(root, "composition.json");
    await writeFile(
      input,
      JSON.stringify({
        schemaVersion: "composition-1",
        id: "owned-audio-cache",
        width: 64,
        height: 64,
        fps: 30,
        frameCount: 1,
        background: "#101820",
        assets: [asset],
        layers: [
          {
            id: "narration",
            type: "audio",
            asset: "voice",
            role: "narration",
            inPoint: 0,
            outPoint: 1,
            sourceStartSample: 0,
            sourceEndSample: 1600,
          },
        ],
      }),
    );
    await expect(
      lintCompositionFile(input, {}, { cacheDirectory: valid }),
    ).resolves.toHaveProperty("validationDiagnostics");
    await expect(lintCompositionFile(input)).rejects.toThrow(
      "Audio cache manifest is missing",
    );
    await expect(access(join(corrupt, "manifest.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  } finally {
    if (previous === undefined)
      delete process.env.STILL_SHIFT_COMPOSITION_MEDIA_CACHE;
    else process.env.STILL_SHIFT_COMPOSITION_MEDIA_CACHE = previous;
    await rm(root, { recursive: true, force: true });
  }
});
