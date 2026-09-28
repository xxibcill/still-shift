import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import type { CompiledStoryPassage } from "../../packages/renderer-core/src/story-passage.ts";
import { PassageAudioSchema } from "../../packages/scene-contract/src/passage-audio.ts";

describe("sound cue authoring and playback", () => {
  let server: ViteDevServer, browser: Browser, base: string;
  beforeAll(async () => {
    server = await createServer({
      configFile: resolve("apps/lab/vite.config.ts"),
      server: { port: 0, strictPort: false },
    });
    await server.listen();
    base = server.resolvedUrls!.local[0]!;
    browser = await chromium.launch({ headless: true });
  }, 30_000);
  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });
  it("registers an existing workspace sound, adds an editable cue and removes it", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(base + "passage.html");
      await page.waitForFunction(() => Boolean(window.passageLab?.snapshot()));
      await page
        .getByLabel("Sound file in workspace", { exact: true })
        .fill("assets/illustrated-sequence/sounds-v001/wood-tap.wav");
      await page
        .getByRole("button", { name: "Register sound file", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          (window.passageLab!.snapshot() as { audio?: { assets: unknown[] } })
            .audio?.assets.length === 1,
      );
      await page
        .getByRole("button", { name: "Add sound to this beat", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          (window.passageLab!.snapshot() as { audio: { sounds: unknown[] } })
            .audio.sounds.length === 1,
      );
      await page.getByLabel("effect-1 level (dB)", { exact: true }).fill("-12");
      await page
        .getByLabel("effect-1 level (dB)", { exact: true })
        .press("Tab");
      await page.waitForFunction(
        () =>
          (
            window.passageLab!.snapshot() as {
              audio: { sounds: { gainDb: number }[] };
            }
          ).audio.sounds[0]!.gainDb === -12,
      );
      await page
        .getByRole("button", { name: "Remove effect-1", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          (window.passageLab!.snapshot() as { audio: { sounds: unknown[] } })
            .audio.sounds.length === 0,
      );
      expect(await page.locator("#errors").innerText()).toBe("");
    } finally {
      await page.close();
    }
  }, 30_000);
  it("retimes sound with a cue, supports undo, previews from a seek and saves the contract", async () => {
    const page = await browser.newPage({ acceptDownloads: true });
    try {
      await page.goto(
        base +
          "passage.html?plan=benchmarks/fixtures/illustrated-sequence/sound/access-story.json",
      );
      await page.waitForFunction(() => Boolean(window.passageLab?.snapshot()));
      const snapshot = () =>
        page.evaluate(
          () =>
            window.passageLab!.snapshot() as {
              frame: number;
              playing: boolean;
              audio: CompiledStoryPassage["audio"];
              narrationReady: boolean;
            },
        );
      expect((await snapshot()).audio!.sounds[0]!.start).toBe(115);
      await page.getByLabel("connection frame", { exact: true }).fill("117");
      await page.getByLabel("connection frame", { exact: true }).press("Tab");
      await page.waitForFunction(
        () =>
          (
            window.passageLab!.snapshot() as {
              audio: { sounds: { start: number }[] };
            }
          ).audio.sounds[0]!.start === 117,
      );
      expect(
        await page
          .locator(".track-mark.sound")
          .first()
          .getAttribute("data-start"),
      ).toBe("117");
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await page.waitForFunction(
        () =>
          (
            window.passageLab!.snapshot() as {
              audio: { sounds: { start: number }[] };
            }
          ).audio.sounds[0]!.start === 115,
      );
      await page
        .locator("#narration")
        .setInputFiles(
          resolve("assets/illustrated-sequence/narration-v001/narration.wav"),
        );
      await page.waitForFunction(
        () =>
          (window.passageLab!.snapshot() as { narrationReady: boolean })
            .narrationReady,
      );
      await page.evaluate(() => window.passageLab!.seek(120));
      await page.getByRole("button", { name: "Play", exact: true }).click();
      await page.waitForFunction(
        () => (window.passageLab!.snapshot() as { frame: number }).frame > 125,
      );
      await page.getByRole("button", { name: "Pause", exact: true }).click();
      expect((await snapshot()).playing).toBe(false);
      await page.getByLabel("Sound effects", { exact: true }).uncheck();
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Save plan", exact: true })
        .click();
      const saved = JSON.parse(
        await readFile((await (await download).path())!, "utf8"),
      );
      expect(saved.audio.sounds).toHaveLength(4);
      expect(saved.audio.sounds[0].anchor).toEqual({
        type: "event",
        id: "route-reveals",
        edge: "start",
      });
      expect(await page.locator("#errors").innerText()).toBe("");
    } finally {
      await page.close();
    }
  }, 30_000);
  it("schedules the same linear envelope on seek and leaves voice audible with effects disabled", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(base);
      const audio = PassageAudioSchema.parse({
        schemaVersion: "passage-audio-1",
        assets: [],
        masterGainDb: -6,
        narrationGainDb: -6,
        sounds: [
          {
            id: "test",
            beat: "one",
            asset: "tone",
            anchor: { type: "cue", id: "cue" },
            durationFrames: 24,
            gainDb: -6,
            fadeInFrames: 6,
            fadeOutFrames: 6,
          },
        ],
      });
      await page.addScriptTag({
        type: "module",
        content: `import { schedulePassageAudio } from "/@fs/${resolve("packages/renderer-core/src/passage-audio-playback.ts")}"; window.scheduleAudioTest = schedulePassageAudio;`,
      });
      await page.waitForFunction(() => "scheduleAudioTest" in window);
      const result = await page.evaluate(
        async ({ audio }) => {
          const schedulePassageAudio = (
            window as unknown as {
              scheduleAudioTest: (...args: unknown[]) => void;
            }
          ).scheduleAudioTest;
          const render = async (frame: number, soundEffects = true) => {
            const context = new OfflineAudioContext(
              2,
              (72 - frame) * 2000,
              48000,
            );
            const tone = context.createBuffer(1, 48000, 48000);
            tone.getChannelData(0).fill(0.5);
            const voice = context.createBuffer(1, 48000 * 4, 48000);
            voice.getChannelData(0).fill(0.125);
            const passage = {
              plan: { fps: 24, sourceStartFrame: 24 },
              frameCount: 72,
              audio: {
                ...audio,
                sounds: audio.sounds.map((s) => ({ ...s, start: 24, end: 48 })),
              },
            };
            schedulePassageAudio(
              context,
              passage,
              new Map([["tone", tone]]),
              voice,
              { frame, when: 0, soundEffects },
            );
            return (await context.startRendering()).getChannelData(0);
          };
          const full = await render(0),
            seek = await render(27),
            muted = await render(27, false);
          let error = 0;
          for (let i = 0; i < seek.length; i++)
            error = Math.max(error, Math.abs(seek[i]! - full[27 * 2000 + i]!));
          return {
            error,
            attack: full[27 * 2000],
            sustain: full[34 * 2000],
            muted: muted[0],
            before: full[23 * 2000],
          };
        },
        {
          audio,
          modulePath:
            "/@fs/" +
            resolve("packages/renderer-core/src/passage-audio-playback.ts"),
        },
      );
      const voice = 0.125 * 10 ** (-12 / 20);
      expect(result.error).toBeLessThan(0.000001);
      expect(result.attack).toBeCloseTo(voice + 0.25 * 10 ** (-12 / 20), 6);
      expect(result.sustain).toBeCloseTo(voice + 0.5 * 10 ** (-12 / 20), 6);
      expect(result.muted).toBeCloseTo(voice, 6);
      expect(result.before).toBeCloseTo(voice, 6);
    } finally {
      await page.close();
    }
  }, 30_000);
});
