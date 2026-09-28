import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium, type Page, type Route } from "playwright";
import { createServer } from "vite";

type DelayedImageWindow = Window & {
  delayedImage: { started: boolean; finished: boolean; release: () => void };
};

const workflows = [
  {
    name: "Commerce",
    url: "commerce.html?fixture=a01-portrait",
    canvas: "#commerce-preview",
    text: "#headline",
    form: "#brief-form",
    downloads: ["#download"],
    locksEditing: false,
  },
  {
    name: "Commerce components",
    url: "commerce-components.html?demo=introduction",
    canvas: "#commerce-preview",
    text: "#demo-text",
    form: "#component-form",
    downloads: ["#download"],
    locksEditing: false,
  },
  {
    name: "Reusable components",
    url: "reusable-components.html?example=tour&mode=commerce",
    canvas: "#preview",
    text: '[name="middleText"]',
    form: "#settings",
    downloads: ["#source", "#save"],
    locksEditing: true,
  },
];

function ready(page: Page) {
  return page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes(" ready ·"),
  );
}
function pixels(page: Page, selector: string) {
  return page
    .locator(selector)
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
}
function apply(page: Page, form: string) {
  return page.locator(form).evaluate((node) => {
    node.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}
async function holdNextImage(page: Page) {
  // Delay the browser's asset decoding boundary; no session internals are exposed.
  await page.evaluate(`(() => {
    const gate = Promise.withResolvers();
    const state = { started: false, finished: false, release: gate.resolve };
    window.delayedImage = state;
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      HTMLImageElement.prototype.decode = decode;
      state.started = true;
      await decode.call(this);
      await gate.promise;
      state.finished = true;
    };
  })()`);
}
async function releaseImage(page: Page) {
  await page.evaluate(() =>
    (window as unknown as DelayedImageWindow).delayedImage.release(),
  );
  await page.waitForFunction(
    () => (window as unknown as DelayedImageWindow).delayedImage.finished,
  );
  // Let the rejected candidate finish loading its remaining local font/asset data.
  await page.waitForTimeout(300);
}
async function holdExport(page: Page) {
  let receive!: (route: Route) => void;
  const request = new Promise<Route>((resolve) => {
    receive = resolve;
  });
  await page.route("**/commerce/export", (route) => receive(route), {
    times: 1,
  });
  await page.locator("#export").click();
  const route = await request;
  return {
    scene: route.request().postDataJSON().scene as { frameCount: number },
    fail: () =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Injected export failure" }),
      }),
  };
}

const server = await createServer({
  configFile: resolve("apps/lab/vite.config.ts"),
  server: { port: 0, strictPort: false, watch: null },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const origin = server.resolvedUrls!.local[0]!;
  for (const workflow of workflows) {
    await page.goto(origin + workflow.url);
    await ready(page);
    const before = await pixels(page, workflow.canvas);
    await page.locator(workflow.text).fill("X".repeat(250));
    await apply(page, workflow.form);
    await page
      .waitForFunction(() =>
        document.querySelector("#status")?.textContent?.includes("preserved"),
      )
      .catch(async (error) => {
        throw new Error(
          workflow.name + ": " + (await page.locator("#status").innerText()),
          { cause: error },
        );
      });
    assert.equal(
      await pixels(page, workflow.canvas),
      before,
      workflow.name + " retains the valid canvas after invalid text",
    );
    for (const selector of [
      "#play",
      "#scrub",
      "#export",
      ...workflow.downloads,
    ])
      assert.equal(
        await page.locator(selector).isDisabled(),
        true,
        selector + " stays blocked while edits are invalid",
      );

    for (const staleText of ["First edit", "X".repeat(250)]) {
      await page.locator(workflow.text).fill(staleText);
      await holdNextImage(page);
      await apply(page, workflow.form);
      await page.waitForFunction(
        () => (window as unknown as DelayedImageWindow).delayedImage.started,
      );
      await page.locator(workflow.text).fill("Latest edit");
      await apply(page, workflow.form);
      await ready(page);
      const latest = await pixels(page, workflow.canvas);
      const status = await page.locator("#status").innerText();
      await releaseImage(page);
      assert.equal(
        await pixels(page, workflow.canvas),
        latest,
        workflow.name + " ignores the late candidate",
      );
      assert.equal(await page.locator("#status").innerText(), status);
      assert.equal(await page.locator("#export").isEnabled(), true);
    }

    // An export keeps the accepted scene even while editable pages change.
    const pending = await holdExport(page);
    assert.ok(JSON.stringify(pending.scene).includes("Latest edit"));
    assert.equal(await page.locator("#export").isDisabled(), true);
    if (workflow.locksEditing) {
      assert.equal(await page.locator(workflow.text).isDisabled(), true);
      assert.equal(await page.locator("#save").isDisabled(), true);
    } else {
      await page.locator(workflow.text).fill("Next edit");
      await apply(page, workflow.form);
      await ready(page);
      assert.ok(!JSON.stringify(pending.scene).includes("Next edit"));
    }
    await pending.fail();
    await page.waitForFunction(
      () => !document.querySelector<HTMLButtonElement>("#export")!.disabled,
    );
    if (workflow.locksEditing) {
      assert.match(
        await page.locator("#status").innerText(),
        /Injected export failure/,
      );
      assert.equal(await page.locator(workflow.text).isEnabled(), true);
    } else {
      assert.match(await page.locator("#status").innerText(), / ready ·/);
    }
    for (const selector of ["#play", "#scrub", ...workflow.downloads])
      assert.equal(
        await page.locator(selector).isEnabled(),
        true,
        selector + " recovers after export failure",
      );

    const retry = await holdExport(page);
    assert.ok(
      JSON.stringify(retry.scene).includes(
        workflow.locksEditing ? "Latest edit" : "Next edit",
      ),
    );
    await retry.fail();
    await page.waitForFunction(
      () => !document.querySelector<HTMLButtonElement>("#export")!.disabled,
    );
    assert.match(
      await page.locator("#status").innerText(),
      /Injected export failure/,
    );
    await page.locator("#scrub").evaluate((scrub: HTMLInputElement) => {
      scrub.value = "0";
      scrub.dispatchEvent(new Event("input"));
    });
    await page.locator("#play").click();
    await page.waitForFunction(
      () =>
        Number(document.querySelector<HTMLInputElement>("#scrub")!.value) > 2,
    );
    await page.locator("#play").click();
    assert.equal(await page.locator("#play").innerText(), "Play");
    console.log(
      workflow.name +
        ": stale loads, failed edit preservation, export snapshots, retry and playback recovery passed",
    );
  }
  await page.route(
    "**/commerce/scenes/a01-beauty-feed.json",
    (route) => route.fulfill({ status: 503, body: "unavailable" }),
    { times: 1 },
  );
  await page.goto(origin + "commerce-components.html?demo=studio");
  await page.waitForFunction(() =>
    document
      .querySelector("#status")
      ?.textContent?.includes("Could not load the approved demo assets"),
  );
  assert.equal(await page.locator("#export").isDisabled(), true);
  await page.locator("#update").click();
  await ready(page);
  assert.equal(await page.locator("#export").isEnabled(), true);
  console.log(
    "Commerce components: failed source request retries without reloading the page",
  );

  await page.goto(origin + "?format=vertical");
  await page.locator("#preset").selectOption("locked_hold");
  await page.locator("#local-source").setInputFiles({
    name: "vertical-lab-source.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#72896d"/><circle cx="320" cy="180" r="72" fill="#ebc783"/></svg>',
    ),
  });
  await page.locator("#load-local").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#status")
      ?.textContent?.includes("Vertical preview needs a focus point"),
  );
  assert.match(
    await page.locator("#status").innerText(),
    /Choose Set manually/,
  );
  await page.locator("#focus-mode").selectOption("manual");
  await page.locator("#load-local").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#status")
      ?.textContent?.includes("ready · 1080 × 1920"),
  );
  assert.deepEqual(
    await page
      .locator("#preview")
      .evaluate((node: HTMLCanvasElement) => [node.width, node.height]),
    [1080, 1920],
  );
  await page.locator("#show-guides").check();
  assert.equal(
    await page
      .locator("#preview-guides")
      .evaluate((node: HTMLCanvasElement) => {
        const pixels = node
          .getContext("2d")!
          .getImageData(0, 0, node.width, node.height).data;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true;
        return false;
      }),
    true,
    "the vertical preview shows the landscape footprint guide",
  );
  await page.locator("#output-format").selectOption("landscape");
  await page.waitForFunction(() =>
    document
      .querySelector("#status")
      ?.textContent?.includes("ready · 1920 × 1080"),
  );
  assert.deepEqual(
    await page
      .locator("#preview")
      .evaluate((node: HTMLCanvasElement) => [node.width, node.height]),
    [1920, 1080],
  );
  console.log(
    "Depth Lab: vertical format, scene-sized canvas and guide overlay passed",
  );
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await server.close();
}
