import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import { createCompositionPreview } from "../../packages/renderer-core/src/composition/render/renderer.ts";

/** Independent Canvas paint loop: no temporal evaluator or graph in the reference. */
export function checkEchoFrames() {
  const canvas = () => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 96;
    return c;
  };
  const position = {
    x: {
      keys: [
        { frame: 0, value: -15, interpolation: "linear" as const },
        { frame: 19, value: 61, interpolation: "linear" as const },
      ],
    },
    y: 20,
  };
  const echo = {
    id: "trail",
    effect: "time.echo",
    inPoint: 2,
    outPoint: 16,
    params: { count: 3, spacing: 2, decay: 0.5 },
  };
  const results = [];
  for (const kind of [
    "solid",
    "group",
    "clipped-group",
    "precomp",
    "collapsed",
    "nested-clock",
    "masked-stack",
  ]) {
    const comp: Composition = {
      schemaVersion: "composition-1",
      id: "echo",
      width: 128,
      height: 96,
      fps: 30,
      frameCount: 20,
      background: "#26313b",
      assets: [],
      layers: [],
    };
    const shape: CompositionLayer = {
      id: "art",
      type: "solid",
      size: [20, 18],
      color: "#cf704a",
      transform: { anchor: [0, 0], position, opacity: 0.6 },
      effects: [echo],
    };
    const grouped = ["group", "clipped-group"].includes(kind);
    if (grouped) {
      comp.layers = [
        {
          id: "front",
          type: "solid",
          parent: "art",
          size: [16, 12],
          color: "#46a4a0",
          transform: { anchor: [0, 0], position: [12, 6], opacity: 0.7 },
        },
        {
          id: "back",
          type: "solid",
          parent: "art",
          size: [20, 18],
          color: "#cf704a",
          transform: { anchor: [0, 0] },
        },
        {
          id: "art",
          type: "group",
          size: [22, 20],
          clip: kind === "clipped-group",
          transform: shape.transform,
          effects: [echo],
        },
      ];
    } else if (["precomp", "collapsed"].includes(kind)) {
      comp.precomps = [
        {
          id: "source",
          width: 128,
          height: 96,
          frameCount: 20,
          layers: [
            {
              ...shape,
              effects: [],
              transform: { anchor: [0, 0], opacity: 0.8 },
            },
          ],
        },
      ];
      comp.layers = [
        {
          id: "art",
          type: "precomp",
          comp: "source",
          collapseTransforms: kind === "collapsed",
          transform: shape.transform,
          effects: [echo],
        },
      ];
    } else if (kind === "nested-clock") {
      comp.precomps = [
        {
          id: "source",
          width: 128,
          height: 96,
          frameCount: 20,
          layers: [shape],
        },
      ];
      comp.layers = [
        {
          id: "inset",
          type: "precomp",
          comp: "source",
          timeRemap: 10,
          stretch: 2,
          transform: { anchor: [0, 0], position: [10, 8] },
        },
      ];
    } else {
      comp.layers = [shape];
      if (kind === "masked-stack") {
        shape.effects!.push({
          id: "soft",
          effect: "blur.gaussian",
          params: { radius: 2 },
        });
        shape.masks = [
          {
            id: "cut",
            mode: "add",
            path: {
              closed: true,
              vertices: [
                [8, -8],
                [24, -8],
                [24, 28],
                [8, 28],
              ],
            },
          },
        ];
      }
    }
    const actual = canvas();
    const preview = createCompositionPreview(actual, comp, {
      images: new Map(),
      fonts: new Map(),
    });
    const expected = canvas();
    const frames = [0, 2, 6, 9, 12, 19, 4, 1, 15, 16];
    let maxDelta = 0;
    for (const frame of frames) {
      preview.renderFrame(frame);
      const t = kind === "nested-clock" ? 10 : frame;
      const active = t >= 2 && t < 16;
      let painted = canvas();
      const ctx = painted.getContext("2d")!;
      const paint = (sample: number, weight: number) => {
        ctx.save();
        ctx.translate(4 * sample - 15, 20);
        if (kind === "clipped-group") {
          ctx.beginPath();
          ctx.rect(0, 0, 22, 20);
          ctx.clip();
        }
        if (kind === "precomp") {
          const source = canvas(),
            sc = source.getContext("2d")!;
          sc.globalAlpha = 0.8;
          sc.fillStyle = "#cf704a";
          sc.fillRect(0, 0, 20, 18);
          ctx.globalAlpha = 0.6 * weight;
          ctx.drawImage(source, 0, 0);
        } else {
          ctx.globalAlpha = 0.6 * weight * (kind === "collapsed" ? 0.8 : 1);
          ctx.fillStyle = "#cf704a";
          ctx.fillRect(0, 0, 20, 18);
          if (grouped) {
            ctx.globalAlpha = 0.6 * weight * 0.7;
            ctx.fillStyle = "#46a4a0";
            ctx.fillRect(12, 6, 16, 12);
          }
        }
        ctx.restore();
      };
      if (active)
        for (let i = 3; i >= 1; i--) paint(Math.max(0, t - i * 2), 0.5 ** i);
      paint(t, 1);
      if (kind === "masked-stack") {
        // Native opacity is inside an active history stack, outside an ordinary pixel stack.
        if (!active) {
          ctx.clearRect(0, 0, 128, 96);
          ctx.fillStyle = "#cf704a";
          ctx.fillRect(4 * t - 15, 20, 20, 18);
        }
        const next = canvas(),
          nc = next.getContext("2d")!;
        nc.filter = "blur(2px)";
        nc.drawImage(painted, 0, 0);
        nc.filter = "none";
        nc.globalCompositeOperation = "destination-in";
        nc.fillRect(4 * t - 7, 12, 16, 36);
        painted = next;
      }
      const out = expected.getContext("2d")!;
      out.globalAlpha = 1;
      out.fillStyle = "#26313b";
      out.fillRect(0, 0, 128, 96);
      out.globalAlpha = kind === "masked-stack" && !active ? 0.6 : 1;
      out.drawImage(
        painted,
        kind === "nested-clock" ? 10 : 0,
        kind === "nested-clock" ? 8 : 0,
      );
      const a = actual.getContext("2d")!.getImageData(0, 0, 128, 96).data,
        b = out.getImageData(0, 0, 128, 96).data;
      for (let i = 0; i < a.length; i++)
        maxDelta = Math.max(maxDelta, Math.abs(a[i]! - b[i]!));
    }
    preview.dispose();
    results.push({ id: `echo/${kind}`, frames: frames.length, maxDelta });
  }
  return results;
}
