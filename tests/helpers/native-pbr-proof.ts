import {
  WebGLRenderer,
  Scene,
  Group,
  Mesh,
  PerspectiveCamera,
  AmbientLight,
  DirectionalLight,
  ACESFilmicToneMapping,
  SRGBColorSpace,
  NoColorSpace,
} from "three";
import type {
  SolidGeometryV2,
  MechanismPartSchema,
} from "@still-shift/scene-contract";
import type { z } from "zod";
import {
  prepareNativePbrResources,
  createNativePbrResources,
} from "../../packages/renderer-core/src/native3d/pbr-resources.ts";
import {
  captureNativePbrGpuDraw,
  sealNativePbrGpuDraw,
} from "../../packages/renderer-core/src/native3d/pbr-gpu-draw.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
export async function nativePbrProof(input: {
  geometry: SolidGeometryV2;
  runFaults?: boolean;
  parts: z.infer<typeof MechanismPartSchema>[];
  images: { image: string; rgba: number[] }[];
}) {
  const prepared = await prepareNativePbrResources(
      input.geometry,
      input.images.map((image) => ({
        image: image.image,
        rgba: Uint8Array.from(image.rgba),
      })),
    ),
    resources = createNativePbrResources(prepared);
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  document.body.append(canvas);
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    preserveDrawingBuffer: true,
    antialias: false,
  });
  renderer.setSize(320, 180, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.setClearColor("#e3e1d8", 0);
  const gl = renderer.getContext() as WebGL2RenderingContext,
    scene = new Scene(),
    camera = new PerspectiveCamera(35, 320 / 180, 0.01, 100);
  camera.position.set(4.5, 3, 5);
  camera.lookAt(4.5, 3, 0);
  scene.add(new AmbientLight(0xffffff, 0.8));
  const light = new DirectionalLight(0xffffff, 2);
  light.position.set(1, 2, 6);
  scene.add(light);
  const parts = new Map(input.parts.map((part) => [part.id, new Group()]));
  for (const part of input.parts) {
    const group = parts.get(part.id)!;
    group.position.set(...part.transform.position);
    (part.parent ? parts.get(part.parent)! : scene).add(group);
  }
  const definition = input.geometry.meshes[0]!,
    material = resources.materials[0]!,
    mesh = new Mesh(resources.geometries.get(definition.id)!, material);
  parts.get(definition.partId)!.add(mesh);
  const original = gl.drawElements.bind(gl),
    captured: ReturnType<typeof captureNativePbrGpuDraw>[] = [],
    captures: {
      id: string;
      rgba: number[];
      pngBase64: string;
      draws: Awaited<ReturnType<typeof sealNativePbrGpuDraw>>[];
    }[] = [],
    faults: { id: string; message: string }[] = [];
  const verificationMemory = new ManagedMemory({
    pixels: 128 * 1024 ** 2,
    metadata: 4 * 1024 ** 2,
  });
  let fault:
    | "tangent"
    | "texture"
    | "mip"
    | "mip-base"
    | "mip-max"
    | "mip-lod"
    | "sampler"
    | undefined;
  let foreignSampler: WebGLSampler | undefined,
    foreignSamplerUnit = 0;
  const stateParameters = [
    gl.CURRENT_PROGRAM,
    gl.VERTEX_ARRAY_BINDING,
    gl.ACTIVE_TEXTURE,
    gl.TEXTURE_BINDING_2D,
    gl.READ_FRAMEBUFFER_BINDING,
    gl.DRAW_FRAMEBUFFER_BINDING,
    gl.READ_BUFFER,
    gl.VIEWPORT,
    gl.COLOR_WRITEMASK,
    gl.PIXEL_PACK_BUFFER_BINDING,
    gl.PIXEL_UNPACK_BUFFER_BINDING,
    gl.SAMPLER_BINDING,
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
    gl.UNPACK_FLIP_Y_WEBGL,
    gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,
    gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
    gl.BLEND,
    gl.DEPTH_TEST,
    gl.SCISSOR_TEST,
    gl.CULL_FACE,
  ];
  let stateRestorations = 0;
  function mapParameter(parameter: number, value: number) {
    const previous = gl.getParameter(
      gl.TEXTURE_BINDING_2D,
    ) as WebGLTexture | null;
    const handle = (
      renderer.properties.get(material.map!) as { __webglTexture: WebGLTexture }
    ).__webglTexture;
    gl.bindTexture(gl.TEXTURE_2D, handle);
    gl.texParameteri(gl.TEXTURE_2D, parameter, value);
    gl.bindTexture(gl.TEXTURE_2D, previous);
  }
  gl.drawElements = function (mode, count, type, offset) {
    if (fault === "tangent") {
      const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram,
        location = gl.getAttribLocation(program, "tangent"),
        buffer = gl.getVertexAttrib(
          location,
          gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING,
        ) as WebGLBuffer,
        saved = gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array([0.25]));
      gl.bindBuffer(gl.ARRAY_BUFFER, saved);
    }
    if (fault === "texture" || fault === "mip") {
      const texture = material.map!,
        handle = (
          renderer.properties.get(texture) as { __webglTexture: WebGLTexture }
        ).__webglTexture,
        active = gl.getParameter(gl.ACTIVE_TEXTURE) as number,
        previous = gl.getParameter(
          gl.TEXTURE_BINDING_2D,
        ) as WebGLTexture | null;
      gl.bindTexture(gl.TEXTURE_2D, handle);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        fault === "mip" ? 1 : 0,
        0,
        0,
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 0]),
      );
      gl.bindTexture(gl.TEXTURE_2D, previous);
      gl.activeTexture(active);
    }
    if (fault === "mip-base") mapParameter(gl.TEXTURE_BASE_LEVEL, 1);
    if (fault === "mip-max") mapParameter(gl.TEXTURE_MAX_LEVEL, 0);
    if (fault === "mip-lod") mapParameter(gl.TEXTURE_MIN_LOD, 1);
    if (fault === "sampler") {
      foreignSampler = gl.createSampler() ?? undefined;
      if (!foreignSampler) throw Error("Unable to seed foreign sampler");
      const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram;
      const location = gl.getUniformLocation(program, "map");
      if (!location) throw Error("Map sampler did not compile");
      foreignSamplerUnit = gl.getUniform(program, location) as number;
      gl.bindSampler(foreignSamplerUnit, foreignSampler);
    }
    const pixelSettings = [
      [gl.PACK_ALIGNMENT, 8],
      [gl.PACK_ROW_LENGTH, 11],
      [gl.PACK_SKIP_PIXELS, 1],
      [gl.PACK_SKIP_ROWS, 2],
      [gl.UNPACK_ALIGNMENT, 8],
      [gl.UNPACK_ROW_LENGTH, 13],
      [gl.UNPACK_IMAGE_HEIGHT, 17],
      [gl.UNPACK_SKIP_PIXELS, 2],
      [gl.UNPACK_SKIP_ROWS, 3],
      [gl.UNPACK_SKIP_IMAGES, 1],
      [gl.UNPACK_FLIP_Y_WEBGL, 1],
      [gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1],
      [gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL],
    ] as const;
    const previousPixels = pixelSettings.map(([parameter]) =>
        Number(gl.getParameter(parameter)),
      ),
      previousPack = gl.getParameter(
        gl.PIXEL_PACK_BUFFER_BINDING,
      ) as WebGLBuffer | null,
      previousUnpack = gl.getParameter(
        gl.PIXEL_UNPACK_BUFFER_BINDING,
      ) as WebGLBuffer | null,
      pack = gl.createBuffer(),
      unpack = gl.createBuffer();
    if (!pack || !unpack) throw Error("Cannot seed foreign pixel buffers");
    let failed = false,
      reason: unknown;
    try {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pack);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, 512, gl.STREAM_READ);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, unpack);
      gl.bufferData(gl.PIXEL_UNPACK_BUFFER, 512, gl.STREAM_DRAW);
      for (const [parameter, value] of pixelSettings)
        gl.pixelStorei(parameter, value);
      const before = stateParameters.map(
        (parameter) => gl.getParameter(parameter) as unknown,
      );
      try {
        captured.push(
          captureNativePbrGpuDraw(
            renderer,
            resources,
            definition.id,
            definition.materialId,
            { mode, count, type, offset },
          ),
        );
      } catch (error) {
        failed = true;
        reason = error;
      }
      for (const [index, parameter] of stateParameters.entries()) {
        const previous = before[index],
          actual = gl.getParameter(parameter) as unknown;
        const equal =
          Array.isArray(previous) || ArrayBuffer.isView(previous)
            ? Array.from(previous as ArrayLike<unknown>).every(
                (value, i) => value === (actual as ArrayLike<unknown>)[i],
              )
            : previous === actual;
        if (!equal)
          throw Error(`PBR verification changed GL state ${parameter}`);
      }
      stateRestorations++;
      if (verificationMemory.statistics.reservations !== 0)
        throw Error("Mip verification retains managed owners");
    } finally {
      for (const [index, [parameter]] of pixelSettings.entries())
        gl.pixelStorei(parameter, previousPixels[index]!);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, previousPack);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, previousUnpack);
      gl.deleteBuffer(pack);
      gl.deleteBuffer(unpack);
    }
    if (failed) throw reason;
    original(mode, count, type, offset);
  };
  async function capture(id: string) {
    captured.length = 0;
    renderer.render(scene, camera);
    if (!captured.length) throw Error("Expected an actual indexed PBR draw");
    const rgba = new Uint8Array(320 * 180 * 4);
    gl.readPixels(0, 0, 320, 180, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    if (!rgba.some((value, index) => index % 4 === 3 && value === 255))
      throw Error("Opaque imported geometry did not cover any pixels");
    captures.push({
      id,
      rgba: Array.from(rgba),
      pngBase64: canvas.toDataURL("image/png").split(",")[1]!,
      draws: await Promise.all(captured.map(sealNativePbrGpuDraw)),
    });
  }
  async function reject(id: string, mutate: () => void, restore: () => void) {
    mutate();
    captured.length = 0;
    let message = "";
    try {
      renderer.render(scene, camera);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      restore();
    }
    if (!message.includes("comp-native3d-"))
      throw Error(`Fault ${id} was accepted: ${message}`);
    if (verificationMemory.statistics.reservations !== 0)
      throw Error(`Fault retains managed owners: ${id}`);
    faults.push({ id, message });
  }
  try {
    const result = await withManagedMemory(verificationMemory, async () => {
      await capture("baseline");
      await capture("repeat");
      if (input.runFaults !== false) {
        await reject(
          "tangent",
          () => {
            fault = "tangent";
          },
          () => {
            fault = undefined;
            mesh.geometry.getAttribute("tangent").needsUpdate = true;
          },
        );
        await reject(
          "texture",
          () => {
            fault = "texture";
          },
          () => {
            fault = undefined;
            material.map!.needsUpdate = true;
          },
        );
        await reject(
          "srgb-role",
          () => {
            material.map!.colorSpace = NoColorSpace;
            material.map!.needsUpdate = true;
          },
          () => {
            material.map!.colorSpace = SRGBColorSpace;
            material.map!.needsUpdate = true;
          },
        );
        await reject(
          "factor",
          () => {
            material.metalness = 0.2;
          },
          () => {
            material.metalness = input.geometry.materials[0]!.metallicFactor;
          },
        );
        await reject(
          "mip",
          () => {
            fault = "mip";
          },
          () => {
            fault = undefined;
            material.map!.needsUpdate = true;
          },
        );
        for (const [id, parameter, restore] of [
          ["mip-base", gl.TEXTURE_BASE_LEVEL, 0],
          ["mip-max", gl.TEXTURE_MAX_LEVEL, 1000],
          ["mip-lod", gl.TEXTURE_MIN_LOD, -1000],
        ] as const)
          await reject(
            id,
            () => {
              fault = id;
            },
            () => {
              fault = undefined;
              mapParameter(parameter, restore);
            },
          );
        await reject(
          "sampler",
          () => {
            fault = "sampler";
          },
          () => {
            fault = undefined;
            gl.bindSampler(foreignSamplerUnit, null);
            gl.deleteSampler(foreignSampler!);
            foreignSampler = undefined;
          },
        );
      }
      await capture("restored");
      return {
        captures,
        faults,
        allocation: prepared.allocation,
        verificationScratchMemory: verificationMemory.statistics,
        stateRestorations,
        scope:
          "actual shared PBR resources under Three MeshStandardMaterial; supplied draw and every used mip verified before draw. Independent current-context derivation, all-level transfer and bounded verification scratch; no composition observation/export certification.",
      };
    });
    let verificationBudgetFault:
      | {
          message: string;
          newTextureAllocations: number;
          memory: ManagedMemory["statistics"];
        }
      | undefined;
    if (input.runFaults !== false) {
      const budget = new ManagedMemory({ pixels: 1, metadata: 4 * 1024 ** 2 }),
        originalCreateTexture = gl.createTexture.bind(gl);
      let newTextureAllocations = 0;
      gl.createTexture = function () {
        newTextureAllocations++;
        return originalCreateTexture();
      };
      try {
        await withManagedMemory(budget, async () => {
          let message = "";
          try {
            renderer.render(scene, camera);
          } catch (error) {
            message = String(error);
          }
          if (
            !message.includes("exceed their aggregate worker quota") ||
            newTextureAllocations !== 0 ||
            budget.statistics.reservations !== 0
          )
            throw Error(
              "Verification budget did not reject before texture allocation or retained owners",
            );
          verificationBudgetFault = {
            message,
            newTextureAllocations,
            memory: budget.statistics,
          };
          faults.push({ id: "verification-budget", message });
        });
      } finally {
        gl.createTexture = originalCreateTexture;
        budget.dispose();
      }
    }
    return { ...result, stateRestorations, verificationBudgetFault };
  } finally {
    verificationMemory.dispose();
    gl.drawElements = original;
    resources.dispose();
    resources.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }
}
