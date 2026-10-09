import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { setTimeout, clearTimeout } from "node:timers";
import { launchRenderBrowser } from "still-shift/runtime";

const child = spawn(
  resolve("node_modules/.bin/still-shift"),
  ["comp", "preview", "--input", "composition.ts"],
  { stdio: ["ignore", "pipe", "pipe"] },
);
const exited = once(child, "exit");
let browser;
let stderr = "";
child.stderr.on("data", (bytes) => {
  stderr += bytes;
});
try {
  const url = await new Promise((done, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Preview startup timed out: ${stderr}`)),
      30_000,
    );
    let buffer = "";
    child.once("error", reject);
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error(`Preview exited: ${stderr}`));
    });
    child.stdout.on("data", (bytes) => {
      buffer += bytes;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("{")) continue;
        const result = JSON.parse(line);
        if (result.status === "preview") {
          clearTimeout(timer);
          done(result.url);
        }
      }
    });
  });
  browser = await launchRenderBrowser();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.locator('#status[data-revision="1"]').waitFor();
  assert.equal(await page.locator("#play").isEnabled(), true);
  assert.match(
    await page.locator("#command").textContent(),
    /npx still-shift comp render/,
  );
  await page.locator("#frame").fill("2");
  await page.locator("#frame").dispatchEvent("input");
  assert.equal(await page.locator("#frame").inputValue(), "2");
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  await exited;
  clearTimeout(timer);
}
