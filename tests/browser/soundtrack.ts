import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import {
  readSoundtrackProject,
  saveSoundtrackEdits,
  soundtrackChecksum,
  prepareStoryPassageInput,
  writePreparedPassage,
  renderStoryPassage,
  renderSoundtrackProject,
} from "@still-shift/animation-engine";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import type { SoundtrackProject } from "@still-shift/scene-contract";

// This test uses generated signals in a fresh ignored directory, never episode media.
const results = resolve("benchmarks/results/composition-ce16");
await mkdir(results, { recursive: true });
const root = await mkdtemp(join(results, "browser-"));
const projectPath = join(root, "project.json");
const projectRelative = relative(resolve("."), projectPath);
const durationSamples = 384000;
for (const [id, expression] of [
  ["voice", "if(between(t,0.25,1)+between(t,4,5),0.3*sin(2*PI*220*t),0)"],
  ["music", "0.04*sin(2*PI*110*t)"],
  ["effect", "if(eq(n,100),0.7,0)"],
])
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "aevalsrc='" + expression + "':s=48000:d=8",
    "-c:a",
    "pcm_f32le",
    join(root, id + ".wav"),
  ]);
const project: SoundtrackProject = {
  schemaVersion: "soundtrack-project-1",
  revision: 0,
  history: { undo: [], redo: [] },
  sampleRate: 48000,
  channels: 2,
  durationSamples,
  channelConversion: "mono-duplicate-stereo-preserve",
  normalization: "none",
  tailPolicy: "retain-to-project-end",
  assets: await Promise.all(
    ["voice", "music", "effect"].map(async (id) => ({
      id,
      path: id + ".wav",
      sha256: await soundtrackChecksum(join(root, id + ".wav")),
    })),
  ),
  tracks: ["voice", "music", "effect"].map((id, i) => ({
    id,
    role: (["narration", "bgm", "sfx"] as const)[i]!,
    output: "master",
    gainDb: 0,
    mute: false,
    solo: false,
    processors:
      i === 2
        ? [{ type: "lowpass" as const, frequencyHz: 5500, q: Math.SQRT1_2 }]
        : [],
  })),
  clips: ["voice", "music", "effect"].map((id, i) => ({
    id: id + "-clip",
    asset: id,
    track: id,
    sourceStartSample: 0,
    sourceEndSample: i === 2 ? 4800 : durationSamples,
    startSample: i === 2 ? 96000 : 0,
    gainDb: 0,
    fadeInSamples: 0,
    fadeOutSamples: 0,
    automation: { interpolation: "linear", points: [] },
  })),
  buses: [],
  master: { id: "master", gainDb: 0 },
  ducking: {
    method: "peak-window-attack-hold-release-1",
    sourceTrack: "voice",
    targetTracks: ["music"],
    thresholdDb: -24,
    attenuationDb: -12,
    windowSamples: 480,
    attackSamples: 480,
    releaseSamples: 4800,
    holdSamples: 2400,
    lookaheadSamples: 480,
  },
};
await writeFile(projectPath, JSON.stringify(project));
const fixture = resolve(
  "benchmarks/fixtures/story-authoring/linked-comparison.json",
);
const plan = JSON.parse(await readFile(fixture, "utf8"));
plan.narration = {
  reference: "synthetic browser verification signal",
  sha256: project.assets[0]!.sha256.replace(/^sha256:/, ""),
};
plan.beats = plan.beats.slice(0, 1);
plan.beats[0].template = resolve(dirname(fixture), plan.beats[0].template);
const planPath = join(root, "passage.json");
await writeFile(planPath, JSON.stringify(plan));
const passage = await prepareStoryPassageInput(plan, planPath);
assert.equal(passage.frameCount, 192);

const server = await createServer({
  configFile: resolve("apps/lab/vite.config.ts"),
  server: { port: 0, strictPort: false, watch: null },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const evidence: Record<string, unknown> = {
  root,
  browserVerification: "owner-authorized one-time pass",
};
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(30000);
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
  await page.addInitScript("window.__name = (fn) => fn;");
  const origin = server.resolvedUrls!.local[0]!;
  await page.goto(origin + "soundtrack.html");
  await page.locator("#path").fill(projectRelative);
  await page.locator("#load button").click();
  let revision = 0;
  const ready = () =>
    page.waitForFunction(
      (r) =>
        document
          .querySelector("#status")
          ?.textContent?.includes("Revision " + r + " ·") &&
        !document.querySelector<HTMLButtonElement>("#render")!.disabled,
      revision,
    );
  await ready();
  assert.equal(await page.locator(".track").count(), 3);
  assert.equal(await page.locator(".clip").count(), 3);
  const change = async (action: () => Promise<unknown>) => {
    await action();
    revision++;
    await ready();
    assert.equal((await readSoundtrackProject(projectPath)).revision, revision);
    assert.equal(await page.locator("#error").innerText(), "");
  };
  // Changing the editable path field cannot redirect edits of the loaded project.
  await page.locator("#path").fill("missing-project.json");
  await page.locator("#clip").selectOption("effect-clip");
  await page.locator("#start").fill("120000");
  await page.locator("#gain").fill("-6");
  await page.locator("#source-end").fill("7200");
  const automation = {
    interpolation: "hold",
    points: [
      { sample: 0, gain: 1 },
      { sample: 2400, gain: 0.5 },
      { sample: 4800, gain: 1 },
    ],
  };
  await page.locator("#automation").fill(JSON.stringify(automation));
  const original = (await readSoundtrackProject(projectPath)).clips[2]!;
  await change(() => page.locator("#clip-edit button").click());
  const edited = (await readSoundtrackProject(projectPath)).clips[2]!;
  assert.equal(edited.startSample, 120000);
  assert.equal(edited.gainDb, -6);
  assert.equal(edited.sourceEndSample, 7200);
  assert.deepEqual(edited.automation, automation);
  assert.equal(
    (await page
      .locator(".track")
      .nth(2)
      .locator("polyline")
      .getAttribute("points"))!.split(" ").length,
    6,
  );
  // One Apply is one undo step: move, gain, trim and automation revert together.
  await change(() => page.locator("#undo").click());
  assert.deepEqual(
    (await readSoundtrackProject(projectPath)).clips[2]!,
    original,
  );
  await change(() => page.locator("#redo").click());
  assert.deepEqual(
    (await readSoundtrackProject(projectPath)).clips[2]!,
    edited,
  );
  for (const kind of ["mute", "solo"])
    for (const checked of [true, false]) {
      await change(() =>
        page
          .locator(".track")
          .nth(2)
          .getByLabel(kind, { exact: true })
          .setChecked(checked),
      );
      assert.equal(
        (await readSoundtrackProject(projectPath)).tracks[2]![
          kind as "mute" | "solo"
        ],
        checked,
      );
    }
  await change(async () => {
    const gain = page.locator(".track").nth(2).getByLabel("Gain dB");
    await gain.fill("-4");
    await gain.press("Tab");
  });
  assert.equal(
    (await readSoundtrackProject(projectPath)).tracks[2]!.gainDb,
    -4,
  );
  await page.locator("#render").click();
  await page.waitForFunction(
    () => !document.querySelector<HTMLAudioElement>("#preview")!.hidden,
    undefined,
    { timeout: 120000 },
  );
  const mixUrl = await page.locator("#download").getAttribute("href");
  assert.ok(mixUrl);
  await page.waitForFunction(
    () => document.querySelector<HTMLAudioElement>("#preview")!.readyState >= 2,
  );
  const decoded = await page.evaluate(async (url) => {
    const bytes = await (await fetch(url)).arrayBuffer();
    const context = new AudioContext({ sampleRate: 48000 });
    try {
      const buffer = await context.decodeAudioData(bytes.slice(0));
      const view = new DataView(bytes);
      let offset = 12;
      while (
        String.fromCharCode(...new Uint8Array(bytes, offset, 4)) !== "data"
      )
        offset +=
          8 +
          view.getUint32(offset + 4, true) +
          (view.getUint32(offset + 4, true) % 2);
      const count = view.getUint32(offset + 4, true) / 8;
      offset += 8;
      let differingSamples = 0,
        maxSampleError = 0;
      for (let ch = 0; ch < 2; ch++) {
        const samples = buffer.getChannelData(ch);
        for (let i = 0; i < count; i++) {
          const error = Math.abs(
            samples[i]! - view.getFloat32(offset + (i * 2 + ch) * 4, true),
          );
          if (error !== 0) differingSamples++;
          maxSampleError = Math.max(maxSampleError, error);
        }
      }
      return {
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        samplesPerChannel: buffer.length,
        differingSamples,
        maxSampleError,
      };
    } finally {
      await context.close();
    }
  }, mixUrl);
  evidence.nativeDecode = decoded;
  assert.deepEqual(decoded, {
    sampleRate: 48000,
    channels: 2,
    samplesPerChannel: durationSamples,
    differingSamples: 0,
    maxSampleError: 0,
  });
  await page.locator("#preview").evaluate(async (audio: HTMLAudioElement) => {
    audio.currentTime = 2.5;
    await audio.play();
  });
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLAudioElement>("#preview")!.currentTime > 2.6,
  );
  await page
    .locator("#preview")
    .evaluate((audio: HTMLAudioElement) => audio.pause());
  const peaksPresent = await page
    .locator(".track canvas")
    .nth(2)
    .evaluate((canvas: HTMLCanvasElement) =>
      canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height)
        .data.some((value) => value !== 0),
    );
  assert.equal(peaksPresent, true);
  await change(() => page.locator("#undo").click());
  assert.equal(await page.locator("#preview").isHidden(), true);
  assert.equal(await page.locator("#preview").getAttribute("src"), null);
  assert.equal(await page.locator("#download").isHidden(), true);
  assert.equal(
    (await page.request.get(new URL(mixUrl, origin).href)).status(),
    409,
  );
  // External CLI/library changes cause a stale editor error and preserve saved bytes.
  await saveSoundtrackEdits(projectPath, revision, [
    { type: "gain", target: "effect-clip", gainDb: -9 },
  ]);
  const saved = await readFile(projectPath);
  await page.locator("#redo").click();
  await page.waitForFunction(
    () => !!document.querySelector("#error")!.textContent,
  );
  assert.deepEqual(await readFile(projectPath), saved);
  await page.locator("#path").fill(projectRelative);
  await page.locator("#load button").click();
  revision += 1;
  await ready();
  evidence.editor = {
    savedRevision: revision,
    edits: [
      "move",
      "gain",
      "trim",
      "hold automation",
      "mute",
      "solo",
      "undo",
      "redo",
    ],
    staleEditRejected: true,
    previewInvalidated: true,
  };
  await page.screenshot({ path: join(root, "timeline.png"), fullPage: true });

  // Exercise the actual passage attachment, decoder, shared clock, seeking and clear.
  await page.addInitScript(`(() => {
    const create = AudioContext.prototype.createBufferSource;
    window.nativeStarts = [];
    AudioContext.prototype.createBufferSource = function () {
      const source = create.call(this), start = source.start;
      source.start = function (...args) {
        window.nativeStarts.push({ args, length: this.buffer.length, rate: this.buffer.sampleRate, channels: this.buffer.numberOfChannels });
        return start.apply(this, args);
      };
      return source;
    };
  })()`);
  await page.goto(
    origin +
      "passage.html?plan=" +
      encodeURIComponent(relative(resolve("."), planPath)),
  );
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("192 frames"),
  );
  await page
    .locator("details")
    .filter({ has: page.locator("#soundtrack-load") })
    .locator("summary")
    .click();
  await page.locator("#soundtrack-project").fill(projectRelative);
  await page.locator("#soundtrack-load").click();
  await page.waitForFunction(
    (r) =>
      document
        .querySelector("#soundtrack-status")
        ?.textContent?.includes("revision " + r + " ·") ||
      !!document.querySelector("#errors")!.textContent,
    revision,
    { timeout: 120000 },
  );
  assert.equal(await page.locator("#errors").innerText(), "");
  assert.match(
    await page.locator("#soundtrack-status").innerText(),
    /Rendered soundtrack revision/,
  );
  console.log("Real editor, exact native PCM and passage attachment passed.");
  await page.locator("#scrub").evaluate((slider: HTMLInputElement) => {
    slider.value = "60";
    slider.dispatchEvent(new Event("input"));
  });
  await page.locator("#play").click();
  await page.waitForFunction(
    () =>
      (window as unknown as { nativeStarts: unknown[] }).nativeStarts.length >
      0,
  );
  await page.locator("#play").click();
  const starts = await page.evaluate(
    () =>
      (
        window as unknown as {
          nativeStarts: {
            args: number[];
            length: number;
            rate: number;
            channels: number;
          }[];
        }
      ).nativeStarts,
  );
  assert.equal(starts[0]!.length, durationSamples);
  assert.equal(starts[0]!.rate, 48000);
  assert.equal(starts[0]!.channels, 2);
  assert.equal(starts[0]!.args[1], 2.5);
  assert.equal(starts[0]!.args[2], 5.5);
  await page.locator("#soundtrack-clear").click();
  await page.locator("#play").click();
  await page.waitForTimeout(100);
  await page.locator("#play").click();
  assert.equal(
    (
      await page.evaluate(
        () => (window as unknown as { nativeStarts: unknown[] }).nativeStarts,
      )
    ).length,
    starts.length,
  );
  evidence.passagePreview = {
    savedRevision: revision,
    starts,
    clearReturnsToLegacy: true,
  };
  assert.deepEqual(errors, []);

  // Verify real picture/mux audio against independent canonical renders and matching AAC encoding.
  const cacheDirectory = join(root, "picture-cache");
  const full = join(root, "export-full"),
    rangeDir = join(root, "export-range");
  await writePreparedPassage(full, passage);
  await writePreparedPassage(rangeDir, passage);
  const fullReport = await renderStoryPassage(full, passage, undefined, {
    soundtrackProject: projectPath,
    cacheDirectory,
  });
  const rangeReport = await renderStoryPassage(rangeDir, passage, undefined, {
    soundtrackProject: projectPath,
    cacheDirectory,
    range: { start: 60, end: 84 },
  });
  assert.equal(fullReport.frameCount, 192);
  assert.equal(rangeReport.frameCount, 24);
  assert.ok(
    fullReport.video.streams.some((stream) => stream.codec_type === "audio"),
  );
  assert.ok(
    rangeReport.video.streams.some((stream) => stream.codec_type === "audio"),
  );
  const pcm = async (path: string) => {
    const { stdout } = await runProcess("ffmpeg", [
      "-v",
      "error",
      "-i",
      path,
      "-map",
      "0:a:0",
      "-c:a",
      "pcm_f32le",
      "-f",
      "hash",
      "-hash",
      "sha256",
      "-",
    ]);
    return stdout;
  };
  const expectedFull = join(root, "expected-full"),
    expectedRange = join(root, "expected-range");
  await renderSoundtrackProject(projectPath, expectedFull);
  await renderSoundtrackProject(projectPath, expectedRange, {
    range: { start: 120000, end: 168000 },
  });
  // Compare range to the full mix cropped at the same end-exclusive sample window.
  const cropped = join(root, "expected-range.wav");
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-i",
    join(expectedFull, "audio/mix.wav"),
    "-af",
    "atrim=start_sample=120000:end_sample=168000,asetpts=PTS-STARTPTS",
    "-c:a",
    "pcm_f32le",
    cropped,
  ]);
  assert.equal(
    await pcm(cropped),
    await pcm(join(expectedRange, "audio/mix.wav")),
  );
  const deliveryHashes: Record<string, string> = {};
  for (const [name, expected, delivery, seconds] of [
    ["full", expectedFull, full, 8],
    ["range", expectedRange, rangeDir, 1],
  ] as const) {
    const encoded = join(root, name + "-expected.m4a");
    await runProcess("ffmpeg", [
      "-v",
      "error",
      "-i",
      join(expected, "audio/mix.wav"),
      "-filter_complex",
      "[0:a:0]anull[a]",
      "-map",
      "[a]",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-t",
      String(seconds),
      encoded,
    ]);
    const expectedHash = await pcm(encoded),
      actualHash = await pcm(join(delivery, "passage.mp4"));
    assert.equal(
      actualHash,
      expectedHash,
      name + " mux audio matches independent canonical encode",
    );
    deliveryHashes[name] = actualHash.trim();
  }
  evidence.passageExport = {
    fullFrames: fullReport.frameCount,
    rangeFrames: rangeReport.frameCount,
    rangePCMExact: true,
    deliveryDecodeMatchesIndependentEncode: deliveryHashes,
    revision,
  };
  evidence.ok = true;
  console.log(
    "CE16 browser verification passed: real saved edits, exact native PCM, playback/seek/clear, passage full/range mux. Artifacts: " +
      root,
  );
} finally {
  await writeFile(
    join(root, "results.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  await browser?.close();
  await server.close();
}
