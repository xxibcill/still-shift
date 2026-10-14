import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { verifyMechanismFinalAudio } from "../../packages/animation-engine/src/mechanism/audio-verification.ts";
import { mediaFloat32Wave } from "../helpers/composition-media-audio.ts";

let directory: string, sourcePath: string;
const sampleCount = 96_000;
function speechFixture(sample: number, channel: number) {
  const time = sample / 48_000;
  const envelope =
    0.16 + 0.05 * Math.sin(time * 17.17) + 0.03 * Math.cos(time * 39.43);
  return (
    envelope *
    (Math.sin(2 * Math.PI * (233 + channel * 37) * time + 95 * time * time) +
      0.4 * Math.sin(2 * Math.PI * 847 * time + 29 * time ** 3))
  );
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "mechanism-audio-runtime-"));
  sourcePath = join(directory, "source.wav");
  await writeFile(
    sourcePath,
    mediaFloat32Wave(sampleCount, 2, speechFixture).wav,
  );
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
async function encode(name: string, filters: string[] = []) {
  const path = join(directory, `${name}.m4a`);
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-nostdin",
    "-threads",
    "1",
    "-i",
    sourcePath,
    ...filters,
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-threads",
    "1",
    "-filter_threads",
    "1",
    "-movflags",
    "+faststart",
    path,
  ]);
  return path;
}
async function check(
  finalPath: string,
  overrides: Partial<Parameters<typeof verifyMechanismFinalAudio>[0]> = {},
) {
  return verifyMechanismFinalAudio({
    sourcePath,
    finalPath,
    sourceSampleCount: sampleCount,
    sourceChannels: 2,
    frameCount: 60,
    fps: 30,
    ...overrides,
  });
}
describe("decoded final narration verification", () => {
  it("accepts aligned AAC content with bounded codec padding and the complete active tail", async () => {
    const path = await encode("aligned"),
      before = await readdir(directory);
    const report = await check(path);
    expect(report.findings).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.decodedClock!.sampleCount).toBeGreaterThanOrEqual(
      sampleCount,
    );
    expect(report.decodedClock!.paddingSamples).toBeLessThanOrEqual(1023);
    expect(report.alignment!.windows).toHaveLength(3);
    expect(report.alignment!.maxLagSamples).toBeLessThanOrEqual(64);
    expect(report.tail!.lastActiveSampleExclusive).toBe(sampleCount);
    expect(report.tail!.preserved).toBe(true);
    expect(await readdir(directory)).toEqual(before);
  });
  it("accepts the exact decoded PCM samples without AAC padding allowance", async () => {
    const report = await check(sourcePath);
    expect(report.findings).toEqual([]);
    expect(report.valid).toBe(true);
    expect(report.decodedClock!.paddingAllowanceSamples).toBe(0);
    expect(report.decodedClock!.decodedSha256).toBe(
      report.decodedClock!.sourceSha256,
    );
    expect(report.alignment!.normalizedError).toBe(0);
  });
  it("rejects missing final audio independently of video stream presence", async () => {
    const path = join(directory, "silent-video.mp4");
    await runProcess("ffmpeg", [
      "-v",
      "error",
      "-nostdin",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=16x16:r=30:d=2",
      "-an",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      path,
    ]);
    const report = await check(path);
    expect(report.valid).toBe(false);
    expect(report.findings.map((item) => item.code)).toContain(
      "mechanism-final-audio-missing",
    );
  });
  it("detects a same-duration 80 ms content shift without compensating for it", async () => {
    const report = await check(
      await encode("shifted", [
        "-af",
        "adelay=3840S:all=1,atrim=end_sample=96000",
      ]),
    );
    expect(report.valid).toBe(false);
    expect(report.findings.map((item) => item.code)).toContain(
      "mechanism-final-audio-sync",
    );
    expect(
      report.alignment!.windows.every(
        (window) => Math.abs(window.lagSamples - 3840) <= 64,
      ),
    ).toBe(true);
    expect(report.decodedClock!.paddingSamples).toBeLessThanOrEqual(1023);
  });
  it("rejects a shortened container and decoded clock", async () => {
    const report = await check(await encode("truncated", ["-t", "1.75"]));
    expect(report.valid).toBe(false);
    expect(report.findings.map((item) => item.code)).toContain(
      "mechanism-final-audio-decoded-duration",
    );
    expect(report.findings.map((item) => item.code)).toContain(
      "mechanism-final-audio-tail",
    );
  });
  it("detects missing terminal speech even when the stream retains the exact duration", async () => {
    const report = await check(
      await encode("muted-tail", [
        "-af",
        "volume=volume=0:enable='gte(t,1.7)'",
      ]),
    );
    expect(report.valid).toBe(false);
    expect(report.findings.map((item) => item.code)).toContain(
      "mechanism-final-audio-tail",
    );
    expect(report.tail!.decodedRms).toBeLessThan(report.tail!.sourceRms / 10);
  });
  it("rejects a changed source clock and bounded invalid requests", async () => {
    const path = await encode("clock");
    const report = await check(path, { frameCount: 61 });
    expect(report.valid).toBe(false);
    expect(report.findings.map((item) => item.code)).toContain(
      "mechanism-audio-source-duration",
    );
    await expect(
      check(path, { sourceSampleCount: 172_800_001 }),
    ).rejects.toThrow("bounded");
    await expect(
      check(path, { signal: AbortSignal.abort(new Error("cancelled")) }),
    ).rejects.toThrow("cancelled");
  });
  it("preserves mono source level when the native final stream duplicates it into stereo", async () => {
    const mono = join(directory, "mono.wav");
    await writeFile(mono, mediaFloat32Wave(sampleCount, 1, speechFixture).wav);
    const finalPath = join(directory, "mono.m4a");
    await runProcess("ffmpeg", [
      "-v",
      "error",
      "-nostdin",
      "-i",
      mono,
      "-af",
      "pan=stereo|c0=c0|c1=c0",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-threads",
      "1",
      "-filter_threads",
      "1",
      finalPath,
    ]);
    const report = await check(finalPath, {
      sourcePath: mono,
      sourceChannels: 1,
    });
    expect(report.findings).toEqual([]);
    expect(report.valid).toBe(true);
  });
});
