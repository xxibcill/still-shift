import type {
  Composition,
  CompositionPreparedNative3DVersions,
  NativeAppearanceCodeIdentity,
} from "@still-shift/scene-contract";
import {
  loadCompositionResources,
  createCompositionPreview,
  renderCompositionFrameAsync,
} from "../../packages/renderer-core/src/composition/render/renderer.ts";
import type { NativeDepthRuntimeFactory } from "../../packages/renderer-core/src/native3d/runtime.ts";
import type { NativeDepthOp } from "../../packages/renderer-core/src/composition/render/graph.ts";
import { releaseRenderPixels } from "../../packages/renderer-core/src/managed-memory-context.ts";
const hash = async (bytes: Uint8ClampedArray) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
const multiply = (a: readonly number[], b: readonly number[]) =>
  Array.from({ length: 16 }, (_, i) =>
    [0, 1, 2, 3].reduce(
      (sum, k) => sum + a[(i % 4) + 4 * k]! * b[Math.floor(i / 4) * 4 + k]!,
      0,
    ),
  );
function localMatrix(t: {
  position: readonly number[];
  rotation: readonly number[];
  scale: readonly number[];
  pivot: readonly number[];
}) {
  const [x, y, z] = t.rotation,
    sx = Math.sin(x!),
    cx = Math.cos(x!),
    sy = Math.sin(y!),
    cy = Math.cos(y!),
    sz = Math.sin(z!),
    cz = Math.cos(z!);
  const m = [
    cy * cz,
    cx * sz + sx * sy * cz,
    sx * sz - cx * sy * cz,
    0,
    -cy * sz,
    cx * cz - sx * sy * sz,
    sx * cz + cx * sy * sz,
    0,
    sy,
    -sx * cy,
    cx * cy,
    0,
    0,
    0,
    0,
    1,
  ];
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < 3; r++) m[c * 4 + r]! *= t.scale[c]!;
  for (let r = 0; r < 3; r++)
    m[12 + r] =
      t.position[r]! -
      m[r]! * t.pivot[0]! -
      m[4 + r]! * t.pivot[1]! -
      m[8 + r]! * t.pivot[2]!;
  return m;
}
const transform = (m: readonly number[], p: readonly number[]) =>
  [0, 1, 2].map(
    (r) => m[r]! * p[0]! + m[4 + r]! * p[1]! + m[8 + r]! * p[2]! + m[12 + r]!,
  );
function contains(corners: readonly number[][], p: number[]) {
  const values = corners.map((a, i) => {
    const b = corners[(i + 1) % 4]!;
    return (
      (b[0]! - a[0]!) * (p[1]! - a[1]!) - (b[1]! - a[1]!) * (p[0]! - a[0]!)
    );
  });
  return values.every((v) => v >= -3) || values.every((v) => v <= 3);
}
/** Independent scalar ACES/encoded-sRGB oracle for the pinned native HDR resolve. */
function displayInk(
  composition: Composition,
  prepared: CompositionPreparedNative3DVersions,
  color: "red" | "green",
) {
  const controller = composition.layers.find(
    (layer) => layer.type === "native3d",
  );
  if (controller?.type !== "native3d") throw Error("Missing native controller");
  const exposure = prepared.assets[controller.asset]!.source.profile.exposure;
  const input =
    color === "red" ? [0.59719, 0.076, 0.0284] : [0.35458, 0.90834, 0.13383];
  const mapped = input.map((v) => {
    const x = (v * exposure) / 0.6;
    return (
      (x * (x + 0.0245786) - 0.000090537) /
      (x * (0.983729 * x + 0.432951) + 0.238081)
    );
  });
  return [
    [1.60475, -0.53108, -0.07367],
    [-0.10208, 1.10813, -0.00605],
    [-0.00327, -0.07276, 1.07602],
  ].map((row) => {
    const x = Math.max(
      0,
      Math.min(
        1,
        row.reduce((sum, a, i) => sum + a * mapped[i]!, 0),
      ),
    );
    return Math.round(
      255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055),
    );
  });
}
function inkPixels(
  pixels: Uint8ClampedArray,
  width: number,
  expected: readonly number[],
) {
  const points: number[][] = [];
  for (let i = 0; i < pixels.length; i += 4)
    if (
      expected.every(
        (value, channel) => Math.abs(pixels[i + channel]! - value) <= 2,
      )
    )
      points.push([((i / 4) % width) + 0.5, Math.floor(i / 4 / width) + 0.5]);
  return points;
}
export async function worldAnnotationsBrowserProof(
  composition: Composition,
  preparedNative3D: CompositionPreparedNative3DVersions,
  appearanceCodeIdentity: NativeAppearanceCodeIdentity,
  color: "red" | "green",
) {
  const expectedInk = displayInk(composition, preparedNative3D, color);
  const resources = await loadCompositionResources(
    composition,
    (id) => "/@fs/" + composition.assets.find((a) => a.id === id)!.path,
    { preparedNative3D, appearanceCodeIdentity },
  );
  const factory = resources.nativeDepthFactory;
  if (!factory) throw Error("Missing native depth factory");
  let passes: NativeDepthOp[] = [];
  const instrument: NativeDepthRuntimeFactory = (device, options) => {
    const runtime = factory(device, options);
    return {
      get allocated() {
        return runtime.allocated;
      },
      validate: (op) => runtime.validate(op),
      render(op, target, paint) {
        passes.push(op);
        runtime.render(op, target, paint);
      },
      async finalize() {
        await runtime.finalize?.();
      },
      dispose: () => runtime.dispose(),
    };
  };
  const canvas = document.createElement("canvas"),
    preview = createCompositionPreview(
      canvas,
      composition,
      { ...resources, nativeDepthFactory: instrument },
      { backend: "webgl2", collectNativeObservations: true },
    );
  const frames: {
      frame: number;
      sha256: string;
      inkPixels: number;
      expectedInk: number[];
      projectedCorners: number[][];
      partWorldMatrix: number[];
      artworkWorldMatrix: number[];
      actualGlyphBounds: unknown;
    }[] = [],
    pngs: { frame: number; png: string }[] = [];
  async function capture(frame: number, record: boolean) {
    passes = [];
    await preview.prepareFrame(frame);
    const report = await renderCompositionFrameAsync(preview, frame);
    if (report.diagnostics.some((d) => d.severity === "error"))
      throw Error(JSON.stringify(report.diagnostics));
    const op = passes[0],
      observed = report.nativeObservationsV2?.[0]?.observed;
    if (!op || passes.length !== 1 || !observed || op.graphics.length !== 1)
      throw Error("Expected one actual native pass/graphic");
    const graphic = op.graphics[0]!,
      layer = composition.layers.find((l) => l.id === graphic.layer)!;
    if (
      layer.type !== "text" ||
      layer.native3D?.role !== "world-graphic" ||
      !layer.native3D.part ||
      !preview.textBounds[layer.id]
    )
      throw Error("Missing actual world text/font");
    const part = observed.parts[layer.native3D.part]!;
    if (!part.inheritedVisible)
      throw Error("Expected visible physical world-text owner");
    const expected = multiply(
      part.worldMatrix,
      localMatrix(layer.native3D.transform),
    );
    if (graphic.worldMatrix.some((v, i) => Math.abs(v - expected[i]!) > 1e-8))
      throw Error("World text did not follow the actual observed part matrix");
    const box = graphic.localBounds;
    if (
      box.left < -0.01 ||
      box.top < -0.01 ||
      box.right > layer.size![0]! + 0.01 ||
      box.bottom > layer.size![1]! + 0.01
    )
      throw Error("Actual glyphs escape the authored plane box");
    const camera = observed.camera,
      cw = camera.worldMatrix,
      focal =
        composition.height /
        (2 * Math.tan((camera.fovDegrees * Math.PI) / 360));
    const corners = [
      [0, 0],
      [graphic.surface.width, 0],
      [graphic.surface.width, graphic.surface.height],
      [0, graphic.surface.height],
    ].map(([x, y]) => {
      const m = graphic.artworkMatrix,
        lx = graphic.rasterOriginPixels[0] + x!,
        ly = graphic.rasterOriginPixels[1] + y!;
      const world = transform(expected, [
        (m[0]! * lx + m[2]! * ly + m[4]! - graphic.originPixels[0]) /
          graphic.pixelsPerUnit,
        -(m[1]! * lx + m[3]! * ly + m[5]! - graphic.originPixels[1]) /
          graphic.pixelsPerUnit,
        0,
      ]);
      const q = world.map((v, i) => v - cw[12 + i]!);
      const vx = q[0]! * cw[0]! + q[1]! * cw[1]! + q[2]! * cw[2]!,
        vy = q[0]! * cw[4]! + q[1]! * cw[5]! + q[2]! * cw[6]!,
        depth = -(q[0]! * cw[8]! + q[1]! * cw[9]! + q[2]! * cw[10]!);
      if (depth <= camera.near || depth >= camera.far)
        throw Error("World plane leaves depth range");
      return [
        composition.width / 2 + (focal * vx) / depth,
        composition.height / 2 - (focal * vy) / depth,
      ];
    });
    if (
      corners.some(
        ([x, y]) =>
          x! < 0 || x! > composition.width || y! < 0 || y! > composition.height,
      )
    )
      throw Error("World plane leaves viewport");
    const pixels = preview.readPixels();
    try {
      const painted = inkPixels(pixels, composition.width, expectedInk);
      if (painted.length < 8 || painted.some((p) => !contains(corners, p)))
        throw Error(
          "World text ink does not lie in its independently projected plane " +
            JSON.stringify({ frame, inkPixels: painted.length, corners }),
        );
      const sha256 = await hash(pixels);
      if (record) {
        frames.push({
          frame,
          sha256,
          inkPixels: painted.length,
          expectedInk,
          projectedCorners: corners,
          partWorldMatrix: [...part.worldMatrix],
          artworkWorldMatrix: [...graphic.worldMatrix],
          actualGlyphBounds: box,
        });
        if ([7, 37].includes(frame)) {
          const output = document.createElement("canvas");
          output.width = composition.width;
          output.height = composition.height;
          output
            .getContext("2d")!
            .putImageData(
              new ImageData(
                Uint8ClampedArray.from(pixels),
                composition.width,
                composition.height,
              ),
              0,
              0,
            );
          pngs.push({ frame, png: output.toDataURL("image/png") });
        }
      } else if (frames[frame]!.sha256 !== sha256)
        throw Error("World annotation seek history changed pixels");
    } finally {
      releaseRenderPixels(pixels);
    }
  }
  try {
    for (let frame = 0; frame < composition.frameCount; frame++)
      await capture(frame, true);
    for (let frame = composition.frameCount - 1; frame >= 0; frame--)
      await capture(frame, false);
    for (let i = 0; i < composition.frameCount; i++)
      await capture((i * 17) % composition.frameCount, false);
    return {
      frames,
      pngs,
      measuredFrames: composition.frameCount,
      seekDraws: composition.frameCount * 3,
      forwardReverseRandomStable: true,
    };
  } finally {
    preview.dispose();
    canvas.width = canvas.height = 0;
  }
}
export async function worldAnnotationHiddenControl(
  composition: Composition,
  preparedNative3D: CompositionPreparedNative3DVersions,
  appearanceCodeIdentity: NativeAppearanceCodeIdentity,
  color: "red" | "green",
  hiddenPart?: string,
) {
  const expectedInk = displayInk(composition, preparedNative3D, color);
  const control = structuredClone(composition);
  if (hiddenPart) {
    const controller = control.layers.find((l) => l.type === "native3d")!;
    if (controller.type !== "native3d") throw Error("Missing controller");
    controller.hiddenParts = [hiddenPart];
  } else
    control.layers = control.layers.filter(
      (l) => l.metadata?.track !== "world-annotation",
    );
  const resources = await loadCompositionResources(
    control,
    (id) => "/@fs/" + control.assets.find((a) => a.id === id)!.path,
    { preparedNative3D, appearanceCodeIdentity },
  );
  const preview = createCompositionPreview(
    document.createElement("canvas"),
    control,
    resources,
    { backend: "webgl2", collectNativeObservations: true },
  );
  try {
    await preview.prepareFrame(0);
    const report = await renderCompositionFrameAsync(preview, 0);
    if (report.diagnostics.some((d) => d.severity === "error"))
      throw Error(JSON.stringify(report.diagnostics));
    if (
      hiddenPart &&
      report.nativeObservationsV2?.[0]?.observed.parts[hiddenPart]
        ?.inheritedVisible !== false
    )
      throw Error("Hidden control owner remains visible");
    const observed = report.nativeObservationsV2?.[0]?.observed;
    if (observed?.version !== "native3d-observed-frame-2")
      throw Error("Missing hidden-control family physical observation");
    const hiddenShapeReceipts = Object.entries(observed.shapes)
      .filter(
        ([, shape]) =>
          observed.parts[shape.association.ownerPart]?.inheritedVisible ===
          false,
      )
      .map(([id, shape]) => {
        if (shape.status !== "not-drawn" || shape.reason !== "authored-hidden")
          throw Error(
            "Hidden changing shape lacks a truthful missing-draw receipt",
          );
        return { id, status: shape.status, reason: shape.reason };
      });
    const source = control.assets.find((asset) => asset.type === "native3d")!;
    const pixels = preview.readPixels();
    try {
      const count = inkPixels(pixels, composition.width, expectedInk).length;
      if (count !== 0) throw Error("Hidden/omitted world text remains painted");
      return {
        sha256: await hash(pixels),
        inkPixels: count,
        hiddenPart: hiddenPart ?? null,
        source: { path: source.path, sha256: source.sha256 },
        observedSourceSha256: observed.sourceSha256,
        hiddenShapeReceipts,
      };
    } finally {
      releaseRenderPixels(pixels);
    }
  } finally {
    preview.dispose();
  }
}
