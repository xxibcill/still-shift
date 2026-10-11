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
export async function nativePbrProof(input: {
  geometry: SolidGeometryV2;
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
  let fault: "tangent" | "texture" | undefined;
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
    if (fault === "texture") {
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
        0,
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
    captured.push(
      captureNativePbrGpuDraw(
        renderer,
        resources,
        definition.id,
        definition.materialId,
        { mode, count, type, offset },
      ),
    );
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
    faults.push({ id, message });
  }
  try {
    await capture("baseline");
    await capture("repeat");
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
    await capture("restored");
    return {
      captures,
      faults,
      allocation: prepared.allocation,
      scope:
        "actual shared PBR resources under Three MeshStandardMaterial; supplied draw and mip0 verified before draw. No source3/composition/export or mip-data certification.",
    };
  } finally {
    gl.drawElements = original;
    resources.dispose();
    resources.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }
}
