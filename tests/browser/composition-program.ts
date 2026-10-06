import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { launchRenderBrowser } from "@still-shift/execution-runtime";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";
import { qualityCapacityComposition } from "../helpers/composition-quality-fixtures.ts";
const run = promisify(execFile),
  root = await mkdtemp(join(tmpdir(), "composition-program-browser-"));
const helper = join(root, "helper.ts"),
  input = join(root, "program.ts"),
  art = join(root, "art.svg");
let session: Awaited<ReturnType<typeof createProgramPreview>> | undefined;
let browser: Awaited<ReturnType<typeof launchRenderBrowser>> | undefined;
const cli = (args: string[]) =>
  run(
    process.execPath,
    [
      "--import",
      "tsx",
      resolve("tools/still-shift-cli/src/cli.ts"),
      "comp",
      ...args,
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
try {
  await writeFile(helper, "export const x=4;export const count=24;");
  await writeFile(
    art,
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="12"><rect width="8" height="12" fill="#FF0000"/></svg>',
  );
  await writeFile(
    input,
    `import{comp,image}from'@still-shift/motion';import{imageAsset}from'@still-shift/motion/node';import{x,count}from'./helper.ts';const art=await imageAsset('art','./art.svg',{relativeTo:import.meta.url});export default comp({width:64,height:64,fps:24,frames:count},c=>{const n=c.add(image('drawing',art).at(x,8));c.timeline(n.x.by(8,6));});`,
  );
  session = await createProgramPreview(input, { watch: true });
  browser = await launchRenderBrowser();
  const page = await browser.newPage();
  await page.goto(session.url);
  await page.waitForFunction(
    () => document.getElementById("status")?.dataset.revision === "1",
  );
  assert.equal(
    await page.locator("html").getAttribute("data-readonly"),
    "true",
  );
  await page.locator("#frame").fill("17");
  await page.locator("#frame").dispatchEvent("input");
  await page.evaluate(() => {
    (window as unknown as { watchSentinel: number }).watchSentinel = 42;
  });
  const pixels = () =>
    page.evaluate(() =>
      Array.from(
        (document.getElementById("preview") as HTMLCanvasElement)
          .getContext("2d")!
          .getImageData(0, 0, 64, 64).data,
      ),
    );
  const first = await pixels();
  await writeFile(helper, "export const x=NaN;export const count=24;");
  await page.waitForFunction(() =>
    document.getElementById("error")!.textContent!.includes("comp-schema-type"),
  );
  assert.deepEqual(await pixels(), first);
  assert.equal(await page.locator("#frame").inputValue(), "17");
  assert.equal(await page.locator("#play").isEnabled(), true);
  await writeFile(helper, "export const x=14;export const count=24;");
  await page.waitForFunction(
    () => Number(document.getElementById("status")?.dataset.revision) > 1,
  );
  assert.equal(await page.locator("#frame").inputValue(), "17");
  assert.notDeepEqual(await pixels(), first);
  assert.equal(
    await page.evaluate(
      () => (window as unknown as { watchSentinel: number }).watchSentinel,
    ),
    42,
  );
  const revision = Number(
    await page.locator("#status").getAttribute("data-revision"),
  );
  await writeFile(helper, "export const x=14;export const count=8;");
  await page.waitForFunction(
    (previous) =>
      Number(document.getElementById("status")?.dataset.revision) > previous,
    revision,
  );
  assert.equal(await page.locator("#frame").inputValue(), "7");
  await page.locator("#backend").selectOption("webgl2");
  await page.waitForFunction(
    () => document.getElementById("status")?.dataset.backend === "webgl2",
  );
  assert.equal(await page.locator("#frame").inputValue(), "7");
  await page.route("**/composition/program", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.snapshot.composition = qualityCapacityComposition();
    payload.snapshot.document = payload.snapshot.composition;
    payload.snapshot.assets = {};
    await route.fulfill({ response, json: payload });
  });
  await page.locator("#backend").selectOption("canvas2d");
  await page.waitForFunction(
    () => document.getElementById("status")?.dataset.backend === "canvas2d",
  );
  await page.locator("#reload-source").click();
  await page.waitForFunction(() =>
    document
      .getElementById("lint-summary")
      ?.textContent?.startsWith("Motion checks unavailable: comp-lint-limit"),
  );
  assert.equal(await page.locator("#frame").inputValue(), "7");
  assert.equal(await page.locator("#play").isEnabled(), true);
  assert.equal(await page.locator("#lint").isDisabled(), true);
  assert.equal(await page.locator("#lint-timeline").innerText(), "");
  assert.equal(await page.locator("#lint-findings").innerText(), "");
  assert.equal(await page.locator("#error").innerText(), "");
  assert.equal(
    await page.locator("html").getAttribute("data-readonly"),
    "true",
  );
  assert.equal(
    await page.locator("#status").getAttribute("data-backend"),
    "canvas2d",
  );
  await browser.close();
  browser = undefined;
  await session.close();
  session = undefined;
  const json = join(root, "compiled.json");
  await cli(["export-json", "--input", input, "--output", json]);
  const hashes = [];
  for (const [source, name] of [
    [input, "builder"],
    [json, "json"],
  ] as const) {
    const output = join(root, `${name}.mp4`);
    await cli(["render", "--input", source, "--output", output]);
    const probe = JSON.parse(
      (
        await run("ffprobe", [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=width,height,nb_frames,r_frame_rate",
          "-of",
          "json",
          output,
        ])
      ).stdout,
    );
    assert.deepEqual(probe.streams[0], {
      width: 64,
      height: 64,
      r_frame_rate: "24/1",
      nb_frames: "8",
    });
    hashes.push(
      createHash("sha256")
        .update(await readFile(output))
        .digest("hex"),
    );
  }
  assert.equal(hashes[0], hashes[1]);
  console.log(
    JSON.stringify({
      status: "passed",
      watch: {
        helperReload: true,
        invalidKeepsPixels: true,
        frameRetained: 17,
        shorterClamped: 7,
        backendSwitch: true,
        fullReload: false,
        readonlyBuilder: true,
        advisoryLintKeepsPreviewAndFrame: true,
      },
      render: {
        sources: ["typescript", "json"],
        frames: 8,
        fps: 24,
        byteIdentical: true,
      },
    }),
  );
} finally {
  await browser?.close();
  await session?.close();
  await rm(root, { recursive: true, force: true });
}
