import { comp, layer } from "@still-shift/motion";
import rawArt from "./art.json" with { type: "json" };
import {
  ramp,
  illustration,
  illustrationArt,
  illustrationAssets,
  contentParams,
  type IllustrationNode,
} from "./shared.ts";
const art = illustrationArt(rawArt);
const assets = await illustrationAssets(
  art,
  new URL("../../../assets/story-motion/", import.meta.url),
);
const wipes: Record<string, [number, number]> = {
  reference: [0, 18],
  question: [8, 30],
  qualifier: [140, 164],
};
const draws: Record<string, [number, number]> = {
  "margin-a": [22, 46],
  "margin-b": [22, 46],
  "pressure-a": [30, 52],
  "pressure-b": [30, 52],
};
const landing: Record<string, [number, number]> = {
  "house-a": [4, 42],
  "house-b": [28, 76],
};
function pose(n: IllustrationNode, f: number) {
  let x = n.x,
    y = n.y,
    sx = 1,
    sy = 1,
    opacity = n.opacity,
    rotation = n.rotation;
  if (wipes[n.id]) {
    const [a, b] = wipes[n.id]!;
    y += 8 * (1 - ramp(f, a, b, 0, 1, "expo"));
  }
  const house = landing[n.id] ?? landing[n.id.replace(/-shadow$/, "")];
  if (house) {
    const [a, b] = house,
      d = b - a;
    if (n.id.endsWith("-shadow")) {
      y += 28 * (1 - ramp(f, a, b, 0, 1, "quint"));
      sx = ramp(f, a, a + d * 0.6, 0.6, 1);
      opacity = ramp(f, a, a + d * 0.6, 0, n.opacity);
    } else {
      y -= 28 * (1 - ramp(f, a, b, 0, 1, "quint"));
      sy = ramp(f, a + d * 0.75, b, 0.985, 1, "back");
      opacity = ramp(f, a, a + d * 0.4, 0, n.opacity);
    }
  }
  if (n.id === "margin-a") sx = ramp(f, 48, 92, 1, 0.82, "inOutQuint");
  if (n.id === "margin-b") sx = ramp(f, 48, 104, 1, 0.36, "inOutQuint");
  if (n.id === "house-b" && f >= 77) {
    sy =
      f < 85
        ? ramp(f, 77, 85, 1, 0.92, "inQuad")
        : ramp(f, 85, 116, 0.92, 0.985, "back");
    rotation =
      f < 85
        ? ramp(f, 77, 85, 0, -2.5, "inQuad")
        : ramp(f, 85, 116, -2.5, -0.8, "back");
  }
  if (n.id === "pressure-a") x = ramp(f, 48, 104, 118, 155, "inOutQuint");
  if (n.id === "pressure-b") {
    x = ramp(f, 48, 104, 1744, 1630, "inOutQuint");
    for (const [a, b, u, v, e] of [
      [150, 162, 1630, 1628, "sine"],
      [162, 174, 1628, 1630, "sine"],
      [174, 186, 1630, 1628, "sine"],
      [186, 191, 1628, 1628.5, "linear"],
    ] as const)
      if (f >= a) x = ramp(f, a, b, u, v, e);
  }
  if (n.id === "house-a-art") opacity = ramp(f, 80, 88, 1, 0.7);
  if (n.id === "room" || n.id === "strained") {
    const [a, b] = n.id === "room" ? [86, 106] : [98, 120];
    y += 24 * (1 - ramp(f, a!, b!, 0, 1, "expo"));
    opacity = ramp(f, a!, a! + (b! - a!) * 0.5, 0, 1);
  }
  return { x, y, sx, sy, opacity, rotation };
}
const samples = (n: IllustrationNode) =>
  Array.from({ length: 192 }, (_, f) => ({
    reveal: wipes[n.id]
      ? ramp(f, ...wipes[n.id]!, 0, 1, "expo")
      : draws[n.id]
        ? ramp(f, ...draws[n.id]!, 0, 1)
        : 1,
    ...(n.type === "path" ? { gap: 0, pinch: 0, pulse: 0 } : { state: 0 }),
  }));
const result = comp(
  {
    id: "unequal-margins-builder",
    width: 1920,
    height: 1080,
    fps: 24,
    frames: 192,
    background: "#E8DFC9",
    assets,
    metadata: { storyCameraCover: ["paper"] },
    camera2d: {
      keys: [
        { frame: 0, x: 930, y: 540, zoom: 1 },
        { frame: 15, x: 936.283, y: 540.471, zoom: 1.002356 },
        { frame: 176, x: 1003.717, y: 545.529, zoom: 1.027644 },
        { frame: 191, x: 1010, y: 546, zoom: 1.03 },
      ],
    },
  },
  (c) => {
    for (const [id, a, b] of [
      ["shared-strain", 48, 104],
      ["more-room", 86, 106],
      ["less-room", 98, 120],
      ["the-same-season", 0, 18],
      ["household-a", 4, 42],
      ["different-room", 8, 30],
      ["same-visible-margin", 22, 46],
      ["household-b", 28, 76],
      ["shared-pressure", 30, 52],
      ["qualitative-comparison", 140, 164],
      ["more-room-retained", 48, 92],
      ["less-room-remains", 48, 104],
      ["focus-less-room", 80, 88],
    ] as const)
      c.marker(id, a, { duration: b - a, label: id });
    const flowNode = art.nodes.find(
      (n: IllustrationNode) => n.id === "strain-path",
    );
    c.add(
      layer({
        id: "strain-path-flow-strain",
        type: "provider",
        cameraDepth: 1,
        provider: "story.flow@1.0.0",
        params: contentParams({
          node: flowNode,
          flow: {
            id: "strain",
            path: "strain-path",
            direction: 1,
            count: 6,
            shape: "dash",
            size: 7,
            color: "#4B5F70",
            window: { start: 40, end: 192, role: "current" },
            speed: [
              { frame: 40, pxPerFrame: 5 },
              { frame: 110, pxPerFrame: 5 },
              { frame: 124, pxPerFrame: 2, easing: "in-out-sine" },
            ],
          },
          interpolateColors: false,
          samples: Array.from({ length: 192 }, () => ({ reveal: 1, gap: 0 })),
        }),
      }),
    );
    for (const n of [...art.nodes].reverse()) {
      const anchor: [number, number] = [
        n.width * n.origin[0],
        n.height * n.origin[1],
      ];
      const depths: Record<string, number> = {
        paper: 0,
        ground: 0.7,
        reference: 0,
        question: 0,
        qualifier: 0,
      };
      const node = c.add(illustration(n, samples(n), depths[n.id] ?? 1));
      const poses = Array.from({ length: 192 }, (_, f) => pose(n, f));
      for (const [channel, property, offset] of [
        ["x", node.x, anchor[0]],
        ["y", node.y, anchor[1]],
        ["sx", node.scaleX, 0],
        ["sy", node.scaleY, 0],
        ["opacity", node.alpha, 0],
        ["rotation", node.rotation, 0],
      ] as const)
        c.timeline(
          property.keys(
            poses.map((p, frame) => ({
              frame,
              value: p[channel] + offset!,
              interpolation: "hold",
            })),
          ),
        );
    }
  },
);
export default result;
