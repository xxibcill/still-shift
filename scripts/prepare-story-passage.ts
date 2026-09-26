import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  readStoryPassage,
  writePreparedPassage,
} from "../packages/animation-engine/src/story-passage-io.ts";
import { passageGallery } from "./story-motion/passage-gallery.ts";
import {
  renderStoryPassage,
  verifyPassageNarration,
} from "../packages/animation-engine/src/story-passage-render.ts";
import { passageDiagnostics } from "../packages/renderer-core/src/passage-diagnostics.ts";

const { values } = parseArgs({
  options: {
    plan: { type: "string" },
    "output-dir": { type: "string" },
    narration: { type: "string" },
    silent: { type: "boolean", default: false },
    "prepare-only": { type: "boolean", default: false },
    resume: { type: "boolean", default: false },
    "cache-dir": { type: "string" },
    "start-frame": { type: "string" },
    "end-frame": { type: "string" },
    beat: { type: "string" },
    "compare-with": { type: "string" },
  },
  strict: true,
});
const controller = new AbortController();
const cancel = () => controller.abort(new Error("Passage rendering cancelled"));
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);
try {
  if (!values.plan || !values["output-dir"])
    throw new Error(
      "Pass --plan <JSON> --output-dir <directory>, plus --narration <WAV>, --silent, or --prepare-only",
    );
  if (
    [Boolean(values.narration), values.silent, values["prepare-only"]].filter(
      Boolean,
    ).length !== 1
  )
    throw new Error(
      "Choose exactly one of --narration, --silent or --prepare-only",
    );
  if (values.resume && values["prepare-only"])
    throw new Error("--resume requires a render mode");
  if (
    values.beat &&
    (values["start-frame"] !== undefined || values["end-frame"] !== undefined)
  )
    throw new Error("Choose --beat or a frame range");
  const passage = await readStoryPassage(values.plan);
  const output = resolve(values["output-dir"]),
    narration = values.narration ? resolve(values.narration) : undefined;
  const range = {
    start: Number(values["start-frame"] ?? 0),
    end: Number(values["end-frame"] ?? passage.frameCount),
  };
  if (values.beat) {
    const beat = passage.beats.find((b) => b.id === values.beat);
    if (!beat) throw new Error("Unknown beat: " + values.beat);
    range.start = beat.start;
    range.end = beat.end;
  }
  if (
    !Number.isInteger(range.start) ||
    !Number.isInteger(range.end) ||
    range.start < 0 ||
    range.end > passage.frameCount ||
    range.end <= range.start
  )
    throw new Error("Invalid half-open preview frame range");
  if (narration) await verifyPassageNarration(passage, narration);
  if (!values.resume) await writePreparedPassage(output, passage);
  let report: Awaited<ReturnType<typeof renderStoryPassage>> | undefined;
  if (!values["prepare-only"])
    report = await renderStoryPassage(output, passage, narration, {
      resume: values.resume,
      signal: controller.signal,
      range,
      ...(values["cache-dir"]
        ? { cacheDirectory: resolve(values["cache-dir"]) }
        : {}),
      onProgress: (progress) =>
        process.stderr.write(JSON.stringify(progress) + "\n"),
    });
  const mode = values["prepare-only"]
    ? "prepared"
    : narration
      ? "narrated"
      : "silent";
  const html =
    (range.start === 0 && range.end === passage.frameCount) ||
    values["prepare-only"]
      ? passageGallery(output, passage, mode)
      : `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Still Shift · Range preview</title><body style="background:#211f1b;color:#eee8d9;font-family:system-ui;padding:24px"><h1>Range preview</h1><p>Passage frames ${range.start}–${range.end} exclusive · ${passage.plan.fps} fps</p><video controls playsinline style="width:100%;max-width:1200px" src="passage.mp4"></video><p><a style="color:#bdcbaa" href="render-report.json">Render report</a></p></body></html>`;
  await writeFile(join(output, "index.html"), html, {
    flag: values.resume ? "w" : "wx",
  });
  await writeFile(
    join(output, "diagnostics.json"),
    JSON.stringify(passage.diagnostics, null, 2) + "\n",
    { flag: values.resume ? "w" : "wx" },
  );
  if (values["compare-with"] && report) {
    const before = JSON.parse(
      await readFile(resolve(values["compare-with"]), "utf8"),
    ) as typeof report;
    const comparison = {
      before: resolve(values["compare-with"]),
      after: join(output, "render-report.json"),
      sameDimensions:
        before.video.streams.find((s) => s.codec_type === "video")?.width ===
          report.video.streams.find((s) => s.codec_type === "video")?.width &&
        before.video.streams.find((s) => s.codec_type === "video")?.height ===
          report.video.streams.find((s) => s.codec_type === "video")?.height,
      sameFrameCount: before.frameCount === report.frameCount,
      sameFps: before.fps === report.fps,
      sameEncodedBytes: before.video.sha256 === report.video.sha256,
      renderMs: {
        before: before.metrics.renderingMs,
        after: report.metrics.renderingMs,
      },
      reusedBeats: report.cache.filter((b) => b.reused).length,
      changedBeats: report.cache
        .filter((b) => !before.cache?.some((old) => old.key === b.key))
        .map((b) => b.beat),
      note: "Technical comparison only; encoded-byte equality is not a measure of visual quality.",
    };
    await writeFile(
      join(output, "comparison.json"),
      JSON.stringify(comparison, null, 2) + "\n",
      { flag: values.resume ? "w" : "wx" },
    );
  }
  console.log(
    JSON.stringify({
      status: mode,
      plan: passage.plan.id,
      frameCount: report?.frameCount ?? passage.frameCount,
      review: join(output, "index.html"),
      diagnostics: passage.diagnostics,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: controller.signal.aborted ? "cancelled" : "failed",
      diagnostics: passageDiagnostics(error),
    }),
  );
  process.exitCode = controller.signal.aborted ? 130 : 1;
} finally {
  process.off("SIGINT", cancel);
  process.off("SIGTERM", cancel);
}
