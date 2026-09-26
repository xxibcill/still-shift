import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { createServer } from "vite";
import {
  readStoryPassage,
  writePreparedPassage,
  prepareStoryPassageInput,
  passageChecksum,
} from "../../packages/animation-engine/src/story-passage-io.ts";
import { renderStoryPassage } from "../../packages/animation-engine/src/story-passage-render.ts";
import { compareFrameSamples } from "../../packages/renderer-core/src/parity.ts";
import type { PassagePlan } from "../../packages/scene-contract/src/story-authoring.ts";
import type { StoryScene } from "../../packages/scene-contract/src/story.ts";

const run = promisify(execFile);
const output = await mkdtemp(join(tmpdir(), "still-shift-authoring-"));
console.log("Authoring verification artifacts: " + output);
const planPath = resolve(
  "benchmarks/fixtures/story-authoring/linked-comparison.json",
);
const passage = await readStoryPassage(planPath);
const cacheDirectory = join(output, "cache");
const render = async (name: string, prepared = passage, narration?: string) => {
  const directory = join(output, name);
  await writePreparedPassage(directory, prepared);
  const report = await renderStoryPassage(directory, prepared, narration, {
    cacheDirectory,
  });
  return { directory, report };
};
const baseline = await render("baseline");
assert.equal(baseline.report.frameCount, 576);
assert.equal(baseline.report.cache.filter((c) => c.reused).length, 0);
const cached = await render("cached");
assert.equal(cached.report.cache.filter((c) => c.reused).length, 3);
const decodedHash = async (video: string) =>
  (
    await run("ffmpeg", [
      "-v",
      "error",
      "-i",
      video,
      "-map",
      "0:v",
      "-f",
      "hash",
      "-hash",
      "sha256",
      "-",
    ])
  ).stdout;
assert.equal(
  await decodedHash(baseline.report.video.path),
  await decodedHash(cached.report.video.path),
);
const edited = structuredClone(passage.plan);
if (edited.schemaVersion !== "story-passage-2")
  throw new Error("Wrong authoring fixture");
edited.beats[0]!.parameters.title = "A changed comparison";
const changedPassage = await prepareStoryPassageInput(edited, planPath);
const changed = await render("changed", changedPassage);
assert.deepEqual(
  changed.report.cache.map((c) => c.reused),
  [false, true, true],
);
const previewDirectory = join(output, "range");
await writePreparedPassage(previewDirectory, passage);
const range = await renderStoryPassage(previewDirectory, passage, undefined, {
  cacheDirectory,
  range: { start: 180, end: 204 },
});
assert.equal(range.frameCount, 24);
assert.equal(range.cache.length, 2);
assert.ok(range.cache.every((c) => c.reused));
const cancelledDirectory = join(output, "cancelled");
await writePreparedPassage(cancelledDirectory, passage);
const controller = new AbortController();
await assert.rejects(
  renderStoryPassage(cancelledDirectory, passage, undefined, {
    cacheDirectory,
    signal: controller.signal,
    onProgress: (progress) => {
      if (progress.stage === "reused") controller.abort();
    },
  }),
);
assert.equal(
  JSON.parse(
    await readFile(join(cancelledDirectory, "render-job.json"), "utf8"),
  ).status,
  "cancelled",
);
const resumed = await renderStoryPassage(
  cancelledDirectory,
  passage,
  undefined,
  { cacheDirectory, resume: true },
);
assert.ok(resumed.cache.every((c) => c.reused));
const narration = join(output, "narration.wav");
await run("ffmpeg", [
  "-v",
  "error",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:duration=25",
  "-c:a",
  "pcm_s16le",
  narration,
]);
const narratedPlan = structuredClone(passage.plan);
narratedPlan.narration = {
  reference: "synthetic test tone",
  sha256: passageChecksum(await readFile(narration)),
};
const narratedPassage = await prepareStoryPassageInput(narratedPlan, planPath);
const narrated = await render("narrated", narratedPassage, narration);
assert.ok(narrated.report.cache.every((c) => c.reused));
assert.ok(narrated.report.video.streams.some((s) => s.codec_type === "audio"));
console.log(
  "Encoded checks passed: exact frames, cache reuse, isolated edit, range export, cancellation/resume, audio reuse.",
);

const server = await createServer({
  configFile: resolve("apps/lab/vite.config.ts"),
  server: { port: 0, strictPort: false },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const scores: unknown[] = [];
const rgb = async (path: string, frame?: number) =>
  new Uint8Array(
    (
      await run(
        "ffmpeg",
        [
          "-v",
          "error",
          "-i",
          path,
          "-vf",
          [
            ...(frame === undefined ? [] : [`select=eq(n\\,${frame})`]),
            "scale=96:54:flags=bicubic",
          ].join(","),
          "-frames:v",
          "1",
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgb24",
          "pipe:1",
        ],
        { encoding: "buffer" },
      )
    ).stdout,
  );
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  const base = server.resolvedUrls!.local[0]!;
  const forbidden = await page.request.get(
    base + "passage-api/load?path=" + encodeURIComponent("/etc/passwd"),
  );
  assert.equal(forbidden.status(), 400);
  await page.goto(base + "passage.html");
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes("576 frames"),
  );
  const snapshot = async () =>
    (await page.evaluate(() => window.passageLab!.snapshot())) as {
      plan: PassagePlan;
      beats: {
        id: string;
        scene: StoryScene;
        events: { id: string; start: number; end: number }[];
      }[];
      frame: number;
    };
  const initial = await snapshot();
  assert.deepEqual(
    initial.beats.map((b) => b.scene),
    passage.beats.map((b) => b.scene),
  );
  const captures = new Map<number, string>();
  for (const frame of [0, 54, 110, 191, 192, 300, 383, 384, 575, 192, 0]) {
    const data = await page.evaluate((index) => {
      window.passageLab!.seek(index);
      return document
        .querySelector<HTMLCanvasElement>("#preview")!
        .toDataURL()
        .split(",")[1]!;
    }, frame);
    if (captures.has(frame)) {
      assert.equal(
        data,
        captures.get(frame),
        "Backward seeking is deterministic",
      );
      continue;
    }
    captures.set(frame, data);
    const image = join(output, `frame-${frame}.png`);
    await writeFile(image, Buffer.from(data, "base64"));
    const score = compareFrameSamples(
      await rgb(image),
      await rgb(baseline.report.video.path, frame),
      96,
      54,
    );
    assert.equal(
      score.warning,
      null,
      `Frame ${frame}: ${JSON.stringify(score)}`,
    );
    scores.push({ frame, ...score });
  }
  const cue = page.getByRole("spinbutton", {
    name: "strain frame",
    exact: true,
  });
  await cue.fill("54");
  await cue.press("Tab");
  await page.waitForFunction(() => {
    const state = window.passageLab!.snapshot() as {
      plan: { beats: { cues: { frame: number }[] }[] };
    };
    return state.plan.beats[0]!.cues[0]!.frame === 54;
  });
  assert.equal(
    (await snapshot()).beats[0]!.events.find((e) => e.id === "less-room")!
      .start,
    111,
  );
  await page.getByText("Linked events", { exact: true }).click();
  const offset = page.getByRole("spinbutton", {
    name: "shared-strain offset",
    exact: true,
  });
  await offset.fill("12");
  await offset.press("Tab");
  const cueDistance = page
    .locator("#diagnostics")
    .getByRole("button", { name: /cue-distance/ });
  await cueDistance.click();
  assert.equal((await snapshot()).frame, 54);
  assert.equal(await page.locator("#node").inputValue(), "pressure-a");
  await offset.fill("0");
  await offset.press("Tab");
  await page.waitForFunction(
    () =>
      !document
        .querySelector("#diagnostics")!
        .textContent!.includes("cue-distance"),
  );
  await cue.fill("180");
  await cue.press("Tab");
  await page.waitForFunction(() =>
    document
      .querySelector("#errors")!
      .textContent!.includes("outside locked beat"),
  );
  assert.equal((await snapshot()).plan.beats[0]!.cues[0]!.frame, 54);
  await page.locator("#errors button").click();
  assert.equal((await snapshot()).frame, 180);
  assert.equal(await page.locator("#node").inputValue(), "pressure-a");
  await cue.fill("192");
  await cue.press("Tab");
  await page.waitForFunction(() =>
    document
      .querySelector("#errors")!
      .textContent!.includes("Cue outside beat"),
  );
  await page.locator("#errors button").click();
  assert.equal((await snapshot()).frame, 191);
  assert.equal((await snapshot()).plan.beats[0]!.cues[0]!.frame, 54);
  await page
    .getByRole("textbox", { name: "title", exact: true })
    .fill("Edited in the Lab");
  await page.getByRole("textbox", { name: "title", exact: true }).press("Tab");
  await page.waitForFunction(
    () => document.querySelector("#errors")!.textContent === "",
  );
  assert.ok(
    (await snapshot()).beats[0]!.scene.nodes.some(
      (n) => n.type === "text" && n.text === "Edited in the Lab",
    ),
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLInputElement>('input[aria-label="title"]')!
        .value === "A reusable comparison",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLInputElement>('input[aria-label="title"]')!
        .value === "Edited in the Lab",
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Save workspace", exact: true })
    .click();
  const download = await downloadPromise;
  const saved = join(output, "saved.workspace.json");
  await download.saveAs(saved);
  const planDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  const planDownload = await planDownloadPromise;
  const savedPlanFile = join(output, "saved-plan.json");
  await planDownload.saveAs(savedPlanFile);
  const reloaded = await readStoryPassage(savedPlanFile);
  assert.deepEqual(
    reloaded.beats.map((b) => b.scene),
    (await snapshot()).beats.map((b) => b.scene),
  );
  const savedState = await snapshot();
  await page
    .getByRole("textbox", { name: "title", exact: true })
    .fill("A temporary draft");
  await page.getByRole("textbox", { name: "title", exact: true }).press("Tab");
  await page.waitForFunction(() => {
    const state = window.passageLab!.snapshot() as {
      plan: { beats: { parameters: { title: string } }[] };
    };
    return state.plan.beats[0]!.parameters.title === "A temporary draft";
  });
  await page.locator("#open-workspace").setInputFiles(saved);
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLInputElement>('input[aria-label="title"]')!
        .value === "Edited in the Lab",
  );
  assert.deepEqual((await snapshot()).plan, savedState.plan);
  await page.evaluate(() => window.passageLab!.seek(42));
  await page.locator("#open-workspace").setInputFiles(savedPlanFile);
  await page.waitForFunction(
    () =>
      (window.passageLab!.snapshot() as { frame: number }).frame === 0 &&
      document.querySelector<HTMLInputElement>('input[aria-label="title"]')!
        .value === "Edited in the Lab",
  );
  assert.deepEqual((await snapshot()).plan, savedState.plan);

  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(
    () =>
      Number(document.querySelector<HTMLInputElement>("#scrub")!.value) > 24,
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByText("Preview aids", { exact: true }).click();
  await page.locator("#show-bounds").check();
  await page.locator("#show-safe").check();
  await page.screenshot({ path: join(output, "desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(output, "phone.png"), fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  assert.deepEqual(failures, []);
  await writeFile(
    join(output, "verification.json"),
    JSON.stringify(
      {
        status: "passed",
        scores,
        cache: cached.report.cache,
        isolatedEdit: changed.report.cache,
        range: { start: 180, end: 204, frames: range.frameCount },
        browser:
          "cue editing, invalid recovery, slots, undo/redo, workspace round trip, playback, overlays, 390px layout",
        narratedFrames: narrated.report.frameCount,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Passage authoring QA passed: ${scores.length} frame comparisons; browser editing, recovery, playback and phone layout. Artifacts: ${output}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
