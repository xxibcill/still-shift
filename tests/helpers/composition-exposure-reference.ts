import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import { createCompositionPreview } from "../../packages/renderer-core/src/composition/render/renderer.ts";

/** Independent opaque sample painting and averaging, including moving occlusion. */
export function checkExposureFrames() {
  const canvas = () => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 96;
    return c;
  };
  const moving = (
    id: string,
    color: string,
    reverse = false,
  ): CompositionLayer => ({
    id,
    type: "solid",
    size: [25, 28],
    color,
    motionBlur: true,
    transform: {
      anchor: [0, 0],
      position: {
        x: {
          keys: [
            { frame: 0, value: reverse ? 91 : 5 },
            { frame: 19, value: reverse ? 15 : 81, interpolation: "linear" },
          ],
        },
        y: 30,
      },
      opacity: 0.6,
    },
  });
  const results = [];
  for (const kind of [
    "occlusion",
    "opt-out",
    "stationary",
    "phase",
    "cuts",
    "clipped-group",
    "precomp",
    "collapsed",
    "frozen-clock",
    "echo",
  ]) {
    const comp: Composition = {
      schemaVersion: "composition-1",
      id: "shutter",
      width: 128,
      height: 96,
      fps: 30,
      frameCount: 20,
      background: "#26313b",
      assets: [],
      motionBlur: {
        enabled: true,
        shutterAngle: 360,
        shutterPhase: kind === "phase" ? 180 : 0,
        samples: 8,
      },
      layers: [moving("front", "#e98d67", true), moving("back", "#479fa4")],
    };
    if (kind === "opt-out") comp.layers[0]!.motionBlur = false;
    if (kind === "stationary")
      for (const layer of comp.layers) layer.transform!.position = [40, 30];
    if (kind === "cuts") {
      comp.motionBlur!.cuts = [10];
      comp.layers[0]!.inPoint = 10;
      comp.layers[1]!.outPoint = 10;
    }
    if (kind === "clipped-group") {
      for (const layer of comp.layers) {
        layer.parent = "group";
        delete layer.motionBlur;
      }
      comp.layers.push({
        id: "group",
        type: "group",
        size: [70, 60],
        clip: true,
        motionBlur: true,
        transform: { anchor: [0, 0], position: [10, 5], opacity: 0.8 },
      });
    }
    if (["precomp", "collapsed", "frozen-clock"].includes(kind)) {
      for (const layer of comp.layers) delete layer.motionBlur;
      comp.precomps = [
        {
          id: "nested",
          width: 128,
          height: 96,
          frameCount: 20,
          layers: comp.layers,
        },
      ];
      comp.layers = [
        {
          id: "host",
          type: "precomp",
          comp: "nested",
          motionBlur: true,
          collapseTransforms: kind === "collapsed",
          ...(kind === "frozen-clock" ? { timeRemap: 6 } : {}),
          transform: { anchor: [0, 0], position: [5, 5], opacity: 0.8 },
        },
      ];
    }
    if (kind === "echo")
      comp.layers[0]!.effects = [
        {
          id: "trail",
          effect: "time.echo",
          params: { spacing: 2, count: 3, decay: 0.5 },
        },
      ];
    const actual = canvas(),
      expected = canvas(),
      sample = canvas();
    const preview = createCompositionPreview(actual, comp, {
      images: new Map(),
      fonts: new Map(),
    });
    const out = expected.getContext("2d", { alpha: false })!;
    const ctx = sample.getContext("2d", { alpha: false })!;
    let maxDelta = 0;
    const frames = [0, 1, 5, 9, 10, 19, 6, 10, 0];
    for (const frame of frames) {
      preview.renderFrame(frame);
      const total = new Float32Array(128 * 96 * 4);
      for (let index = 0; index < 8; index++) {
        let t = Math.max(
          0,
          Math.min(
            19,
            frame + (index + 0.5) / 8 - 0.5 + (kind === "phase" ? 0.5 : 0),
          ),
        );
        if (kind === "cuts")
          t = frame < 10 ? Math.min(t, 10 - 1e-7) : Math.max(t, 10);
        ctx.fillStyle = "#26313b";
        ctx.fillRect(0, 0, 128, 96);
        const nested = ["precomp", "frozen-clock"].includes(kind)
          ? canvas()
          : null;
        const paint = nested ? nested.getContext("2d")! : ctx;
        paint.save();
        if (kind === "clipped-group") {
          paint.translate(10, 5);
          paint.beginPath();
          paint.rect(0, 0, 70, 60);
          paint.clip();
        }
        if (kind === "collapsed") paint.translate(5, 5);
        const opacity =
          kind === "clipped-group" || kind === "collapsed" ? 0.6 * 0.8 : 0.6;
        const draw = (front: boolean, time: number, weight = 1) => {
          paint.save();
          paint.globalAlpha = opacity * weight;
          paint.fillStyle = front ? "#e98d67" : "#479fa4";
          const x =
            kind === "stationary" ? 40 : front ? 91 - 4 * time : 5 + 4 * time;
          paint.translate(x, 30);
          paint.fillRect(0, 0, 25, 28);
          paint.restore();
        };
        const time = kind === "frozen-clock" ? 6 : t;
        if (kind !== "cuts" || frame < 10) draw(false, time);
        if (kind !== "cuts" || frame >= 10) {
          if (kind === "echo") {
            // The history stack is isolated before it meets the opaque backdrop.
            const trail = canvas(),
              tc = trail.getContext("2d")!;
            for (let i = 3; i >= 0; i--) {
              tc.globalAlpha = 0.6 * 0.5 ** i;
              tc.fillStyle = "#e98d67";
              tc.save();
              tc.translate(91 - 4 * Math.max(0, time - 2 * i), 30);
              tc.fillRect(0, 0, 25, 28);
              tc.restore();
            }
            paint.drawImage(trail, 0, 0);
          } else draw(true, kind === "opt-out" ? frame : time);
        }
        paint.restore();
        if (nested) {
          ctx.globalAlpha = 0.8;
          ctx.drawImage(nested, 5, 5);
          ctx.globalAlpha = 1;
        }
        const bytes = ctx.getImageData(0, 0, 128, 96).data;
        for (let i = 0; i < bytes.length; i++) total[i] = total[i]! + bytes[i]!;
      }
      const image = out.createImageData(128, 96);
      for (let i = 0; i < total.length; i++)
        image.data[i] = Math.round(total[i]! / 8);
      out.putImageData(image, 0, 0);
      const a = actual.getContext("2d")!.getImageData(0, 0, 128, 96).data;
      for (let i = 0; i < a.length; i++)
        maxDelta = Math.max(maxDelta, Math.abs(a[i]! - image.data[i]!));
    }
    preview.dispose();
    results.push({ id: `exposure/${kind}`, frames: frames.length, maxDelta });
  }
  return results;
}

export function measureExposureFrames() {
  const results = [];
  for (const samples of [1, 2, 8, 16, 32, 64]) {
    const comp: Composition = {
      schemaVersion: "composition-1",
      id: "exposure-cost",
      width: 1920,
      height: 1080,
      fps: 30,
      frameCount: 60,
      background: "#26313b",
      assets: [],
      motionBlur: {
        enabled: samples > 1,
        shutterAngle: 360,
        shutterPhase: 0,
        samples: Math.max(2, samples),
      },
      layers: [
        {
          id: "moving",
          type: "solid",
          size: [400, 300],
          color: "#d87047",
          motionBlur: true,
          transform: {
            anchor: [0, 0],
            position: {
              x: {
                keys: [
                  { frame: 0, value: 100 },
                  { frame: 59, value: 1400, interpolation: "linear" },
                ],
              },
              y: 300,
            },
            opacity: 0.6,
          },
        },
      ],
    };
    const canvas = document.createElement("canvas");
    const preview = createCompositionPreview(canvas, comp, {
      images: new Map(),
      fonts: new Map(),
    });
    const timings: number[] = [];
    for (let frame = 20; frame < 28; frame++) {
      const start = performance.now();
      preview.renderFrame(frame);
      canvas.getContext("2d")!.getImageData(0, 0, 1920, 1080);
      if (frame >= 23) timings.push(performance.now() - start);
    }
    timings.sort((a, b) => a - b);
    results.push({ samples, width: 1920, height: 1080, medianMs: timings[2]! });
    preview.dispose();
    canvas.width = canvas.height = 0;
  }
  return results;
}
