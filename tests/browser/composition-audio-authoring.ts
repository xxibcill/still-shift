import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, relative } from "node:path";
import { createServer } from "vite";
import type { Browser } from "playwright";
import {
  compositionPcmBoundary,
  type Composition,
} from "@still-shift/scene-contract";
import {
  loadComposition,
  probeCompositionVideo,
  renderComposition,
} from "@still-shift/animation-engine";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";
import { compositionApi } from "../../apps/lab/composition-api.ts";
import { mediaFloat32Wave } from "../helpers/composition-media-audio.ts";
import {
  mediaPngChunk,
  mediaRgbaPng,
} from "../helpers/composition-media-png.ts";
import type * as Playback from "../../packages/renderer-core/src/rendered-audio-playback.ts";

type AudioProofWindow = Window & {
  audioBuffers: AudioBuffer[];
  audioContexts: AudioContext[];
  audioStarts: {
    when: number;
    offset: number;
    duration: number;
    stopped?: number;
    pictureWhenStopped?: string;
  }[];
};
const checksum = (bytes: Uint8Array) =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");

/** Actual Web Audio PCM, offline scheduling, audio-clock playback and both capture APIs. */
export async function verifyNativeAudioAuthoring(
  browser: Browser,
  root: string,
  directory: string,
) {
  const sampleCount = 96000;
  const source = mediaFloat32Wave(sampleCount, 2, (sample, channel) =>
    sample === sampleCount - 1
      ? channel
        ? -0.125
        : 0.0625
      : sample % 4000 < 240
        ? Math.sin((sample * 2 * Math.PI * (channel ? 997 : 431)) / 48000) *
          0.35
        : 0,
  );
  const audioPath = join(directory, "authoring-audio.wav");
  await writeFile(audioPath, source.wav);
  const digits = [
    "111101101101111",
    "010110010010111",
    "111001111100111",
    "111001111001111",
    "101101111001001",
    "111100111001111",
    "111100111101111",
    "111001001001001",
    "111101111101111",
    "111101111001111",
  ];
  for (let frame = 0; frame < 24; frame++) {
    const rgba = Buffer.alloc(16 * 16 * 4);
    for (let pixel = 0; pixel < 16 * 16; pixel++)
      rgba.set([24 + frame * 8, 40, 80, 255], pixel * 4);
    // Burn two actual ordinal digits into the source, alongside a pixel-readable frame code.
    for (const [index, digit] of String(frame)
      .padStart(2, "0")
      .split("")
      .entries())
      for (let at = 0; at < 15; at++)
        if (digits[Number(digit)]![at] === "1")
          rgba.set(
            [255, 255, 255, 255],
            ((3 + Math.floor(at / 3)) * 16 + 3 + index * 5 + (at % 3)) * 4,
          );
    await writeFile(
      join(directory, `audio-picture_${String(frame).padStart(2, "0")}.png`),
      mediaRgbaPng(16, 16, rgba, [mediaPngChunk("sRGB", Buffer.from([0]))]),
    );
  }
  const videoPath = join(directory, "audio-picture.mkv");
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-n",
    "-framerate",
    "12",
    "-i",
    join(directory, "audio-picture_%02d.png"),
    "-frames:v",
    "24",
    "-vf",
    "setparams=color_primaries=bt709:color_trc=iec61966-2-1:colorspace=gbr:range=full",
    "-c:v",
    "ffv1",
    "-pix_fmt",
    "gbrap16le",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "iec61966-2-1",
    "-colorspace",
    "0",
    "-color_range",
    "pc",
    videoPath,
  ]);
  const video = await probeCompositionVideo(videoPath);
  const stillPath = join(directory, "audio-still.png"),
    still = mediaRgbaPng(
      8,
      8,
      Buffer.from(Array.from({ length: 64 }, () => [0, 192, 128, 255]).flat()),
      [mediaPngChunk("sRGB", Buffer.from([0]))],
    );
  await writeFile(stillPath, still);
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: "audio-authoring",
    width: 64,
    height: 64,
    fps: 24,
    frameCount: 48,
    assets: [
      {
        id: "sound",
        type: "audio",
        path: audioPath,
        sha256: checksum(source.wav),
        sampleCount,
        sampleRate: 48000,
        channels: 2,
      },
      {
        id: "movie",
        type: "video",
        path: videoPath,
        sha256: checksum(await readFile(videoPath)),
        width: video.width,
        height: video.height,
        frameCount: video.frameCount,
        frameRate: video.frameRate,
        color: video.color,
      },
      {
        id: "still",
        type: "image",
        path: stillPath,
        sha256: checksum(still),
        width: 8,
        height: 8,
      },
    ],
    layers: [
      {
        id: "picture",
        type: "solid",
        size: [64, 64],
        color: {
          keys: [
            { frame: 0, value: "#ffffff", interpolation: "hold" },
            { frame: 24, value: "#ffcc00", interpolation: "hold" },
          ],
        },
      },
      {
        id: "tone",
        type: "audio",
        asset: "sound",
        role: "sfx",
        gainDb: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 47, value: 0 },
          ],
        },
        pan: {
          keys: [
            { frame: 0, value: 0 },
            { frame: 47, value: 0 },
          ],
        },
      },
      {
        id: "movie",
        type: "video",
        asset: "movie",
        transform: { position: [0, 0], anchor: [0, 0] },
        timeRemap: {
          keys: [
            { frame: 0, value: 23 / 12, interpolation: "linear" },
            { frame: 46, value: 0, interpolation: "linear" },
          ],
        },
      },
      {
        id: "moving-still",
        type: "image",
        size: [8, 8],
        sources: [{ asset: "still" }],
        transform: {
          position: {
            x: {
              keys: [
                { frame: 0, value: 32 },
                { frame: 47, value: 48 },
              ],
            },
            y: 24,
          },
        },
      },
      {
        id: "lower-third",
        type: "shape",
        contents: [
          { id: "box", type: "rect", size: [64, 8], position: [32, 56] },
          { id: "fill", type: "fill", color: "#102840" },
        ],
      },
    ],
  };
  // Native layers are ordered front to back; keep the full-frame background behind media.
  composition.layers.push(composition.layers.shift()!);
  const input = join(directory, "audio-authoring.json");
  await writeFile(input, JSON.stringify(composition));
  const app = await createProgramPreview(input, { watch: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript("window.__name = (fn) => fn;");
  await page.addInitScript(() => {
    const state = window as unknown as AudioProofWindow;
    state.audioContexts = [];
    state.audioBuffers = [];
    state.audioStarts = [];
    const Native = AudioContext;
    window.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) {
        super(options);
        state.audioContexts.push(this);
      }
      override createBuffer(channels: number, length: number, rate: number) {
        const buffer = super.createBuffer(channels, length, rate);
        state.audioBuffers.push(buffer);
        return buffer;
      }
      override createBufferSource() {
        const source = super.createBufferSource(),
          start = source.start.bind(source),
          stop = source.stop.bind(source);
        let record: AudioProofWindow["audioStarts"][number] | undefined;
        source.start = (
          when = 0,
          offset = 0,
          duration = source.buffer!.duration - offset,
        ) => {
          record = { when, offset, duration };
          state.audioStarts.push(record);
          start(when, offset, duration);
        };
        source.stop = (when) => {
          if (record) {
            record.stopped = this.currentTime;
            const canvas = document.getElementById(
              "preview",
            ) as HTMLCanvasElement | null;
            if (canvas) record.pictureWhenStopped = canvas.toDataURL();
          }
          stop(when);
        };
        return source;
      }
    };
  });
  const ready = () =>
    page.waitForFunction(
      () =>
        document.getElementById("status")?.dataset.ready === "program" &&
        !document.getElementById("inspector-edit")?.hasAttribute("disabled"),
    );
  const waves = () =>
    page
      .locator('.audio-waveform-lane[data-key="tone"]')
      .locator("canvas")
      .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
  const measureSync = () =>
    page.evaluate(async () => {
      const state = window as unknown as AudioProofWindow;
      let samples = 0,
        maxFrameDifference = 0,
        maxSourceFrameDifference = 0;
      await new Promise<void>((resolve, reject) => {
        const tick = () => {
          const start = state.audioStarts[0],
            context = state.audioContexts.at(-1);
          if (start && context) {
            const elapsed = context.currentTime - start.when;
            if (elapsed >= 0 && elapsed < start.duration) {
              const frame = Number(
                (document.getElementById("frame") as HTMLInputElement).value,
              );
              maxFrameDifference = Math.max(
                maxFrameDifference,
                Math.abs(frame - Math.floor(elapsed * 24)),
              );
              const surface = document.createElement("canvas");
              surface.width = surface.height = 1;
              const context = surface.getContext("2d")!;
              context.drawImage(
                document.getElementById("preview") as HTMLCanvasElement,
                1,
                1,
                1,
                1,
                0,
                0,
                1,
                1,
              );
              const pixel = context.getImageData(0, 0, 1, 1).data;
              const actualSource = Math.round((pixel[0]! - 24) / 8),
                expectedSource = Math.floor((46 - Math.min(46, frame)) / 2);
              maxSourceFrameDifference = Math.max(
                maxSourceFrameDifference,
                Math.abs(actualSource - expectedSource),
              );
              if (pixel[1] !== 40 || pixel[2] !== 80 || pixel[3] !== 255)
                return reject(
                  new Error(
                    `Native video source pixel changed: ${Array.from(pixel)}`,
                  ),
                );
              samples++;
            }
            if (start.stopped !== undefined) return resolve();
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return { samples, maxFrameDifference, maxSourceFrameDifference };
    });

  let fixtureDirectory: string | undefined;
  let fixtureServer: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    await page.goto(app.url);
    await ready();
    assert.equal(app.snapshot()!.preparedAudio!.sampleCount, sampleCount);
    assert.equal(await page.locator(".audio-waveform-lane").count(), 3);
    assert.match(
      await page
        .locator('.audio-waveform-lane[data-clock="source"]')
        .innerText(),
      /source time · 2.000 s/,
    );
    const sourcePixels = [];
    for (const backend of ["webgl2", "canvas2d"]) {
      await page.locator("#backend").selectOption(backend);
      await page.waitForFunction(
        (backend) =>
          document.getElementById("status")?.dataset.backend === backend &&
          !document.getElementById("inspector-edit")?.hasAttribute("disabled"),
        backend,
      );
      for (const frame of Array.from(
        { length: 48 },
        (_, index) => 47 - index,
      )) {
        await page.locator("#frame").fill(String(frame));
        await page.locator("#frame").dispatchEvent("input");
        await page.waitForFunction(
          (frame) =>
            document
              .getElementById("time")
              ?.textContent?.includes(`${frame + 1} / 48`),
          frame,
        );
        const pixel = await page.locator("#preview").evaluate((canvas) => {
          const surface = document.createElement("canvas");
          surface.width = surface.height = 1;
          const context = surface.getContext("2d")!;
          context.drawImage(
            canvas as HTMLCanvasElement,
            1,
            1,
            1,
            1,
            0,
            0,
            1,
            1,
          );
          return Array.from(context.getImageData(0, 0, 1, 1).data);
        });
        const sourceFrame = Math.floor((46 - Math.min(46, frame)) / 2);
        assert.deepEqual(
          pixel,
          [24 + sourceFrame * 8, 40, 80, 255],
          `Actual remapped movie/${backend} root frame ${frame}`,
        );
      }
      sourcePixels.push({ backend, exactReverseSeeks: 48 });
    }
    const exact = await page.evaluate(
      async ({ module, frame }) => {
        const state = window as unknown as AudioProofWindow;
        const buffer = state.audioBuffers.at(-1)!;
        const encode = async (sound: AudioBuffer) => {
          const bytes = new Uint8Array(sound.length * 8),
            view = new DataView(bytes.buffer);
          for (let sample = 0; sample < sound.length; sample++)
            for (let channel = 0; channel < 2; channel++)
              view.setFloat32(
                sample * 8 + channel * 4,
                sound.getChannelData(channel)[sample]!,
                true,
              );
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          return (
            "sha256:" +
            Array.from(new Uint8Array(digest), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join("")
          );
        };
        const playback = (await import(
          /* @vite-ignore */ module
        )) as typeof Playback;
        const offline = new OfflineAudioContext(
          2,
          buffer.length - frame * 2000,
          48000,
        );
        playback.scheduleRenderedAudio(offline, buffer, {
          frame,
          frameCount: 48,
          fps: 24,
          when: 0,
        });
        const rendered = await offline.startRendering();
        return {
          rate: buffer.sampleRate,
          channels: buffer.numberOfChannels,
          length: buffer.length,
          master: await encode(buffer),
          offline: await encode(rendered),
          last: [
            rendered.getChannelData(0).at(-1),
            rendered.getChannelData(1).at(-1),
          ],
        };
      },
      {
        module: `/@fs/${root}/packages/renderer-core/src/rendered-audio-playback.ts`,
        frame: 6,
      },
    );
    assert.deepEqual(
      [exact.rate, exact.channels, exact.length],
      [48000, 2, sampleCount],
    );
    assert.equal(exact.master, checksum(source.pcm));
    assert.equal(exact.offline, checksum(source.pcm.subarray(12000 * 8)));
    assert.deepEqual(exact.last, [0.0625, -0.125]);
    await page.locator("#play").click();
    const sync = await measureSync();
    assert.ok(
      sync.samples >= 24,
      "observe actual audio-clock/picture presentation across the passage",
    );
    assert.equal(
      sync.maxSourceFrameDifference,
      0,
      "actual time-remapped numbered video follows every presented root frame with zero source-frame offset",
    );
    assert.ok(
      sync.maxFrameDifference <= 1,
      `actual preview A/V difference ${sync.maxFrameDifference} frames`,
    );
    await page.waitForFunction(
      () =>
        document.getElementById("play")?.textContent === "Play" &&
        document.getElementById("time")?.textContent?.includes("48 / 48"),
    );
    const completed = await page.evaluate(
      () => (window as unknown as AudioProofWindow).audioStarts.at(-1)!,
    );
    assert.deepEqual([completed.offset, completed.duration], [0, 2]);
    assert.ok(
      completed.stopped! + 1 / 48000 >= completed.when + completed.duration,
      "final picture retains the complete last audio interval",
    );
    await page.locator("#frame").fill("24");
    await page.locator("#frame").dispatchEvent("input");
    await page.locator("#play").click();
    await page.waitForFunction(
      () => (window as unknown as AudioProofWindow).audioStarts.length === 2,
    );
    await page.locator("#play").click();
    const partial = await page.evaluate(
      () => (window as unknown as AudioProofWindow).audioStarts.at(-1)!,
    );
    assert.equal(partial.offset, 1);
    assert.equal(partial.duration, 1);
    assert.ok(partial.stopped! < partial.when + 1);
    const before = await waves();
    await page.locator('[data-layer="tone"] > button').first().click();
    await page
      .locator("#key-lanes")
      .getByRole("button", { name: /gainDb/ })
      .click();
    await page.getByLabel("Media key value", { exact: true }).fill("-6");
    await page
      .getByRole("button", { name: "Apply media key value", exact: true })
      .click();
    await ready();
    const edited = await waves();
    assert.notEqual(edited, before);
    await page.locator("#undo").click();
    await ready();
    assert.equal(await waves(), before);
    await page.locator("#redo").click();
    await ready();
    assert.equal(await waves(), edited);
    await page
      .locator("#key-lanes")
      .getByRole("button", { name: /pan/ })
      .click();
    await page.getByLabel("Media key value", { exact: true }).fill("0.5");
    await page
      .getByRole("button", { name: "Apply media key value", exact: true })
      .click();
    await ready();
    const expected = structuredClone(composition),
      tone = expected.layers.find((layer) => layer.id === "tone")!;
    if (
      tone.type !== "audio" ||
      typeof tone.gainDb !== "object" ||
      typeof tone.pan !== "object"
    )
      throw Error("Expected native keys");
    tone.gainDb.keys[0]!.value = -6;
    tone.pan.keys[0]!.value = 0.5;
    const saving = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/composition/program-save",
    );
    await page.locator("#save-document").click();
    const saved = await saving;
    const savedPayload = await saved.json();
    assert.equal(saved.status(), 200, JSON.stringify(savedPayload));
    const savedRevision = Number(savedPayload.snapshot.revision);
    assert.ok(
      savedRevision > 1,
      "save must return a newly built source revision",
    );
    assert.deepEqual(savedPayload.snapshot.document, expected);
    await page.waitForFunction(
      (revision) =>
        Number(document.getElementById("status")?.dataset.revision) >=
          revision &&
        document.getElementById("document-state")?.textContent ===
          "Source unchanged" &&
        !document.getElementById("inspector-edit")?.hasAttribute("disabled"),
      savedRevision,
    );
    assert.deepEqual(JSON.parse(await readFile(input, "utf8")), expected);
    const expectedLoaded = await loadComposition(input);
    const expectedPcm = (
      await readFile(expectedLoaded.assetPaths["__audio:mix"]!)
    ).subarray(58);
    const attachedHash = await page.evaluate(async () => {
      const buffer = (window as unknown as AudioProofWindow).audioBuffers.at(
          -1,
        )!,
        bytes = new Uint8Array(buffer.length * 8),
        view = new DataView(bytes.buffer);
      for (let sample = 0; sample < buffer.length; sample++)
        for (let channel = 0; channel < 2; channel++)
          view.setFloat32(
            sample * 8 + channel * 4,
            buffer.getChannelData(channel)[sample]!,
            true,
          );
      return (
        "sha256:" +
        Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (byte) => byte.toString(16).padStart(2, "0"),
        ).join("")
      );
    });
    assert.equal(attachedHash, checksum(expectedPcm));
    const rendered = await renderComposition({
      compositionPath: input,
      outputPath: join(directory, "audio-authoring-expected.mp4"),
    });
    const downloading = page.waitForEvent("download");
    await page.locator("#export-composition").click();
    const download = join(directory, "audio-authoring-draft.mp4");
    await (await downloading).saveAs(download);
    assert.equal(checksum(await readFile(download)), rendered.checksums.output);
    const raw = await page.request.get(
      new URL(
        `/composition/program-asset?revision=${savedRevision}&id=sound`,
        app.url,
      ).href,
    );
    assert.equal(raw.status(), 404);
    const sourceCapture = app.snapshot()!;
    const master = await page.request.get(
      new URL(sourceCapture.assets["__audio:mix"]!, app.url).href,
    );
    assert.equal(master.headers()["content-type"], "audio/wav");
    assert.equal(
      checksum(await master.body()),
      sourceCapture.preparedAudio!.resource.sha256,
    );
    await page.locator("#frame").fill("0");
    await page.locator("#frame").dispatchEvent("input");
    await page.locator("#play").click();
    await page.waitForFunction(
      () => (window as unknown as AudioProofWindow).audioStarts.length === 3,
    );

    await writeFile(audioPath, Buffer.concat([source.wav, Buffer.from([0])]));
    await page.waitForFunction(() =>
      document
        .getElementById("error")
        ?.textContent?.includes(
          "Audio bytes differ from their authored identity",
        ),
    );
    assert.equal(await page.locator("#play").innerText(), "Play");
    assert.equal(
      await page
        .locator("#preview")
        .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL()),
      await page.evaluate(
        () =>
          (window as unknown as AudioProofWindow).audioStarts.at(-1)!
            .pictureWhenStopped,
      ),
    );
    assert.equal(
      await page.evaluate(
        () =>
          (window as unknown as AudioProofWindow).audioStarts.at(-1)!
            .stopped !== undefined,
      ),
      true,
    );
    await writeFile(audioPath, source.wav);
    await page.waitForFunction(
      (revision) =>
        Number(document.getElementById("status")?.dataset.revision) >
          revision &&
        document.getElementById("error")?.textContent === "" &&
        !document.getElementById("inspector-edit")?.hasAttribute("disabled"),
      savedRevision,
    );
    const fixtureRoot = join(root, "benchmarks/fixtures/composition");
    await mkdir(fixtureRoot, { recursive: true });
    fixtureDirectory = await mkdtemp(
      join(fixtureRoot, "ce13-audio-authoring-"),
    );
    await copyFile(audioPath, join(fixtureDirectory, "audio.wav"));
    await copyFile(videoPath, join(fixtureDirectory, "movie.mkv"));
    await copyFile(stillPath, join(fixtureDirectory, "still.png"));
    const fixture = structuredClone(expected);
    fixture.assets[0]!.path = "audio.wav";
    fixture.assets[1]!.path = "movie.mkv";
    fixture.assets[2]!.path = "still.png";
    await writeFile(
      join(fixtureDirectory, "source.json"),
      JSON.stringify(fixture),
    );
    fixtureServer = await createServer({
      root: join(root, "apps/lab"),
      configFile: false,
      cacheDir: join(directory, "audio-fixture-vite"),
      logLevel: "error",
      plugins: [compositionApi()],
      server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
    });
    await fixtureServer.listen();
    const fixturePath = relative(
      fixtureRoot,
      join(fixtureDirectory, "source.json"),
    );
    await page.goto(
      fixtureServer.resolvedUrls!.local[0]! +
        "composition.html?scene=" +
        encodeURIComponent(fixturePath),
    );
    await page.waitForFunction(
      (path) => document.getElementById("status")?.dataset.ready === path,
      fixturePath,
    );
    assert.equal(await page.locator(".audio-waveform-lane").count(), 3);
    await page.locator("#backend").selectOption("webgl2");
    await page.waitForFunction(
      () =>
        document.getElementById("status")?.dataset.backend === "webgl2" &&
        !document.getElementById("inspector-edit")?.hasAttribute("disabled"),
    );
    await page.locator("#play").click();
    const webglSync = await measureSync();
    assert.ok(webglSync.samples >= 24);
    assert.ok(webglSync.maxFrameDifference <= 1);
    assert.equal(webglSync.maxSourceFrameDifference, 0);
    const fractionalBoundaries = [];
    for (const fps of [7, 29, 59]) {
      const frameCount = 5;
      const samples = compositionPcmBoundary(frameCount, fps);
      const sound = mediaFloat32Wave(samples, 2, (sample, channel) =>
        sample === samples - 1
          ? channel
            ? -0.125
            : 0.0625
          : channel
            ? -0.25
            : 0.5,
      );
      const filename = `fractional-${fps}`;
      await writeFile(join(fixtureDirectory, filename + ".wav"), sound.wav);
      const fractional: Composition = {
        schemaVersion: "composition-1",
        id: filename,
        width: 64,
        height: 64,
        fps,
        frameCount,
        background: "#223344",
        assets: [
          {
            id: "sound",
            type: "audio",
            path: filename + ".wav",
            sha256: checksum(sound.wav),
            sampleCount: samples,
            sampleRate: 48000,
            channels: 2,
          },
        ],
        layers: [{ id: "tone", type: "audio", asset: "sound", role: "sfx" }],
      };
      const fractionalInput = join(fixtureDirectory, filename + ".json");
      await writeFile(fractionalInput, JSON.stringify(fractional));
      const path = relative(fixtureRoot, fractionalInput);
      await page.goto(
        fixtureServer.resolvedUrls!.local[0]! +
          "composition.html?scene=" +
          encodeURIComponent(path),
      );
      await page.waitForFunction(
        (path) => document.getElementById("status")?.dataset.ready === path,
        path,
      );
      for (const backend of ["canvas2d", "webgl2"]) {
        await page.locator("#backend").selectOption(backend);
        await page.waitForFunction(
          (backend) =>
            document.getElementById("status")?.dataset.backend === backend &&
            !document
              .getElementById("inspector-edit")
              ?.hasAttribute("disabled"),
          backend,
        );
        const exact = await page.evaluate(
          async ({ fps, frameCount, module }) => {
            const buffer = (
              window as unknown as AudioProofWindow
            ).audioBuffers.at(-1)!;
            const startSample = Math.ceil(48000 / fps);
            const encode = async (sound: AudioBuffer) => {
              const bytes = new Uint8Array(sound.length * 8),
                view = new DataView(bytes.buffer);
              for (let sample = 0; sample < sound.length; sample++)
                for (let channel = 0; channel < 2; channel++)
                  view.setFloat32(
                    sample * 8 + channel * 4,
                    sound.getChannelData(channel)[sample]!,
                    true,
                  );
              return (
                "sha256:" +
                Array.from(
                  new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
                  (byte) => byte.toString(16).padStart(2, "0"),
                ).join("")
              );
            };
            const offline = new OfflineAudioContext(
              2,
              buffer.length - startSample,
              48000,
            );
            const playback = (await import(
              /* @vite-ignore */ module
            )) as typeof Playback;
            playback.scheduleRenderedAudio(offline, buffer, {
              frame: 1,
              frameCount,
              fps,
              when: 0,
            });
            const rendered = await offline.startRendering();
            return {
              length: buffer.length,
              master: await encode(buffer),
              offline: await encode(rendered),
              last: [
                rendered.getChannelData(0).at(-1),
                rendered.getChannelData(1).at(-1),
              ],
            };
          },
          {
            fps,
            frameCount,
            module: `/@fs/${root}/packages/renderer-core/src/rendered-audio-playback.ts`,
          },
        );
        assert.equal(exact.length, samples);
        assert.equal(exact.master, checksum(sound.pcm));
        const startSample = compositionPcmBoundary(1, fps);
        assert.equal(
          exact.offline,
          checksum(sound.pcm.subarray(startSample * 8)),
        );
        assert.deepEqual(exact.last, [0.0625, -0.125]);
        await page.locator("#frame").fill("1");
        await page.locator("#frame").dispatchEvent("input");
        await page.waitForFunction(() =>
          document.getElementById("time")?.textContent?.includes("2 / 5"),
        );
        const priorStarts = await page.evaluate(
          () => (window as unknown as AudioProofWindow).audioStarts.length,
        );
        await page.locator("#play").click();
        await page.waitForFunction(
          (count) =>
            (window as unknown as AudioProofWindow).audioStarts.length > count,
          priorStarts,
        );
        await page.waitForFunction(
          () =>
            document.getElementById("play")?.textContent === "Play" &&
            document.getElementById("time")?.textContent?.includes("5 / 5"),
        );
        const scheduled = await page.evaluate(
          () => (window as unknown as AudioProofWindow).audioStarts.at(-1)!,
        );
        assert.equal(scheduled.offset, startSample / 48000);
        assert.equal(scheduled.duration, (samples - startSample) / 48000);
        assert.ok(
          scheduled.stopped! + 1 / 48000 >= scheduled.when + scheduled.duration,
        );
        fractionalBoundaries.push({
          fps,
          backend,
          samples,
          startSample,
          master: exact.master,
          offline: exact.offline,
          last: exact.last,
        });
      }
    }
    assert.deepEqual(errors, []);
    return {
      fractionalBoundaries,
      sync,
      webglSync,
      sourcePixels,
      combinedMedia:
        "24 frame-numbered FFV1 frames at12fps; reverse remap; animated still and lower third; matching stereo PCM",
      savedRevision,
      sampleCount,
      rate: exact.rate,
      channels: exact.channels,
      master: "all PCM sample bits exact",
      offlineSeek: "frame 6 through distinct last samples exact",
      playback: "audio clock; full final interval; seek/pause exact",
      gainPanEdit: "waveform changes; undo/redo exact; saved master bits exact",
      draftExport: "byte-identical",
      fixtureWaveforms: "source/processed/mix",
      registeredMaster: "WAV with exact captured checksum",
      originalAudioNotServed: true,
      sourceWatch:
        "changed source stops sound and preserves valid pixels; restored source reloads",
    };
  } catch (error) {
    console.error(
      "Native audio authoring failure state",
      JSON.stringify({
        revision: app.snapshot()?.revision,
        document: JSON.parse(await readFile(input, "utf8")),
        status: await page.locator("#status").innerText(),
        error: await page.locator("#error").innerText(),
        state: await page.locator("#document-state").innerText(),
        pageErrors: errors,
      }),
    );
    throw error;
  } finally {
    await page.close();
    await app.close();
    await fixtureServer?.close();
    if (fixtureDirectory)
      await rm(fixtureDirectory, { recursive: true, force: true });
  }
}
