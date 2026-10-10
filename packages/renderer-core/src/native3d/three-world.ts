import {
  ACESFilmicToneMapping,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SpotLight,
  SRGBColorSpace,
} from "three";
import type { Object3D, WebGLRenderer } from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type {
  Native3DSource,
  NativeSceneFrame,
} from "@still-shift/scene-contract";
import type { DeepReadonly } from "./types.ts";
import { createNativeThreeMaterials } from "./three-materials.ts";
import type { NativeTextureFont } from "./three-textures.ts";

export function inheritedThreeVisibility(object: Object3D): boolean {
  for (let part: Object3D | null = object; part; part = part.parent)
    if (!part.visible) return false;
  return true;
}
export function createNativeThreeGeometry(
  source: DeepReadonly<Native3DSource>,
) {
  const geometries = new Map<string, BufferGeometry>();
  try {
    for (const definition of source.geometry.meshes) {
      const geometry = new BufferGeometry();
      geometries.set(definition.id, geometry);
      geometry.setAttribute(
        "position",
        new Float32BufferAttribute(definition.positions, 3),
      );
      geometry.setAttribute(
        "normal",
        new Float32BufferAttribute(definition.normals, 3),
      );
      if (definition.uvs)
        geometry.setAttribute(
          "uv",
          new Float32BufferAttribute(definition.uvs, 2),
        );
      geometry.setIndex(
        definition.indices.some((value) => value >= 65535)
          ? new Uint32BufferAttribute(definition.indices, 1)
          : new Uint16BufferAttribute(definition.indices, 1),
      );
      for (const group of definition.groups ?? [])
        geometry.addGroup(group.start, group.count, group.materialIndex);
    }
  } catch (error) {
    for (const geometry of geometries.values()) geometry.dispose();
    throw error;
  }
  return {
    geometries,
    dispose() {
      for (const geometry of geometries.values()) geometry.dispose();
      geometries.clear();
    },
  };
}
export type NativeThreeGeometry = ReturnType<typeof createNativeThreeGeometry>;
/** Bind the actual uploaded typed attributes to the prepared physical catalogue once.
 * Float64 authored positions are explicitly quantized to GPU Float32 here. */
export function verifyNativeThreeGeometry(
  source: DeepReadonly<Native3DSource>,
  geometry: NativeThreeGeometry,
): void {
  for (const definition of source.geometry.meshes) {
    const actual = geometry.geometries.get(definition.id);
    if (!actual)
      throw Error(
        `comp-native3d-checksum: missing uploaded mesh ${definition.id}`,
      );
    for (const [name, expected] of [
      ["position", definition.positions],
      ["normal", definition.normals],
      ["uv", definition.uvs],
    ] as const) {
      if (!expected) continue;
      const attribute = actual.getAttribute(name);
      if (
        !attribute ||
        attribute.array.length !== expected.length ||
        expected.some(
          (value, index) => attribute.array[index] !== Math.fround(value),
        )
      )
        throw Error(
          `comp-native3d-checksum: uploaded ${definition.id}.${name} differs from GPU-quantized source`,
        );
    }
    const index = actual.getIndex();
    if (
      !index ||
      index.array.length !== definition.indices.length ||
      definition.indices.some((value, offset) => index.array[offset] !== value)
    )
      throw Error(
        `comp-native3d-checksum: uploaded ${definition.id}.indices differs from source`,
      );
  }
}

/** Synchronous: the caller has already prepared the exact source and font. */
export function createNativeThreeWorld(
  renderer: WebGLRenderer,
  source: DeepReadonly<Native3DSource>,
  options: {
    textureFont?: NativeTextureFont;
    geometry?: NativeThreeGeometry;
  } = {},
) {
  renderer.setClearColor(
    source.profile.background,
    source.profile.transparent ? 0 : 1,
  );
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = source.profile.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  const world = new Scene();
  world.background = source.profile.transparent
    ? null
    : new Color(source.profile.background);
  const room = new RoomEnvironment();
  const pmrem = new PMREMGenerator(renderer);
  let environment: ReturnType<PMREMGenerator["fromScene"]>;
  try {
    environment = pmrem.fromScene(room, 0.04);
  } finally {
    room.dispose();
    pmrem.dispose();
  }
  if (source.profile.fog)
    world.fog = new Fog(
      source.profile.fog.color,
      source.profile.fog.near,
      source.profile.fog.far,
    );
  world.environment = environment.texture;
  world.environmentIntensity = source.profile.environmentIntensity;
  world.add(new HemisphereLight("#e8f6ff", "#63716e", 1.15));
  const lights: (SpotLight | DirectionalLight)[] = [];
  let materialSet: ReturnType<typeof createNativeThreeMaterials> | undefined;
  let geometry: NativeThreeGeometry | undefined;
  const ownsGeometry = options.geometry === undefined;
  try {
    for (const definition of source.lights) {
      const light =
        definition.type === "spot" ? new SpotLight() : new DirectionalLight();
      lights.push(light);
      light.color.set(definition.color);
      light.intensity = definition.intensity;
      light.position.set(...definition.position);
      light.target.position.set(...definition.target);
      light.castShadow = definition.castShadow;
      light.shadow.mapSize.set(
        definition.shadowMapSize,
        definition.shadowMapSize,
      );
      light.shadow.bias = definition.shadowBias;
      light.shadow.normalBias = definition.shadowNormalBias;
      light.shadow.radius = definition.shadowRadius;
      if (light instanceof SpotLight) {
        light.angle = definition.angle;
        light.penumbra = definition.penumbra;
      }
      if (light instanceof DirectionalLight)
        Object.assign(light.shadow.camera, {
          left: -12,
          right: 12,
          top: 12,
          bottom: -12,
          near: 0.1,
          far: 45,
        });
      world.add(light, light.target);
    }
    const camera = new PerspectiveCamera();
    materialSet = createNativeThreeMaterials(source, options.textureFont);
    const materialIndex = new Map(
      source.geometry.materials.map((material, index) => [material.id, index]),
    );
    const parts = new Map(source.parts.map((part) => [part.id, new Group()]));
    for (const definition of source.parts) {
      const part = parts.get(definition.id)!;
      part.name = definition.id;
      part.matrixAutoUpdate = false;
      (definition.parent ? parts.get(definition.parent)! : world).add(part);
    }
    geometry = options.geometry ?? createNativeThreeGeometry(source);
    verifyNativeThreeGeometry(source, geometry);
    const meshes: Mesh[] = [];
    for (const definition of source.geometry.meshes) {
      const mesh = new Mesh(
        geometry.geometries.get(definition.id)!,
        definition.groups?.length
          ? materialSet.materials
          : materialSet.materials[materialIndex.get(definition.materialId)!],
      );
      mesh.name = definition.id;
      mesh.castShadow = definition.partId !== "floor";
      mesh.receiveShadow = true;
      parts.get(definition.partId)!.add(mesh);
      meshes.push(mesh);
    }
    function applyFrame(
      frame: DeepReadonly<NativeSceneFrame>,
      width: number,
      height: number,
      localVisibility?: Readonly<Record<string, boolean>>,
    ) {
      for (const [id, part] of parts) {
        part.matrix.fromArray(frame.parts[id]!.localMatrix);
        // The bridge retains its historical inherited assignment. Native groups
        // receive authored local visibility; parent traversal supplies inheritance.
        part.visible = localVisibility?.[id] ?? frame.parts[id]!.visible;
      }
      camera.position.set(...frame.camera.position);
      camera.up.set(...frame.camera.up);
      camera.lookAt(...frame.camera.target);
      camera.fov = frame.camera.fovDegrees;
      camera.aspect = width / height;
      camera.near = frame.camera.near;
      camera.far = frame.camera.far;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      world.updateMatrixWorld(true);
    }
    let disposed = false;
    return {
      world,
      camera,
      parts,
      meshes,
      source,
      applyFrame,
      dispose() {
        if (disposed) return;
        disposed = true;
        if (ownsGeometry) geometry!.dispose();
        materialSet!.dispose();
        for (const light of lights) light.shadow.dispose();
        environment.dispose();
        world.clear();
        parts.clear();
        meshes.length = 0;
      },
    };
  } catch (error) {
    if (ownsGeometry) geometry?.dispose();
    materialSet?.dispose();
    for (const light of lights) light.shadow.dispose();
    environment.dispose();
    throw error;
  }
}
export type NativeThreeWorld = ReturnType<typeof createNativeThreeWorld>;
