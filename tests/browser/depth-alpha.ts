import assert from "node:assert/strict";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
  assertPinnedRenderEnvironment,
} from "@still-shift/execution-runtime";
import { depthAlphaEdgeAcceptance } from "./depth-failures.ts";
import { depthBitmapAcceptance } from "./depth-bitmaps.ts";

export async function depthAlphaProfileAcceptance(url: string) {
  const reports = [];
  for (const profile of ["pinned", "hardware"] as const) {
    const browser = await launchRenderBrowser({ profile });
    try {
      const page = await browser.newPage();
      await page.addInitScript("window.__name=(fn)=>fn;");
      await page.goto(url);
      const environment = await probeRenderEnvironment(page, profile);
      if (profile === "pinned") assertPinnedRenderEnvironment(environment);
      else assert.doesNotMatch(environment.webglRenderer, /SwiftShader/);
      const { report } = await depthAlphaEdgeAcceptance(page);
      reports.push({
        profile,
        environment,
        ...report,
        bitmaps: await depthBitmapAcceptance(page),
      });
    } finally {
      await browser.close();
    }
  }
  return reports;
}
