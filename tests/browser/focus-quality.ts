import assert from "node:assert/strict";
import { resolve } from "node:path";
import type { Page } from "playwright";
import type { CinematicScene } from "../../packages/scene-contract/src/cinematic.ts";
import type * as Probe from "./focus-pixels.ts";

export async function inspectFocusQuality(page: Page, source: CinematicScene) {
  const result = await page.evaluate(
    async ({ source, url }) => {
      const probe = (await import(url)) as typeof Probe;
      return probe.measureFocusPixels(source);
    },
    { source, url: `/@fs${resolve("tests/browser/focus-pixels.ts")}` },
  );
  assert.ok(
    result.ending.near < result.opening.near * 0.7,
    "Foreground must visibly lose high-frequency detail",
  );
  assert.ok(
    result.ending.subject > result.opening.subject * 1.5,
    "Destination must visibly gain high-frequency detail",
  );
  assert.deepEqual(
    result.repeated,
    result.opening,
    "Seeking must not leak filter state",
  );
  assert.ok(
    result.blurredOutside[0]! >= 250 &&
      result.blurredOutside[1]! > 20 &&
      result.blurredOutside[1]! < 245,
    "Blur must spread outside the source rectangle without a black fringe",
  );
  assert.equal(result.blurredOutside[1], result.blurredOutside[2]);
  assert.deepEqual(result.sharpOutside, [255, 255, 255, 255]);
  assert.deepEqual(result.corner, [255, 255, 255, 255]);
  assert.match(result.unsupportedError, /requires Canvas 2D filter support/);
  return result;
}
