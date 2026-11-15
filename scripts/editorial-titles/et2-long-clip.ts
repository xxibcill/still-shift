// ET2 long-clip measurement: pixel lint over a deterministic long video
// (docs/editorial-typography-improvement-plan.md#et2--pixel-lint-over-native-video).
//
//   pnpm exec tsx scripts/editorial-titles/et2-long-clip.ts \
//     [--width 1080] [--height 1920] [--seconds 60] \
//     [--decoded-cache-bytes N] [--decoded-frame-bytes N] [--output result.json]
//
// The clip is generated into a temporary directory by looping the tracked
// fixture clip (tests/helpers/editorial-video-lint.ts) and removed afterwards,
// together with its private media cache. Prints one JSON record: the lint
// outcome, wall time, peak Node and browser resident memory (sampled with
// `ps`), native media decode residency against `mediaLimits.decodedFrameBytes`,
// prepared cache bytes against `mediaLimits.decodedCacheBytes`, and any
// temporary entries the lint left behind.
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { lintCompositionFile } from "@still-shift/animation-engine";
import {
  COMPOSITION_MEDIA_DEFAULT_LIMITS,
  type CompositionMediaLimits,
} from "@still-shift/scene-contract";
import { passageDiagnostics } from "@still-shift/renderer-core";
import {
  directoryBytes,
  generateLongClip,
  lintTemporaryEntries,
  longClipComposition,
  mediaCacheTransientEntries,
} from "../../tests/helpers/editorial-video-lint.ts";

const { values } = parseArgs({
  options: {
    width: { type: "string", default: "1080" },
    height: { type: "string", default: "1920" },
    seconds: { type: "string", default: "60" },
    "decoded-cache-bytes": { type: "string" },
    "decoded-frame-bytes": { type: "string" },
    output: { type: "string" },
  },
});
const width = Number(values.width),
  height = Number(values.height),
  seconds = Number(values.seconds);
const mediaLimits: CompositionMediaLimits = {
  ...(values["decoded-cache-bytes"]
    ? { decodedCacheBytes: Number(values["decoded-cache-bytes"]) }
    : {}),
  ...(values["decoded-frame-bytes"]
    ? { decodedFrameBytes: Number(values["decoded-frame-bytes"]) }
    : {}),
};

/** Resident bytes of this process and of every descendant (browser, FFmpeg). */
function residentBytes() {
  const rows = execFileSync("ps", ["-axo", "pid=,ppid=,rss="], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .map(
      (line) =>
        line.trim().split(/\s+/).map(Number) as [number, number, number],
    );
  const children = new Map<number, number[]>();
  for (const [pid, ppid] of rows)
    children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  const rss = new Map(rows.map(([pid, , kb]) => [pid, kb * 1024]));
  let descendants = 0;
  const queue = [...(children.get(process.pid) ?? [])];
  while (queue.length) {
    const pid = queue.pop()!;
    descendants += rss.get(pid) ?? 0;
    queue.push(...(children.get(pid) ?? []));
  }
  return { node: process.memoryUsage().rss, descendants };
}

const work = await mkdtemp(join(tmpdir(), "et2-long-clip-"));
const tempBefore = await lintTemporaryEntries();
try {
  const generationStarted = performance.now();
  const clip = await generateLongClip(work, { width, height, seconds });
  const generationSeconds = (performance.now() - generationStarted) / 1000;
  const composition = await longClipComposition(
    clip,
    Object.keys(mediaLimits).length ? mediaLimits : undefined,
  );
  const input = join(work, "long-clip.composition.json");
  await writeFile(input, JSON.stringify(composition));
  const cacheDirectory = join(work, "media-cache");
  const peak = { node: 0, descendants: 0, combined: 0 };
  const sample = () => {
    const now = residentBytes();
    peak.node = Math.max(peak.node, now.node);
    peak.descendants = Math.max(peak.descendants, now.descendants);
    peak.combined = Math.max(peak.combined, now.node + now.descendants);
  };
  const timer = setInterval(sample, 250);
  const started = performance.now();
  let outcome: Record<string, unknown>;
  try {
    const report = await lintCompositionFile(
      input,
      {},
      {
        pixels: true,
        cacheDirectory,
        collectTextBounds: true,
        collectMediaStatistics: true,
      },
    );
    outcome = {
      status: report.status,
      measured: report.measured,
      diagnosticCodes: [
        ...new Set(report.diagnostics.map((d) => d.code)),
      ].sort(),
      frozenPixels: report.diagnostics
        .filter((d) => d.code === "frozen-pixels")
        .map((d) => d.frames),
      textBoundStates: Object.keys(report.textBounds ?? {}).length,
      mediaStatistics: report.mediaStatistics,
    };
  } catch (error) {
    outcome = {
      status: "rejected",
      diagnostics: passageDiagnostics(error).map(({ code, message, path }) => ({
        code,
        message,
        path,
      })),
    };
  } finally {
    clearInterval(timer);
    sample();
  }
  const lintSeconds = (performance.now() - started) / 1000;
  const limits = { ...COMPOSITION_MEDIA_DEFAULT_LIMITS, ...mediaLimits };
  const record = {
    schema: "still-shift-et2-long-clip-1",
    clip: { ...clip, path: undefined, seconds, generationSeconds },
    mediaLimits: limits,
    outcome,
    lintSeconds,
    peakResidentBytes: peak,
    preparedCacheBytes: await directoryBytes(cacheDirectory),
    cacheTransientEntries: await mediaCacheTransientEntries(cacheDirectory),
    leftoverTemporaryEntries: (await lintTemporaryEntries()).filter(
      (name) => !tempBefore.includes(name),
    ),
    host: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
    },
  };
  const text = JSON.stringify(record, null, 2) + "\n";
  if (values.output) await writeFile(values.output, text);
  process.stdout.write(text);
} finally {
  await rm(work, { recursive: true, force: true });
}
