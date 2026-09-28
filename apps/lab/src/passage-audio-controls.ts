import {
  PassageAudioSchema,
  PassageSoundSchema,
  type PassageAudio,
  type PassageSound,
} from "../../../packages/scene-contract/src/passage-audio.ts";
import type { PassagePlan } from "../../../packages/scene-contract/src/story-authoring.ts";
import type { CompiledStoryPassage } from "../../../packages/renderer-core/src/story-passage.ts";

export function renderPassageAudioControls(
  host: HTMLElement,
  passage: CompiledStoryPassage,
  beatId: string,
  apply: (change: (draft: PassagePlan) => void) => Promise<void>,
) {
  host.replaceChildren();
  if (passage.plan.schemaVersion !== "story-passage-2") {
    host.textContent = "Enable linked authoring to add sound cues.";
    return;
  }
  const beat = passage.beats.find((beat) => beat.id === beatId)!;
  const audio = passage.plan.audio;
  const change = (edit: (audio: PassageAudio) => void) =>
    apply((plan) => {
      if (
        plan.schemaVersion !== "story-passage-2" ||
        plan.id !== passage.plan.id
      )
        throw new Error("Reload the sound controls for this plan");
      plan.audio ??= PassageAudioSchema.parse({
        schemaVersion: "passage-audio-1",
        assets: [],
        sounds: [],
      });
      edit(plan.audio);
    });
  const notice = document.createElement("p");
  notice.className = "hint";
  notice.setAttribute("role", "status");
  const button = (
    parent: HTMLElement,
    title: string,
    action: () => Promise<unknown>,
  ) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = title;
    button.onclick = () => {
      button.disabled = true;
      void action()
        .catch((error) => {
          notice.textContent = String(error);
        })
        .finally(() => {
          button.disabled = false;
        });
    };
    parent.append(button);
    return button;
  };
  const field = (
    parent: HTMLElement,
    title: string,
    value: string | number,
    action?: (value: string) => void,
  ) => {
    const label = document.createElement("label");
    label.className = "field";
    label.append(title);
    const input = document.createElement("input");
    input.type = typeof value === "number" ? "number" : "text";
    input.value = String(value);
    input.setAttribute("aria-label", title);
    if (input.type === "number")
      input.step = title.includes("dB") ? "0.5" : "1";
    input.onchange = () => action?.(input.value);
    label.append(input);
    parent.append(label);
    return input;
  };
  const select = (
    parent: HTMLElement,
    title: string,
    choices: { value: string; label: string }[],
    value: string,
    action: (value: string) => void,
  ) => {
    const label = document.createElement("label");
    label.className = "field";
    label.append(title);
    const input = document.createElement("select");
    input.setAttribute("aria-label", title);
    for (const choice of choices) {
      const option = document.createElement("option");
      option.value = choice.value;
      option.textContent = choice.label;
      input.append(option);
    }
    input.value = value;
    input.onchange = () => action(input.value);
    label.append(input);
    parent.append(label);
  };
  const inspect = async (
    path: string,
  ): Promise<{ path: string; sha256: string; duration: number }> => {
    const response = await fetch(
      "/passage-api/audio?path=" + encodeURIComponent(path),
    );
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.diagnostics
          ?.map((d: { message: string }) => d.message)
          .join("\n") ?? "Cannot read sound",
      );
    return result;
  };
  field(host, "Master level (dB)", audio?.masterGainDb ?? 0, (value) => {
    void change((a) => {
      a.masterGainDb = Number(value);
    });
  });
  field(host, "Narration level (dB)", audio?.narrationGainDb ?? 0, (value) => {
    void change((a) => {
      a.narrationGainDb = Number(value);
    });
  });
  const assetPath = field(host, "Sound file in workspace", "");
  assetPath.placeholder = "assets/sounds/tap.wav";
  button(host, "Register sound file", async () => {
    const info = await inspect(assetPath.value.trim());
    await change((a) => {
      if (a.assets.some((asset) => asset.sha256 === info.sha256))
        throw new Error("This sound is already registered");
      let index = 1;
      while (a.assets.some((asset) => asset.id === "sound-" + index)) index++;
      a.assets.push({
        id: "sound-" + index,
        path: info.path,
        sha256: info.sha256,
      });
    });
  });
  const anchors: {
    value: string;
    label: string;
    anchor: PassageSound["anchor"];
  }[] = [
    ...beat.cues.map((cue) => ({
      value: JSON.stringify({ type: "cue", id: cue.id }),
      label: "Cue · " + cue.id,
      anchor: { type: "cue" as const, id: cue.id },
    })),
    ...beat.events.flatMap((event) =>
      (["start", "end"] as const).map((edge) => ({
        value: JSON.stringify({ type: "event", id: event.id, edge }),
        label: `${event.id} · ${edge}`,
        anchor: { type: "event" as const, id: event.id, edge },
      })),
    ),
  ];
  for (const sound of audio?.sounds.filter((sound) => sound.beat === beatId) ??
    []) {
    const group = document.createElement("div");
    group.className = "event";
    host.append(group);
    const title = document.createElement("div");
    title.className = "event-title";
    const resolved = passage.audio!.sounds.find(
      (item) => item.id === sound.id,
    )!;
    title.textContent = `${sound.id} · ${resolved.start}–${resolved.end} frames`;
    group.append(title);
    const edit = (fn: (sound: PassageSound) => void) => {
      void change((a) => fn(a.sounds.find((item) => item.id === sound.id)!));
    };
    select(
      group,
      sound.id + " asset",
      audio!.assets.map((asset) => ({ value: asset.id, label: asset.id })),
      sound.asset,
      (value) =>
        edit((s) => {
          s.asset = value;
        }),
    );
    select(
      group,
      sound.id + " anchor",
      anchors,
      JSON.stringify(sound.anchor),
      (value) =>
        edit((s) => {
          s.anchor = anchors.find((anchor) => anchor.value === value)!.anchor;
        }),
    );
    for (const [key, label] of [
      ["offset", "offset frames"],
      ["durationFrames", "duration frames"],
      ["sourceStartFrame", "source in frame"],
      ["gainDb", "level (dB)"],
      ["fadeInFrames", "fade in frames"],
      ["fadeOutFrames", "fade out frames"],
    ] as const)
      field(group, sound.id + " " + label, sound[key], (value) =>
        edit((s) => {
          s[key] = Number(value);
        }),
      );
    button(group, "Remove " + sound.id, () =>
      change((a) => {
        a.sounds = a.sounds.filter((item) => item.id !== sound.id);
      }),
    );
  }
  let selectedAsset = audio?.assets[0]?.id ?? "";
  select(
    host,
    "Asset for new sound",
    (audio?.assets ?? []).map((asset) => ({
      value: asset.id,
      label: asset.id,
    })),
    selectedAsset,
    (value) => {
      selectedAsset = value;
    },
  );
  const add = button(host, "Add sound to this beat", async () => {
    const asset = audio!.assets.find((asset) => asset.id === selectedAsset)!;
    const info = await inspect(asset.path),
      anchor = anchors[0]!.anchor;
    const start =
      beat.start +
      (anchor.type === "cue" ? beat.cues[0]!.frame : beat.events[0]!.start);
    await change((a) => {
      let index = 1;
      while (a.sounds.some((s) => s.id === "effect-" + index)) index++;
      a.sounds.push(
        PassageSoundSchema.parse({
          id: "effect-" + index,
          beat: beatId,
          asset: selectedAsset,
          anchor,
          durationFrames: Math.max(
            1,
            Math.min(
              passage.plan.fps,
              Math.floor(info.duration * passage.plan.fps),
              passage.frameCount - start,
            ),
          ),
          gainDb: -18,
        }),
      );
    });
  });
  add.disabled = !selectedAsset || !anchors.length;
  notice.textContent =
    "WAV or MP3. Sounds follow linked timing. Lower levels to leave headroom for narration; fades are linear. Save the plan to keep edits.";
  host.append(notice);
}
