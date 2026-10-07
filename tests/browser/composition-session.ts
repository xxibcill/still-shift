import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import type * as SessionModule from "../../apps/lab/src/preview-session.ts";

const server = await createServer({
  configFile: resolve("apps/lab/vite.config.ts"),
  server: { port: 0, strictPort: false, watch: null },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  // tsx keeps function names in serialized Playwright callbacks.
  await page.addInitScript("window.__name = (value) => value;");
  await page.goto(server.resolvedUrls!.local[0]! + "composition.html");
  const report = await page.evaluate(async (modulePath) => {
    const { createPreviewSession }: typeof SessionModule = await import(
      /* @vite-ignore */ modulePath
    );
    const host = document.createElement("section"),
      play = document.createElement("button"),
      scrub = document.createElement("input"),
      exportButton = document.createElement("button"),
      edit = document.createElement("fieldset");
    scrub.type = "range";
    host.append(play, scrub, exportButton, edit);
    document.body.append(host);
    const picture = document.createElement("div");
    host.append(picture);
    const disposed: string[] = [],
      callbacks: string[] = [],
      errors: string[] = [];
    let ready = "";
    type Snapshot = {
      scene: { fps: number; frameCount: number };
      name: string;
    };
    const session = createPreviewSession<Snapshot>({
      controls: {
        play,
        scrub,
        export: exportButton,
        downloads: [],
        edit: [edit],
      },
      retainValidOnFailure: true,
      disableWhileExporting: true,
      disableEditsWhileLoading: true,
      ready: (snapshot) => {
        ready = snapshot.name;
      },
      frameChanged: (frame, snapshot) =>
        callbacks.push(`${ready}/${snapshot.name}/${frame}`),
      status: (message, failed) => {
        if (failed) errors.push(message);
      },
    });
    const check = (value: boolean, message: string) => {
      if (!value) throw new Error(message);
    };
    const pixels = () => picture.querySelector("canvas")!.toDataURL();
    const load = (
      name: string,
      frames: number,
      fail = false,
      gate?: Promise<void>,
      prepareFrame?: (frame: number) => Promise<void>,
    ) =>
      session.load(async (resources) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 32;
        const renderer = {
          ...(prepareFrame ? { prepareFrame } : {}),
          renderFrame(frame: number) {
            if (fail) throw new Error("Invalid staged frame");
            const context = canvas.getContext("2d")!;
            context.clearRect(0, 0, 32, 32);
            context.fillStyle = name === "first" ? "#b74d32" : "#446faa";
            context.fillRect(frame * 2, 0, 16, 16);
            return { frame };
          },
          dispose() {
            disposed.push(name);
          },
        };
        check(
          resources.renderer(renderer, () =>
            picture.replaceChildren(canvas),
          ) === renderer,
          "Registered renderer identity must be preserved",
        );
        await gate;
        return {
          snapshot: { name, scene: { fps: 24, frameCount: frames } },
          initialFrame: session.frame,
        };
      });
    check(await load("first", 8), "First candidate must commit");
    session.show(5);
    const before = pixels();
    check(
      !(await load("invalid", 8, true)),
      "Invalid first frame must not commit",
    );
    check(
      pixels() === before && session.frame === 5,
      "Invalid candidate must retain exact pixels and frame",
    );
    check(
      session.snapshot?.name === "first" && !play.disabled && !scrub.disabled,
      "Retained valid preview must remain usable",
    );
    check(
      disposed.join() === "invalid",
      "Only failed resources should be disposed",
    );
    const deferred = <T>() => {
      let resolve!: (value: T | PromiseLike<T>) => void;
      const promise = new Promise<T>((accept) => {
        resolve = accept;
      });
      return { promise, resolve };
    };
    const gate = deferred<void>(),
      stale = load("stale", 8, false, gate.promise);
    check(edit.disabled, "Staged loading must lock native inspector edits");
    check(await load("latest", 2), "Newest candidate must commit");
    check(
      !edit.disabled,
      "Accepted native stage must release inspector edit lock",
    );
    const latest = pixels();
    gate.resolve();
    check(!(await stale), "Late candidate must not commit");
    check(
      pixels() === latest && session.frame === 1,
      "Late candidate must preserve newest pixels and clamped frame",
    );
    check(
      callbacks.every((value) => {
        const [accepted, drawn] = value.split("/");
        return accepted === drawn;
      }),
      "Ready callback must precede frame callbacks",
    );
    const exporting = deferred<string>(),
      pending = session.export(async (snapshot) => {
        check(
          snapshot.name === "latest",
          "Export must own the accepted snapshot",
        );
        return exporting.promise;
      });
    const dynamicInput = document.createElement("input");
    edit.append(dynamicInput);
    check(
      edit.disabled && dynamicInput.matches(":disabled"),
      "New graph controls must inherit the export lock",
    );
    exporting.resolve("Exported");
    await pending;
    check(
      !edit.disabled && !dynamicInput.matches(":disabled"),
      "Export lock must release",
    );
    const initialGate = deferred<void>();
    const stalePreparation = load(
      "async-stale",
      8,
      false,
      undefined,
      () => initialGate.promise,
    );
    await Promise.resolve();
    check(
      pixels() === latest,
      "Pending native first frame must preserve active pixels",
    );
    const seekGate = deferred<void>(),
      clearGate = deferred<void>();
    check(
      await load("async-native", 8, false, undefined, (frame) => {
        if (frame === 4) return seekGate.promise;
        if (frame === 7) return clearGate.promise;
        if (frame === 6)
          return Promise.reject(Error("Native preparation failed"));
        return Promise.resolve();
      }),
      "Ready native candidate must commit",
    );
    initialGate.resolve();
    check(
      !(await stalePreparation),
      "Late native first-frame preparation must not commit",
    );
    const pendingSeek = session.show(4);
    check(
      session.frame === 1,
      "Pending native seek must retain displayed frame",
    );
    await session.show(2);
    const newestPixels = pixels();
    seekGate.resolve();
    await pendingSeek;
    check(
      session.frame === 2 && pixels() === newestPixels,
      "Late native seek must not replace newer pixels or position",
    );
    await session.show(6);
    check(
      session.frame === 2 && pixels() === newestPixels,
      "Failed native seek must retain exact valid pixels",
    );
    const clearSeek = session.show(7);
    session.pause();
    session.clear();
    clearGate.resolve();
    await clearSeek;
    check(
      session.snapshot === undefined && play.disabled,
      "Clear must retire the active snapshot",
    );
    check(
      disposed.filter((name) => name === "latest").length === 1,
      "Accepted renderer must be disposed once",
    );
    check(
      disposed.filter((name) => name === "stale").length === 1,
      "Stale renderer must be disposed once",
    );
    check(
      disposed.filter((name) => name === "async-stale").length === 1 &&
        disposed.filter((name) => name === "async-native").length === 1,
      "Stale and accepted native renderers must dispose exactly once",
    );
    return {
      failedFrameRetained: true,
      staleIgnored: true,
      shorterClamped: true,
      rendererIdentity: true,
      callbackOrder: true,
      dynamicExportLock: true,
      nativeInitialReadiness: true,
      nativeStaleSeekIgnored: true,
      nativeFailureRetained: true,
      nativePendingClear: true,
      errors,
      disposed,
    };
  }, "/src/preview-session.ts");
  assert.equal(report.errors.length, 2);
  assert.match(report.errors[0]!, /Invalid staged frame.*preserved/);
  assert.match(report.errors[1]!, /Native preparation failed.*preserved/);
  console.log("Composition session:", JSON.stringify(report));
} finally {
  await browser?.close();
  await server.close();
}
