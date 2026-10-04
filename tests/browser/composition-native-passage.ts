import { createServer } from "vite";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  loadPassageCompositions,
  prepareStoryPassageInput,
  readStoryPassage,
  renderComposition,
  renderStoryPassage,
  writePreparedPassage,
} from "@still-shift/animation-engine";
import { PassageError } from "@still-shift/renderer-core";
import { runProcess } from "@still-shift/execution-runtime/subprocess";

const root = await mkdtemp(join(tmpdir(), "still-shift-native-beat-"));
const backend = process.argv.includes("--webgl") ? "webgl2" : "canvas2d";
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
  assert.equal(
    nativeBeat.cues[0]!.frame,
    compositions.reset!.markers![0]!.frame,
  );
  assert.equal(compositions.reset!.layers.at(-1)!.type, "precomp");
  const render = async (name: string, pictures = compositions) => {
    const output = join(root, name);
    await writePreparedPassage(output, passage);
    return renderStoryPassage(output, passage, undefined, {
      renderer: "composition",
      backend,
      compositions: pictures,
      cacheDirectory,
    });
  };
  const first = await render("first"),
    second = await render("second");
  assert.equal(first.frameCount, 576);
  assert.ok(first.cache.every((clip) => !clip.reused));
  assert.ok(second.cache.every((clip) => clip.reused));
  const native = await renderComposition({
    backend,
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
    first.cache[2]!.sha256,
    native.checksums.output.replace(/^sha256:/, ""),
    "Cached native beat must be byte-identical to standalone composition export",
  );
  assert.equal(
    await decodedHash(first.video.path),
    await decodedHash(second.video.path),
  );
  const relocated = JSON.parse(await readFile(picture, "utf8"));
  await mkdir(join(root, "assets"));
  for (const asset of relocated.assets) {
    await writeFile(
      join(root, "assets", asset.id),
      await readFile(
        compositions.reset!.assets.find((a) => a.id === asset.id)!.path,
      ),
    );
    asset.path = `assets/${asset.id}`;
  }
  await writeFile(join(root, "native.json"), JSON.stringify(relocated));
  await writeFile(
    join(root, "beats.json"),
    JSON.stringify({ reset: "native.json" }),
  );
  const portable = await loadPassageCompositions(
    join(root, "beats.json"),
    passage,
  );
  const portableRender = await render("portable", portable);
  assert.ok(portableRender.cache.every((clip) => clip.reused));
  assert.ok(first.cache[2]!.key !== first.planSha256);
  const changed = structuredClone(compositions);
  if (changed.reset!.layers[0]!.type !== "solid")
    throw new Error("solid fixture expected");
  changed.reset!.layers[0]!.color = "#408060";
  const edited = await render("edited", changed);
  assert.deepEqual(
    edited.cache.map((clip) => clip.reused),
    [true, true, false],
  );
  const narration = join(root, "narration.wav");
  await runProcess("ffmpeg", [
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
    reference: "native acceptance tone",
    sha256: createHash("sha256")
      .update(await readFile(narration))
      .digest("hex"),
  };
  const narratedPassage = await prepareStoryPassageInput(
    narratedPlan,
    passage.inputs.plan.path,
  );
  const narratedOutput = join(root, "narrated");
  await writePreparedPassage(narratedOutput, narratedPassage);
  const narrated = await renderStoryPassage(
    narratedOutput,
    narratedPassage,
    narration,
    { renderer: "composition", backend, compositions, cacheDirectory },
  );
  assert.equal(narrated.frameCount, 576);
  assert.ok(narrated.cache.every((clip) => clip.reused));
  assert.ok(
    narrated.video.streams.some((stream) => stream.codec_type === "audio"),
  );
  await writeFile(
    join(root, "missing.json"),
    JSON.stringify({ reset: "no-picture.json" }),
  );
  const referenceFailure = (error: unknown) =>
    error instanceof PassageError &&
    error.diagnostics[0]?.code === "comp-passage-reference";
  await assert.rejects(
    loadPassageCompositions(join(root, "missing.json"), passage),
    referenceFailure,
  );
  await writeFile(
    join(root, "unknown-beat.json"),
    JSON.stringify({ ["__proto__"]: "native.json" }),
  );
  await assert.rejects(
    loadPassageCompositions(join(root, "unknown-beat.json"), passage),
    (error: unknown) =>
      error instanceof PassageError &&
      error.diagnostics[0]?.code === "comp-passage-beat",
  );
  const incompatible = { ...relocated, fps: 30 };
  await writeFile(join(root, "native.json"), JSON.stringify(incompatible));
  await assert.rejects(
    loadPassageCompositions(join(root, "beats.json"), passage),
    /must match/,
  );
  await writeFile(join(root, "native.json"), JSON.stringify(relocated));
  relocated.assets[0].sha256 = `sha256:${"0".repeat(64)}`;
  await writeFile(join(root, "native.json"), JSON.stringify(relocated));
  await assert.rejects(
    loadPassageCompositions(join(root, "beats.json"), passage),
    referenceFailure,
  );
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
        `passage.html?renderer=composition&backend=${backend}&plan=benchmarks/fixtures/story-authoring/linked-comparison.json&composition-beats=benchmarks/fixtures/composition/ce4a/native-beats.json`,
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
    `Mixed composition passage (${backend}): 576 frames, adapted story precomp with native overlay, cue mappings, narration, standalone encoded-beat identity, isolated cache edits, relocated assets, invalid-input diagnostics and Lab pixel/seek checks pass.`,
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
