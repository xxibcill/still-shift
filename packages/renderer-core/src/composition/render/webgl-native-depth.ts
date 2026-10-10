import {
  BufferGeometry,
  DepthTexture,
  Float32BufferAttribute,
  FramebufferTexture,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NoBlending,
  NoColorSpace,
  OrthographicCamera,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedIntType,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import type {
  NativeDepthRuntime,
  NativeDepthRuntimeOptions,
} from "../../native3d/runtime.ts";
import type {
  NativeDepthOp,
  NativeWorldGraphicArtwork,
  SurfaceNode,
} from "./graph.ts";
import type { WebglDevice, WebglSurface } from "./webgl-device.ts";
import { captureNativeGlState } from "./webgl-native-state.ts";
import { passageError } from "../../passage-diagnostics.ts";
import { resolveNative3DVariant } from "../../native3d/prepare.ts";
import {
  createNativeThreeGeometry,
  createNativeThreeWorld,
  type NativeThreeGeometry,
  type NativeThreeWorld,
} from "../../native3d/three-world.ts";
import { createNativeThreeGraphic } from "../../native3d/three-graphics.ts";
import { observeNativeThreeWorld } from "../../native3d/three-observation.ts";
import { NATIVE_COVERAGE_RESOLVE_GLSL } from "../../native3d/resolve.ts";
import {
  createRenderStorage,
  releaseRenderStorage,
  renderMemory,
} from "../../managed-memory-context.ts";
import type { PreparedNative3DVariant } from "../../native3d/types.ts";

type GeometryOwner = { value: NativeThreeGeometry | undefined };
type WorldOwner = { value: NativeThreeWorld | undefined };
type GraphicOwner = { value: ReturnType<typeof createNativeThreeGraphic> };
type Targets = { hdr: WebGLRenderTarget; encoded: WebGLRenderTarget };
const nativeDestructors = new WeakMap<object, (value: object) => void>();
/** Admit Three's bounded application object/control storage before its factory,
 * separately from CPU typed buffers, canvas backings and GPU pixel storage. */
function createAccountedStorage<T extends object>(
  metadataBytes: number,
  pixelBytes: number,
  create: () => T,
  initialize: (value: T) => void,
  destroy: (value: T) => void,
): T {
  const lease = renderMemory()?.reserve(
    "metadata",
    metadataBytes,
    undefined,
    true,
  );
  const finish = lease?.deferRelease();
  const dispose = (value: T) => {
    try {
      destroy(value);
    } finally {
      nativeDestructors.delete(value);
      lease?.release();
    }
  };
  try {
    const value = createRenderStorage(pixelBytes, create, initialize, dispose);
    nativeDestructors.set(value, dispose as (value: object) => void);
    finish?.();
    return value;
  } catch (error) {
    try {
      lease?.release();
      finish?.();
    } catch {
      /* Preserve factory/admission failure. */
    }
    throw error;
  }
}
function releaseOwned<T extends object>(value: T, destroy: (value: T) => void) {
  releaseRenderStorage(
    value,
    (nativeDestructors.get(value) as ((value: T) => void) | undefined) ??
      destroy,
  );
}
export function validateNativeDepthSurface(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  node: string,
) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 16 ||
    height < 16 ||
    width > 8192 ||
    height > 8192 ||
    width * height > 8_388_608 ||
    width > gl.getParameter(gl.MAX_TEXTURE_SIZE) ||
    height > gl.getParameter(gl.MAX_TEXTURE_SIZE)
  )
    passageError(
      "comp-native3d-limit",
      "Native pass dimensions exceed the admitted surface budget",
      { node },
    );
  if (!gl.getExtension("EXT_color_buffer_float"))
    passageError(
      "comp-native3d-profile",
      "Native HDR requires EXT_color_buffer_float",
      { node },
    );
  for (const format of [gl.RGBA16F, gl.DEPTH_COMPONENT24]) {
    const samples = gl.getInternalformatParameter(
      gl.RENDERBUFFER,
      format,
      gl.SAMPLES,
    ) as Int32Array;
    if (!Array.from(samples).includes(4))
      passageError(
        "comp-native3d-profile",
        "Native HDR/depth requires actual four-sample support",
        { node },
      );
  }
}
function geometryBytes(variant: PreparedNative3DVariant) {
  return variant.source.geometry.meshes.reduce(
    (bytes, mesh) =>
      bytes +
      2 *
        ((mesh.positions.length +
          mesh.normals.length +
          (mesh.uvs?.length ?? 0)) *
          4 +
          mesh.indices.length * (mesh.positions.length / 3 > 65535 ? 4 : 2)),
    0,
  );
}
function worldBytes(variant: PreparedNative3DVariant) {
  // Bound PMREM generation's environment/scratch before construction, then
  // exact authored shadow and procedural texture storage including canvas/mips.
  return (
    64 * 1024 * 1024 +
    variant.source.lights.reduce(
      (n, light) => n + (light.castShadow ? light.shadowMapSize ** 2 * 16 : 0),
      0,
    ) +
    variant.source.geometry.materials.reduce(
      (n, material) =>
        n +
        (material.texture
          ? (material.texture.kind === "tape-graduations"
              ? 4096 * 512
              : 1024 * 512) * 10
          : 0),
      0,
    )
  );
}
/** Browser-only Three implementation, supplied explicitly to the pure compositor. */
export function createNativeDepthRuntime(
  device: WebglDevice,
  options: NativeDepthRuntimeOptions,
): NativeDepthRuntime {
  const gl = device.gl;
  let renderer: WebGLRenderer | undefined, targets: Targets | undefined;
  let rendererOwner: { value: WebGLRenderer | undefined } | undefined;
  const controls = renderMemory()?.reserve("metadata", 262144, undefined, true);
  const geometries = new Map<string, GeometryOwner>(),
    worlds = new Map<string, WorldOwner>();
  let closed = false;
  function createResolvePipeline() {
    let geometry: BufferGeometry | undefined,
      material: ShaderMaterial | undefined;
    try {
      geometry = createAccountedStorage(
        4096,
        120,
        () => new BufferGeometry(),
        () => {},
        (value) => value.dispose(),
      );
      geometry.setAttribute(
        "position",
        new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
      );
      geometry.setAttribute(
        "uv",
        new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2),
      );
      material = new ShaderMaterial({
        uniforms: {
          nativeHdr: { value: null },
          nativeExposure: { value: 1 },
          nativeBackground: { value: [0, 0, 0] },
          nativeOpaque: { value: false },
        },
        vertexShader:
          "varying vec2 nativeUv; void main(){nativeUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}",
        fragmentShader: NATIVE_COVERAGE_RESOLVE_GLSL,
        depthTest: false,
        depthWrite: false,
        transparent: false,
        blending: NoBlending,
        toneMapped: false,
      });
      const world = new Scene();
      world.add(new Mesh(geometry, material));
      return {
        resolveOwner: geometry,
        resolveMaterial: material,
        resolveWorld: world,
        resolveCamera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
      };
    } catch (error) {
      // Setup has not touched GL. Every earlier admitted owner must retire even
      // when a later metadata/pixel admission or plain constructor rejects.
      try {
        if (geometry) releaseOwned(geometry, (value) => value.dispose());
      } catch {
        /* Preserve setup failure. */
      }
      try {
        material?.dispose();
      } catch {
        /* Preserve setup failure. */
      }
      try {
        controls?.release();
      } catch {
        /* Preserve setup failure. */
      }
      throw error;
    }
  }
  const { resolveOwner, resolveMaterial, resolveWorld, resolveCamera } =
    createResolvePipeline();
  function getRenderer() {
    if (!renderer) {
      rendererOwner = createAccountedStorage<{
        value: WebGLRenderer | undefined;
      }>(
        262144,
        1024,
        () => ({ value: undefined }),
        (owner) => {
          owner.value = new WebGLRenderer({
            canvas: device.canvas,
            context: gl,
            alpha: true,
            antialias: false,
            premultipliedAlpha: true,
          });
        },
        (owner) => {
          owner.value?.dispose();
          owner.value = undefined;
        },
      );
      renderer = rendererOwner.value!;
      renderer.setPixelRatio(1);
      renderer.autoClear = false;
      renderer.info.autoReset = false;
    }
    return renderer;
  }
  function getWorld(variant: PreparedNative3DVariant, asset: string) {
    const textureFont = options.nativeTextureFont?.(asset);
    const worldKey = `${variant.sourceKey}:${textureFont?.family ?? ""}:${textureFont?.weight ?? ""}:${textureFont?.sha256 ?? ""}`;
    let owner = worlds.get(worldKey);
    if (owner) return owner.value!;
    if (worlds.size >= 64)
      passageError(
        "comp-native3d-limit",
        "Native browser worlds exceed the prepared variant/font bound",
        { node: asset },
      );
    let geometry = geometries.get(variant.meshDataSha256);
    if (!geometry) {
      geometry = createAccountedStorage<GeometryOwner>(
        4096 + variant.source.geometry.meshes.length * 2048,
        geometryBytes(variant),
        () => ({ value: undefined }),
        (owner) => {
          owner.value = createNativeThreeGeometry(variant.source);
        },
        (owner) => {
          owner.value?.dispose();
          owner.value = undefined;
        },
      );
      geometries.set(variant.meshDataSha256, geometry);
    }
    owner = createAccountedStorage<WorldOwner>(
      65536 +
        variant.source.parts.length * 2048 +
        variant.source.geometry.meshes.length * 1024 +
        variant.source.geometry.materials.length * 65536 +
        variant.source.lights.length * 4096,
      worldBytes(variant),
      () => ({ value: undefined }),
      (owner) => {
        owner.value = createNativeThreeWorld(getRenderer(), variant.source, {
          geometry: geometry!.value!,
          ...(textureFont ? { textureFont } : {}),
        });
      },
      (owner) => {
        owner.value?.dispose();
        owner.value = undefined;
      },
    );
    worlds.set(worldKey, owner);
    return owner.value!;
  }
  function getTargets(width: number, height: number, node: string) {
    if (targets?.hdr.width === width && targets.hdr.height === height)
      return targets;
    if (targets) {
      releaseOwned(targets, (value) => {
        value.hdr.dispose();
        value.encoded.dispose();
      });
      targets = undefined;
    }
    targets = createAccountedStorage(
      4096,
      width * height * 64,
      () => {
        const depth = new DepthTexture(width, height, UnsignedIntType);
        depth.internalFormat = "DEPTH_COMPONENT24";
        const hdr = new WebGLRenderTarget(width, height, {
          type: HalfFloatType,
          format: RGBAFormat,
          internalFormat: "RGBA16F",
          depthBuffer: true,
          stencilBuffer: false,
          depthTexture: depth,
          samples: 4,
          resolveDepthBuffer: false,
        });
        hdr.texture.colorSpace = NoColorSpace;
        hdr.texture.generateMipmaps = false;
        const encoded = new WebGLRenderTarget(width, height, {
          depthBuffer: false,
          stencilBuffer: false,
        });
        encoded.texture.colorSpace = NoColorSpace;
        encoded.texture.generateMipmaps = false;
        return { hdr, encoded };
      },
      (value) => {
        const three = getRenderer();
        three.initRenderTarget(value.hdr);
        three.initRenderTarget(value.encoded);
        three.setRenderTarget(value.hdr);
        if (
          gl.checkFramebufferStatus(gl.FRAMEBUFFER) !==
            gl.FRAMEBUFFER_COMPLETE ||
          gl.getParameter(gl.SAMPLES) !== 4 ||
          gl.getFramebufferAttachmentParameter(
            gl.FRAMEBUFFER,
            gl.DEPTH_ATTACHMENT,
            gl.FRAMEBUFFER_ATTACHMENT_DEPTH_SIZE,
          ) !== 24 ||
          [
            gl.FRAMEBUFFER_ATTACHMENT_RED_SIZE,
            gl.FRAMEBUFFER_ATTACHMENT_GREEN_SIZE,
            gl.FRAMEBUFFER_ATTACHMENT_BLUE_SIZE,
            gl.FRAMEBUFFER_ATTACHMENT_ALPHA_SIZE,
          ].some(
            (parameter) =>
              gl.getFramebufferAttachmentParameter(
                gl.FRAMEBUFFER,
                gl.COLOR_ATTACHMENT0,
                parameter,
              ) !== 16,
          ) ||
          gl.getFramebufferAttachmentParameter(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE,
          ) !== gl.FLOAT
        )
          passageError(
            "comp-native3d-profile",
            "Native target did not allocate RGBA16F, depth24 and four samples",
            { node },
          );
      },
      (value) => {
        value.hdr.dispose();
        value.encoded.dispose();
      },
    );
    return targets;
  }
  function copyArtwork(
    artwork: NativeWorldGraphicArtwork,
    surface: WebglSurface,
  ) {
    if (
      surface.screen ||
      surface.floating ||
      surface.width !== artwork.surface.width ||
      surface.height !== artwork.surface.height
    )
      passageError(
        "comp-native3d-binding",
        "Native artwork needs its exact offscreen RGBA8 local surface",
        { node: artwork.layer },
      );
    return createAccountedStorage(
      2048,
      surface.width * surface.height * 4,
      () => {
        const texture = new FramebufferTexture(surface.width, surface.height);
        texture.colorSpace = NoColorSpace;
        texture.minFilter = texture.magFilter = LinearFilter;
        return texture;
      },
      (texture) => {
        const three = getRenderer();
        three.resetState();
        gl.bindFramebuffer(gl.FRAMEBUFFER, surface.framebuffer);
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        three.copyFramebufferToTexture(texture);
        three.resetState();
      },
      (texture) => texture.dispose(),
    );
  }
  function validate(op: NativeDepthOp) {
    if (closed)
      passageError(
        "comp-native3d-not-ready",
        "Native depth runtime is disposed",
        { node: op.layer },
      );
    const variant = resolveNative3DVariant(options.native3D, op.frame);
    if (!/^sha256:[a-f0-9]{64}$/.test(options.nativeAppearanceCodeSha256 ?? ""))
      passageError(
        "comp-native3d-not-ready",
        "Native appearance-code identity is required",
        { node: op.layer },
      );
    if (
      op.sourceKey !== variant.sourceKey ||
      op.width !== op.frame.viewport.width ||
      op.height !== op.frame.viewport.height
    )
      passageError(
        "comp-native3d-source",
        "Native pass dimensions or source differ from the prepared snapshot",
        { node: op.layer },
      );
    validateNativeDepthSurface(gl, op.width, op.height, op.layer);
    const font = options.nativeTextureFont?.(op.frame.asset);
    if (
      variant.source.geometry.materials.some(
        (material) => material.texture?.kind === "tape-graduations",
      ) &&
      (!font || !/^sha256:[a-f0-9]{64}$/.test(font.sha256 ?? ""))
    )
      passageError(
        "comp-native3d-not-ready",
        "Native graduation texture requires its already-loaded pinned font",
        { node: op.layer },
      );
    if (op.graphics.length > 64)
      passageError(
        "comp-native3d-limit",
        "Native pass has more than 64 world artwork leaves",
        { node: op.layer },
      );
    return variant;
  }
  return {
    validate(op) {
      validate(op);
    },
    get allocated() {
      return worlds.size + geometries.size + (targets ? 2 : 0);
    },
    render(
      op: NativeDepthOp,
      target: WebglSurface,
      renderArtwork: (node: SurfaceNode) => WebglSurface,
    ) {
      if (closed)
        passageError(
          "comp-native3d-not-ready",
          "Native depth runtime is disposed",
          { node: op.layer },
        );
      const variant = validate(op);
      if (
        target.width !== op.width ||
        target.height !== op.height ||
        target.screen ||
        target.floating
      )
        passageError(
          "comp-native3d-source",
          "Native output differs from its owning RGBA8 viewport",
          { node: op.layer },
        );
      // Raycaster retains actual per-hit records until sorting. Admit its complete
      // physical triangle upper bound once, not an assumed small visible-hit count.
      const triangles = variant.source.geometry.meshes.reduce(
        (count, mesh) => count + mesh.indices.length / 3,
        0,
      );
      const scratch = renderMemory()?.reserve(
        "metadata",
        16384 +
          op.graphics.length * 1024 +
          variant.source.parts.length * 1024 +
          variant.source.anchors.length * 2048 +
          triangles * 1024,
      );
      let state: ReturnType<typeof captureNativeGlState> | undefined;
      const graphics: GraphicOwner[] = [],
        textures: FramebufferTexture[] = [];

      let shared: NativeThreeWorld | undefined;
      let background: NativeThreeWorld["world"]["background"] | undefined;
      let failed = false,
        first: unknown;
      try {
        state = captureNativeGlState(gl);
        const surfaces = op.graphics.map((artwork) =>
          renderArtwork(artwork.surface),
        );
        // Foreign PBO/row-length state must be normalized before even Three's
        // constructor allocates its default textures. The captured guard owns it.
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
        gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
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
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.disable(gl.SAMPLE_COVERAGE);
        gl.disable(gl.RASTERIZER_DISCARD);
        gl.disable(gl.DITHER);
        gl.depthRange(0, 1);
        // Three uses texture parameters, not WebGLSampler objects. Foreign unit
        // samplers otherwise override authored filtering/wrap during this pass.
        for (
          let unit = 0;
          unit < gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
          unit++
        )
          gl.bindSampler(unit, null);
        const three = getRenderer();
        three.resetState();
        // Borrow executor surfaces. Copies are native-owned; the executor releases
        // every returned surface in its own finally, including early failures.
        op.graphics.forEach((artwork, index) => {
          const texture = copyArtwork(artwork, surfaces[index]!);
          textures.push(texture);
          const graphic = createAccountedStorage(
            8192,
            184,
            () => ({ value: createNativeThreeGraphic(artwork, texture) }),
            () => {},
            (value) => value.value.dispose(),
          );
          graphics.push(graphic);
        });
        three.resetState();
        shared = getWorld(variant, op.frame.asset);
        shared.applyFrame(
          op.frame.frame,
          op.width,
          op.height,
          op.frame.localVisibility,
        );
        const passTargets = getTargets(op.width, op.height, op.layer);
        background = shared.world.background;
        shared.world.background = null;
        for (const graphic of graphics) shared.world.add(graphic.value.mesh);
        three.setRenderTarget(passTargets.hdr);
        three.setClearColor(0, 0);
        three.clear(true, true, false);
        gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
        gl.disable(gl.RASTERIZER_DISCARD);
        three.info.reset();
        three.render(shared.world, shared.camera);
        const pass = {
          calls: three.info.render.calls,
          triangles: three.info.render.triangles,
        };
        resolveMaterial.uniforms.nativeHdr!.value = passTargets.hdr.texture;
        resolveMaterial.uniforms.nativeExposure!.value =
          variant.source.profile.exposure;
        const hex = Number.parseInt(
          variant.source.profile.background.slice(1),
          16,
        );
        resolveMaterial.uniforms.nativeBackground!.value = [
          ((hex >>> 16) & 255) / 255,
          ((hex >>> 8) & 255) / 255,
          (hex & 255) / 255,
        ];
        resolveMaterial.uniforms.nativeOpaque!.value =
          !variant.source.profile.transparent;
        three.setRenderTarget(passTargets.encoded);
        three.render(resolveWorld, resolveCamera);
        three.setRenderTarget(passTargets.encoded);
        const sourceFramebuffer = gl.getParameter(
          gl.DRAW_FRAMEBUFFER_BINDING,
        ) as WebGLFramebuffer | null;
        if (!sourceFramebuffer)
          passageError(
            "comp-native3d-profile",
            "Native final target did not expose its bound public framebuffer",
            { node: op.layer },
          );
        gl.disable(gl.SCISSOR_TEST);
        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sourceFramebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.framebuffer);
        // Three target row zero is the image bottom; compositor texture row zero
        // is the image top. Transfer only this pass rectangle, reversing Y once.
        gl.blitFramebuffer(
          0,
          0,
          op.width,
          op.height,
          0,
          op.height,
          op.width,
          0,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST,
        );
        if (
          gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) !==
            gl.FRAMEBUFFER_COMPLETE ||
          gl.getError() !== gl.NO_ERROR
        )
          passageError(
            "comp-native3d-profile",
            "Native final GPU transfer failed",
            { node: op.layer },
          );
        options.observeNativeFrame?.(
          observeNativeThreeWorld(
            shared,
            op.frame,
            options.nativeAppearanceCodeSha256!,
            pass,
          ),
          op.sampleFrame,
        );
        device.passes += 2;
      } catch (error) {
        failed = true;
        first = error;
      } finally {
        const cleanup = (action: () => void) => {
          try {
            action();
          } catch (error) {
            if (!failed) {
              failed = true;
              first = error;
            }
          }
        };
        for (const graphic of graphics) {
          if (shared) shared.world.remove(graphic.value.mesh);
          cleanup(() =>
            releaseOwned(graphic, (value) => value.value.dispose()),
          );
        }
        if (shared && background !== undefined)
          shared.world.background = background;
        for (const texture of textures)
          cleanup(() => releaseOwned(texture, (value) => value.dispose()));
        if (state) cleanup(() => renderer?.resetState());
        cleanup(() => state?.restore());
        cleanup(() => scratch?.release());
      }
      if (failed) throw first;
    },
    dispose() {
      if (closed) return;
      closed = true;
      let state: ReturnType<typeof captureNativeGlState> | undefined;
      let failed = false,
        first: unknown;
      const cleanup = (action: () => void) => {
        try {
          action();
        } catch (error) {
          if (!failed) {
            failed = true;
            first = error;
          }
        }
      };
      cleanup(() => {
        state = captureNativeGlState(gl);
      });
      for (const owner of worlds.values())
        cleanup(() => releaseOwned(owner, (value) => value.value?.dispose()));
      worlds.clear();
      for (const owner of geometries.values())
        cleanup(() => releaseOwned(owner, (value) => value.value?.dispose()));
      geometries.clear();
      if (targets) {
        const owned = targets;
        targets = undefined;
        cleanup(() =>
          releaseOwned(owned, (value) => {
            try {
              value.hdr.dispose();
            } finally {
              value.encoded.dispose();
            }
          }),
        );
      }
      cleanup(() => releaseOwned(resolveOwner, (value) => value.dispose()));
      cleanup(() => resolveMaterial.dispose());
      if (rendererOwner) {
        const owned = rendererOwner;
        rendererOwner = undefined;
        cleanup(() => releaseOwned(owned, (value) => value.value?.dispose()));
      }
      renderer = undefined;
      cleanup(() => controls?.release());
      cleanup(() => state?.restore());
      if (failed) throw first;
    },
  };
}
