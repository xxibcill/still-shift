import type { WebGLRenderer } from "three";
import type { NativePbrResources } from "./pbr-resources.ts";
import {
  nativePbrBytesHash,
  nativePbrOwnedTexture,
  nativePbrPixelsMatch,
  copyNativePbrPixels,
} from "./pbr-resources.ts";
import { verifyNativePbrGpuTexture } from "./pbr-gpu-texture.ts";
function mismatch(message: string): never {
  throw Error("comp-native3d-checksum: " + message);
}
function uniform(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  expected: readonly number[],
) {
  const location = gl.getUniformLocation(program, name);
  if (!location) mismatch(`Shader has no active ${name} uniform`);
  const value = gl.getUniform(program, location) as number | Float32Array;
  const values = typeof value === "number" ? [value] : Array.from(value);
  if (
    values.length !== expected.length ||
    values.some((value, index) => value !== Math.fround(expected[index]!))
  )
    mismatch(`Actual ${name} differs from the material manifest`);
}
/** Verify the currently bound indexed draw. Caller owns the actual draw-to-mesh association. */
export function captureNativePbrGpuDraw(
  renderer: WebGLRenderer,
  resources: NativePbrResources,
  meshId: string,
  materialId: string,
  draw: { mode: number; count: number; type: number; offset: number },
) {
  const context = renderer.getContext();
  if (!("getBufferSubData" in context))
    throw Error("comp-native3d-protocol: PBR draw capture requires WebGL2");
  const gl = context,
    program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
  if (!program) mismatch("No actual shader program is bound");
  const geometry = resources.prepared.geometry,
    mesh = geometry.meshes.find((mesh) => mesh.id === meshId),
    material = geometry.materials.find(
      (material) => material.id === materialId,
    );
  if (!mesh || !material)
    mismatch("Actual draw has no expected mesh/material association");
  const materialIndex = geometry.materials.findIndex(
    (entry) => entry.id === materialId,
  );
  const declaredRanges = mesh.groups?.length
    ? mesh.groups.filter((group) => group.materialIndex === materialIndex)
    : mesh.materialId === materialId
      ? [{ start: 0, count: mesh.indices.length }]
      : [];
  const indexBytes = mesh.indices.some((index) => index >= 65535) ? 4 : 2;
  const notDeclaredRange = !declaredRanges.some(
    (range) =>
      range.start * indexBytes === draw.offset && range.count === draw.count,
  );
  if (
    draw.mode !== gl.TRIANGLES ||
    draw.type !== (indexBytes === 4 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT) ||
    notDeclaredRange ||
    !Number.isSafeInteger(draw.offset) ||
    !Number.isSafeInteger(draw.count) ||
    draw.count <= 0 ||
    draw.offset < 0 ||
    draw.offset % indexBytes ||
    draw.count % 3 ||
    draw.offset / indexBytes + draw.count > mesh.indices.length
  )
    mismatch("Actual indexed range differs from the mesh topology");
  const arrayBuffer = gl.getParameter(
    gl.ARRAY_BUFFER_BINDING,
  ) as WebGLBuffer | null;
  const vertexBytes: Record<string, Uint8Array> = {};
  try {
    for (const [name, values, size] of [
      ["position", mesh.positions, 3],
      ["normal", mesh.normals, 3],
      ["uv", mesh.uvs, 2],
      ["tangent", mesh.tangents, 4],
    ] as const) {
      if (!values) continue;
      const location = gl.getAttribLocation(program, name);
      if (location < 0) {
        if (
          (name === "uv" &&
            !material.baseColorTexture &&
            !material.metallicRoughnessTexture &&
            !material.normalTexture) ||
          (name === "tangent" && !material.normalTexture)
        )
          continue;
        mismatch(`Shader did not use required ${name}`);
      }
      const stride = gl.getVertexAttrib(
        location,
        gl.VERTEX_ATTRIB_ARRAY_STRIDE,
      ) as number;
      const buffer = gl.getVertexAttrib(
        location,
        gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING,
      ) as WebGLBuffer | null;
      if (
        !buffer ||
        !gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_ENABLED) ||
        gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_SIZE) !== size ||
        gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_TYPE) !==
          gl.FLOAT ||
        gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_NORMALIZED) ||
        (stride !== 0 && stride !== size * 4) ||
        gl.getVertexAttribOffset(location, gl.VERTEX_ATTRIB_ARRAY_POINTER) !==
          0 ||
        gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_DIVISOR) !== 0
      )
        mismatch(
          `Actual ${name} pointer differs from uploaded float attributes`,
        );
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      if (
        gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) !==
        values.length * 4
      )
        mismatch(`Actual ${name} buffer size differs`);
      const actual = new Float32Array(values.length);
      gl.getBufferSubData(gl.ARRAY_BUFFER, 0, actual);
      if (values.some((value, index) => actual[index] !== Math.fround(value)))
        mismatch(`Actual GPU ${name} values differ`);
      vertexBytes[name] = new Uint8Array(actual.buffer);
    }
    if (
      gl.getBufferParameter(gl.ELEMENT_ARRAY_BUFFER, gl.BUFFER_SIZE) !==
      mesh.indices.length * indexBytes
    )
      mismatch("Actual index buffer size differs");
    const indices =
      indexBytes === 4
        ? new Uint32Array(mesh.indices.length)
        : new Uint16Array(mesh.indices.length);
    gl.getBufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indices);
    if (mesh.indices.some((value, index) => indices[index] !== value))
      mismatch("Actual GPU index values differ");
    vertexBytes.indices = new Uint8Array(indices.buffer);
  } finally {
    gl.bindBuffer(gl.ARRAY_BUFFER, arrayBuffer);
  }
  uniform(gl, program, "diffuse", material.baseColorFactor.slice(0, 3));
  if (gl.isEnabled(gl.BLEND)) mismatch("OPAQUE material used blending");
  if (gl.isEnabled(gl.CULL_FACE) === material.doubleSided)
    mismatch("Actual face culling differs from the material");
  if (gl.getUniformLocation(program, "opacity"))
    uniform(gl, program, "opacity", [1]);
  uniform(gl, program, "metalness", [material.metallicFactor]);
  uniform(gl, program, "roughness", [material.roughnessFactor]);
  if (material.normalTexture)
    uniform(gl, program, "normalScale", [
      material.normalTexture.scale,
      material.normalTexture.scale,
    ]);
  const shaderSources = (gl.getAttachedShaders(program) ?? []).map(
    (shader) => gl.getShaderSource(shader) ?? "",
  );
  if (
    !gl.getUniformLocation(program, "opacity") &&
    !shaderSources.some((source) => source.includes("#define OPAQUE"))
  )
    mismatch("Shader has no opaque alpha path");
  if (
    material.metallicRoughnessTexture &&
    (!shaderSources.some((source) =>
      source.includes("roughnessFactor *= texelRoughness.g"),
    ) ||
      !shaderSources.some((source) =>
        source.includes("metalnessFactor *= texelMetalness.b"),
      ))
  )
    mismatch(
      "Actual compiled shader does not read G roughness and B metalness",
    );
  const active = gl.getParameter(gl.ACTIVE_TEXTURE) as number,
    textures = [];
  try {
    for (const [role, names] of [
      ["baseColorTexture", ["map"]],
      ["metallicRoughnessTexture", ["roughnessMap", "metalnessMap"]],
      ["normalTexture", ["normalMap"]],
    ] as const) {
      const binding = material[role];
      if (!binding) continue;
      let actual: WebGLTexture | undefined;
      for (const name of names) {
        const location = gl.getUniformLocation(program, name);
        if (!location) mismatch(`Shader has no active ${name} sampler`);
        const unit = gl.getUniform(program, location) as number;
        gl.activeTexture(gl.TEXTURE0 + unit);
        const handle = gl.getParameter(
            gl.TEXTURE_BINDING_2D,
          ) as WebGLTexture | null,
          expected = (
            renderer.properties.get(
              nativePbrOwnedTexture(resources, binding),
            ) as { __webglTexture?: WebGLTexture }
          ).__webglTexture;
        if (gl.getParameter(gl.SAMPLER_BINDING) !== null)
          mismatch(`Actual ${name} uses a foreign sampler object`);
        if (!handle || handle !== expected)
          mismatch(`Actual ${name} sampler uses a foreign texture`);
        if (actual && actual !== handle)
          mismatch("Packed metal/roughness maps must share one actual texture");
        actual = handle;
        for (const [parameter, value] of [
          [gl.TEXTURE_MAG_FILTER, binding.sampler.magFilter],
          [gl.TEXTURE_MIN_FILTER, binding.sampler.minFilter],
          [gl.TEXTURE_WRAP_S, binding.sampler.wrapS],
          [gl.TEXTURE_WRAP_T, binding.sampler.wrapT],
        ] as const)
          if (gl.getTexParameter(gl.TEXTURE_2D, parameter) !== value)
            mismatch(`Actual ${name} filter/wrap differs`);
        for (const [parameter, value] of [
          [gl.TEXTURE_BASE_LEVEL, 0],
          [gl.TEXTURE_MAX_LEVEL, 1000],
          [gl.TEXTURE_MIN_LOD, -1000],
          [gl.TEXTURE_MAX_LOD, 1000],
          [gl.TEXTURE_COMPARE_MODE, gl.NONE],
        ] as const)
          if (gl.getTexParameter(gl.TEXTURE_2D, parameter) !== value)
            mismatch(
              `Actual ${name} mip selection differs from the owned texture`,
            );
        uniform(gl, program, name + "Transform", [1, 0, 0, 0, 1, 0, 0, 0, 1]);
      }
      textures.push(
        verifyNativePbrGpuTexture(
          gl,
          actual!,
          geometry.images.find((image) => image.id === binding.image)!,
          binding.colorSpace,
          (actual, offset) =>
            nativePbrPixelsMatch(resources, binding.image, actual, offset),
          binding.sampler,
          (destination, offset) =>
            copyNativePbrPixels(resources, binding.image, destination, offset),
        ),
      );
    }
  } finally {
    gl.activeTexture(active);
  }
  return {
    version: "native-pbr-gpu-draw-2" as const,
    geometrySha256: resources.prepared.geometrySha256,
    mesh: meshId,
    material: materialId,
    draw,
    vertexBytes,
    textures,
    shaderBytes: new TextEncoder().encode(shaderSources.join("\n")),
    scope:
      "supplied indexed draw, complete used mip pixels/transfer against an independent current-environment reference and uniforms; camera/whole-frame and composition observation are not certified",
  };
}

export async function sealNativePbrGpuDraw(
  captured: ReturnType<typeof captureNativePbrGpuDraw>,
) {
  const { vertexBytes, shaderBytes, ...receipt } = captured;
  const vertexHashes: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(vertexBytes))
    vertexHashes[name] = await nativePbrBytesHash(bytes);
  return {
    ...receipt,
    vertexHashes,
    shaderSha256: await nativePbrBytesHash(shaderBytes),
  };
}
