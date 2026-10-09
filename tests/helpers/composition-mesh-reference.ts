import { createCompositionPreview } from "../../packages/renderer-core/src/index.ts";
import type {
  Composition,
  CompositionLayer,
} from "../../packages/scene-contract/src/index.ts";
type Fixture = {
  id: string;
  effect: string;
  params: NonNullable<
    NonNullable<CompositionLayer["effects"]>[number]["params"]
  >;
  islands?: boolean;
  transform?: CompositionLayer["transform"];
};
function texture(islands: boolean) {
  const source = document.createElement("canvas");
  source.width = source.height = 64;
  const context = source.getContext("2d")!;
  const pixels = context.createImageData(64, 64);
  for (let y = 8; y < 56; y++)
    for (let x = 8; x < 56; x++) {
      if (
        islands
          ? y < 24 || y >= 40 || (x >= 24 && x < 40)
          : x >= 24 && x < 32 && y >= 24 && y < 32
      )
        continue;
      pixels.data.set(
        [60 + x * 2, 40 + y * 2, 120, (x + y) % 9 === 0 ? 128 : 255],
        (y * 64 + x) * 4,
      );
    }
  context.putImageData(pixels, 0, 0);
  return source;
}
function fixtures(): Fixture[] {
  const controls = Array.from({ length: 64 }, (_, i) => [
    (i % 8) / 7,
    Math.floor(i / 8) / 7,
  ]);
  const targets = controls.map(([x, y]) => [
    x! + Math.sin(y! * Math.PI) * 0.05,
    y! + Math.sin(x! * Math.PI) * 0.08,
  ]);
  const puppet = {
    rest: [
      [10, 10],
      [50, 10],
      [32, 50],
    ],
    pins: [
      [10, 10],
      [51, 18],
      [32, 50],
    ],
    refinement: 2,
  };
  return [
    {
      id: "bezier",
      effect: "distort.mesh-warp",
      params: {
        size: [64, 64],
        subdivisions: 12,
        controls: [
          [0, 0],
          [1, 0.1],
          [0.1, 1],
          [0.9, 0.9],
        ],
      },
    },
    {
      id: "bezier-8x8-animated",
      effect: "distort.mesh-warp",
      params: {
        size: [64, 64],
        columns: 8,
        rows: 8,
        subdivisions: 24,
        controls: {
          keys: [
            { frame: 0, value: controls },
            { frame: 1, value: targets },
          ],
        },
      },
    },
    {
      id: "bezier-reflected",
      effect: "distort.mesh-warp",
      params: {
        size: [64, 64],
        subdivisions: 16,
        controls: [
          [0, 0],
          [1, 0.1],
          [0.1, 1],
          [0.9, 0.9],
        ],
      },
      transform: { anchor: [0, 0], position: [80, 16], scale: [-1, 1] },
    },
    { id: "puppet", effect: "distort.puppet", params: puppet },
    {
      id: "puppet-quarter-turn",
      effect: "distort.puppet",
      params: puppet,
      transform: { anchor: [0, 0], position: [80, 16], rotation: 90 },
    },
    {
      id: "puppet-starch",
      effect: "distort.puppet",
      params: { ...puppet, starchCenters: [[32, 40]], starch: [[20, 0.8]] },
    },
    ...[1, -1].map((depth) => ({
      id: `puppet-overlap-${depth}`,
      effect: "distort.puppet",
      islands: true,
      params: {
        rest: [
          [16, 32],
          [48, 32],
        ],
        pins: [
          [30, 32],
          [34, 32],
        ],
        starchCenters: [
          [16, 32],
          [48, 32],
        ],
        starch: [
          [24, 1],
          [24, 1],
        ],
        refinement: 2,
        overlapCenters: [[16, 32]],
        overlap: [[16, depth]],
      },
    })),
  ];
}
function compare(a: Uint8ClampedArray, b: Uint8ClampedArray, id: string) {
  let maxDelta = 0,
    alphaDelta = 0,
    premultipliedDelta = 0,
    different = 0;
  for (let at = 0; at < a.length; at += 4) {
    alphaDelta = Math.max(alphaDelta, Math.abs(a[at + 3]! - b[at + 3]!));
    for (let c = 0; c < 4; c++) {
      const delta = Math.abs(a[at + c]! - b[at + c]!);
      maxDelta = Math.max(maxDelta, delta);
      if (delta) different++;
      if (c < 3)
        premultipliedDelta = Math.max(
          premultipliedDelta,
          Math.abs(
            Math.round((a[at + c]! * a[at + 3]!) / 255) -
              Math.round((b[at + c]! * b[at + 3]!) / 255),
          ),
        );
    }
  }
  if (maxDelta > 2 || alphaDelta > 1 || premultipliedDelta > 1)
    throw Error(
      `Mesh pixel mismatch ${id}: ${maxDelta}/${alphaDelta}/${premultipliedDelta}`,
    );
  return { maxDelta, alphaDelta, premultipliedDelta, different };
}
export function checkMeshRendering() {
  const reports = [];
  const overlap = new Map<string, Uint8ClampedArray>();
  for (const fixture of fixtures()) {
    const comp: Composition = {
      schemaVersion: "composition-1",
      id: fixture.id,
      width: 96,
      height: 96,
      fps: 24,
      frameCount: 2,
      assets: [
        {
          id: "tile",
          type: "image",
          path: "tile.png",
          width: 64,
          height: 64,
          sha256: `sha256:${"0".repeat(64)}`,
        },
      ],
      layers: [
        {
          id: "art",
          type: "image",
          size: [64, 64],
          fit: "stretch",
          sources: [{ asset: "tile" }],
          transform: fixture.transform ?? {
            anchor: [0, 0],
            position: [16, 16],
          },
          effects: [
            { id: "mesh", effect: fixture.effect, params: fixture.params },
          ],
        },
      ],
    };
    const results = [];
    for (const backend of ["canvas2d", "webgl2"] as const) {
      const preview = createCompositionPreview(
        document.createElement("canvas"),
        comp,
        {
          images: new Map([["tile", texture(fixture.islands ?? false)]]),
          fonts: new Map(),
        },
        { backend, preserveAlpha: true },
      );
      try {
        const frames: Uint8ClampedArray[] = [];
        for (const frame of [0, 1]) {
          try {
            preview.renderFrame(frame);
          } catch (error) {
            throw Error(`${fixture.id}/${backend}/${frame}: ${String(error)}`);
          }
          frames.push(preview.readPixels().slice());
        }
        preview.renderFrame(0);
        const repeat = preview.readPixels();
        if (frames[0]!.some((value, i) => value !== repeat[i]))
          throw Error(`Mesh reverse seek differs for ${fixture.id}/${backend}`);
        if (
          fixture.id.includes("animated") &&
          frames[0]!.every((value, i) => value === frames[1]![i])
        )
          throw Error("Mesh controls did not animate");
        if (backend === "canvas2d" && fixture.id.includes("overlap"))
          overlap.set(fixture.id, frames[0]!);
        results.push(frames);
      } finally {
        preview.dispose();
      }
    }
    for (const frame of [0, 1])
      reports.push({
        id: fixture.id,
        frame,
        ...compare(
          results[0]![frame]!,
          results[1]![frame]!,
          `${fixture.id}/${frame}`,
        ),
      });
  }
  const front = overlap.get("puppet-overlap-1")!,
    back = overlap.get("puppet-overlap--1")!;
  if (front.every((value, i) => value === back[i]))
    throw Error("Puppet overlap regions did not change visible draw order");
  const gl = document.createElement("canvas").getContext("webgl2")!;
  const subpixelBits = gl.getParameter(gl.SUBPIXEL_BITS) as number;
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return { subpixelBits, reports };
}
