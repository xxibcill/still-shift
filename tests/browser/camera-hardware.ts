import assert from "node:assert/strict";
import { launchRenderBrowser,probeRenderEnvironment } from "@still-shift/execution-runtime";
import type { Composition } from "@still-shift/scene-contract";
import type { Browser,Page } from "playwright";
import { compareFrames,meetsTier,strictestTier } from "../../packages/renderer-core/src/frame-tolerance.ts";
import { cameraPreview } from "./camera-preview.ts";
export type CameraFixture={name:string;doc:Composition;assetUrls:Record<string,string>;backends:readonly ("canvas2d"|"webgl2")[]};
export async function cameraHardwarePreview(url:string,fixtures:CameraFixture[]) {
  const sessions:{browser:Browser;page:Page;environment:Awaited<ReturnType<typeof probeRenderEnvironment>>}[]=[];
  try {
    for(const profile of ["pinned","hardware"] as const) {
      const browser=await launchRenderBrowser({profile}),page=await browser.newPage();
      await page.addInitScript("window.__name=(fn)=>fn;");await page.goto(url);
      sessions.push({browser,page,environment:await probeRenderEnvironment(page,profile)});
    }
    assert.doesNotMatch(sessions[1]!.environment.webglRenderer,/SwiftShader/,"CE8 needs an actual hardware GPU");
    const reports=[];
    for(const fixture of fixtures) for(const backend of fixture.backends) for(const frame of [0,16,31]) {
      const bytes=[];
      for(const {page} of sessions) {
        const result=await cameraPreview(page,fixture.doc,fixture.assetUrls,backend,[frame]);
        bytes.push(new Uint8ClampedArray(Buffer.from(result.pixels[frame]!,"base64")));
      }
      const metrics=compareFrames(bytes[0]!,bytes[1]!,fixture.doc.width,fixture.doc.height);
      assert(meetsTier(metrics,"perceptual"),`${fixture.name}/${backend}/${frame}: hardware ${JSON.stringify(metrics)}`);
      reports.push({fixture:fixture.name,backend,frame,tier:strictestTier(metrics),...metrics,psnr:Number.isFinite(metrics.psnr) ? metrics.psnr : 999});
    }
    return {environments:sessions.map(x=>x.environment),policy:"unchanged perceptual hardware policy",reports};
  } finally {for(const {browser} of sessions) await browser.close();}
}
