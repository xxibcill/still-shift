/** Play a verified complete master without adding a second gain, pan or fade law. */
export function scheduleRenderedAudio(
  context: BaseAudioContext,
  buffer: AudioBuffer,
  options: { frame: number; frameCount: number; fps: number; when: number },
) {
  const { frame, frameCount, fps, when } = options;
  const startSample = (frame * 48000) / fps;
  const endSample = (frameCount * 48000) / fps;
  if (
    !Number.isInteger(frameCount) ||
    !Number.isInteger(fps) ||
    fps < 1 ||
    !Number.isInteger(frame) ||
    frame < 0 ||
    frame >= frameCount ||
    !Number.isInteger(startSample) ||
    !Number.isInteger(endSample) ||
    buffer.sampleRate !== 48000 ||
    buffer.numberOfChannels !== 2 ||
    buffer.length !== endSample ||
    !Number.isFinite(when) ||
    when < 0
  )
    throw new Error(
      "Rendered audio must use the complete 48 kHz stereo master and an integer picture boundary",
    );
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  try {
    source.start(when, startSample / 48000, (endSample - startSample) / 48000);
  } catch (error) {
    source.disconnect();
    throw error;
  }
  let stopped = false;
  return {
    get frame() {
      return (
        frame +
        Math.floor(Math.max(0, context.currentTime - when) * fps + 0.00001)
      );
    },
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        source.stop();
      } catch {
        /* The scheduled buffer may have ended. */
      }
      source.disconnect();
    },
  };
}
