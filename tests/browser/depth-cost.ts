import type { Page } from "playwright";
import type { Composition } from "@still-shift/scene-contract";
import type { PreviewScene } from "@still-shift/renderer-core";
import type * as Render from "../../packages/renderer-core/src/index.ts";
import type * as Legacy from "../helpers/legacy-depth-oracle.ts";

/** Serial old/native/old brackets; records costs without changing CE6-P ownership. */
export async function depthRenderCosts(page: Page, doc: Composition, scene: PreviewScene, urls: Record<string,string>) {
  return page.evaluate(async ({json, scene, urls}) => {
    const doc = JSON.parse(json) as Composition,
      renderUrl = "/packages/renderer-core/src/index.ts",
      legacyUrl = "/tests/helpers/legacy-depth-oracle.ts",
      renderer: typeof Render = await import(renderUrl),
      legacy: typeof Legacy = await import(legacyUrl),
      resources = await renderer.loadCompositionResources(doc, id => urls[id]!),
      canvas = document.createElement("canvas"),
      oldCanvas = document.createElement("canvas");
    oldCanvas.width = doc.width;
    oldCanvas.height = doc.height;
    const native = renderer.createCompositionPreview(canvas, doc, resources, {backend:"webgl2"}),
      old = legacy.createWebGLPreview(oldCanvas, scene,
        resources.images.get("source") as HTMLImageElement,
        resources.images.get("depth") as HTMLImageElement | undefined ?? null),
      gl = oldCanvas.getContext("webgl2")!,
      oldPixels = new Uint8Array(doc.width*doc.height*4);
    const measure = (kind: "old" | "native", offset: number) => {
      const times: number[] = [], samples: number[] = [];
      for (let index=0; index<8; index++) {
        const frame = offset+index, start = performance.now();
        if (kind === "old") {
          old.renderFrame(frame);
          gl.readPixels(0,0,doc.width,doc.height,gl.RGBA,gl.UNSIGNED_BYTE,oldPixels);
        } else {
          const report = native.renderFrame(frame);
          native.readPixels();
          samples.push(report.samples);
        }
        times.push(performance.now()-start);
      }
      const measured = times.slice(3), sorted = [...measured].sort((a,b) => a-b);
      return {cold: times[0]!, warmups:times.slice(1,3), measured, median:sorted[2]!,
        ...(kind === "native" ? {actualSampleCounts:samples} : {})};
    };
    try {
      const before = measure("old", 0), actual = measure("native", 0), after = measure("old", 0);
      return {width:doc.width, height:doc.height, oldBefore:before, native:actual, oldAfter:after,
        ratio: actual.median/((before.median+after.median)/2),
        shader:legacy.SHADER_VERSION, rendererVersion:native.rendererVersion,
        policy:"recorded serial render/readback; deferred WebGL speed targets remain CE6-P"};
    } finally {native.dispose(); old.dispose();}
  }, {json:JSON.stringify(doc), scene, urls});
}
