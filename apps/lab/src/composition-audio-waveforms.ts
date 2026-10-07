import type { CompositionPreparedAudio } from "../../../packages/scene-contract/src/index.ts";

export function presentCompositionAudioWaveforms(
  audio?: CompositionPreparedAudio,
) {
  const panel = document.getElementById("audio-waveforms")!;
  panel.hidden = !audio;
  panel.replaceChildren();
  if (!audio) return;
  panel.dataset.sampleCount = String(audio.sampleCount);
  const title = document.createElement("h2");
  title.textContent = "Audio";
  const description = document.createElement("p");
  description.textContent =
    "Source lanes show the original sound. Processed lanes include trims, fades, gain and pan on the composition timeline.";
  panel.append(title, description);
  const row = (
    label: string,
    clock: "source" | "composition",
    wave: CompositionPreparedAudio["waveforms"]["mix"],
    key: string,
  ) => {
    const lane = document.createElement("div");
    lane.className = "audio-waveform-lane";
    lane.dataset.clock = clock;
    lane.dataset.key = key;
    const caption = document.createElement("p");
    const headroom =
      wave.peakDbfs === null
        ? "silent"
        : `${wave.peakDbfs.toFixed(1)} dBFS peak`;
    caption.textContent = `${label} · ${clock} time · ${(wave.sampleCount / 48000).toFixed(3)} s · ${headroom}${wave.samplesAboveFullScale ? ` · ${wave.samplesAboveFullScale} samples above full scale` : ""}`;
    const canvas = document.createElement("canvas");
    canvas.width = wave.peaks.length;
    canvas.height = 64;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", caption.textContent);
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#375b62";
    for (let bin = 0; bin < wave.peaks.length; bin++) {
      const height = Math.min(1, wave.peaks[bin]!) * 30;
      context.fillRect(bin, 32 - height, 1, Math.max(1, height * 2));
    }
    lane.append(caption, canvas);
    if (clock === "composition") {
      const cursor = document.createElement("span");
      cursor.className = "audio-waveform-cursor";
      cursor.setAttribute("aria-hidden", "true");
      lane.append(cursor);
    }
    panel.append(lane);
  };
  for (const wave of audio.waveforms.source)
    row(`${wave.asset} · source`, "source", wave, wave.asset);
  for (const wave of audio.waveforms.processed)
    row(`${wave.key} · processed`, "composition", wave, wave.key);
  row("Complete mix", "composition", audio.waveforms.mix, "mix");
}

export function positionCompositionAudioWaveforms(
  frame: number,
  frameCount: number,
) {
  for (const cursor of document.querySelectorAll<HTMLElement>(
    ".audio-waveform-cursor",
  ))
    cursor.style.left = `${(100 * frame) / frameCount}%`;
}
