import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportScene } from "@still-shift/execution-runtime/export";
import { loadPreparedScene } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { writeExportScene } from "../fixtures/export-scene.ts";
import type * as Subprocess from "../../packages/execution-runtime/src/subprocess.ts";

const pause = vi.hoisted(() => ({
  phase: undefined as "probe" | "decode" | undefined,
  readyPath: "",
  signal: undefined as AbortSignal | undefined,
}));

vi.mock(
  "../../packages/execution-runtime/src/subprocess.ts",
  async (importOriginal) => {
    const actual = await importOriginal<typeof Subprocess>();
    return {
      ...actual,
      runProcess: async (...args: Parameters<typeof actual.runProcess>) => {
        const [command, parameters, options] = args;
        const selected =
          pause.phase === "probe"
            ? command === "ffprobe"
            : pause.phase === "decode" &&
              command === "ffmpeg" &&
              parameters.includes("null");
        if (!selected) return actual.runProcess(...args);
        pause.phase = undefined;
        pause.signal = options?.signal;
        return actual.runProcess(
          process.execPath,
          [
            "-e",
            'const fs=require("node:fs");process.on("SIGTERM",()=>{});fs.writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000);',
            pause.readyPath,
          ],
          options,
        );
      },
    };
  },
);

afterEach(() => {
  pause.phase = undefined;
  pause.signal = undefined;
  vi.restoreAllMocks();
});

describe("export verification cancellation", () => {
  it("reports a browser module startup failure, cleans up, and permits retry", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "still-shift-startup-failure-"),
    );
    const launch = chromium.launch.bind(chromium);
    let browser: Browser | undefined;
    const failure = "Injected export module initialization failure";
    vi.spyOn(chromium, "launch").mockImplementationOnce(async (options) => {
      browser = await launch(options);
      const newPage = browser.newPage.bind(browser);
      vi.spyOn(browser, "newPage").mockImplementationOnce(async (options) => {
        const page = await newPage(options);
        page.setDefaultTimeout(1_000);
        await page.route("**/export-page.ts", (route) => route.fulfill({
          contentType: "application/javascript",
          body: `throw new Error(${JSON.stringify(failure)});`,
        }));
        return page;
      });
      return browser;
    });
    try {
      const scenePath = await writeExportScene(directory);
      const prepared = await loadPreparedScene(scenePath);
      const request = {
        ...prepared,
        sourcePath: scenePath,
        depthPath: null,
        outputPath: join(directory, "output.mp4"),
      };
      await expect(exportScene(request)).rejects.toThrow(
        `Export browser did not initialize: ${failure}`,
      );
      expect(browser?.isConnected()).toBe(false);
      expect((await readdir(directory)).sort()).toEqual([
        "scene.json",
        "source.svg",
      ]);
      expect((await exportScene(request)).frameCount).toBe(3);
    } finally {
      await browser?.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("cancels an active frame upload, closes the browser, and permits retry", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "still-shift-encode-cancel-"),
    );
    const controller = new AbortController();
    const reason = new Error("Cancelled during encoding");
    const launch = chromium.launch.bind(chromium);
    let browser: Browser | undefined;
    let abortStarted = 0;
    vi.spyOn(chromium, "launch").mockImplementationOnce(async (options) => {
      browser = await launch(options);
      const newPage = browser.newPage.bind(browser);
      vi.spyOn(browser, "newPage").mockImplementationOnce(async (options) => {
        const page = await newPage(options);
        page.on("request", (request) => {
          if (new URL(request.url()).pathname === "/_export/frame") {
            abortStarted = performance.now();
            controller.abort(reason);
          }
        });
        return page;
      });
      return browser;
    });
    try {
      const scenePath = await writeExportScene(directory);
      const prepared = await loadPreparedScene(scenePath);
      const request = {
        ...prepared,
        sourcePath: scenePath,
        depthPath: null,
        outputPath: join(directory, "output.mp4"),
      };
      await expect(
        exportScene({ ...request, signal: controller.signal }),
      ).rejects.toBe(reason);
      expect(abortStarted).toBeGreaterThan(0);
      expect(performance.now() - abortStarted).toBeLessThan(2_000);
      expect(browser?.isConnected()).toBe(false);
      expect((await readdir(directory)).sort()).toEqual([
        "scene.json",
        "source.svg",
      ]);
      expect((await exportScene(request)).frameCount).toBe(3);
    } finally {
      controller.abort();
      await browser?.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it.each(["probe", "decode"] as const)(
    "cancels %s, reaps its child, and permits retry",
    async (phase) => {
      const directory = await mkdtemp(
        join(tmpdir(), "still-shift-export-cancel-"),
      );
      const controller = new AbortController();
      let pending: Promise<unknown> | undefined;
      try {
        const scenePath = await writeExportScene(directory);
        const prepared = await loadPreparedScene(scenePath);
        const outputPath = join(directory, "output.mp4");
        const request = {
          ...prepared,
          sourcePath: scenePath,
          depthPath: null,
          outputPath,
        };
        pause.readyPath = join(directory, "child.pid");
        pause.phase = phase;
        pending = exportScene({ ...request, signal: controller.signal }).catch(
          (error: unknown) => error,
        );
        let pid = 0;
        await vi.waitFor(
          async () => {
            pid = Number(await readFile(pause.readyPath, "utf8"));
            expect(pid).toBeGreaterThan(0);
          },
          { timeout: 10_000, interval: 25 },
        );
        expect(pause.signal).toBe(controller.signal);
        const reason = new Error(`Cancelled during ${phase}`);
        const started = performance.now();
        controller.abort(reason);
        expect(await pending).toBe(reason);
        expect(performance.now() - started).toBeLessThan(2_000);
        expect(() => process.kill(pid, 0)).toThrow(
          expect.objectContaining({ code: "ESRCH" }),
        );
        expect((await readdir(directory)).sort()).toEqual([
          "child.pid",
          "scene.json",
          "source.svg",
        ]);
        const result = await exportScene(request);
        expect(result.frameCount).toBe(3);
        expect(await readFile(outputPath)).not.toHaveLength(0);
      } finally {
        controller.abort();
        await pending;
        await rm(directory, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
