import type {
  Composition,
  CompositionLayer,
} from "@still-shift/scene-contract";
import { createCompositionPreview } from "../../packages/renderer-core/src/composition/render/renderer.ts";

/** Direct Canvas references distinguish per-draw filtering from flattened filtering. */
export function checkPrimitiveFrames() {
  const canvas = () => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 96;
    return c;
  };
  const paint = (ctx: CanvasRenderingContext2D, second = true) => {
    ctx.fillStyle = "#cf704a";
    ctx.fillRect(0, 0, 36, 32);
    if (second) {
      ctx.fillStyle = "#46a4a0";
      ctx.fillRect(19, 14, 30, 20);
    }
  };
  const providers = [
    {
      id: "test.paint@1.0.0",
      prepare: () => (ctx: CanvasRenderingContext2D) => paint(ctx),
    },
  ];
  const effects = [
    {
      id: "paint",
      effect: "blur.primitive",
      params: {
        radius: {
          keys: [
            { frame: 0, value: 0, interpolation: "hold" },
            { frame: 4, value: 4, interpolation: "hold" },
            { frame: 8, value: 2, interpolation: "hold" },
          ],
        },
      },
    },
  ];
  const results = [];
  for (const kind of [
    "solid",
    "provider",
    "group",
    "clipped",
    "precomp",
    "collapsed",
    "offscreen",
    "masked",
  ]) {
    const comp: Composition = {
      schemaVersion: "composition-1",
      id: "paint",
      width: 128,
      height: 96,
      fps: 30,
      frameCount: 12,
      background: "#26313b",
      assets: [],
      layers: [],
    };
    const x = kind === "offscreen" ? -38 : 25;
    const children: CompositionLayer[] = [
      {
        id: "front",
        type: "solid",
        size: [30, 20],
        color: "#46a4a0",
        transform: { anchor: [0, 0], position: [19, 14] },
      },
      {
        id: "back",
        type: "solid",
        size: [36, 32],
        color: "#cf704a",
        transform: { anchor: [0, 0] },
      },
    ];
    const transform = {
      anchor: [0, 0] as [number, number],
      position: [x, 20] as [number, number],
      opacity: 0.55,
    };
    if (kind === "provider")
      comp.layers = [
        {
          id: "art",
          type: "provider",
          provider: providers[0]!.id,
          params: {},
          transform,
          effects,
        },
      ];
    else if (["group", "clipped", "masked"].includes(kind)) {
      const group: CompositionLayer = {
        id: "art",
        type: "group",
        size: [38, 38],
        clip: kind === "clipped",
        transform,
        effects,
      };
      if (kind === "masked")
        group.masks = [
          {
            id: "mask",
            mode: "add",
            path: {
              closed: true,
              vertices: [
                [8, -20],
                [40, -20],
                [40, 60],
                [8, 60],
              ],
            },
          },
        ];
      comp.layers = [
        ...children.map((layer) => ({ ...layer, parent: "art" })),
        group,
      ];
    } else if (kind === "precomp" || kind === "collapsed") {
      comp.precomps = [
        {
          id: "source",
          width: 128,
          height: 96,
          frameCount: 12,
          layers: children,
        },
      ];
      comp.layers = [
        {
          id: "art",
          type: "precomp",
          comp: "source",
          collapseTransforms: kind === "collapsed",
          transform,
          effects,
        },
      ];
    } else comp.layers = [{ ...children[1]!, id: "art", transform, effects }];
    const actual = canvas(),
      preview = createCompositionPreview(
        actual,
        comp,
        { images: new Map(), fonts: new Map() },
        { providers },
      );
    const frames = [0, 4, 7, 8, 11, 5, 1, 0];
    let maxDelta = 0;
    for (const frame of frames) {
      preview.renderFrame(frame);
      const radius = frame < 4 ? 0 : frame < 8 ? 4 : 2;
      const expected = canvas(),
        out = expected.getContext("2d", { alpha: false })!;
      out.fillStyle = "#26313b";
      out.fillRect(0, 0, 128, 96);
      const filtered = kind === "masked" ? canvas() : expected,
        ctx = filtered.getContext("2d")!;
      ctx.save();
      ctx.translate(x, 20);
      if (kind === "clipped") {
        ctx.beginPath();
        ctx.rect(0, 0, 38, 38);
        ctx.clip();
      }
      ctx.filter = radius ? `blur(${radius}px)` : "none";
      ctx.globalAlpha = 0.55;
      if (kind === "precomp") {
        const raw = canvas();
        paint(raw.getContext("2d")!);
        ctx.drawImage(raw, 0, 0);
      } else paint(ctx, !["solid", "offscreen"].includes(kind));
      ctx.restore();
      if (kind === "masked") {
        ctx.globalCompositeOperation = "destination-in";
        ctx.fillRect(33, 0, 32, 80);
      }
      if (kind === "masked") out.drawImage(filtered, 0, 0);
      const a = actual.getContext("2d")!.getImageData(0, 0, 128, 96).data,
        b = out.getImageData(0, 0, 128, 96).data;
      for (let i = 0; i < a.length; i++)
        maxDelta = Math.max(maxDelta, Math.abs(a[i]! - b[i]!));
    }
    preview.dispose();
    results.push({ id: `primitive/${kind}`, frames: frames.length, maxDelta });
  }
  return results;
}
