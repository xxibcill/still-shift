// ET2: pixel lint over a 60 s video stays inside `mediaLimits`, and cancelling
// it leaves no temporary cache
// (docs/editorial-typography-improvement-plan.md#et2--pixel-lint-over-native-video).
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { subscribe, unsubscribe } from "node:diagnostics_channel";
import type { IncomingMessage } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { lintCompositionFile } from "@still-shift/animation-engine";
import type { CompositionMediaLimits } from "@still-shift/scene-contract";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import {
  directoryBytes,
  generateLongClip,
  lintTemporaryEntries,
  longClipComposition,
  mediaCacheTransientEntries,
  type LongClip,
} from "../helpers/editorial-video-lint.ts";

async function until(
  condition: () => Promise<boolean>,
  settled: () => boolean,
  timeout = 60_000,
) {
  const deadline = performance.now() + timeout;
  while (!settled() && !(await condition())) {
    if (performance.now() > deadline)
      throw new Error("Timed out waiting for lint progress");
    await delay(25);
  }
}

const rejectsWith = async (
  work: Promise<unknown>,
  expected: readonly [code: string, path: string][],
) =>
  assert.rejects(work, (error: unknown) => {
    assert.deepEqual(
      passageDiagnostics(error).map((d) => [d.code, d.path]),
      expected,
    );
    return true;
  });

export async function verifyLongVideoLint() {
  const directory = await mkdtemp(join(tmpdir(), "et2-long-video-lint-"));
  // A private temporary root, so lint runs elsewhere on the machine cannot
  // make the leftover checks flaky. tmpdir() reads TMPDIR on every call, and
  // the browser and FFmpeg inherit it.
  const previousTmpdir = process.env.TMPDIR;
  process.env.TMPDIR = join(directory, "tmp");
  await mkdir(process.env.TMPDIR);
  const tempBefore = await lintTemporaryEntries();
  const newTemporary = async () =>
    (await lintTemporaryEntries()).filter((name) => !tempBefore.includes(name));
  try {
    const clip = await generateLongClip(directory, {
      width: 270,
      height: 480,
      seconds: 60,
    });
    await mkdir(join(directory, "again"));
    assert.equal(
      (
        await generateLongClip(join(directory, "again"), {
          width: 270,
          height: 480,
          seconds: 60,
        })
      ).sha256,
      clip.sha256,
      "ET2: long clip regenerates byte-identically",
    );
    const frameBytes = clip.width * clip.height * 4;
    const input = async (name: string, limits?: CompositionMediaLimits) => {
      const path = join(directory, `${name}.json`);
      await writeFile(
        path,
        JSON.stringify(await longClipComposition(clip, limits)),
      );
      return path;
    };

    // Bounded lint: three decoded frames may be resident at once.
    const cache = join(directory, "cache");
    const bounded = await input("bounded", {
      decodedFrameBytes: frameBytes * 3,
    });
    const started = performance.now();
    const report = await lintCompositionFile(
      bounded,
      {},
      {
        pixels: true,
        cacheDirectory: cache,
        collectTextBounds: true,
        collectMediaStatistics: true,
      },
    );
    const lintMs = Math.round(performance.now() - started);
    assert.equal(report.measured.pixels, true);
    assert.equal(report.measured.textBounds, true);
    assert.ok(
      !report.diagnostics.some(
        (d) => d.code === "frozen-pixels" || d.code === "frozen-run",
      ),
      "ET2: moving long clip is not frozen",
    );
    const media = report.mediaStatistics!;
    assert.equal(media.decodedFrameBytesLimit, frameBytes * 3);
    assert.equal(media.decodedFrames, clip.frameCount);
    assert.ok(media.peakDecodedBytes <= media.decodedFrameBytesLimit);
    assert.ok(media.evictions >= clip.frameCount - 3);
    assert.deepEqual(await mediaCacheTransientEntries(cache), []);
    const preparedCacheBytes = await directoryBytes(cache);
    assert.deepEqual(await newTemporary(), []);

    // Declared limits reject before any frame is decoded or staged.
    const required = clip.frameCount * (frameBytes + clip.height + 1024);
    const tightCache = join(directory, "cache-tight");
    await rejectsWith(
      lintCompositionFile(
        await input("tight", { decodedCacheBytes: required - 1 }),
        {},
        { pixels: true, cacheDirectory: tightCache },
      ),
      [["comp-media-limit", "long-clip"]],
    );
    assert.deepEqual(
      await readdir(tightCache).catch(() => []),
      [],
      "ET2: rejected preparation writes nothing",
    );
    await rejectsWith(
      lintCompositionFile(
        await input("short", { maxDurationSeconds: 59 }),
        {},
        { pixels: true, cacheDirectory: tightCache },
      ),
      [
        ["comp-media-limit", "frameCount"],
        ["comp-media-limit", "assets[1]"],
      ],
    );
    assert.deepEqual(await newTemporary(), []);

    // `armed` resolves once it has aborted the lint at the phase it waits for.
    const cancel = async (
      cacheDirectory: string,
      armed: (abort: () => void, finished: () => boolean) => Promise<void>,
    ) => {
      const controller = new AbortController();
      const reason = new Error("ET2 cancellation probe");
      const work = lintCompositionFile(
        bounded,
        {},
        { pixels: true, cacheDirectory, signal: controller.signal },
      );
      let finished = false;
      const watched = work.then(
        () => void (finished = true),
        () => void (finished = true),
      );
      await Promise.race([
        armed(
          () => controller.abort(reason),
          () => finished,
        ),
        watched,
      ]);
      // A lint that finished before its phase was reached fails here.
      await assert.rejects(work, (error: unknown) => error === reason);
      assert.deepEqual(await mediaCacheTransientEntries(cacheDirectory), []);
      assert.deepEqual(await newTemporary(), []);
    };
    // During FFmpeg decoding into the staging directory.
    const coldCache = join(directory, "cache-cold");
    await cancel(coldCache, async (abort, finished) => {
      await until(
        async () =>
          (await mediaCacheTransientEntries(coldCache)).some((name) =>
            name.startsWith(".prepare-"),
          ),
        finished,
      );
      abort();
    });
    assert.deepEqual(
      await readdir(coldCache),
      [],
      "ET2: cancelled preparation publishes no entry",
    );
    // While the browser lints frames from the warm cache. The lint server is
    // in this process, so the abort comes from its request for one frame of
    // the clip: the lint is mid-run whatever the machine's speed.
    const cancelAtFrame = 48;
    const framesRequested = new Set<number>();
    let atFrame: (() => void) | undefined;
    const onRequest = (message: unknown) => {
      const frame = /^\/_lint\/assets\/__media%3Along-clip%3A(\d+)$/.exec(
        (message as { request: IncomingMessage }).request.url ?? "",
      );
      if (!frame) return;
      framesRequested.add(Number(frame[1]));
      if (Number(frame[1]) === cancelAtFrame) atFrame?.();
    };
    subscribe("http.server.request.start", onRequest);
    try {
      await cancel(
        cache,
        (abort) =>
          new Promise<void>((resolve) => {
            atFrame = () => {
              abort();
              resolve();
            };
          }),
      );
    } finally {
      unsubscribe("http.server.request.start", onRequest);
    }
    assert.ok(
      framesRequested.has(cancelAtFrame) &&
        Math.max(...framesRequested) < clip.frameCount - 1,
      `ET2: browser lint stopped mid-clip (last frame requested ${Math.max(...framesRequested)})`,
    );
    assert.equal(
      await directoryBytes(cache),
      preparedCacheBytes,
      "ET2: the bounded reusable cache is unchanged by cancellation",
    );
    // O4 transport regression at proof scale: high-entropy 1080×1920 frames
    // whose prepared PNGs total more than 512 MiB, about the proof's 513 MB.
    // Inlining them into one page payload (the pre-6ed1a5d0 lint) fails with
    // "Execution context was destroyed"; streamed frames lint normally.
    const noisy = await generateLongClip(directory, {
      width: 1080,
      height: 1920,
      seconds: 4,
      noise: 48,
    });
    const noisyCache = join(directory, "cache-noisy");
    const noisyInput = join(directory, "noisy.json");
    await writeFile(
      noisyInput,
      JSON.stringify(await longClipComposition(noisy)),
    );
    const noisyStarted = performance.now();
    const noisyReport = await lintCompositionFile(
      noisyInput,
      {},
      {
        pixels: true,
        cacheDirectory: noisyCache,
        collectMediaStatistics: true,
      },
    );
    const proofScaleLintMs = Math.round(performance.now() - noisyStarted);
    assert.equal(noisyReport.measured.pixels, true);
    assert.equal(noisyReport.measured.textBounds, true);
    assert.equal(noisyReport.mediaStatistics!.decodedFrames, noisy.frameCount);
    assert.ok(
      noisyReport.mediaStatistics!.peakDecodedBytes <=
        noisyReport.mediaStatistics!.decodedFrameBytesLimit,
    );
    const proofScaleBytes = await directoryBytes(noisyCache);
    assert.ok(
      proofScaleBytes > 512 * 1024 ** 2,
      `ET2: proof-scale payload must stay above 512 MiB (${proofScaleBytes})`,
    );
    assert.deepEqual(await newTemporary(), []);
    return {
      proofScale: {
        clip: summary(noisy),
        lintMs: proofScaleLintMs,
        preparedCacheBytes: proofScaleBytes,
      },
      clip: summary(clip),
      lintMs,
      decodedFrameBytesLimit: media.decodedFrameBytesLimit,
      peakDecodedBytes: media.peakDecodedBytes,
      decodedFrames: media.decodedFrames,
      evictions: media.evictions,
      preparedCacheBytes,
      cancelled: ["prepare", "browser"],
    };
  } finally {
    if (previousTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previousTmpdir;
    await rm(directory, { recursive: true, force: true });
  }
}

const summary = (clip: LongClip) => ({
  width: clip.width,
  height: clip.height,
  frameCount: clip.frameCount,
  sha256: clip.sha256,
  bytes: clip.bytes,
});
