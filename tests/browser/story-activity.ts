import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = await createServer({
  configFile: resolve("apps/lab/vite.config.ts"),
  server: { port: 0, strictPort: false },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `${server.resolvedUrls!.local[0]}illustrated.html?collection=story`,
  );
  await page.waitForFunction(() =>
    document.querySelector("#status")?.textContent?.includes(" ready"),
  );

  const activity = page.locator("#story-activity");
  assert.equal(await activity.isVisible(), true);
  assert.deepEqual(
    await activity
      .locator("[data-role]")
      .evaluateAll((rows) =>
        rows.map((row) => (row as HTMLElement).dataset.role),
      ),
    ["carrier", "action", "response", "current"],
  );
  assert.ok(
    (await activity.locator(".story-activity-segment").count()) > 0,
    "Compiled story events should appear in the activity strip",
  );
  await page.locator("#scrub").evaluate((scrub: HTMLInputElement) => {
    scrub.value = "96";
    scrub.dispatchEvent(new Event("input"));
  });
  assert.equal(await page.locator("#scrub").inputValue(), "96");
  assert.match(
    (await activity.getAttribute("style")) ?? "",
    /--activity-position: 50\.2604/,
  );

  await page.selectOption("#scene", "story:category-swap");
  await page.waitForFunction(() =>
    document
      .querySelector("#status")
      ?.textContent?.startsWith("Category Swap ready"),
  );
  const before = await activity
    .locator("[data-role=action]")
    .getAttribute("aria-label");
  await page.locator("#story-controls summary").click();
  await page.locator("#story-events input").first().fill("100");
  await page.getByRole("button", { name: "Apply timing" }).click();
  assert.match(
    await page.locator("#story-events [role=status]").innerText(),
    /Timing applied/,
  );
  const after = await activity
    .locator("[data-role=action]")
    .getAttribute("aria-label");
  assert.notEqual(after, before, "The strip should follow edited timing");

  const v2 = JSON.parse(
    await readFile(
      "benchmarks/fixtures/story-motion-v2/unequal-margins.json",
      "utf8",
    ),
  );
  const v2ControlsMs = await page.evaluate(async (scene) => {
    const modulePath = "/src/story-controls.ts";
    const { createStoryControls } = await import(/* @vite-ignore */ modulePath);
    const started = performance.now();
    createStoryControls(
      scene,
      () => {},
      () => {},
    );
    return performance.now() - started;
  }, v2);
  assert.ok(
    v2ControlsMs < 2500,
    `192-frame V2 controls took ${v2ControlsMs.toFixed(0)} ms`,
  );
  assert.match(
    await page.locator("#story-quality").innerText(),
    /Longest freeze:/,
  );
  assert.match(
    await page.locator("#story-quality").innerText(),
    /Longest semantic gap:.*Essential text velocity:/,
  );
  assert.ok(
    (await page.locator("#story-quality button").count()) > 0,
    "Continuous diagnostics should provide seek buttons",
  );

  const cameraSpans = await page.evaluate(
    async ({ source, compilerPath }) => {
      const activityPath = "/src/story-activity.ts";
      const { compileStoryScene } = await import(
        /* @vite-ignore */ compilerPath
      );
      const { showStoryActivity } = await import(
        /* @vite-ignore */ activityPath
      );
      const scene = compileStoryScene(source);
      scene.camera = {
        ...scene.camera,
        keys: [
          { frame: 0, x: 960, y: 540, zoom: 1 },
          { frame: 48, x: 960, y: 540, zoom: 1 },
          { frame: 96, x: 970, y: 540, zoom: 1 },
          { frame: 191, x: 970, y: 540, zoom: 1 },
        ],
      };
      scene.motionEvents = [
        {
          node: "camera",
          role: "carrier",
          kind: "camera",
          window: { start: 0, end: 191 },
        },
      ];
      scene.compiledMotion = undefined;
      scene.drivers = [];
      scene.constraints = [];
      showStoryActivity(scene);
      return [
        ...document.querySelectorAll(
          "[data-role=carrier] .story-activity-segment",
        ),
      ].map((segment) => ({
        start: Number((segment as HTMLElement).dataset.start),
        end: Number((segment as HTMLElement).dataset.end),
      }));
    },
    {
      source: v2,
      compilerPath: `/@fs${resolve("packages/renderer-core/src/story-scene.ts")}`,
    },
  );
  assert.equal(cameraSpans.length, 1);
  assert.ok(cameraSpans[0]!.start > 48 && cameraSpans[0]!.start < 60);
  assert.ok(cameraSpans[0]!.end > 90 && cameraSpans[0]!.end <= 97);

  const inactiveConstraint = await page.evaluate(
    async ({ source, compilerPath, evaluatorPath }) => {
      const { compileStoryScene } = await import(
        /* @vite-ignore */ compilerPath
      );
      const { evaluatePreparedNode } = await import(
        /* @vite-ignore */ evaluatorPath
      );
      const activityPath = "/src/story-activity.ts";
      const { showStoryActivity } = await import(
        /* @vite-ignore */ activityPath
      );
      const scene = compileStoryScene(source);
      const target = scene.nodes.find(
        (node: { id: string }) => node.id === "house-a",
      )!;
      scene.tracks = {
        [target.id]: {
          x: [
            { time: 0, value: target.x },
            { time: 20, value: target.x + 20 },
          ],
        },
      };
      scene.motionEvents = [];
      scene.compiledMotion = undefined;
      scene.drivers = [];
      scene.constraints = [
        {
          type: "keep-in-safe-area",
          target: target.id,
          inset: 0,
          clamp: true,
        },
      ];
      const targetMoved =
        evaluatePreparedNode(scene, target, 0).x !==
        evaluatePreparedNode(scene, target, 20).x;
      showStoryActivity(scene);
      return {
        targetMoved,
        response: document
          .querySelector("[data-role=response]")
          ?.getAttribute("aria-label"),
      };
    },
    {
      source: v2,
      compilerPath: `/@fs${resolve("packages/renderer-core/src/story-scene.ts")}`,
      evaluatorPath: `/@fs${resolve("packages/renderer-core/src/prepared-scene.ts")}`,
    },
  );
  assert.equal(inactiveConstraint.targetMoved, true);
  assert.equal(inactiveConstraint.response, "response: no compiled activity");

  await page.selectOption("#scene", "cinematic:ci-09-layered-parallax");
  await page.waitForFunction(
    () =>
      document
        .querySelector("#status")
        ?.textContent?.startsWith("Layered Parallax") &&
      document.querySelector("#status")?.textContent?.includes(" ready"),
  );
  assert.equal(await activity.isVisible(), false);
  assert.equal(await page.locator("#story-controls").isVisible(), false);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Phone layout should not overflow",
  );
  assert.deepEqual(errors, []);
  console.log(
    `Story activity Lab checks passed (${v2ControlsMs.toFixed(0)} ms for V2 controls)`,
  );
} finally {
  await browser?.close();
  await server.close();
}
