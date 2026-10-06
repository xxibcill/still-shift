import {
  CompositionSchema,
  type Composition,
  type CompositionAsset,
  type CompositionLayer,
} from "@still-shift/scene-contract";

/** Small mixed graphs share exactly the same local old-depth raster oracle. */
export function depthGraphFixtures(
  base: Composition,
  font: Extract<CompositionAsset, { type: "font" }>,
): Composition[] {
  const photo = structuredClone(base.layers[0]!);
  if (photo.type !== "depth-image")
    throw Error("Depth graph fixture needs native depth");
  const label: CompositionLayer = {
    id: "caption",
    type: "text",
    text: "Depth + native layers",
    fontAsset: font.id,
    fontSize: 16,
    color: "#ffffff",
    transform: { anchor: [0, 0], position: [12, 9] },
  };
  const doc = (
    id: string,
    layers: CompositionLayer[],
    fields: Partial<Composition> = {},
  ): Composition =>
    CompositionSchema.parse({
      ...base,
      id,
      width: 320,
      height: 180,
      frameCount: 24,
      background: "#10243b",
      assets: [...base.assets, font],
      layers: [label, ...layers],
      ...fields,
    });
  const plain = doc("depth-local-clock-overlay", [
    { ...photo, startFrame: -30, stretch: 2, inPoint: 0, outPoint: 24 },
  ]);
  const masked = doc("depth-parent-mask-matte-effect", [
    {
      ...photo,
      parent: "pair",
      blendMode: "screen",
      startFrame: -30,
      masks: [
        {
          id: "window",
          mode: "add",
          opacity: 0.85,
          feather: 0.75,
          path: {
            closed: true,
            vertices: [
              [8, 6],
              [154, 6],
              [154, 84],
              [8, 84],
            ],
          },
        },
      ],
      trackMatte: { layer: "matte", mode: "alpha" },
      effects: [
        { id: "soft", effect: "blur.gaussian", params: { radius: 1.5 } },
      ],
    },
    {
      id: "matte",
      type: "solid",
      size: [148, 80],
      color: "#ffffff",
      parent: "pair",
      transform: { anchor: [0, 0], position: [6, 5], opacity: 0.9 },
    },
    {
      id: "graphic",
      type: "solid",
      size: [45, 45],
      color: "#ffb244",
      transform: { position: [215, 105] },
      effects: [{ id: "glow", effect: "blur.gaussian", params: { radius: 2 } }],
    },
    {
      id: "pair",
      type: "group",
      size: [160, 90],
      clip: true,
      transform: {
        anchor: [0, 0],
        position: [28, 48],
        opacity: 0.8,
        scale: [0.98, 0.96],
      },
    },
  ]);
  const clocks = doc(
    "depth-repeated-precomp-remap",
    [
      {
        id: "first",
        type: "precomp",
        comp: "picture",
        transform: { anchor: [0, 0], position: [0, 35] },
        timeRemap: {
          keys: [
            { frame: 0, value: 12 },
            { frame: 23, value: 62, interpolation: "linear" },
          ],
        },
      },
      {
        id: "second",
        type: "precomp",
        comp: "picture",
        startFrame: 65,
        stretch: -1,
        transform: { anchor: [0, 0], position: [160, 75] },
      },
    ],
    {
      precomps: [
        {
          id: "picture",
          width: 160,
          height: 90,
          frameCount: base.frameCount,
          fps: base.fps,
          layers: [photo],
        },
      ],
    },
  );
  const exposure = doc(
    "depth-fractional-shutter",
    [{ ...photo, startFrame: -30, stretch: 2, motionBlur: true }],
    {
      motionBlur: {
        enabled: true,
        shutterAngle: 180,
        shutterPhase: -90,
        samples: 4,
        adaptive: false,
      },
    },
  );
  const camera: CompositionLayer = {
    id: "camera",
    type: "camera",
    zoom: 320,
    transform: {
      position: {
        keys: [
          { frame: 0, value: [160, 90, -320] },
          { frame: 23, value: [174, 96, -295], interpolation: "linear" },
        ],
      },
    },
  };
  const spatial = {
    ...photo,
    threeD: true,
    startFrame: -30,
    transform: { ...photo.transform, anchor: [0, 0, 0], position: [25, 45, 0] },
  } as CompositionLayer;
  const projected = doc("depth-camera-applied-once", [spatial, camera]);
  const lit = doc("depth-opt-in-flat-lighting", [
    { ...spatial, receivesLight: true } as CompositionLayer,
    {
      id: "light",
      type: "light",
      lightType: "ambient",
      color: "#88bbff",
      intensity: 0.7,
    },
    camera,
  ]);
  return [plain, masked, clocks, exposure, projected, lit];
}

/** Replace only the local depth kernel with independently captured immutable old rasters. */
export function depthRasterReference(
  base: Composition,
  frames: Extract<CompositionAsset, { type: "image" }>[],
): Composition {
  const doc = structuredClone(base);
  doc.id += "-old-raster";
  doc.assets.push(...frames);
  for (const scope of [doc, ...(doc.precomps ?? [])]) {
    scope.layers = scope.layers.map((layer): CompositionLayer => {
      if (layer.type !== "depth-image") return layer;
      const common: Partial<typeof layer> = { ...layer };
      for (const field of [
        "sourceAsset",
        "depth",
        "overscan",
        "edgeDamping",
        "framing",
        "motion",
        "alphaMode",
        "size",
      ] as const)
        delete common[field];
      // The lighting fixture uses exactly frames 30..53 and no shutter. A native
      // image receiver keeps the independent reference within the 32-source cap.
      if (layer.receivesLight) {
        const start = -(layer.startFrame ?? 0);
        const count = scope.frameCount;
        return {
          ...common,
          id: layer.id,
          type: "image",
          size: layer.size,
          fit: "stretch",
          rasterize: "natural-size",
          sources: frames
            .slice(start, start + count)
            .map((asset) => ({ asset: asset.id })),
          state: {
            keys: frames.map((_, frame) => ({
              frame,
              value: Math.max(0, Math.min(count - 1, frame - start)),
            })),
          },
        };
      }
      return {
        ...common,
        id: layer.id,
        type: "provider",
        provider: "test.depth-raster@1.0.0",
        bounds: [0, 0, layer.size[0], layer.size[1]],
        assets: frames.map((asset) => asset.id),
        params: {
          width: layer.size[0],
          height: layer.size[1],
          frames: frames.map((asset) => asset.id),
        },
      };
    });
  }
  return CompositionSchema.parse(doc);
}
