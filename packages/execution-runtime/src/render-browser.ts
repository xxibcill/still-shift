import { createHash } from "node:crypto";
import { arch, platform } from "node:process";

import { chromium, type Browser, type Page } from "playwright";

import { AnimationEngineError } from "@still-shift/scene-contract";

/**
 * Identity of the pinned render browser. Bump it whenever the launch flags or the
 * probe drawing change, because either changes cache identity and fingerprints.
 */
export const RENDER_BROWSER_PROFILE = "chromium-software-2" as const;

/**
 * `--disable-gpu` keeps Canvas 2D on Skia's CPU rasteriser and WebGL on SwiftShader.
 * It reproduces the historical headless default byte for byte. Forcing
 * `--use-angle=swiftshader` instead moves Canvas 2D onto GPU rasterisation and changes
 * existing output. `--enable-unsafe-swiftshader` keeps WebGL available on Chromium
 * versions that no longer fall back to SwiftShader automatically. Verified on
 * Chromium 151.0.7922.34 (see docs/composition-engine-plan.md, GPU determinism policy).
 */
export const RENDER_BROWSER_ARGS: readonly string[] = [
  "--disable-gpu",
  "--enable-unsafe-swiftshader",
];

/** Stable diagnostic reported when export would run on an unpinned renderer. */
export const RENDERER_MISMATCH_DIAGNOSTIC = "export-renderer-mismatch" as const;

export type RenderBrowserProfile = "pinned" | "hardware";

export type RenderEnvironment = {
  profile: typeof RENDER_BROWSER_PROFILE | "hardware";
  browserVersion: string;
  webglRenderer: string;
  /** SHA-256 of a fixed Canvas 2D and WebGL drawing; identifies rasterisation output. */
  rasterFingerprint: string;
  platform: NodeJS.Platform;
  arch: string;
};

/** Hardware profile for preview measurement only; never valid for export. */
const hardwareArgs = (): string[] =>
  platform === "darwin"
    ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]
    : ["--enable-gpu", "--ignore-gpu-blocklist"];

export function renderBrowserArgs(profile: RenderBrowserProfile = "pinned") {
  return profile === "pinned" ? [...RENDER_BROWSER_ARGS] : hardwareArgs();
}

/** Launch headless Chromium with the pinned software-rendering profile. */
export function launchRenderBrowser(
  options: { profile?: RenderBrowserProfile } = {},
): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: renderBrowserArgs(options.profile),
  });
}

/**
 * Draws a fixed scene with Canvas 2D (gradients, blur, blending, transforms, image
 * scaling) and WebGL (shader arithmetic, blending), then hashes the pixels. No text is
 * drawn, so system fonts do not affect the result. Runs inside the page.
 */
function rasterProbe(): { webglRenderer: string; pixels: string } {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 128;
  // Match export: frequent-readback mode would force a CPU raster path even on a GPU.
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  const gradient = ctx.createLinearGradient(0, 0, 192, 128);
  gradient.addColorStop(0, "#e8dfc9");
  gradient.addColorStop(1, "#2b4a3a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 192, 128);
  ctx.filter = "blur(3px)";
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "#c05a3c";
  ctx.beginPath();
  ctx.arc(70, 62, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = "none";
  ctx.globalCompositeOperation = "screen";
  ctx.setTransform(0.94, 0.21, -0.21, 0.94, 30, -8);
  ctx.fillStyle = "rgba(40, 90, 200, 0.55)";
  ctx.fillRect(80, 30, 70, 40);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 10, 10, 96, 64, 100, 70, 80, 50);
  const canvasPixels = ctx.getImageData(0, 0, 192, 128).data;

  let webglRenderer = "unavailable";
  let webglPixels = new Uint8Array(0);
  const glCanvas = document.createElement("canvas");
  glCanvas.width = 64;
  glCanvas.height = 64;
  const gl = glCanvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (gl) {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    webglRenderer = String(
      gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
    );
    const program = gl.createProgram();
    // No named inner functions: this body is serialised into the page, where
    // transpiler name helpers do not exist.
    for (const [type, source] of [
      [
        gl.VERTEX_SHADER,
        "#version 300 es\nin vec2 p; out vec2 uv; void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }",
      ],
      [
        gl.FRAGMENT_SHADER,
        "#version 300 es\nprecision highp float; in vec2 uv; out vec4 o;\n" +
          "void main(){ float s = 0.0; for (int i = 0; i < 24; i++) { float t = float(i) / 24.0;" +
          " s += sin(uv.x * 31.0 + t * 7.0) * cos(uv.y * 19.0 - t * 5.0) / 24.0; }" +
          " o = vec4(0.5 + 0.5 * s, uv.x, fract(uv.y * 3.3 + s), 0.8); }",
      ],
    ] as const) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const location = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.1, 0.2, 0.3, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    webglPixels = new Uint8Array(64 * 64 * 4);
    gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, webglPixels);
  }
  // Hashing happens in Node: crypto.subtle is absent from non-secure pages such as
  // about:blank.
  let binary = "";
  for (const bytes of [canvasPixels, webglPixels])
    for (let index = 0; index < bytes.length; index += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return { webglRenderer, pixels: btoa(binary) };
}

/** Identify the renderer actually used by a page; works on any loaded page. */
export async function probeRenderEnvironment(
  page: Page,
  profile: RenderBrowserProfile = "pinned",
): Promise<RenderEnvironment> {
  const probe = await page.evaluate(rasterProbe);
  return {
    profile: profile === "pinned" ? RENDER_BROWSER_PROFILE : "hardware",
    browserVersion: page.context().browser()?.version() ?? "unknown",
    webglRenderer: probe.webglRenderer,
    rasterFingerprint: `sha256:${createHash("sha256").update(Buffer.from(probe.pixels, "base64")).digest("hex")}`,
    platform,
    arch,
  };
}

/** Export and baselines must run on the pinned software renderer. */
export function assertPinnedRenderEnvironment(environment: RenderEnvironment) {
  if (
    environment.profile !== RENDER_BROWSER_PROFILE ||
    !environment.webglRenderer.includes("SwiftShader")
  )
    throw new AnimationEngineError(
      "RENDER_FAILED",
      `Export requires the pinned software renderer (${RENDER_BROWSER_PROFILE}); the browser reported "${environment.webglRenderer}"`,
      {
        diagnostic: RENDERER_MISMATCH_DIAGNOSTIC,
        profile: environment.profile,
        webglRenderer: environment.webglRenderer,
      },
    );
}
