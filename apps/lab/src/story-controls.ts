import {
  StorySceneSchema,
  type StoryScene,
} from "../../../packages/scene-contract/src/story.ts";
import { MotionEasingSchema } from "../../../packages/scene-contract/src/motion-easing.ts";

export function createStoryControls(
  input: StoryScene,
  apply: (input: StoryScene) => void,
  seek: (frame: number) => void,
) {
  const host = document.getElementById("story-events")!;
  host.replaceChildren();
  const draft = structuredClone(input);
  const fields: (() => void)[] = [];
  const add = (label: string, object: Record<string, unknown>, key: string) => {
    const row = document.createElement("label");
    row.textContent = label;
    const field = document.createElement("input");
    field.type = "number";
    field.min = "0";
    field.max = String(input.frameCount - 1);
    field.step = "1";
    field.value = String(object[key]);
    field.setAttribute("aria-label", label);
    const jump = document.createElement("button");
    jump.type = "button";
    jump.textContent = "View frame";
    jump.onclick = () =>
      seek(
        Math.max(0, Math.min(input.frameCount - 1, Number(field.value) || 0)),
      );
    row.append(field, jump);
    host.append(row);
    fields.push(() => {
      object[key] = Number(field.value);
    });
  };
  const visit = (value: unknown, name: string) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${name} ${index + 1}`));
      return;
    }
    const record = value as Record<string, unknown>;
    const label =
      typeof record.cue === "string" ? record.cue.replaceAll("-", " ") : name;
    for (const [key, child] of Object.entries(record)) {
      if (
        typeof child === "number" &&
        ["start", "end", "swapFrame", "atFrame", "contextReadyFrame"].includes(
          key,
        )
      )
        add(`${label} · ${key}`, record, key);
      else if (typeof child === "object") visit(child, `${name} ${key}`);
    }
    if (typeof record.start === "number" && typeof record.end === "number") {
      const row = document.createElement("label");
      row.textContent = `${label} · easing`;
      const select = document.createElement("select");
      select.setAttribute("aria-label", `${label} · easing`);
      for (const easing of MotionEasingSchema.options) {
        const option = document.createElement("option");
        option.value = easing;
        option.textContent = easing.replaceAll("-", " ");
        select.append(option);
      }
      select.value =
        typeof record.easing === "string" ? record.easing : "smoothstep";
      row.append(select);
      host.append(row);
      fields.push(() => {
        record.easing = select.value;
      });
    }
  };
  visit(draft.recipe, "");
  const button = document.createElement("button");
  button.textContent = "Apply timing";
  button.type = "button";
  const message = document.createElement("p");
  message.setAttribute("role", "status");
  button.onclick = () => {
    try {
      fields.forEach((read) => read());
      apply(StorySceneSchema.parse(draft));
      message.textContent =
        "Timing applied to this preview. Download the scene to keep it.";
    } catch (error) {
      message.textContent =
        error instanceof Error ? error.message : String(error);
    }
  };
  const download = document.createElement("button");
  download.textContent = "Download scene";
  download.type = "button";
  download.onclick = () => {
    try {
      fields.forEach((read) => read());
      const parsed = StorySceneSchema.parse(draft);
      apply(parsed);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(parsed, null, 2) + "\n"], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${input.recipe.preset.replaceAll("_", "-")}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message.textContent =
        "Scene downloaded. Keep it beside its asset paths or update those paths before CLI export.";
    } catch (error) {
      message.textContent =
        error instanceof Error ? error.message : String(error);
    }
  };
  host.append(button, download, message);
}
