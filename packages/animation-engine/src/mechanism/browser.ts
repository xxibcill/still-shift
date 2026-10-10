import {
  ACESFilmicToneMapping,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  FrontSide,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Raycaster,
  Scene,
  SpotLight,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { Object3D } from "three";
import type { MechanismScene } from "@still-shift/scene-contract";
import type { evaluateMechanismFrame } from "../../../renderer-core/src/mechanism/index.ts";

type EvaluatedFrame = ReturnType<typeof evaluateMechanismFrame>;
type TextureFont = { bytesBase64: string; weight: string; family: string };
export const MECHANISM_BRIDGE_RENDERER_VERSION = "mechanism-three-bridge-1";

export async function createMechanismPlateRenderer(
  scene: MechanismScene,
  options: { width: number; height: number; font?: TextureFont },
) {
  const canvas = document.createElement("canvas");
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: scene.profile.transparent,
    preserveDrawingBuffer: true,
    // MSAA resolves store premultiplied coverage; canvas PNG encoding restores straight alpha.
    premultipliedAlpha: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(options.width, options.height);
  renderer.setClearColor(
    scene.profile.background,
    scene.profile.transparent ? 0 : 1,
  );
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = scene.profile.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  const world = new Scene();
  world.background = scene.profile.transparent
    ? null
    : new Color(scene.profile.background);
  const room = new RoomEnvironment();
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  if (scene.profile.fog)
    world.fog = new Fog(
      scene.profile.fog.color,
      scene.profile.fog.near,
      scene.profile.fog.far,
    );
  world.environment = environment.texture;
  world.environmentIntensity = scene.profile.environmentIntensity;
  world.add(new HemisphereLight("#e8f6ff", "#63716e", 1.15));
  for (const definition of scene.lights) {
    const light =
      definition.type === "spot" ? new SpotLight() : new DirectionalLight();
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
  const textures: CanvasTexture[] = [];
  let font: FontFace | undefined;
  const fontFamily = "StillShiftMechanismDigits";
  if (options.font) {
    const binary = atob(options.font.bytesBase64);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    font = new FontFace(fontFamily, bytes, { weight: options.font.weight });
    await font.load();
    document.fonts.add(font);
  }
  const materials = scene.geometry.materials.map((definition) => {
    const material = new MeshStandardMaterial({
      color: definition.color,
      metalness: definition.metalness,
      roughness: definition.roughness,
      emissive: definition.emissive,
      emissiveIntensity: definition.emissiveIntensity,
      opacity: definition.opacity,
      alphaTest: definition.alphaMode === "mask" ? definition.alphaCutoff : 0,
      side: definition.side === "double" ? DoubleSide : FrontSide,
    });
    if (definition.texture) {
      if (definition.texture.kind === "tape-graduations" && !font)
        throw new Error(
          "font-missing: tape-graduations requires a pinned font",
        );
      const texture =
        definition.texture.kind === "tape-graduations"
          ? tapeTexture(fontFamily, options.font!.weight)
          : woodTexture(definition.texture.seed ?? 42);
      textures.push(texture);
      material.map = texture;
      if (definition.texture.kind === "wood-grain") {
        material.bumpMap = texture;
        material.bumpScale = 0.035;
      }
    }
    return material;
  });
  const materialIndex = new Map(
    scene.geometry.materials.map((material, index) => [material.id, index]),
  );
  const parts = new Map(scene.parts.map((part) => [part.id, new Group()]));
  for (const definition of scene.parts) {
    const part = parts.get(definition.id)!;
    part.name = definition.id;
    part.matrixAutoUpdate = false;
    (definition.parent ? parts.get(definition.parent)! : world).add(part);
  }
  const meshes: Mesh[] = [];
  for (const definition of scene.geometry.meshes) {
    const geometry = new BufferGeometry();
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
    geometry.setIndex(definition.indices);
    for (const group of definition.groups ?? [])
      geometry.addGroup(group.start, group.count, group.materialIndex);
    const mesh = new Mesh(
      geometry,
      definition.groups?.length
        ? materials
        : materials[materialIndex.get(definition.materialId)!],
    );
    mesh.name = definition.id;
    mesh.castShadow = definition.partId !== "floor";
    mesh.receiveShadow = true;
    parts.get(definition.partId)!.add(mesh);
    meshes.push(mesh);
  }
  const raycaster = new Raycaster();
  function render(frame: EvaluatedFrame) {
    for (const [id, part] of parts) {
      part.matrix.fromArray(frame.parts[id]!.localMatrix);
      part.visible = frame.parts[id]!.visible;
    }
    camera.position.set(...frame.camera.position);
    camera.up.set(...frame.camera.up);
    camera.lookAt(...frame.camera.target);
    camera.fov = frame.camera.fovDegrees;
    camera.aspect = options.width / options.height;
    camera.near = frame.camera.near;
    camera.far = frame.camera.far;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    world.updateMatrixWorld(true);
    for (const [id, part] of parts) {
      const expected = frame.parts[id]!.worldMatrix;
      if (
        part.matrixWorld.elements.some(
          (value, index) => Math.abs(value - expected[index]!) > 1e-8,
        )
      )
        throw new Error(
          `mechanism-rendered-transform: part ${id} differs from evaluated world matrix`,
        );
    }
    for (const definition of scene.anchors) {
      const actual = parts
        .get(definition.part)!
        .localToWorld(new Vector3(...definition.position));
      const expected = new Vector3(...frame.anchors[definition.id]!.world);
      if (actual.distanceTo(expected) > 1e-8)
        throw new Error(
          `mechanism-rendered-anchor: anchor ${definition.id} differs from actual part transform`,
        );
    }
    for (const mesh of meshes) {
      if (
        mesh.matrix.elements.some(
          (value, index) => Math.abs(value - (index % 5 === 0 ? 1 : 0)) > 1e-8,
        )
      )
        throw new Error(
          `mechanism-rendered-mesh: baked mesh ${mesh.name} has an unintended independent transform`,
        );
    }
    renderer.render(world, camera);
    const anchors = Object.fromEntries(
      Object.entries(frame.anchors).map(([id, anchor]) => {
        const projected = new Vector3(...anchor.world).project(camera);
        const pixel: [number, number] = [
          ((projected.x + 1) * options.width) / 2,
          ((1 - projected.y) * options.height) / 2,
        ];
        const projectionErrorPixels = anchor.pixel
          ? Math.hypot(pixel[0] - anchor.pixel[0], pixel[1] - anchor.pixel[1])
          : 0;
        let visibility: string = anchor.projectionVisibility;
        if (visibility === "in-frame") {
          raycaster.setFromCamera(
            new Vector2(projected.x, projected.y),
            camera,
          );
          const distance = camera.position.distanceTo(
            new Vector3(...anchor.world),
          );
          const first = raycaster
            .intersectObjects(meshes, false)
            .find((hit) => visible(hit.object));
          if (first && first.distance < distance - 0.0001)
            visibility = "occluded";
        }
        return [id, { ...anchor, visibility, projectionErrorPixels }];
      }),
    );
    return { ...frame, anchors, renderer: { ...renderer.info.render } };
  }
  function dispose() {
    for (const mesh of meshes) mesh.geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    environment.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    if (font) document.fonts.delete(font);
  }
  return {
    render,
    png: () => canvas.toDataURL("image/png").split(",")[1]!,
    dispose,
  };
}

function visible(object: Object3D): boolean {
  for (let part: Object3D | null = object; part; part = part.parent)
    if (!part.visible) return false;
  return true;
}
function textureCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("texture-canvas-unavailable");
  return { canvas, context };
}
function srgbTexture(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
function tapeTexture(family: string, weight: string) {
  const { canvas, context } = textureCanvas(4096, 512);
  context.fillStyle = "#f8c94f";
  context.fillRect(0, 0, 4096, 512);
  context.fillStyle = "#242829";
  context.font = `${weight} 104px ${family}`;
  context.textAlign = "center";
  for (let tick = 0; tick <= 100; tick++) {
    const x = (tick / 100) * 4096,
      major = tick % 10 === 0,
      length = major ? 118 : tick % 5 === 0 ? 83 : 48;
    context.fillRect(x, 0, major ? 8 : 4, length);
    context.fillRect(x, 512 - length, major ? 8 : 4, length);
    if (major && tick > 0) {
      context.save();
      context.translate(x, 273);
      context.rotate(Math.PI / 2);
      context.fillText(String(tick / 10), 0, 0);
      context.restore();
    }
  }
  return srgbTexture(canvas);
}
function woodTexture(seed: number) {
  const { canvas, context } = textureCanvas(1024, 512);
  context.fillStyle = "#c49b69";
  context.fillRect(0, 0, 1024, 512);
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let line = 0; line < 2400; line++) {
    const y = random() * 512;
    context.strokeStyle = `rgba(${65 + random() * 70},${36 + random() * 50},16,${0.02 + random() * 0.09})`;
    context.lineWidth = 0.4 + random() * 2;
    context.beginPath();
    for (let x = 0; x <= 1024; x += 8) {
      const py =
        y + Math.sin(x * 0.008 + y * 0.035) * 3 + Math.sin(x * 0.025 + y) * 0.8;
      if (x) context.lineTo(x, py);
      else context.moveTo(x, py);
    }
    context.stroke();
  }
  return srgbTexture(canvas);
}
