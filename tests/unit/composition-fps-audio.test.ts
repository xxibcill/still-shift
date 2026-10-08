import { expect, it } from "vitest";
import { compositionPcmBoundary } from "@still-shift/scene-contract";
import { scheduleRenderedAudio } from "../../packages/renderer-core/src/rendered-audio-playback.ts";
it("places every 1–60 fps boundary on the first following PCM sample", () => {
  for (let fps = 1; fps <= 60; fps++)
    for (const frame of [0, 1, 5, 108000]) {
      const sample = compositionPcmBoundary(frame, fps);
      expect(sample * fps).toBeGreaterThanOrEqual(frame * 48000);
      expect((sample - 1) * fps).toBeLessThan(frame * 48000);
    }
});
it("schedules a fractional PCM picture boundary without rejecting the complete master", () => {
  let args: number[] = [];
  const source = {
    buffer: null,
    connect() {},
    disconnect() {},
    start(...values: number[]) {
      args = values;
    },
    stop() {},
  };
  const context = {
    destination: {},
    currentTime: 0,
    createBufferSource: () => source,
  } as unknown as BaseAudioContext;
  const buffer = {
    sampleRate: 48000,
    numberOfChannels: 2,
    length: compositionPcmBoundary(5, 7),
  } as AudioBuffer;
  const playback = scheduleRenderedAudio(context, buffer, {
    frame: 1,
    frameCount: 5,
    fps: 7,
    when: 0,
  });
  expect(args).toEqual([
    0,
    compositionPcmBoundary(1, 7) / 48000,
    (compositionPcmBoundary(5, 7) - compositionPcmBoundary(1, 7)) / 48000,
  ]);
  playback.stop();
});
