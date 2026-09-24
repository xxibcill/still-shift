import {
  ClampToEdgeWrapping,
  LinearFilter,
  Mesh,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  WebGLRenderer,
} from "three";

import {
  coverFit,
  evaluateFrame,
  PREVIEW_LIMITS,
  type PreviewScene,
} from "./scene.ts";

const vertexShader = `
varying vec2 vUv;
uniform sampler2D uDepth;
uniform vec2 uCover;
uniform float uOverscan;
uniform float uScale;
uniform float uDepthStrength;
void main() {
  float depth = texture2D(uDepth, uv).r;
  if (!(depth >= 0.0 && depth <= 1.0)) depth = 0.5;
  float parallax = 1.0 / (1.0 - depth * uDepthStrength);
  vec2 displaced = position.xy * uCover * (1.0 + uOverscan) * uScale * parallax;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, depth * uDepthStrength, 1.0);
  vUv = uv;
}`;

const fragmentShader = `
uniform sampler2D uSource;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(uSource, vUv);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const createTexture = (
  image: HTMLImageElement,
  colorSpace: typeof SRGBColorSpace | typeof NoColorSpace,
): Texture => {
  const texture = new Texture(image);
  texture.colorSpace = colorSpace;
  texture.flipY = true;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
};

export type WebGLPreview = {
  renderFrame(frameIndex: number): void;
  dispose(): void;
};

export const createWebGLPreview = (
  canvas: HTMLCanvasElement,
  scene: PreviewScene,
  source: HTMLImageElement,
  depth: HTMLImageElement,
): WebGLPreview => {
  const context = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  if (!context) throw new Error("WebGL2 is required for the depth preview");

  const renderer = new WebGLRenderer({
    canvas,
    context,
    alpha: false,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.setClearColor(0x141414, 1);

  const sourceTexture = createTexture(source, SRGBColorSpace);
  const depthTexture = createTexture(depth, NoColorSpace);
  const cover = coverFit(
    scene.source.width,
    scene.source.height,
    scene.canvas.width,
    scene.canvas.height,
  );
  const geometry = new PlaneGeometry(
    2,
    2,
    PREVIEW_LIMITS.gridColumns,
    PREVIEW_LIMITS.gridRows,
  );
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uSource: { value: sourceTexture },
      uDepth: { value: depthTexture },
      uCover: { value: [cover.x, cover.y] },
      uOverscan: { value: scene.motion.overscan },
      uScale: { value: 1 },
      uDepthStrength: { value: scene.motion.depthStrength },
    },
  });
  const previewScene = new Scene();
  previewScene.add(new Mesh(geometry, material));
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  return {
    renderFrame(frameIndex) {
      const frame = evaluateFrame(scene, frameIndex);
      material.uniforms.uScale!.value = frame.scale;
      renderer.render(previewScene, camera);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      sourceTexture.dispose();
      depthTexture.dispose();
      renderer.dispose();
    },
  };
};
