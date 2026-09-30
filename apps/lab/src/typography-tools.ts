import { measureTypographyPixels } from "../../../packages/renderer-core/src/typography-pixels.ts";
import { prepareTypeReview } from "../../../packages/renderer-core/src/typography-review.ts";
import type { StoryScene } from "../../../packages/scene-contract/src/story.ts";
import { StorySceneSchema } from "../../../packages/scene-contract/src/story.ts";
import { compileStoryScene } from "../../../packages/renderer-core/src/story-scene.ts";
import {
  createIllustratedPreview,
  type Images,
} from "../../../packages/renderer-core/src/illustrated-renderer.ts";
import {
  analyzeTypography,
  textReadingWindows,
} from "../../../packages/renderer-core/src/typography-quality.ts";
import { resolveTextEvents } from "../../../packages/renderer-core/src/typography-events.ts";
import { renderTypeSpecimen } from "../../../packages/renderer-core/src/typography-specimen.ts";
import "./typography-tools.css";

export function createTypographyTools(
  input: StoryScene,
  seek: (frame: number) => void,
  images?: Images,
  apply?: (scene: StoryScene) => void,
) {
  const scene = compileStoryScene(input),
    host = document.createElement("section");
  host.className = "type-tools";
  host.setAttribute("aria-label", "Text timeline");
  const heading = document.createElement("h3");
  heading.textContent = "Text timeline";
  const description = document.createElement("p");
  description.textContent =
    "Words mark spoken onsets. Bars show text motion; shaded windows show settled reading time.";
  const timeline = document.createElement("div");
  timeline.className = "type-timeline";
  const button = (
    label: string,
    start: number,
    end: number,
    className: string,
  ) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = label;
    b.title = `${label} · frames ${start}–${end}`;
    b.setAttribute("aria-label", b.title);
    b.style.left = `${(100 * start) / scene.frameCount}%`;
    b.style.width = `${Math.max(0.6, (100 * (end - start)) / scene.frameCount)}%`;
    b.onclick = () => seek(Math.max(0, Math.min(scene.frameCount - 1, start)));
    return b;
  };
  const row = (name: string) => {
    const line = document.createElement("div");
    line.className = "type-lane";
    const label = document.createElement("span");
    label.textContent = name;
    label.className = "type-lane-label";
    const track = document.createElement("div");
    track.className = "type-track";
    line.append(label, track);
    timeline.append(line);
    return track;
  };
  const words = row("Narration");
  for (const word of scene.narrationTiming?.segments ?? []) {
    const start = Math.round(word.start * scene.fps),
      end = Math.round(word.end * scene.fps);
    if (start < scene.frameCount)
      words.append(button(word.text, start, end, "type-word"));
  }
  const windows = textReadingWindows(scene),
    events = resolveTextEvents(scene);
  const preview =
    images && scene.typography
      ? createIllustratedPreview(
          document.createElement("canvas"),
          scene,
          images,
        )
      : undefined;
  const prepared = images?.fonts
    ? (preview?.typography ?? prepareTypeReview(scene, images.fonts))
    : undefined;
  let report = analyzeTypography(scene, prepared ? { prepared } : {});
  const tracks = new Map<string, HTMLDivElement>();
  preview?.dispose();
  for (const node of scene.nodes.filter((n) => n.type === "text")) {
    const track = row(node.id);
    tracks.set(node.id, track);
    for (const window of windows.filter((w) => w.node === node.id))
      track.append(button("Reading", window.start, window.end, "type-reading"));
    for (const animator of scene.textAnimators?.filter(
      (a) => a.node === node.id,
    ) ?? [])
      track.append(
        button(
          `${animator.unit} ${animator.mask ?? "motion"}`,
          animator.start,
          animator.end,
          "type-motion",
        ),
      );
    for (const event of events.filter((e) => e.node === node.id))
      track.append(button(event.verb, event.start, event.end, "type-verb"));
  }
  const findings = document.createElement("details"),
    summary = document.createElement("summary");
  const renderFindings = () => {
    timeline.querySelectorAll(".type-finding").forEach((pin) => pin.remove());
    summary.textContent = `${report.diagnostics.length} typography suggestions`;
    findings.replaceChildren(summary);
    for (const finding of report.diagnostics) {
      for (const node of finding.nodes)
        tracks
          .get(node)
          ?.append(
            button(
              finding.code,
              finding.frames[0],
              finding.frames[0] + 1,
              "type-finding",
            ),
          );
      const p = document.createElement("p"),
        jump = document.createElement("button");
      jump.type = "button";
      jump.textContent = `Frame ${finding.frames[0]}`;
      jump.onclick = () => seek(finding.frames[0]);
      p.append(finding.message + " ", jump);
      findings.append(p);
    }
  };
  renderFindings();
  const actions = document.createElement("div");
  actions.className = "controls";
  const specimen = document.createElement("button");
  specimen.type = "button";
  specimen.textContent = "Download type specimen";
  specimen.disabled = !images?.fonts;
  specimen.onclick = () => {
    if (!images?.fonts) return;
    for (const [i, canvas] of renderTypeSpecimen(
      scene,
      images.fonts,
    ).entries()) {
      const link = document.createElement("a");
      link.href = canvas.toDataURL();
      link.download = `type-specimen-${i + 1}.png`;
      link.click();
    }
  };
  actions.append(specimen);
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const pixels = document.createElement("button");
  pixels.type = "button";
  pixels.textContent = "Check contrast and animation handoff";
  pixels.disabled = !images;
  pixels.onclick = () => {
    if (!images) return;
    pixels.disabled = true;
    status.textContent = "Measuring rendered text…";
    requestAnimationFrame(() => {
      try {
        report = analyzeTypography(scene, {
          ...(prepared ? { prepared } : {}),
          pixels: measureTypographyPixels(scene, images),
        });
        renderFindings();
        status.textContent = "Rendered contrast and handoff checks complete.";
      } catch (error) {
        status.textContent =
          error instanceof Error ? error.message : String(error);
      } finally {
        pixels.disabled = false;
      }
    });
  };
  actions.append(pixels);
  if (
    input.typography &&
    input.narrationTiming?.granularity === "word" &&
    apply
  ) {
    const nodes = document.createElement("select");
    nodes.setAttribute("aria-label", "Emphasis text");
    for (const node of input.nodes.filter((n) => n.type === "text")) {
      const option = document.createElement("option");
      option.value = node.id;
      option.textContent = node.id;
      nodes.append(option);
    }
    const words = document.createElement("select");
    words.setAttribute("aria-label", "Spoken word");
    input.narrationTiming.segments.forEach((word, i) => {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = `${word.text} · ${word.start.toFixed(2)} s`;
      words.append(option);
    });
    const emphasize = document.createElement("button");
    emphasize.type = "button";
    emphasize.textContent = "Emphasize on spoken word";
    emphasize.onclick = () => {
      try {
        const draft = structuredClone(input),
          i = Number(words.value),
          word = draft.narrationTiming!.segments[i]!;
        (draft.textEvents ??= []).push({
          node: nodes.value,
          verb: "emphasize",
          manner: "color",
          color: "#ad4933",
          duration: Math.max(
            1,
            Math.min(10, Math.round(word.start * draft.fps)),
          ),
          at: {
            narrationWord: {
              segment: word.segmentIndex ?? 0,
              index: word.wordIndex ?? i,
            },
          },
        });
        const parsed = StorySceneSchema.parse(draft);
        compileStoryScene(parsed);
        apply(parsed);
        status.textContent = "Emphasis added at the spoken onset.";
      } catch (error) {
        status.textContent =
          error instanceof Error ? error.message : String(error);
      }
    };
    actions.append(nodes, words, emphasize);
  }
  host.append(heading, description, timeline, findings, actions, status);
  return host;
}
