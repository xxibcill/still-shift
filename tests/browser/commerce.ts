import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { promisify } from "node:util";
import { chromium, type Page } from "playwright";
import { createServer } from "vite";
import { PreparedAnimationEngine } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import {
  CommerceSceneSchema,
  CommerceAnimationResultSchema,
} from "../../packages/scene-contract/src/commerce.ts";
import { compareFrameSamples } from "../../packages/renderer-core/src/parity.ts";

const run = promisify(execFile);
const temporary = await mkdtemp(join(tmpdir(), "still-shift-commerce-test-"));
const argument = process.argv.indexOf("--renders");
const profileArgument = process.argv.indexOf("--profile");
const profileFilter =
  profileArgument < 0 ? undefined : process.argv[profileArgument + 1];
const output = argument < 0 ? temporary : resolve(process.argv[argument + 1]!);
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: resolve("apps/lab/vite.config.ts"),
  server: { port: 0, strictPort: false },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const evidence: unknown[] = [];
const errors: string[] = [];
const ready = (page: Page, preset: string) =>
  page.waitForFunction(
    (id) =>
      document.querySelector("#status")?.textContent?.startsWith(id + " ready"),
    preset,
  );
const seek = (page: Page, frame: number) =>
  page.evaluate((index) => {
    const slider = document.querySelector<HTMLInputElement>("#scrub")!;
    slider.value = String(index);
    slider.dispatchEvent(new Event("input"));
    return document
      .querySelector<HTMLCanvasElement>("#commerce-preview")!
      .toDataURL()
      .split(",")[1]!;
  }, frame);
async function rgb(path: string, frame?: number) {
  const filters = [
    ...(frame === undefined ? [] : ["select=eq(n\\," + frame + ")"]),
    "scale=96:96:flags=bicubic",
  ];
  const { stdout } = await run(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-vf",
      filters.join(","),
      "-fps_mode",
      "vfr",
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    { encoding: "buffer" },
  );
  return new Uint8Array(stdout);
}
async function probe(path: string) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,nb_frames,r_frame_rate",
    "-of",
    "json",
    path,
  ]);
  return JSON.parse(stdout).streams[0];
}
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const origin = server.resolvedUrls!.local[0]!;
  const catalog = JSON.parse(
    await readFile("benchmarks/fixtures/ecommerce-motion/catalog.json", "utf8"),
  ) as { id: string }[];
  const entries = catalog.filter(
    (entry) => !profileFilter || entry.id.endsWith("-" + profileFilter),
  );
  assert.ok(entries.length, "The requested profile needs at least one fixture");
  for (const entry of entries) {
    const scenePath = resolve(
      "benchmarks/fixtures/ecommerce-motion/" + entry.id + ".json",
    );
    const source = await readFile(scenePath);
    const scene = CommerceSceneSchema.parse(JSON.parse(source.toString()));
    await page.goto(origin + "commerce.html?fixture=" + entry.id);
    await ready(page, scene.recipe.preset);
    const video = join(output, entry.id + ".mp4");
    for (const suffix of ["", ".scene.json", ".result.json"])
      await rm(video + suffix, { force: true });
    await new PreparedAnimationEngine().animate({
      scenePath,
      outputPath: video,
    });
    const result = CommerceAnimationResultSchema.parse(
      JSON.parse(await readFile(video + ".result.json", "utf8")),
    );
    assert.equal(
      result.checksums.source,
      "sha256:" + createHash("sha256").update(source).digest("hex"),
    );
    assert.equal(result.frameCount, scene.frameCount);
    const stream = await probe(video);
    assert.deepEqual(
      [
        stream.width,
        stream.height,
        Number(stream.nb_frames),
        stream.r_frame_rate,
      ],
      [scene.width, scene.height, scene.frameCount, scene.fps + "/1"],
    );
    const captures = new Map<number, string>();
    const scores = [];
    const indices = [
      0,
      Math.round(scene.frameCount * 0.17),
      Math.round(scene.frameCount * 0.35),
      Math.round(scene.frameCount * 0.6),
      Math.round(scene.frameCount * 0.8),
      scene.frameCount - 1,
      0,
    ];
    for (const frame of indices) {
      const base64 = await seek(page, frame);
      if (captures.has(frame)) {
        assert.equal(base64, captures.get(frame), entry.id + " backward seek");
        continue;
      }
      captures.set(frame, base64);
      const image = join(temporary, entry.id + "-" + frame + ".png");
      await writeFile(image, Buffer.from(base64, "base64"));
      const score = compareFrameSamples(
        await rgb(image),
        await rgb(video, frame),
        96,
        96,
      );
      assert.equal(
        score.warning,
        null,
        entry.id + " frame " + frame + ": " + JSON.stringify(score),
      );
      scores.push({ frame, ...score });
    }
    assert.notEqual(
      captures.get(0),
      captures.get(scene.frameCount - 1),
      "The scene must visibly animate",
    );
    if (
      [
        "a01-portrait",
        "h04-square",
        "h03-thai",
        "h03-landscape",
        "h03-beauty-feed",
        "h01-beauty-feed",
        "h04-beauty-feed",
        "a01-beauty-feed",
      ].includes(entry.id)
    ) {
      await seek(page, Math.round(scene.frameCount * 0.6));
      await page
        .locator("#commerce-preview")
        .screenshot({ path: join(output, entry.id + "-preview.png") });
      await page.screenshot({
        path: join(output, entry.id + "-workbench.png"),
        fullPage: true,
      });
    }
    if (entry.id.includes("-beauty-")) {
      await writeFile(
        join(output, entry.id + "-poster.png"),
        Buffer.from(await seek(page, scene.frameCount - 1), "base64"),
      );
    }
    evidence.push({
      id: entry.id,
      width: scene.width,
      height: scene.height,
      frames: scene.frameCount,
      fps: scene.fps,
      totalWallMs: result.metrics.totalWallMs,
      scores,
    });
    console.log(
      entry.id + ": export, six parity frames and backward seek passed",
    );
  }
  // Exercise both public CLI commands with A01 at the second supported frame rate.
  const a01Brief = JSON.parse(
    await readFile(
      "benchmarks/fixtures/ecommerce-motion/a01-landscape.brief.json",
      "utf8",
    ),
  );
  a01Brief.fps = 24;
  a01Brief.frameCount = 240;
  a01Brief.product.imagePath = resolve(
    "assets/ecommerce-motion/sample-one.png",
  );
  const a01BriefPath = join(temporary, "a01-24.brief.json");
  const a01ScenePath = join(temporary, "a01-24.json");
  const a01Video = join(output, "a01-24.mp4");
  await writeFile(a01BriefPath, JSON.stringify(a01Brief));
  for (const suffix of ["", ".scene.json", ".result.json"])
    await rm(a01Video + suffix, { force: true });
  await run(process.execPath, [
    "--import",
    "tsx",
    "tools/still-shift-cli/src/cli.ts",
    "prepare-commerce",
    "--brief",
    a01BriefPath,
    "--output",
    a01ScenePath,
  ]);
  await run(process.execPath, [
    "--import",
    "tsx",
    "tools/still-shift-cli/src/cli.ts",
    "animate-scene",
    "--scene",
    a01ScenePath,
    "--output",
    a01Video,
  ]);
  const a01Stream = await probe(a01Video);
  assert.equal(Number(a01Stream.nb_frames), 240);
  assert.equal(a01Stream.r_frame_rate, "24/1");
  await page.goto(origin + "commerce.html");
  await ready(page, "H03");
  await page.locator("#load-beauty").click();
  await page.waitForFunction(
    () =>
      (document.querySelector("#profile") as HTMLSelectElement).value ===
        "feed" &&
      document.querySelector("#status")?.textContent?.startsWith("H03 ready"),
  );

  assert.equal(await page.locator("#profile").inputValue(), "feed");
  assert.equal(await page.locator("#art-direction").inputValue(), "editorial");
  assert.match(await page.locator("#fixture-note").innerText(), /AI-generated/);
  await page.fill("#headline", "A ritual,\nmade yours.");
  await page.fill("#cta", "Explore SAMPLE 01");
  for (const preset of ["H01", "H04", "A01", "H03"]) {
    await page.locator('.format[data-id="' + preset + '"]').click();
    await ready(page, preset);
    assert.equal(
      await page.locator("#export").isDisabled(),
      false,
      preset + " should render when selected from the beauty example",
    );
    assert.equal(await page.locator("#profile").inputValue(), "feed");
    assert.equal(
      await page.locator("#headline").inputValue(),
      "A ritual,\nmade yours.",
    );
    assert.equal(await page.locator("#cta").inputValue(), "Explore SAMPLE 01");
    assert.equal(
      await page.locator("#art-direction").inputValue(),
      preset === "H03" ? "editorial" : "studio",
    );
    assert.equal(
      await page.locator("#preparation").inputValue(),
      preset === "H03" ? "photo" : "cutout",
    );
    if (preset === "H04") {
      assert.equal(
        await page.locator("#callout-0").inputValue(),
        "Brushed cap",
      );
      await page.fill("#callout-0", "Brushed finish");
    }
    if (preset === "A01") {
      assert.equal(
        await page.locator("#callout-0").inputValue(),
        "Brushed finish",
      );
      const image = join(temporary, "selected-a01.png");
      await writeFile(image, Buffer.from(await seek(page, 180), "base64"));
      const downloaded = page.waitForEvent("download", { timeout: 120000 });
      await page.locator("#export").click();
      const video = join(output, "selected-a01-beauty.mp4");
      await (await downloaded).saveAs(video);
      assert.equal(Number((await probe(video)).nb_frames), 300);
      assert.equal(
        compareFrameSamples(await rgb(image), await rgb(video, 180), 96, 96)
          .warning,
        null,
      );
    }
  }
  assert.equal(await page.locator(".format").count(), 48);
  await page.selectOption("#availability", "ready");
  assert.equal(await page.locator(".format").count(), 4);
  await page.selectOption("#availability", "");
  await page.fill("#search", "P08");
  await page.locator('.format[data-id="P08"]').click();
  assert.equal(await page.locator("#export").isDisabled(), true);
  assert.equal(await page.locator("#commerce-preview").isVisible(), false);
  assert.match(await page.locator("#status").innerText(), /Reference only/);

  await page.goto(origin + "commerce.html?fixture=a01-portrait");
  await ready(page, "A01");
  await page.locator("#restart").click();
  await page.locator("#play").click();
  await page.waitForFunction(
    () =>
      Number((document.querySelector("#scrub") as HTMLInputElement).value) > 30,
  );
  await page.locator("#play").click();
  const frozen = await page.locator("#scrub").inputValue();
  await page.waitForTimeout(100);
  assert.equal(await page.locator("#scrub").inputValue(), frozen);
  await page.fill("#headline", "A".repeat(250));
  assert.equal(await page.locator("#export").isDisabled(), true);
  await page.locator("#update").click();
  await page.waitForFunction(() =>
    document.querySelector("#status")?.classList.contains("error"),
  );
  assert.match(
    await page.locator("#status").innerText(),
    /Text does not fit|Text overflows/,
  );
  assert.equal(await page.locator("#export").isDisabled(), true);

  // Upload a second asset and author a fresh brief, then reproduce its source bundle.
  await page.goto(origin + "commerce.html");
  await ready(page, "H03");
  await page.setInputFiles(
    "#product-file",
    "assets/ecommerce-motion/sample-two.png",
  );
  await page.waitForFunction(
    () =>
      (document.querySelector("#headline") as HTMLInputElement).value === "",
  );
  assert.equal(await page.locator("#fixture-note").isVisible(), false);
  assert.equal(await page.locator("#export").isDisabled(), true);
  await page.fill("#product-name", "SECOND SAMPLE");
  await page.fill("#headline", "Another daily ritual.");
  await page.fill("#cta", "Explore the sample");
  await page.locator(".asset-details").evaluate((element) => {
    (element as HTMLDetailsElement).open = true;
  });
  await page.fill(
    "#product-source",
    "Original second studio illustration, fixture use.",
  );
  await page.fill("#copy-source", "Original test copy, no factual claim.");
  await page.selectOption("#profile", "square");
  await page.selectOption("#fps", "24");
  await page.locator("#update").click();
  await ready(page, "H03");
  const uploadPreview = await seek(page, 191);
  const downloadEvent = page.waitForEvent("download");
  await page.locator("#download").click();
  const zip = join(temporary, "source.zip");
  await (await downloadEvent).saveAs(zip);
  await run("unzip", ["-t", zip]);
  const bundle = join(temporary, "bundle");
  await run("unzip", ["-q", zip, "-d", bundle]);
  const prepared = CommerceSceneSchema.parse(
    JSON.parse(await readFile(join(bundle, "scene.json"), "utf8")),
  );
  assert.equal(prepared.metadata.productId, "sample-two.png");
  assert.equal(prepared.frameCount, 192);
  assert.equal(prepared.width, 1080);
  assert.deepEqual(
    await readFile(join(bundle, "assets/product.png")),
    await readFile("assets/ecommerce-motion/sample-two.png"),
  );
  assert.match(
    await readFile(join(bundle, "assets/OFL.txt"), "utf8"),
    /SIL OPEN FONT LICENSE/,
  );
  const videoDownload = page.waitForEvent("download", { timeout: 120000 });
  await page.locator("#export").click();
  const uiVideo = join(output, "uploaded-second-product.mp4");
  await (await videoDownload).saveAs(uiVideo);
  assert.equal(Number((await probe(uiVideo)).nb_frames), 192);
  const uploadImage = join(temporary, "upload.png");
  await writeFile(uploadImage, Buffer.from(uploadPreview, "base64"));
  assert.equal(
    compareFrameSamples(await rgb(uploadImage), await rgb(uiVideo, 191), 96, 96)
      .warning,
    null,
  );
  await new PreparedAnimationEngine().animate({
    scenePath: join(bundle, "scene.json"),
    outputPath: join(temporary, "reproduced.mp4"),
  });
  assert.deepEqual(
    await rgb(uiVideo, 191),
    await rgb(join(temporary, "reproduced.mp4"), 191),
  );
  // Non-millisecond-aligned timing must survive the frame-authoritative export path.
  prepared.frameCount = 257;
  const fractional = join(bundle, "fractional.json");
  await writeFile(fractional, JSON.stringify(prepared));
  const fractionalVideo = join(temporary, "fractional.mp4");
  await new PreparedAnimationEngine().animate({
    scenePath: fractional,
    outputPath: fractionalVideo,
  });
  assert.equal(Number((await probe(fractionalVideo)).nb_frames), 257);

  const rejected = await page.request.post(origin + "commerce/export", {
    headers: { origin: "https://example.invalid", "X-Still-Shift": "commerce" },
    data: {},
  });
  assert.equal(rejected.status(), 403);
  assert.equal(
    (
      await page.request.post(origin + "commerce/export", { data: {} })
    ).status(),
    403,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: join(output, "commerce-mobile.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    join(
      output,
      profileFilter
        ? "commerce-" + profileFilter + "-verification.json"
        : "commerce-verification.json",
    ),
    JSON.stringify(
      {
        fixtures: evidence,
        backwardSeeks: entries.length,
        beautyFormatSwitching: true,
        editedCopyPreserved: true,
        selectedA01Export: true,
        uploadedSourceRoundTrip: true,
        uiExport: true,
        a01Cli240At24: true,
        frame257At24: true,
        overflowRejected: true,
        referenceOnlyBlocked: true,
        mobileNoOverflow: true,
        browserErrors: errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Commerce browser checks passed: " +
      entries.length +
      " fixtures, " +
      entries.length * 6 +
      " parity frames, source bundle, photo example, upload/export and responsive layout.",
  );
} finally {
  await browser?.close();
  await server.close();
  await rm(temporary, { recursive: true, force: true });
}
