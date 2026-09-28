import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { generateSfx } from "../../packages/animation-engine/src/sfx-generation.ts";
import { PassageAudioAssetSchema } from "../../packages/scene-contract/src/passage-audio.ts";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";

const request = {
  provider: "elevenlabs",
  id: "wood-tap",
  prompt: "One quiet wooden tap",
  durationSeconds: 1,
};
let directory: string, bytes: Uint8Array<ArrayBuffer>;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "sfx-generation-"));
  const path = join(directory, "provider.mp3");
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1",
    "-c:a",
    "libmp3lame",
    path,
  ]);
  bytes = new Uint8Array(await readFile(path));
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("generated sound assets", () => {
  it("runs the public CLI command and returns a reusable asset without leaking credentials", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response(bytes)));
    vi.stubEnv("ELEVENLABS_API_KEY", "private-cli-key");
    vi.stubGlobal("fetch", fetcher);
    const io = { stdout: vi.fn(), stderr: vi.fn() };
    try {
      const outputDir = join(directory, "cli-take");
      expect(
        await runCli(
          [
            "sfx",
            "generate",
            "--provider",
            "elevenlabs",
            "--id",
            "cli-tap",
            "--prompt",
            "One wooden tap",
            "--duration",
            "1",
            "--prompt-influence",
            "0.7",
            "--loop",
            "true",
            "--output-dir",
            outputDir,
          ],
          io,
        ),
      ).toBe(0);
      const output = io.stdout.mock.calls.flat().join("");
      const result = JSON.parse(output);
      expect(result.asset.path).toBe(join(outputDir, "sound.mp3"));
      expect(result.asset.generation).toMatchObject({
        promptInfluence: 0.7,
        loop: true,
      });
      expect(output).not.toContain("private-cli-key");
      expect(io.stderr).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
  it("saves playable audio, verified hash and portable prompt provenance; never overwrites a take", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response(bytes)));
    const outputDir = join(directory, "take-1");
    const result = await generateSfx(request, {
      outputDir,
      apiKey: "private-test-key",
      fetch: fetcher,
    });
    expect(result.duration).toBeGreaterThanOrEqual(1);
    expect(result.asset.sha256).toBe(
      "sha256:" + createHash("sha256").update(bytes).digest("hex"),
    );
    expect(result.asset.generation?.prompt).toBe(request.prompt);
    expect(PassageAudioAssetSchema.parse(result.asset)).toEqual(result.asset);
    expect(JSON.parse(await readFile(result.manifestPath, "utf8"))).toEqual(
      result,
    );
    expect(await readFile(result.manifestPath, "utf8")).not.toContain(
      "private-test-key",
    );
    expect(
      await readFile(join(outputDir, "request.json"), "utf8"),
    ).not.toContain("private-test-key");
    await expect(
      generateSfx(request, {
        outputDir,
        apiKey: "private-test-key",
        fetch: fetcher,
      }),
    ).rejects.toThrow("already exists");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retains paid output when decoding fails and prevents accidental repeat charges", async () => {
    const outputDir = join(directory, "bad-audio");
    const fetcher = vi.fn().mockResolvedValue(new Response("invalid-audio"));
    await expect(
      generateSfx(request, { outputDir, apiKey: "secret", fetch: fetcher }),
    ).rejects.toThrow("saved");
    expect(await readFile(join(outputDir, "sound.mp3"), "utf8")).toBe(
      "invalid-audio",
    );
    expect(
      await readFile(join(outputDir, "failure.json"), "utf8"),
    ).not.toContain("secret");
    await expect(
      generateSfx(request, { outputDir, apiKey: "secret", fetch: fetcher }),
    ).rejects.toThrow("already exists");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
