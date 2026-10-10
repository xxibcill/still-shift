import type {
  NativeObservedFrame,
  SolidScene,
} from "@still-shift/scene-contract";
import {
  Native3DLayerSchema,
  NativeObservedFrameSchema,
} from "@still-shift/scene-contract";
import { prepareNative3DScene } from "../../packages/renderer-core/src/native3d/prepare.ts";
import { sampleNativeFrame } from "../../packages/renderer-core/src/native3d/evaluate.ts";
import { createNativeDepthRuntime } from "../../packages/renderer-core/src/composition/render/webgl-native-depth.ts";
import { WebglDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import type {
  NativeDepthOp,
  NativeWorldGraphicArtwork,
  SurfaceNode,
} from "../../packages/renderer-core/src/composition/render/graph.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";

const SIZE = 256;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
type Input = { source: SolidScene; sourceSha256: string };
export type NativeDepthArtifact = {
  id: string;
  facts: unknown;
  rgba?: number[];
  width?: number;
  height?: number;
};
type Retain = (artifact: NativeDepthArtifact) => Promise<void>;
function requireFact(value: unknown, description: string): asserts value {
  if (!value) throw Error(`native3d-depth-reference: ${description}`);
}
function at(pixels: Uint8Array, x: number, y: number): number[] {
  return Array.from(
    pixels.subarray((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4),
  );
}
function equalPixels(actual: Uint8Array, expected: Uint8Array) {
  requireFact(actual.length === expected.length, "pixel lengths differ");
  let maximumDelta = 0,
    changedPixels = 0;
  for (let offset = 0; offset < actual.length; offset += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(
        actual[offset + channel]! - expected[offset + channel]!,
      );
      maximumDelta = Math.max(maximumDelta, delta);
      changed ||= delta !== 0;
    }
    if (changed) changedPixels++;
  }
  return { maximumDelta, changedPixels };
}
/** Independent camera algebra for this authored camera, never the renderer's projection helper. */
function project(x: number, y: number, z: number): [number, number] {
  const focal = SIZE / (2 * Math.tan(Math.PI / 6));
  return [
    Math.round(SIZE / 2 + (x * focal) / (10 - z)),
    Math.round(SIZE / 2 - (y * focal) / (10 - z)),
  ];
}
/** CPU reference for the declared pinned ACES/sRGB resolve, independent of its GLSL. */
function encodedRadiance(rgb: readonly number[]): number[] {
  const transform = (matrix: readonly number[][], color: readonly number[]) =>
    matrix.map((row) =>
      row.reduce((sum, value, index) => sum + value * color[index]!, 0),
    );
  const input = transform(
    [
      [0.59719, 0.35458, 0.04823],
      [0.076, 0.90834, 0.01566],
      [0.0284, 0.13383, 0.83777],
    ],
    rgb.map((value) => value / 0.6),
  );
  const fitted = input.map(
    (value) =>
      (value * (value + 0.0245786) - 0.000090537) /
      (value * (0.983729 * value + 0.432951) + 0.238081),
  );
  return transform(
    [
      [1.60475, -0.53108, -0.07367],
      [-0.10208, 1.10813, -0.00605],
      [-0.00327, -0.07276, 1.07602],
    ],
    fitted,
  )
    .map((value) => {
      const linear = Math.min(1, Math.max(0, value));
      return Math.round(
        255 *
          (linear <= 0.0031308
            ? 12.92 * linear
            : 1.055 * linear ** (1 / 2.4) - 0.055),
      );
    })
    .concat(255);
}
function nearColor(
  actual: readonly number[],
  expected: readonly number[],
  tolerance = 2,
) {
  return (
    actual.length === expected.length &&
    actual.every(
      (value, index) => Math.abs(value - expected[index]!) <= tolerance,
    )
  );
}
function rgbaQuarters(alpha = 255): Uint8Array<ArrayBuffer> {
  const pixels = new Uint8Array(128 * 128 * 4);
  const colors = [
    [255, 0, 0],
    [0, 0, 255],
    [0, 0, 0],
    [255, 255, 255],
  ];
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const color = colors[(y >= 64 ? 2 : 0) + (x >= 64 ? 1 : 0)]!;
      const offset = (y * 128 + x) * 4;
      for (let channel = 0; channel < 3; channel++)
        pixels[offset + channel] = Math.round((color[channel]! * alpha) / 255);
      pixels[offset + 3] = alpha;
    }
  return pixels;
}
function artwork(
  surface: SurfaceNode,
  fields: Partial<NativeWorldGraphicArtwork> = {},
): NativeWorldGraphicArtwork {
  return {
    layer: "graphic",
    surface,
    localBounds: { left: 0, top: 0, right: 128, bottom: 128 },
    rasterOriginPixels: [0, 0],
    artworkMatrix: [1, 0, 0, 1, 0, 0],
    originPixels: [64, 64],
    pixelsPerUnit: 32,
    worldMatrix: [...IDENTITY],
    side: "front",
    opacity: 1,
    alphaMode: "mask",
    alphaCutoff: 0.4,
    ...fields,
  };
}
function yRotation(
  radians: number,
  z = 0,
): NativeWorldGraphicArtwork["worldMatrix"] {
  const c = Math.cos(radians),
    s = Math.sin(radians);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, z, 1];
}
/** The oracle reads actual public GL state independently of captureNativeGlState. */
function stateSnapshot(gl: WebGL2RenderingContext) {
  const parameters = [
    gl.READ_FRAMEBUFFER_BINDING,
    gl.DRAW_FRAMEBUFFER_BINDING,
    gl.VERTEX_ARRAY_BINDING,
    gl.ARRAY_BUFFER_BINDING,
    gl.ELEMENT_ARRAY_BUFFER_BINDING,
    gl.PIXEL_PACK_BUFFER_BINDING,
    gl.PIXEL_UNPACK_BUFFER_BINDING,
    gl.CURRENT_PROGRAM,
    gl.ACTIVE_TEXTURE,
    gl.TEXTURE_BINDING_2D,
    gl.SAMPLER_BINDING,
    gl.VIEWPORT,
    gl.SCISSOR_BOX,
    gl.COLOR_WRITEMASK,
    gl.COLOR_CLEAR_VALUE,
    gl.DEPTH_FUNC,
    gl.DEPTH_WRITEMASK,
    gl.DEPTH_RANGE,
    gl.FRONT_FACE,
    gl.CULL_FACE_MODE,
    gl.BLEND_EQUATION_RGB,
    gl.BLEND_EQUATION_ALPHA,
    gl.BLEND_SRC_RGB,
    gl.BLEND_DST_RGB,
    gl.BLEND_SRC_ALPHA,
    gl.BLEND_DST_ALPHA,
    gl.PACK_ALIGNMENT,
    gl.PACK_ROW_LENGTH,
    gl.PACK_SKIP_PIXELS,
    gl.PACK_SKIP_ROWS,
    gl.UNPACK_ALIGNMENT,
    gl.UNPACK_ROW_LENGTH,
    gl.UNPACK_IMAGE_HEIGHT,
    gl.UNPACK_SKIP_PIXELS,
    gl.UNPACK_SKIP_ROWS,
    gl.UNPACK_SKIP_IMAGES,
    gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
    gl.UNPACK_FLIP_Y_WEBGL,
    gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
  ];
  const flags = [
    gl.BLEND,
    gl.CULL_FACE,
    gl.DEPTH_TEST,
    gl.STENCIL_TEST,
    gl.SCISSOR_TEST,
    gl.DITHER,
    gl.SAMPLE_ALPHA_TO_COVERAGE,
    gl.SAMPLE_COVERAGE,
    gl.RASTERIZER_DISCARD,
  ];
  const activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as number;
  const samplers = [0, 3].map((unit) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    return {
      unit,
      binding: gl.getParameter(gl.SAMPLER_BINDING) as WebGLSampler | null,
    };
  });
  gl.activeTexture(activeTexture);
  return {
    samplers,
    parameters: parameters.map(
      (parameter) => [parameter, gl.getParameter(parameter)] as const,
    ),
    flags: flags.map((flag) => [flag, gl.isEnabled(flag)] as const),
  };
}
function requireSameState(
  before: ReturnType<typeof stateSnapshot>,
  after: ReturnType<typeof stateSnapshot>,
) {
  for (let index = 0; index < before.samplers.length; index++)
    requireFact(
      before.samplers[index]!.binding === after.samplers[index]!.binding,
      `foreign sampler unit ${before.samplers[index]!.unit} changed`,
    );
  for (let index = 0; index < before.parameters.length; index++) {
    const [key, expected] = before.parameters[index]!;
    const actual = after.parameters[index]![1];
    const same =
      Array.isArray(expected) || ArrayBuffer.isView(expected)
        ? JSON.stringify(Array.from(expected as ArrayLike<number>)) ===
          JSON.stringify(Array.from(actual as ArrayLike<number>))
        : expected === actual;
    requireFact(same, `foreign GL parameter ${key} changed`);
  }
  requireFact(
    JSON.stringify(before.flags) === JSON.stringify(after.flags),
    "foreign GL capabilities changed",
  );
}
function ordinaryDraw(device: WebglDevice) {
  const surface = device.surface(32, 32);
  try {
    device.pass(
      "void main(){pixel=vec4(17.0/255.0,71.0/255.0,193.0/255.0,1.0);}",
      surface,
      [],
    );
    const pixels = device.read(surface);
    for (let offset = 0; offset < pixels.length; offset += 4)
      requireFact(
        pixels[offset] === 17 &&
          pixels[offset + 1] === 71 &&
          pixels[offset + 2] === 193 &&
          pixels[offset + 3] === 255,
        "ordinary compositor changed after native pass",
      );
    return { pixels: 32 * 32, rgba: [17, 71, 193, 255], maximumDelta: 0 };
  } finally {
    device.release(surface);
  }
}

/** Public depth/runtime oracle. This intentionally does not inspect Three private renderer properties. */
export async function checkNativeDepthReference(
  inputs: readonly Input[],
  retain: Retain,
) {
  const summaries: { id: string; facts: unknown }[] = [];
  const emit = async (id: string, facts: unknown, pixels?: Uint8Array) => {
    const row = { id, facts };
    summaries.push(row);
    await retain({
      ...row,
      ...(pixels
        ? { rgba: Array.from(pixels), width: SIZE, height: SIZE }
        : {}),
    });
  };
  for (const [inputIndex, input] of inputs.entries()) {
    const prepared = await prepareNative3DScene(
      input.source,
      input.sourceSha256,
    );
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const device = new WebglDevice(canvas, true, 0),
      gl = device.gl;
    const raster = device.surface(128, 128),
      target = device.surface(SIZE, SIZE);
    const node: SurfaceNode = {
      id: "artwork",
      width: 128,
      height: 128,
      background: null,
      ops: [],
    };
    device.uploadBytes(raster, rgbaQuarters());
    // The appearance hash is a fixture association; the root's package proof owns
    // real appearance-code hashing. The actual backend and observations are real.
    let rejectObservation = false;
    let latest: NativeObservedFrame | undefined;
    let observedSampleFrame: number | undefined;
    const runtime = createNativeDepthRuntime(device, {
      native3D: { solid: prepared },
      nativeAppearanceCodeSha256: "sha256:" + "b".repeat(64),
      observeNativeFrame: (observed, sampleFrame) => {
        NativeObservedFrameSchema.parse(observed);
        latest = observed;
        observedSampleFrame = sampleFrame;
        if (rejectObservation) throw Error("intentional observer rejection");
      },
    });
    const controller = Native3DLayerSchema.parse({
      id: "world",
      type: "native3d",
      asset: "solid",
      sourceStartFrame: 0,
      sourceFps: 30,
    });
    const makeOp = (
      graphics: NativeWorldGraphicArtwork[],
      hidePhysical = false,
    ): NativeDepthOp => {
      const frame = sampleNativeFrame(
        prepared,
        hidePhysical ? { ...controller, hiddenParts: ["root"] } : controller,
        {
          scope: "proof",
          scopeFrame: 0.25,
          layerTime: 0.25,
          owningScopeFps: 30,
          width: SIZE,
          height: SIZE,
        },
      );
      return {
        kind: "native-depth",
        layer: "world",
        sourceKey: frame.sourceKey,
        frame,
        sampleFrame: 0.75,
        width: SIZE,
        height: SIZE,
        graphics,
      };
    };
    const draw = (op: NativeDepthOp) => {
      runtime.validate(op);
      runtime.render(op, target, () => raster);
      return device.read(target);
    };
    try {
      const flat = artwork(node, { worldMatrix: yRotation(0, 1) });
      if (inputIndex !== 0) {
        const pixels = draw(makeOp([flat], true));
        const background = at(pixels, 8, 8),
          expected =
            input.source.profile.background === "#ffffff"
              ? [255, 255, 255, 255]
              : [0, 0, 0, 255];
        await emit(
          `opaque-background-${inputIndex}`,
          { background, expected, observed: latest },
          pixels,
        );
        requireFact(
          JSON.stringify(background) === JSON.stringify(expected),
          "authored opaque background was not encoded exactly",
        );
        continue;
      }
      const tilt = artwork(node, { worldMatrix: yRotation(Math.PI / 4) });
      const behind = artwork(node, {
        layer: "behind-graphic",
        worldMatrix: yRotation(0, -1),
      });
      const crossing = draw(makeOp([tilt, behind]));
      const left = project(-Math.SQRT1_2, 0.7, Math.SQRT1_2),
        right = project(Math.SQRT1_2, 0.7, -Math.SQRT1_2);
      const leftPixel = at(crossing, ...left),
        rightPixel = at(crossing, ...right);
      await emit(
        "joint-physical-graphic-crossing",
        {
          left: { point: left, rgba: leftPixel },
          right: {
            point: right,
            rgba: rightPixel,
            expected: encodedRadiance([0, 1, 0]),
          },
          observed: latest,
          sampleFrame: observedSampleFrame,
        },
        crossing,
      );
      requireFact(
        leftPixel[0]! > 180 && leftPixel[1]! < 80,
        "front tilted artwork did not win physical depth",
      );
      requireFact(
        nearColor(rightPixel, encodedRadiance([0, 1, 0])),
        "physical mesh did not hide rear tilted artwork with the declared ACES resolve",
      );
      requireFact(
        observedSampleFrame === 0.75 && latest!.scopeFrame === 0.25,
        "root exposure and local scope were conflated",
      );
      requireFact(
        latest!.pass.calls >= 3 && latest!.pass.triangles >= 6,
        "joint mesh/graphic pass did not observe actual draw calls",
      );
      const reverse = draw(makeOp([behind, tilt]));
      const order = equalPixels(reverse, crossing);
      await emit("joint-graphic-order-reversed", order, reverse);
      requireFact(
        order.maximumDelta === 0,
        "joint depth result depended on authored graphic order",
      );

      const flatPixels = draw(makeOp([flat], true));
      const probes = [
        project(-0.8, 0.8, 1),
        project(0.8, 0.8, 1),
        project(-0.8, -0.8, 1),
        project(0.8, -0.8, 1),
      ];
      const colors = probes.map((point) => at(flatPixels, ...point));
      const corner = at(flatPixels, 8, 8);
      let partialCoverage = 0,
        invalidPremultiplied = 0,
        nonzeroTransparentRgb = 0;
      for (let offset = 0; offset < flatPixels.length; offset += 4) {
        const alpha = flatPixels[offset + 3]!;
        if (alpha > 0 && alpha < 255) partialCoverage++;
        if (
          flatPixels[offset]! > alpha ||
          flatPixels[offset + 1]! > alpha ||
          flatPixels[offset + 2]! > alpha
        )
          invalidPremultiplied++;
        if (
          alpha === 0 &&
          (flatPixels[offset] !== 0 ||
            flatPixels[offset + 1] !== 0 ||
            flatPixels[offset + 2] !== 0)
        )
          nonzeroTransparentRgb++;
      }
      const expectedColors = [
        [1, 0, 0],
        [0, 0, 1],
        [0, 0, 0],
        [1, 1, 1],
      ].map(encodedRadiance);
      await emit(
        "four-corner-transfer-and-coverage",
        {
          probes,
          colors,
          expectedColors,
          corner,
          partialCoverage,
          invalidPremultiplied,
          nonzeroTransparentRgb,
          observed: latest,
        },
        flatPixels,
      );
      requireFact(
        colors.every((color, index) =>
          nearColor(color, expectedColors[index]!),
        ),
        "unlit artwork differs from independent ACES/sRGB numeric controls",
      );
      requireFact(
        colors[0]![0]! > 180 &&
          colors[0]![2]! < 80 &&
          colors[1]![2]! > 180 &&
          colors[1]![0]! < 80,
        "top-row corner orientation changed",
      );
      requireFact(
        colors[2]!.slice(0, 3).every((value) => value === 0) &&
          colors[2]![3] === 255,
        "black artwork was lost",
      );
      requireFact(
        colors[3]!.slice(0, 3).every((value) => value > 220) &&
          colors[3]![3] === 255,
        "bottom-right white artwork moved",
      );
      requireFact(
        corner.every((value) => value === 0) &&
          partialCoverage > 0 &&
          invalidPremultiplied === 0 &&
          nonzeroTransparentRgb === 0,
        "coverage resolve broke premultiplication/transparent edge policy",
      );
      requireFact(
        latest!.parts.root!.localVisible === false &&
          latest!.parts.child!.localVisible === true &&
          latest!.parts.child!.inheritedVisible === false,
        "native local/inherited visibility was collapsed",
      );
      await emit("ordinary-after-native-success", ordinaryDraw(device));

      device.uploadBytes(raster, rgbaQuarters(128));
      const half = draw(makeOp([flat], true));
      const halfComparison = equalPixels(half, flatPixels);
      await emit("encoded-premultiplied-input-recovered", halfComparison, half);
      requireFact(
        halfComparison.maximumDelta === 0,
        "premultiplied encoded artwork was decoded without recovering straight color",
      );
      const masked = draw(makeOp([{ ...flat, opacity: 0.5 }], true));
      await emit(
        "alpha-mask-applies-layer-opacity-once",
        {
          maximumAlpha: Math.max(
            ...masked.filter((_, index) => index % 4 === 3),
          ),
        },
        masked,
      );
      requireFact(
        masked.every((value) => value === 0),
        "mask cutoff ignored sampled alpha times layer opacity",
      );
      device.uploadBytes(raster, rgbaQuarters());

      const flipped = {
        ...flat,
        artworkMatrix: [
          -1, 0, 0, 1, 128, 0,
        ] as NativeWorldGraphicArtwork["artworkMatrix"],
      };
      const front = draw(makeOp([flipped], true));
      await emit(
        "negative-local-determinant-front-culled",
        { nonzeroBytes: front.filter((value) => value !== 0).length },
        front,
      );
      requireFact(
        front.every((value) => value === 0),
        "front-only artwork ignored physical local winding",
      );
      const double = draw(makeOp([{ ...flipped, side: "double" }], true));
      const mirroredColors = probes.map((point) => at(double, ...point));
      await emit(
        "negative-local-determinant-double-visible",
        { colors: mirroredColors },
        double,
      );
      requireFact(
        mirroredColors[0]![2]! > 180 && mirroredColors[1]![0]! > 180,
        "double-sided local flip lost mirror orientation",
      );

      // A failure after the completed native pass must retain the first error and
      // leave the compositor's existing state ready for its ordinary draw.
      rejectObservation = true;
      let rejection: unknown;
      try {
        draw(makeOp([flat], true));
      } catch (error) {
        rejection = error;
      }
      rejectObservation = false;
      const afterRejected = ordinaryDraw(device);
      await emit("ordinary-after-native-observation-failure", {
        error:
          rejection instanceof Error ? rejection.message : String(rejection),
        ordinary: afterRejected,
      });
      requireFact(
        rejection instanceof Error &&
          rejection.message === "intentional observer rejection",
        "native failure was swallowed or replaced",
      );

      // Actual nondefault bindings/pixel stores/capabilities; CPU fake-GL tests
      // separately cover every state family and restoration failure cleanup.
      const vao = gl.createVertexArray()!,
        array = gl.createBuffer()!,
        element = gl.createBuffer()!,
        pack = gl.createBuffer()!,
        unpack = gl.createBuffer()!,
        sampler = gl.createSampler()!;
      const foreignTexture = gl.createTexture()!;
      const baseline = stateSnapshot(gl);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, array);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, element);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pack);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, 4096, gl.STREAM_READ);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, unpack);
      gl.bufferData(gl.PIXEL_UNPACK_BUFFER, 4096, gl.STREAM_DRAW);
      gl.activeTexture(gl.TEXTURE0 + 3);
      gl.bindTexture(gl.TEXTURE_2D, foreignTexture);
      gl.bindSampler(0, sampler);
      gl.bindSampler(3, sampler);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, raster.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.framebuffer);
      gl.viewport(7, 9, 111, 113);
      gl.scissor(3, 5, 31, 37);
      gl.colorMask(false, true, false, true);
      gl.clearColor(0.2, 0.3, 0.4, 0.5);
      gl.depthFunc(gl.GREATER);
      gl.depthMask(false);
      gl.depthRange(0.2, 0.8);
      gl.frontFace(gl.CW);
      gl.cullFace(gl.FRONT);
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE,
        gl.ZERO,
      );
      gl.blendEquationSeparate(gl.FUNC_REVERSE_SUBTRACT, gl.FUNC_SUBTRACT);
      for (const flag of [
        gl.BLEND,
        gl.CULL_FACE,
        gl.DEPTH_TEST,
        gl.SCISSOR_TEST,
        gl.DITHER,
        gl.SAMPLE_ALPHA_TO_COVERAGE,
        gl.SAMPLE_COVERAGE,
        gl.RASTERIZER_DISCARD,
      ])
        gl.enable(flag);
      gl.pixelStorei(gl.PACK_ALIGNMENT, 8);
      gl.pixelStorei(gl.PACK_ROW_LENGTH, 17);
      gl.pixelStorei(gl.PACK_SKIP_PIXELS, 2);
      gl.pixelStorei(gl.PACK_SKIP_ROWS, 3);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 8);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 19);
      gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, 23);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 2);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 3);
      gl.pixelStorei(gl.UNPACK_SKIP_IMAGES, 1);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(
        gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
        gl.BROWSER_DEFAULT_WEBGL,
      );
      const before = stateSnapshot(gl);
      runtime.render(makeOp([flat], true), target, () => raster);
      requireSameState(before, stateSnapshot(gl));
      // Independent readback of the successful native result while the test-owned
      // hostile state is still present. Normalize only pack state, then restore it.
      const foreignPixels = new Uint8Array(SIZE * SIZE * 4);
      try {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
        gl.pixelStorei(gl.PACK_ROW_LENGTH, 0);
        gl.pixelStorei(gl.PACK_SKIP_PIXELS, 0);
        gl.pixelStorei(gl.PACK_SKIP_ROWS, 0);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
        gl.readPixels(
          0,
          0,
          SIZE,
          SIZE,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          foreignPixels,
        );
        requireFact(
          gl.getError() === gl.NO_ERROR,
          "foreign-state native output readback failed",
        );
      } finally {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, raster.framebuffer);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pack);
        gl.pixelStorei(gl.PACK_ALIGNMENT, 8);
        gl.pixelStorei(gl.PACK_ROW_LENGTH, 17);
        gl.pixelStorei(gl.PACK_SKIP_PIXELS, 2);
        gl.pixelStorei(gl.PACK_SKIP_ROWS, 3);
      }
      requireSameState(before, stateSnapshot(gl));
      const nativePixelComparison = equalPixels(foreignPixels, flatPixels);
      let callbackFailure: unknown;
      try {
        runtime.render(makeOp([flat], true), target, () => {
          throw Error("intentional artwork rejection");
        });
      } catch (error) {
        callbackFailure = error;
      }
      requireSameState(before, stateSnapshot(gl));
      await emit(
        "actual-foreign-state-success-and-failure",
        {
          nativePixelComparison,
          samplerUnits: [0, 3],
          checkedParameters: before.parameters.length,
          checkedCapabilities: before.flags.length,
          callbackError:
            callbackFailure instanceof Error
              ? callbackFailure.message
              : String(callbackFailure),
        },
        foreignPixels,
      );
      requireFact(
        nativePixelComparison.maximumDelta === 0 &&
          nativePixelComparison.changedPixels === 0,
        "native pixels depended on foreign GL state",
      );
      requireFact(
        callbackFailure instanceof Error &&
          callbackFailure.message === "intentional artwork rejection",
        "artwork failure was swallowed or replaced",
      );
      // Restore test-owned state with independently recorded public values.
      for (const [flag, enabled] of baseline.flags) {
        if (enabled) gl.enable(flag);
        else gl.disable(flag);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
      gl.bindSampler(0, null);
      gl.bindSampler(3, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.colorMask(true, true, true, true);
      gl.depthMask(true);
      gl.depthFunc(gl.LESS);
      gl.depthRange(0, 1);
      gl.frontFace(gl.CCW);
      gl.cullFace(gl.BACK);
      gl.blendFuncSeparate(gl.ONE, gl.ZERO, gl.ONE, gl.ZERO);
      gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
      for (const parameter of [
        gl.PACK_ROW_LENGTH,
        gl.PACK_SKIP_PIXELS,
        gl.PACK_SKIP_ROWS,
        gl.UNPACK_ROW_LENGTH,
        gl.UNPACK_IMAGE_HEIGHT,
        gl.UNPACK_SKIP_PIXELS,
        gl.UNPACK_SKIP_ROWS,
        gl.UNPACK_SKIP_IMAGES,
      ])
        gl.pixelStorei(parameter, 0);
      gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.deleteVertexArray(vao);
      for (const buffer of [array, element, pack, unpack])
        gl.deleteBuffer(buffer);
      gl.deleteSampler(sampler);
      gl.deleteTexture(foreignTexture);
      await emit("ordinary-after-foreign-state-control", ordinaryDraw(device));

      const beforeInvalid = device.read(target);
      let invalid: unknown;
      try {
        runtime.validate({ ...makeOp([flat]), width: 15 });
      } catch (error) {
        invalid = error;
      }
      const diagnostics = passageDiagnostics(invalid);
      const unchanged = equalPixels(device.read(target), beforeInvalid);
      await emit("invalid-preflight-keeps-destination", {
        diagnostics,
        unchanged,
      });
      requireFact(
        diagnostics.some(
          (diagnostic) => diagnostic.code === "comp-native3d-source",
        ) && unchanged.maximumDelta === 0,
        "invalid native preflight mutated its destination",
      );
      requireFact(
        gl.getError() === gl.NO_ERROR,
        "native controls left a WebGL error",
      );
    } finally {
      try {
        runtime.dispose();
      } finally {
        device.release(raster);
        device.release(target);
        device.dispose();
      }
    }
  }
  return {
    version: "native3d-depth-reference-1",
    basis: "actual-public-three-runtime-and-public-webgl2",
    width: SIZE,
    height: SIZE,
    cases: summaries,
  };
}
