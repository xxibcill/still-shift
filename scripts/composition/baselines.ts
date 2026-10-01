/**
 * Composition-engine baselines (docs/composition-engine-plan.md, CE0).
 *
 * Renders every frame of each acceptance fixture through the current renderer in the
 * pinned software-rendering browser, then writes or checks per-frame hashes, sampled
 * thumbnails and render timings.
 *
 *   pnpm composition:baselines --check              compare with the stored baseline
 *   pnpm composition:baselines --write              regenerate baseline and timings
 *   pnpm composition:baselines --compare-hardware   measure hardware-GPU preview drift
 *   options: --only id[,id]  --family name[,name]  --list
 *
 * Cross-platform comparison (another environment against this one):
 *   there:  --check --baseline darwin-arm64 --save-mismatches <dir>
 *           checks against another platform's baseline and saves full frames that differ
 *   here:   --compare-frames <dir>
 *           renders the same frames here and reports their tolerance tier
 */
import { createReadStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { availableParallelism, cpus, tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { arch, argv, exit, platform } from "node:process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import type { Browser, Page } from "playwright";
import { format } from "prettier";
import { createServer, type Plugin, type ViteDevServer } from "vite";

import { loadPreparedScene } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { validatePreparedAssets } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { readStoryPassage } from "../../packages/animation-engine/src/story-passage-io.ts";
import {
  assertPinnedRenderEnvironment,
  launchRenderBrowser,
  probeRenderEnvironment,
  RENDER_BROWSER_ARGS,
  type RenderBrowserProfile,
  type RenderEnvironment,
} from "../../packages/execution-runtime/src/render-browser.ts";
import {
  compareFrames,
  FRAME_TOLERANCE_VERSION,
  strictestTier,
  worstTier,
  type ToleranceTier,
} from "../../packages/renderer-core/src/frame-tolerance.ts";
import {
  compilePreparedScene,
  type IllustratedScene,
} from "../../packages/renderer-core/src/prepared-scene.ts";
import type {
  BaselineRenderOptions,
  BaselineRenderResult,
  SampleRenderOptions,
} from "./baseline-page.ts";

import {
  assertBaselineInventory,
  selectBaselineFixtures,
} from "./baseline-check.ts";

const BASELINE_VERSION = "composition-baseline-1";
const root = resolve(import.meta.dirname, "../..");
const baselineDirectory = join(root, "tests/visual/composition-baselines");
const manifestPath = join(baselineDirectory, "fixtures.json");
const environmentKey = `${platform}-${arch}`;
const baselinePath = join(baselineDirectory, `${environmentKey}.json`);
const hardwareReportPath = join(
  baselineDirectory,
  `hardware-preview-${environmentKey}.json`,
);
const timingPath = join(root, "benchmarks/composition-baseline.json");

type FixtureEntry = {
  id: string;
  family: string;
  kind: "scene" | "passage";
  path: string;
  tier: ToleranceTier;
  note?: string;
};
type FixtureManifest = {
  version: "composition-fixtures-1";
  sampleEvery: number;
  thumbnailWidth: number;
  fixtures: FixtureEntry[];
};
type RenderItem = {
  id: string;
  fixture: FixtureEntry;
  scene: IllustratedScene;
  assetPaths: Record<string, string>;
};
type BaselineItem = {
  fixture: string;
  family: string;
  path: string;
  tier: ToleranceTier;
  width: number;
  height: number;
  frameCount: number;
  /** SHA-256 over the concatenated full per-frame hashes. */
  sha256: string;
  /** First 16 hex digits of each frame's RGBA SHA-256, space-separated by frame. */
  frames: string;
  /** Sampled 8-bit RGB thumbnails, gzip + base64, keyed by frame. */
  thumbnails: Record<string, { width: number; height: number; rgb: string }>;
};
type BaselineFile = {
  version: typeof BASELINE_VERSION;
  renderer: "illustrated-canvas";
  browserArgs: readonly string[];
  renderEnvironment: RenderEnvironment;
  /** Machine that generated the file; a "VirtualApple" CPU means Rosetta emulation. */
  machine?: {
    cpu: string;
    logicalCores: number;
    platform: string;
    arch: string;
  };
  items: Record<string, BaselineItem>;
};

const args = argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1]?.split(",") : undefined;
};
const mode = args.includes("--write")
  ? "write"
  : args.includes("--compare-hardware")
    ? "compare-hardware"
    : args.includes("--compare-frames")
      ? "compare-frames"
      : args.includes("--list")
        ? "list"
        : "check";
const compareKey = option("--baseline")?.[0] ?? environmentKey;
const saveDirectory = option("--save-mismatches")?.[0];
const savedFrames = option("--compare-frames")?.[0];
const MAX_MISMATCH_UPLOADS = 6;

const manifest = JSON.parse(
  await readFile(manifestPath, "utf8"),
) as FixtureManifest;
if (manifest.version !== "composition-fixtures-1")
  throw new Error("Unknown fixture manifest version");
const only = option("--only");
const families = option("--family");
const selected = selectBaselineFixtures(manifest.fixtures, { only, families });

async function expand(fixture: FixtureEntry): Promise<RenderItem[]> {
  const path = join(root, fixture.path);
  if (fixture.kind === "scene") {
    const prepared = await loadPreparedScene(path);
    return [
      {
        id: fixture.id,
        fixture,
        scene: prepared.scene,
        assetPaths: prepared.assetPaths,
      },
    ];
  }
  const passage = await readStoryPassage(path);
  return Promise.all(
    passage.beats.map(async (beat) => ({
      id: `${fixture.id}/${beat.id}`,
      fixture,
      scene: compilePreparedScene(beat.scene),
      assetPaths: await validatePreparedAssets(beat.scene, dirname(path)),
    })),
  );
}

const sampleFrames = (frameCount: number) => {
  const frames = new Set([0, frameCount - 1]);
  for (let frame = 0; frame < frameCount; frame += manifest.sampleEvery)
    frames.add(frame);
  return [...frames].sort((a, b) => a - b);
};

/** First, middle and last frame: enough to see what changed, small enough to track. */
const thumbnailFrames = (frameCount: number) => [
  ...new Set([0, Math.floor((frameCount - 1) / 2), frameCount - 1]),
];

const contentType = (path: string) =>
  ({
    ".otf": "font/otf",
    ".ttf": "font/ttf",
    ".woff2": "font/woff2",
    ".svg": "image/svg+xml",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  })[extname(path).toLowerCase()] ?? "image/png";

const readBody = (incoming: IncomingMessage) =>
  new Promise<Buffer>((accept, reject) => {
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
    incoming.on("end", () => accept(Buffer.concat(chunks)));
    incoming.on("error", reject);
  });

function harnessPlugin(
  state: { assets: Record<string, string> },
  frameDirectory: string,
): Plugin {
  const fail = (response: ServerResponse, status: number, message: string) => {
    response.statusCode = status;
    response.end(message);
  };
  return {
    name: "still-shift-composition-baselines",
    configureServer(server) {
      server.middlewares.use((incoming, response, next) => {
        const url = new URL(incoming.url ?? "/", "http://localhost");
        if (url.pathname.startsWith("/_baseline/assets/")) {
          // /_baseline/assets/<item sequence>/<asset id>
          const id = url.pathname.split("/").at(-1) ?? "";
          const path = Object.hasOwn(state.assets, id)
            ? state.assets[id]
            : undefined;
          if (!path) return fail(response, 404, "Unknown asset");
          void stat(path).then(
            (file) => {
              response.statusCode = 200;
              response.setHeader("Cache-Control", "no-store");
              response.setHeader("Content-Type", contentType(path));
              response.setHeader("Content-Length", file.size);
              createReadStream(path).pipe(response);
            },
            (error: unknown) => fail(response, 500, String(error)),
          );
          return;
        }
        if (url.pathname !== "/_baseline/frame") return next();
        if (incoming.method !== "POST")
          return fail(response, 405, "POST required");
        const profile = url.searchParams.get("profile") ?? "";
        const item = url.searchParams.get("item") ?? "";
        const frame = url.searchParams.get("frame") ?? "";
        if (
          !/^(pinned|hardware|reference)$/.test(profile) ||
          !/^\d+$/.test(frame)
        )
          return fail(response, 400, "Invalid frame upload");
        void readBody(incoming)
          .then(async (bytes) => {
            const path = join(
              frameDirectory,
              profile,
              encodeURIComponent(item),
              `${frame}.rgba`,
            );
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, bytes);
            response.statusCode = 204;
            response.end();
          })
          .catch((error: unknown) => fail(response, 500, String(error)));
      });
    },
  };
}

type Session = {
  browser: Browser;
  page: Page;
  environment: RenderEnvironment;
};

async function openSession(
  baseUrl: string,
  profile: RenderBrowserProfile,
): Promise<Session> {
  const browser = await launchRenderBrowser({ profile });
  const page = await browser.newPage();
  await page.goto(
    new URL("/scripts/composition/baseline-page.html", baseUrl).href,
  );
  await page.waitForFunction(() => Boolean(window.runCompositionBaseline));
  const environment = await probeRenderEnvironment(page, profile);
  if (profile === "pinned") assertPinnedRenderEnvironment(environment);
  return { browser, page, environment };
}

let assetSequence = 0;
async function renderItem(
  session: Session,
  state: { assets: Record<string, string> },
  item: RenderItem,
  profile: RenderBrowserProfile,
  uploadSampleFrames: boolean,
  expectedFrames?: string[],
) {
  state.assets = item.assetPaths;
  await session.page.setViewportSize({
    width: item.scene.canvas.width,
    height: item.scene.canvas.height,
  });
  const options: BaselineRenderOptions = {
    sampleFrames: sampleFrames(item.scene.timeline.frameCount),
    thumbnailFrames: thumbnailFrames(item.scene.timeline.frameCount),
    thumbnailWidth: manifest.thumbnailWidth,
    uploadSampleFrames,
    ...(expectedFrames
      ? { expectedFrames, maxMismatchUploads: MAX_MISMATCH_UPLOADS }
      : {}),
    profile: expectedFrames ? "reference" : profile,
    item: item.id,
    assetBase: `/_baseline/assets/${++assetSequence}/`,
  };
  return session.page.evaluate(
    ({ scene, options }) => window.runCompositionBaseline!(scene, options),
    { scene: item.scene, options },
  ) as Promise<BaselineRenderResult>;
}

/** Baselines are per platform and architecture until CE0 shows they can be shared. */
async function readBaseline(path: string) {
  try {
    return JSON.parse(await readFile(path, "utf8")) as BaselineFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    throw new Error(
      `No composition baseline at ${path}. Baselines are per platform and architecture; see the GPU determinism policy in docs/composition-engine-plan.md before writing one with --write, or compare with another platform using --baseline.`,
      { cause: error },
    );
  }
}

/** Stable key order keeps full and partial writes diff-free. */
const sortedById = <T>(record: Record<string, T>) =>
  Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );

/** Generated files stay in the repository's Prettier format. */
const writeJson = async (path: string, value: unknown) =>
  writeFile(path, await format(JSON.stringify(value), { filepath: path }));

const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
};
const round = (value: number) => Math.round(value * 100) / 100;

const toBaselineItem = (
  item: RenderItem,
  result: BaselineRenderResult,
): BaselineItem => ({
  fixture: item.fixture.id,
  family: item.fixture.family,
  path: item.fixture.path,
  tier: item.fixture.tier,
  width: item.scene.canvas.width,
  height: item.scene.canvas.height,
  frameCount: item.scene.timeline.frameCount,
  sha256: `sha256:${createHash("sha256").update(result.frameHashes.join("")).digest("hex")}`,
  frames: result.frameHashes.map((hash) => hash.slice(0, 16)).join(" "),
  thumbnails: Object.fromEntries(
    result.thumbnails.map((thumbnail) => [
      String(thumbnail.frame),
      {
        width: thumbnail.width,
        height: thumbnail.height,
        rgb: gzipSync(Buffer.from(thumbnail.rgb, "base64"), {
          level: 9,
        }).toString("base64"),
      },
    ]),
  ),
});

function compareWithBaseline(
  stored: BaselineItem | undefined,
  actual: BaselineItem,
) {
  if (!stored) return "missing from baseline";
  if (stored.frameCount !== actual.frameCount)
    return `frame count ${actual.frameCount}, expected ${stored.frameCount}`;
  if (stored.width !== actual.width || stored.height !== actual.height)
    return `size ${actual.width}×${actual.height}, expected ${stored.width}×${stored.height}`;
  const storedFrames = stored.frames.split(" ");
  const differing = actual.frames
    .split(" ")
    .flatMap((hash, frame) => (hash === storedFrames[frame] ? [] : [frame]));
  if (!differing.length) return null;
  const listed = differing.slice(0, 8).join(", ");
  return `${differing.length} frame(s) differ: ${listed}${differing.length > 8 ? ", …" : ""}`;
}

/**
 * Renders the frames another environment saved (because they differed from this
 * environment's baseline) and classifies each pair. Items without saved frames matched
 * exactly on every frame.
 */
async function compareSavedFrames(
  session: Session,
  item: RenderItem,
  mismatch: { differingFrames: number; frames: number } | undefined,
) {
  if (!mismatch)
    return { observedTier: null, note: "item missing from the other run" };
  if (!mismatch.differingFrames)
    return {
      observedTier: "exact",
      differingFrames: 0,
      frames: mismatch.frames,
    };
  const itemDirectory = join(
    resolve(savedFrames!),
    "reference",
    encodeURIComponent(item.id),
  );
  const frames = (await readdir(itemDirectory))
    .map((name) => Number(name.replace(".rgba", "")))
    .sort((a, b) => a - b);
  state.assets = item.assetPaths;
  await session.page.setViewportSize({
    width: item.scene.canvas.width,
    height: item.scene.canvas.height,
  });
  const options: SampleRenderOptions = {
    sampleFrames: frames,
    profile: "pinned",
    item: item.id,
    assetBase: `/_baseline/assets/${++assetSequence}/`,
  };
  await session.page.evaluate(
    ({ scene, options }) => window.runCompositionSamples!(scene, options),
    { scene: item.scene, options },
  );
  const comparisons = await Promise.all(
    frames.map(async (frame) =>
      compareFrames(
        await readFile(
          join(
            frameDirectory,
            "pinned",
            encodeURIComponent(item.id),
            `${frame}.rgba`,
          ),
        ),
        await readFile(join(itemDirectory, `${frame}.rgba`)),
        item.scene.canvas.width,
        item.scene.canvas.height,
      ),
    ),
  );
  const minPsnr = Math.min(...comparisons.map((c) => c.psnr));
  return {
    observedTier: worstTier(comparisons.map(strictestTier)),
    differingFrames: mismatch.differingFrames,
    frames: mismatch.frames,
    comparedFrames: frames,
    maxChannelDelta: Math.max(...comparisons.map((c) => c.maxChannelDelta)),
    minPsnr: Number.isFinite(minPsnr) ? round(minPsnr) : "identical",
    minSsim:
      Math.round(Math.min(...comparisons.map((c) => c.ssim)) * 1e5) / 1e5,
  };
}

if (mode === "list") {
  for (const fixture of selected)
    console.log(
      `${fixture.id.padEnd(48)} ${fixture.family.padEnd(18)} ${fixture.tier.padEnd(10)} ${fixture.path}`,
    );
  exit(0);
}

// --write with --save-mismatches also compares, so one pass can write this
// platform's baseline and collect differences from another platform's.
const stored =
  mode === "check" || saveDirectory
    ? await readBaseline(join(baselineDirectory, `${compareKey}.json`))
    : undefined;
const renderItems: RenderItem[] = [];
for (const fixture of selected) renderItems.push(...(await expand(fixture)));
if (stored)
  assertBaselineInventory({
    storedItems: stored.items,
    renderItems,
    filters: { only, families },
  });

const frameDirectory = saveDirectory
  ? resolve(saveDirectory)
  : await mkdtemp(join(tmpdir(), "still-shift-baselines-"));
if (saveDirectory) await mkdir(frameDirectory, { recursive: true });
const machine = {
  cpu: cpus()[0]?.model ?? "unknown",
  logicalCores: availableParallelism(),
  platform,
  arch,
};
type SavedEnvironment = {
  renderEnvironment: RenderEnvironment;
  machine: typeof machine;
  comparedWith: string;
  mismatches: Record<string, { differingFrames: number; frames: number }>;
};
const saved: SavedEnvironment | undefined = savedFrames
  ? (JSON.parse(
      await readFile(join(resolve(savedFrames), "environment.json"), "utf8"),
    ) as SavedEnvironment)
  : undefined;
if (saved && saved.comparedWith !== environmentKey)
  throw new Error(
    `Saved frames were compared with ${saved.comparedWith}; run --compare-frames on that environment`,
  );
const state = { assets: {} as Record<string, string> };
let server: ViteDevServer | undefined;
const sessions: Session[] = [];
let failed = false;
try {
  server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [harnessPlugin(state, frameDirectory)],
    server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local[0];
  if (!baseUrl) throw new Error("Baseline server has no local URL");
  const pinned = await openSession(baseUrl, "pinned");
  sessions.push(pinned);
  const hardware =
    mode === "compare-hardware"
      ? await openSession(baseUrl, "hardware")
      : undefined;
  if (hardware) sessions.push(hardware);
  console.log(
    `renderer: ${pinned.environment.webglRenderer}\nfingerprint: ${pinned.environment.rasterFingerprint} (${environmentKey})`,
  );
  if (hardware)
    console.log(`hardware preview: ${hardware.environment.webglRenderer}`);

  const mismatches: SavedEnvironment["mismatches"] = {};
  const platformReport: Record<string, unknown> = {};
  if (
    stored &&
    stored.renderEnvironment.rasterFingerprint !==
      pinned.environment.rasterFingerprint
  )
    console.warn(
      `warning: raster fingerprint differs from the baseline (${stored.renderEnvironment.rasterFingerprint}); frame differences may come from the environment`,
    );

  const items: Record<string, BaselineItem> = {};
  const timings: Record<string, unknown> = {};
  const hardwareReport: Record<string, unknown> = {};
  const started = performance.now();
  for (const item of renderItems) {
    const itemStart = performance.now();
    if (saved) {
      platformReport[item.id] = await compareSavedFrames(
        pinned,
        item,
        saved.mismatches[item.id],
      );
      console.log(
        `${item.id.padEnd(52)} ${String(item.scene.timeline.frameCount).padStart(4)}f ${(platformReport[item.id] as { observedTier: string | null }).observedTier ?? "none"}`,
      );
      continue;
    }
    const result = await renderItem(
      pinned,
      state,
      item,
      "pinned",
      mode === "compare-hardware",
      saveDirectory ? stored?.items[item.id]?.frames.split(" ") : undefined,
    );
    const baselineItem = toBaselineItem(item, result);
    items[item.id] = baselineItem;
    const totalMs = result.renderMs.map(
      (render, frame) => render + result.readbackMs[frame]!,
    );
    const average = (values: number[]) =>
      round(values.reduce((a, b) => a + b, 0) / values.length);
    timings[item.id] = {
      width: baselineItem.width,
      height: baselineItem.height,
      frames: baselineItem.frameCount,
      frameAverageMs: average(totalMs),
      frameP95Ms: round(percentile(totalMs, 0.95)),
      renderAverageMs: average(result.renderMs),
      readbackAverageMs: average(result.readbackMs),
    };
    let status = "";
    if (stored) {
      const problem = compareWithBaseline(stored.items[item.id], baselineItem);
      if (problem && mode === "check") failed = true;
      status = problem ? `FAIL ${problem}` : "ok";
      const storedFrames = stored.items[item.id]?.frames.split(" ");
      mismatches[item.id] = {
        frames: baselineItem.frameCount,
        differingFrames: baselineItem.frames
          .split(" ")
          .filter((hash, frame) => hash !== storedFrames?.[frame]).length,
      };
    }
    if (hardware) {
      state.assets = item.assetPaths;
      await hardware.page.setViewportSize({
        width: item.scene.canvas.width,
        height: item.scene.canvas.height,
      });
      const sampleOptions: SampleRenderOptions = {
        sampleFrames: sampleFrames(item.scene.timeline.frameCount),
        profile: "hardware",
        item: item.id,
        assetBase: `/_baseline/assets/${++assetSequence}/`,
      };
      await hardware.page.evaluate(
        ({ scene, options }) => window.runCompositionSamples!(scene, options),
        { scene: item.scene, options: sampleOptions },
      );
      const comparisons = await Promise.all(
        sampleFrames(item.scene.timeline.frameCount).map(async (frame) => {
          const read = (profile: string) =>
            readFile(
              join(
                frameDirectory,
                profile,
                encodeURIComponent(item.id),
                `${frame}.rgba`,
              ),
            );
          return compareFrames(
            await read("pinned"),
            await read("hardware"),
            item.scene.canvas.width,
            item.scene.canvas.height,
          );
        }),
      );
      await rm(join(frameDirectory, "pinned", encodeURIComponent(item.id)), {
        recursive: true,
      });
      await rm(join(frameDirectory, "hardware", encodeURIComponent(item.id)), {
        recursive: true,
      });
      const observed = worstTier(comparisons.map(strictestTier));
      const minPsnr = Math.min(...comparisons.map((c) => c.psnr));
      hardwareReport[item.id] = {
        observedTier: observed,
        assignedTier: item.fixture.tier,
        sampledFrames: comparisons.length,
        maxChannelDelta: Math.max(...comparisons.map((c) => c.maxChannelDelta)),
        // JSON cannot represent Infinity, the PSNR of identical frames.
        minPsnr: Number.isFinite(minPsnr) ? round(minPsnr) : "identical",
        minSsim:
          Math.round(Math.min(...comparisons.map((c) => c.ssim)) * 1e5) / 1e5,
      };
      status = `hardware ${observed ?? "none"}`;
    }
    console.log(
      `${item.id.padEnd(52)} ${String(baselineItem.frameCount).padStart(4)}f ${Math.round(
        performance.now() - itemStart,
      )
        .toString()
        .padStart(6)}ms ${status}`,
    );
  }
  const elapsedSeconds = round((performance.now() - started) / 1000);
  const itemCount = Object.keys(items).length;
  const frameCount = Object.values(items).reduce((n, i) => n + i.frameCount, 0);
  console.log(`${itemCount} items, ${frameCount} frames in ${elapsedSeconds}s`);

  if (mode === "write") {
    const partial = Boolean(only || families);
    // A partial write merges into this platform's baseline, if one exists yet.
    const previous =
      partial && (await stat(baselinePath).catch(() => undefined))
        ? await readBaseline(baselinePath)
        : undefined;
    const file: BaselineFile = {
      version: BASELINE_VERSION,
      renderer: "illustrated-canvas",
      browserArgs: RENDER_BROWSER_ARGS,
      renderEnvironment: pinned.environment,
      machine,
      items: sortedById({ ...previous?.items, ...items }),
    };
    await writeJson(baselinePath, file);
    const previousTimings = partial
      ? (
          JSON.parse(await readFile(timingPath, "utf8")) as {
            items: Record<string, unknown>;
          }
        ).items
      : {};
    await writeJson(timingPath, {
      version: BASELINE_VERSION,
      note: "Machine-specific timings for the CE0 acceptance fixtures; compare only with runs on similar hardware. frame* is render plus pixel readback: Canvas 2D records commands in renderFrame and rasterises lazily, so most drawing cost appears in readback.",
      machine,
      renderEnvironment: pinned.environment,
      items: sortedById({ ...previousTimings, ...timings }),
    });
    console.log(`wrote ${baselinePath}\nwrote ${timingPath}`);
  }
  if (mode === "compare-hardware") {
    const previousReport =
      only || families
        ? (
            JSON.parse(await readFile(hardwareReportPath, "utf8")) as {
              items: Record<string, unknown>;
            }
          ).items
        : {};
    await writeJson(hardwareReportPath, {
      version: BASELINE_VERSION,
      tolerance: FRAME_TOLERANCE_VERSION,
      method:
        "Each sampled frame is rendered on a fresh canvas and read back once, because Chromium moves a canvas off the GPU after repeated readbacks.",
      pinned: pinned.environment,
      hardware: hardware!.environment,
      items: sortedById({ ...previousReport, ...hardwareReport }),
    });
    console.log(`wrote ${hardwareReportPath}`);
  }
  if (saveDirectory) {
    await writeJson(join(frameDirectory, "environment.json"), {
      renderEnvironment: pinned.environment,
      machine,
      comparedWith: compareKey,
      mismatches,
    } satisfies SavedEnvironment);
    console.log(`saved differing frames in ${frameDirectory}`);
  }
  if (saved) {
    const other = `${saved.renderEnvironment.platform}-${saved.renderEnvironment.arch}`;
    const reportPath = join(
      baselineDirectory,
      `platform-${other}-vs-${environmentKey}.json`,
    );
    await writeJson(reportPath, {
      version: BASELINE_VERSION,
      tolerance: FRAME_TOLERANCE_VERSION,
      method: `Frames were rendered on ${other}, checked against the ${environmentKey} baseline, and every differing frame's first occurrence plus differing sampled frames (up to ${MAX_MISMATCH_UPLOADS} per item) were saved at full resolution, then compared with the same frames rendered here.`,
      reference: { renderEnvironment: pinned.environment, machine },
      other: {
        renderEnvironment: saved.renderEnvironment,
        machine: saved.machine,
      },
      items: sortedById(platformReport),
    });
    console.log(`wrote ${reportPath}`);
  }
  if (failed) console.error("Baseline check failed");
} finally {
  for (const session of sessions)
    await session.browser.close().catch(() => undefined);
  await server?.close();
  if (!saveDirectory)
    await rm(frameDirectory, { recursive: true, force: true });
}
exit(failed ? 1 : 0);
