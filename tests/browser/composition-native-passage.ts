import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  loadPassageCompositions,
  readStoryPassage,
  renderComposition,
  renderStoryPassage,
  writePreparedPassage,
} from "@still-shift/animation-engine";
import { runProcess } from "@still-shift/execution-runtime/subprocess";

const root = await mkdtemp(join(tmpdir(), "still-shift-native-beat-"));
const picture = resolve(
  "benchmarks/fixtures/composition/ce4a/native-beat.json",
);
const reference = resolve(
  "benchmarks/fixtures/composition/ce4a/native-beats.json",
);
try {
  const passage = await readStoryPassage(
    "benchmarks/fixtures/story-authoring/linked-comparison.json",
  );
  const compositions = await loadPassageCompositions(reference, passage);
  const cacheDirectory = join(root, "cache");
  const nativeBeat = passage.beats.find((beat) => beat.id === "reset")!;
  const range = { start: nativeBeat.start, end: nativeBeat.end };
  const render = async (name: string) => {
    const output = join(root, name);
    await writePreparedPassage(output, passage);
    return renderStoryPassage(output, passage, undefined, {
      renderer: "composition",
      compositions,
      cacheDirectory,
      range,
    });
  };
  const first = await render("first"),
    second = await render("second");
  assert.equal(first.frameCount, 192);
  assert.equal(first.cache[0]!.reused, false);
  assert.equal(second.cache[0]!.reused, true);
  const native = await renderComposition({
    compositionPath: picture,
    outputPath: join(root, "native.mp4"),
  });
  const decodedHash = async (path: string) =>
    (
      await runProcess("ffmpeg", [
        "-v",
        "error",
        "-i",
        path,
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
    first.cache[0]!.sha256,
    native.checksums.output.replace(/^sha256:/, ""),
    "Cached native beat must be byte-identical to standalone composition export",
  );
  assert.equal(
    await decodedHash(first.video.path),
    await decodedHash(second.video.path),
  );
  await writeFile(join(root, "native.json"), await readFile(picture));
  await writeFile(
    join(root, "beats.json"),
    JSON.stringify({ reset: "native.json" }),
  );
  assert.deepEqual(
    await loadPassageCompositions(join(root, "beats.json"), passage),
    compositions,
  );
  assert.ok(first.cache[0]!.key !== first.planSha256);
  const server = await createServer({
    configFile: resolve("apps/lab/vite.config.ts"),
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await server.listen();
  const browser = await launchRenderBrowser();
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      server.resolvedUrls!.local[0]! +
        "passage.html?renderer=composition&plan=benchmarks/fixtures/story-authoring/linked-comparison.json&composition-beats=benchmarks/fixtures/composition/ce4a/native-beats.json",
    );
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLSelectElement>("#beat")!.options.length ===
        3,
    );
    await page.locator("#beat").selectOption("2");
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLSelectElement>("#node")!.options[0]
          ?.value === "difference-panel",
    );
    for (const frame of [384, 480, 575, 384]) {
      await page.locator("#scrub").evaluate((element, frame) => {
        const input = element as HTMLInputElement;
        input.value = String(frame);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, frame);
      const pixel = await page
        .locator("#preview")
        .evaluate((canvas) =>
          Array.from(
            (canvas as HTMLCanvasElement)
              .getContext("2d")!
              .getImageData(600, 500, 1, 1).data,
          ),
        );
      assert.deepEqual(
        pixel,
        [164, 140, 20, 255],
        `Native difference blend at passage frame ${frame}`,
      );
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
  console.log(
    "Native composition passage: 192 frames, standalone encoded-beat identity, cache reuse, relocated beat map and Lab native pixel/seek checks pass.",
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
