/**
 * CG1 spike: the float grade stage and the parity rule, measured on the
 * pinned renderer (Chromium + SwiftShader) with raw WebGL2, before any
 * renderer change.
 *
 *   node --import tsx research/color-grading-cg1/float-stage-spike.ts
 *
 * Questions (docs/color-grading-engine-plan.md, CG1):
 * 1. Which float formats can the grade stage render to here?
 * 2. Does a float chain match the float64 reference (@still-shift/color-science)
 *    within one 8-bit code value (owner decision 3), on every CG0 still?
 *    RGBA32F and RGBA16F intermediates are both measured.
 * 3. Is a value pushed above 1 recovered by the next pass (8-bit vs float)?
 * 4. Does one quantization on exit avoid the banding of per-pass 8-bit?
 * 5. How does the GPU round float → RGBA8, and is dither worth its cost?
 * 6. Are repeated renders byte-identical?
 *
 * Writes research/color-grading-cg1/float-stage-spike.json.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { format } from "prettier";
import { createServer } from "vite";
import {
  launchRenderBrowser,
  probeRenderEnvironment,
} from "@still-shift/execution-runtime";
import { decodeCompositionRgbaPng } from "../../packages/animation-engine/src/composition-media-color.ts";
import type * as Science from "../../packages/color-science/src/index.ts";

const root = resolve(import.meta.dirname, "../..");
const STILLS = [
  "gray-ramp-256",
  "chart-24",
  "hue-sweep",
  "saturation-sweep",
  "skin-tones",
  "noisy-gradient",
  "alpha-patches",
];
const stills = await Promise.all(
  STILLS.map(async (id) => {
    const { width, height, rgba } = decodeCompositionRgbaPng(
      await readFile(
        join(root, `benchmarks/fixtures/color/cg0/stills/${id}.png`),
      ),
    );
    return { id, width, height, rgba: [...rgba] };
  }),
);

const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const browser = await launchRenderBrowser();
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (fn) => fn;");
  await page.goto(server.resolvedUrls!.local[0]!);
  const environment = await probeRenderEnvironment(page);
  const run = () =>
    page.evaluate(async (stills) => {
      const cs = (await import(
        String("/packages/color-science/src/index.ts")
      )) as typeof Science;
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2", { antialias: false })!;
      const ext = {
        colorBufferFloat: !!gl.getExtension("EXT_color_buffer_float"),
        colorBufferHalfFloat: !!gl.getExtension("EXT_color_buffer_half_float"),
        textureFloatLinear: !!gl.getExtension("OES_texture_float_linear"),
        floatBlend: !!gl.getExtension("EXT_float_blend"),
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      };
      const vs = `#version 300 es
        void main(){ vec2 p = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 4.0 - 1.0; gl_Position = vec4(p, 0, 1); }`;
      // One operator per pass, chosen by a uniform; straight color in, straight out.
      const fs = `#version 300 es
        precision highp float;
        uniform highp sampler2D src; uniform int op;
        uniform vec3 lift, gammaV, gain, offs; uniform float contrast, pivot, sat;
        uniform vec3 slope, cOffset, power; uniform float cSat; uniform float k;
        out vec4 color;
        const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
        float cctEnc(float x){ return x <= 0.0078125 ? 10.5402377416545 * x + 0.0729055341958355 : (log2(x) + 9.72) / 17.52; }
        float cctDec(float v){ return v > 0.155251141552511 ? exp2(v * 17.52 - 9.72) : (v - 0.0729055341958355) / 10.5402377416545; }
        void main(){
          vec4 s = texelFetch(src, ivec2(gl_FragCoord.xy), 0);
          vec3 v = s.rgb;
          if (op == 0) {
            vec3 l = v + lift;
            vec3 c = mix(l, pow(max(l, 0.0), 1.0 / gammaV), step(0.0, l));
            v = (c * gain + offs) * contrast + pivot * (1.0 - contrast);
            float y = dot(v, LUMA);
            v = y * (1.0 - sat) + v * sat;
          } else if (op == 1) {
            vec3 t = v * slope + cOffset;
            v = mix(t, pow(max(t, 0.0), power), step(0.0, t));
            float y = dot(v, LUMA);
            v = y + cSat * (v - y);
          } else if (op == 2) {
            v = vec3(cctDec(cctEnc(v.r) + k), cctDec(cctEnc(v.g) + k), cctDec(cctEnc(v.b) + k));
          } else if (op == 3) {
            v = v * k;
          }
          color = vec4(v, s.a);
        }`;
      const shader = (type: number, source: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
          throw Error(gl.getShaderInfoLog(s)!);
        return s;
      };
      const program = gl.createProgram()!;
      gl.attachShader(program, shader(gl.VERTEX_SHADER, vs));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(program);
      gl.useProgram(program);
      gl.bindVertexArray(gl.createVertexArray());
      const u = (name: string) => gl.getUniformLocation(program, name);

      type Format = "rgba8" | "rgba16f" | "rgba32f";
      const target = (w: number, h: number, fmt: Format) => {
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texStorage2D(
          gl.TEXTURE_2D,
          1,
          fmt === "rgba8"
            ? gl.RGBA8
            : fmt === "rgba16f"
              ? gl.RGBA16F
              : gl.RGBA32F,
          w,
          h,
        );
        const fb = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          tex,
          0,
        );
        const complete =
          gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        return { tex, fb, complete, fmt };
      };
      const complete = {
        rgba16f: target(4, 4, "rgba16f").complete,
        rgba32f: target(4, 4, "rgba32f").complete,
      };

      type Pass =
        | { op: 0; p: Science.PrimaryCorrection }
        | { op: 1; cdl: Science.Cdl }
        | { op: 2; k: number }
        | { op: 3; k: number };
      const setPass = (pass: Pass) => {
        gl.uniform1i(u("op"), pass.op);
        if (pass.op === 0) {
          gl.uniform3fv(u("lift"), pass.p.lift);
          gl.uniform3fv(u("gammaV"), pass.p.gamma);
          gl.uniform3fv(u("gain"), pass.p.gain);
          gl.uniform3fv(u("offs"), pass.p.offset);
          gl.uniform1f(u("contrast"), pass.p.contrast);
          gl.uniform1f(u("pivot"), pass.p.pivot);
          gl.uniform1f(u("sat"), pass.p.saturation);
        } else if (pass.op === 1) {
          gl.uniform3fv(u("slope"), pass.cdl.slope);
          gl.uniform3fv(u("cOffset"), pass.cdl.offset);
          gl.uniform3fv(u("power"), pass.cdl.power);
          gl.uniform1f(u("cSat"), pass.cdl.saturation);
        } else gl.uniform1f(u("k"), pass.k);
      };
      const reference = (rgb: Science.Rgb, pass: Pass): Science.Rgb => {
        if (pass.op === 0) return cs.applyPrimaryCorrection(rgb, pass.p);
        if (pass.op === 1) return cs.applyCdl(rgb, pass.cdl, "no-clamp");
        if (pass.op === 3)
          return [rgb[0] * pass.k, rgb[1] * pass.k, rgb[2] * pass.k];
        const t = cs.transferFunction("acescct");
        return rgb.map((v) =>
          t.decode(t.encode(v) + pass.k),
        ) as unknown as Science.Rgb;
      };

      /** Run passes on the GPU: intermediate format between passes; float readback of the last. */
      const gpu = (
        still: (typeof stills)[number],
        passes: Pass[],
        fmt: Format,
        exit: Format,
      ) => {
        const { width: w, height: h } = still;
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        const input = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, input);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          w,
          h,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          new Uint8Array(still.rgba),
        );
        let source = input;
        passes.forEach((pass, i) => {
          const t = target(w, h, i === passes.length - 1 ? exit : fmt);
          gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, source);
          gl.uniform1i(u("src"), 0);
          setPass(pass);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          source = t.tex;
        });
        if (exit === "rgba8") {
          const bytes = new Uint8Array(w * h * 4);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
          return { bytes };
        }
        const floats = new Float32Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, floats);
        return { floats };
      };
      const quantize = (v: number) =>
        Math.floor(Math.min(1, Math.max(0, v)) * 255 + 0.5);
      const pixelsOf = (still: (typeof stills)[number]) =>
        Array.from({ length: still.width * still.height }, (_, i) => i);

      // Chain: primary → CDL → ACEScct exposure → primary (pow, log2, exp2).
      const chain: Pass[] = [
        {
          op: 0,
          p: {
            lift: [0.02, 0.0, -0.01],
            gamma: [1.15, 1.0, 0.9],
            gain: [1.2, 1.05, 0.95],
            offset: [0.01, 0, 0],
            contrast: 1.25,
            pivot: 0.435,
            saturation: 1.3,
          },
        },
        {
          op: 1,
          cdl: {
            slope: [1.05, 0.98, 1.1],
            offset: [-0.01, 0.005, 0.02],
            power: [0.95, 1.05, 1.1],
            saturation: 0.9,
          },
        },
        { op: 2, k: 0.5 / 17.52 },
        {
          op: 0,
          p: {
            lift: [0, 0, 0],
            gamma: [0.9, 0.9, 0.9],
            gain: [0.85, 0.85, 0.85],
            offset: [0, 0, 0],
            contrast: 0.9,
            pivot: 0.5,
            saturation: 1,
          },
        },
      ];
      const parity: Record<string, unknown>[] = [];
      for (const fmt of ["rgba32f", "rgba16f"] as const)
        for (const still of stills) {
          const out = gpu(still, chain, fmt, "rgba32f").floats!;
          let maxCode = 0,
            over = 0,
            maxFloat = 0,
            n = 0;
          for (const i of pixelsOf(still)) {
            // texSubImage2D and readPixels use the same row order: no flip.
            const g = i * 4;
            let rgb: Science.Rgb = [
              still.rgba[i * 4]! / 255,
              still.rgba[i * 4 + 1]! / 255,
              still.rgba[i * 4 + 2]! / 255,
            ];
            for (const pass of chain) rgb = reference(rgb, pass);
            for (let c = 0; c < 3; c++) {
              const d = Math.abs(quantize(out[g + c]!) - quantize(rgb[c]!));
              maxCode = Math.max(maxCode, d);
              if (d > 0) over++;
              maxFloat = Math.max(maxFloat, Math.abs(out[g + c]! - rgb[c]!));
              n++;
            }
          }
          parity.push({
            format: fmt,
            still: still.id,
            channels: n,
            maxCodeDifference: maxCode,
            channelsDiffering: over,
            maxFloatDifference: maxFloat,
          });
        }

      // Recovery: gain 2 then gain 0.5, intermediate in each format.
      const ramp = stills[0]!;
      const recovery = (["rgba8", "rgba16f", "rgba32f"] as const).map((fmt) => {
        const out = gpu(
          ramp,
          [
            { op: 3, k: 2 },
            { op: 3, k: 0.5 },
          ],
          fmt,
          "rgba32f",
        ).floats!;
        let max = 0;
        for (let x = 0; x < 256; x++)
          max = Math.max(max, Math.abs(quantize(out[x * 4]!) - x));
        return { intermediate: fmt, maxCodeErrorAfterRecovery: max };
      });

      // Banding: ten stacked corrections whose product is neutral.
      const stack: Pass[] = [];
      for (let i = 0; i < 5; i++)
        stack.push(
          {
            op: 0,
            p: {
              ...cs.NEUTRAL_PRIMARY,
              gamma: [1.6, 1.6, 1.6],
              gain: [0.8, 0.8, 0.8],
            },
          },
          { op: 0, p: { ...cs.NEUTRAL_PRIMARY, gain: [1.25, 1.25, 1.25] } },
        );
      // Undo the gammas exactly: gamma 1.6 five times composes to x^(1/1.6^5); add the inverse at the end.
      stack.push({
        op: 0,
        p: {
          ...cs.NEUTRAL_PRIMARY,
          gamma: [1 / 1.6 ** 5, 1 / 1.6 ** 5, 1 / 1.6 ** 5],
        },
      });
      const banding = (["rgba8", "rgba32f"] as const).map((fmt) => {
        const out = gpu(ramp, stack, fmt, "rgba32f").floats!;
        const codes = Array.from({ length: 256 }, (_, x) =>
          quantize(out[x * 4]!),
        );
        return {
          intermediate: fmt,
          passes: stack.length,
          distinctLevels: new Set(codes).size,
          maxCodeError: Math.max(...codes.map((c, x) => Math.abs(c - x))),
        };
      });

      // GPU float → RGBA8 rounding at exact ties and the dither question.
      const ties = {
        id: "ties",
        width: 256,
        height: 1,
        rgba: Array.from({ length: 256 * 4 }, (_, i) =>
          i % 4 === 3 ? 255 : Math.floor(i / 4),
        ),
      };
      const tieK = 127.5 / 127; // maps code 127 to 127.5/255 exactly in float64
      const viaGpu = gpu(ties, [{ op: 3, k: tieK }], "rgba32f", "rgba8").bytes!;
      const viaFloat = gpu(
        ties,
        [{ op: 3, k: tieK }],
        "rgba32f",
        "rgba32f",
      ).floats!;
      let unormDiffers = 0;
      for (let x = 0; x < 256; x++)
        if (viaGpu[x * 4]! !== quantize(viaFloat[x * 4]!)) unormDiffers++;

      return {
        ext,
        complete,
        parity,
        recovery,
        banding,
        unorm: { samples: 256, gpuVsHalfUpDiffer: unormDiffers },
      };
    }, stills);

  const first = await run();
  const second = await run();
  const digest = (value: unknown) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const result = {
    schema: "still-shift-color-cg1-spike-1",
    environment,
    command:
      "node --import tsx research/color-grading-cg1/float-stage-spike.ts",
    ...first,
    repeat: {
      identical: digest(first) === digest(second),
      sha256: digest(first),
    },
    memory: {
      bytesPerPixel: { rgba8: 4, rgba16f: 8, rgba32f: 16 },
      surfaceMiB: Object.fromEntries(
        (
          [
            ["1080p", 1920 * 1080],
            ["4K UHD", 3840 * 2160],
          ] as const
        ).map(([name, px]) => [
          name,
          {
            rgba8: +((px * 4) / 2 ** 20).toFixed(1),
            rgba16f: +((px * 8) / 2 ** 20).toFixed(1),
            rgba32f: +((px * 16) / 2 ** 20).toFixed(1),
          },
        ]),
      ),
      pixelBudgetGiB: {
        oneWorker: 7.375,
        fourWorkers: 1.75,
        source:
          "compositionWorkerMemoryLimits: (8 GiB - 512 MiB node allowance) / workers - 1/8 GiB metadata",
      },
    },
  };
  await writeFile(
    join(root, "research/color-grading-cg1/float-stage-spike.json"),
    await format(JSON.stringify(result), { parser: "json" }),
  );
  console.log(
    JSON.stringify(
      {
        parityWorst: Math.max(
          ...(first.parity as { maxCodeDifference: number }[]).map(
            (p) => p.maxCodeDifference,
          ),
        ),
        recovery: first.recovery,
        banding: first.banding,
        unorm: first.unorm,
        repeat: result.repeat.identical,
        ext: first.ext,
        complete: first.complete,
      },
      null,
      1,
    ),
  );
} finally {
  await browser.close();
  await server.close();
}
