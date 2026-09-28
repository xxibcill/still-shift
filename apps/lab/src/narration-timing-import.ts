import type { PassagePlan } from "../../../packages/scene-contract/src/story-authoring.ts";
import { parseNarrationTiming } from "../../../packages/renderer-core/src/narration-timing.ts";
import { importNarrationTiming } from "../../../packages/renderer-core/src/narration-timing-import.ts";

type Voice = { sha256: string; buffer: AudioBuffer };
type ImportTarget = {
  plan: PassagePlan;
  validate(plan: PassagePlan): void;
  commit(plan: PassagePlan, voice: Voice): Promise<boolean>;
};

export function createNarrationTimingImport(
  captureTarget: () => ImportTarget | undefined,
  decode: (file: File) => Promise<Voice>,
) {
  const el = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const form = el<HTMLFormElement>("timing-form"),
    prepare = el<HTMLButtonElement>("timing-prepare"),
    apply = el<HTMLButtonElement>("timing-apply"),
    notice = el("timing-status");
  let ticket = 0;
  let pending:
    | { target: ImportTarget; plan: PassagePlan; voice: Voice }
    | undefined;
  function invalidate() {
    ticket++;
    pending = undefined;
    apply.disabled = true;
    el("timing-preview").replaceChildren();
  }
  form.onchange = invalidate;
  form.onsubmit = (event) => {
    event.preventDefault();
    invalidate();
    const current = ticket;
    const target = captureTarget();
    if (!target) {
      notice.textContent = "Load a linked authoring passage first.";
      return;
    }
    const audioFile = el<HTMLInputElement>("timing-audio").files?.[0],
      timingFile = el<HTMLInputElement>("timing-file").files?.[0];
    if (!audioFile || !timingFile) {
      notice.textContent = "Choose narration audio and its timing file.";
      return;
    }
    const mode = el<HTMLSelectElement>("timing-mode").value;
    if (mode !== "add" && mode !== "match") return;
    prepare.disabled = true;
    notice.textContent = "Reading narration and checking cue changes…";
    void (async () => {
      try {
        if (timingFile.size > 2_000_000)
          throw new Error("Narration timing exceeds the 2 MB import limit");
        if (!/\.(json|srt)$/i.test(timingFile.name))
          throw new Error("Use word timing JSON or SRT");
        const timing = parseNarrationTiming(
          await timingFile.text(),
          /\.srt$/i.test(timingFile.name) ? "srt" : "json",
        );
        const voice = await decode(audioFile);
        if (current !== ticket) return;
        const result = importNarrationTiming(target.plan, timing, {
          mode,
          reference: audioFile.name,
          sha256: voice.sha256,
          durationSeconds: voice.buffer.duration,
        });
        target.validate(result.plan);
        pending = { target, plan: result.plan, voice };
        const list = document.createElement("ul");
        for (const change of result.changes) {
          const row = document.createElement("li");
          row.textContent = `${change.beat} / ${change.id}: ${change.previousFrame === undefined ? "new" : change.previousFrame} → ${change.frame} frames · ${change.phrase}`;
          list.append(row);
        }
        el("timing-preview").replaceChildren(list);
        notice.textContent = `${result.changes.length} cue changes ready. ${timing.granularity === "subtitle" ? "SRT uses subtitle onsets; it has no word-level precision." : "Word times are rounded to the nearest passage frame."} Existing animation and sound links follow matched cues; new cues can be linked under Linked events.`;
        apply.disabled = false;
      } catch (error) {
        if (current === ticket)
          notice.textContent =
            error instanceof Error ? error.message : String(error);
      } finally {
        prepare.disabled = false;
      }
    })();
  };
  apply.onclick = () => {
    const proposal = pending;
    if (!proposal) return;
    apply.disabled = true;
    prepare.disabled = true;
    void proposal.target
      .commit(proposal.plan, proposal.voice)
      .then((committed) => {
        if (!committed)
          throw new Error(
            "Timing import could not be applied. Review passage diagnostics and preview again.",
          );
        pending = undefined;
        notice.textContent =
          "Narration and timing applied. Voice preview is ready. Cues remain editable; Undo restores the previous plan. Save the plan or workspace to keep these changes.";
      })
      .catch((error) => {
        pending = undefined;
        notice.textContent =
          error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        prepare.disabled = false;
      });
  };
}
