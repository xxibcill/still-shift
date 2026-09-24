import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  Mesh,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
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
uniform vec2 uDepthSampleStep;
uniform vec2 uOffset;
uniform float uOverscan;
uniform float uScale;
uniform float uDepthStrength;
uniform float uRoll;
uniform float uEdgeDamping;
float safeDepth(vec2 coordinates) {
  float value = texture2D(uDepth, coordinates).r;
  return (value >= 0.0 && value <= 1.0) ? value : 0.5;
}
void main() {
  float depth = safeDepth(uv);
  float gradient = max(
    max(abs(depth - safeDepth(uv + vec2(uDepthSampleStep.x, 0.0))),
        abs(depth - safeDepth(uv - vec2(uDepthSampleStep.x, 0.0)))),
    max(abs(depth - safeDepth(uv + vec2(0.0, uDepthSampleStep.y))),
        abs(depth - safeDepth(uv - vec2(0.0, uDepthSampleStep.y))))
  );
  float damping = 1.0 - uEdgeDamping * 0.8 * smoothstep(0.06, 0.25, gradient);
  float parallax = 1.0 / (1.0 - depth * uDepthStrength * damping);
  vec2 displaced = position.xy * uCover * (1.0 + uOverscan) * uScale * parallax;
  float cosine = cos(uRoll);
  float sine = sin(uRoll);
  displaced = vec2(
    displaced.x * cosine - displaced.y * sine,
    displaced.x * sine + displaced.y * cosine
  ) + uOffset;
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

const createNeutralDepthTexture = (): Texture => {
  const texture = new DataTexture(
    new Uint8Array([128, 128, 128, 255]),
    1,
    1,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.colorSpace = NoColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
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
  depth: HTMLImageElement | null,
): WebGLPreview => {
  if (!depth && scene.motion.mode !== "fallback_2d") {
    throw new Error("Depth image is required for depth motion");
  }
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
  const depthTexture = depth
    ? createTexture(depth, NoColorSpace)
    : createNeutralDepthTexture();
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
      uDepthSampleStep: {
        value: [
          Math.max(1 / scene.source.width, 1 / PREVIEW_LIMITS.gridColumns),
          Math.max(1 / scene.source.height, 1 / PREVIEW_LIMITS.gridRows),
        ],
      },
      uOffset: { value: [0, 0] },
      uOverscan: { value: scene.motion.overscan },
      uScale: { value: 1 },
      uDepthStrength: { value: 0 },
      uRoll: { value: 0 },
      uEdgeDamping: { value: scene.motion.preset === "slow_push" ? 0 : 1 },
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
      material.uniforms.uDepthStrength!.value = frame.depthStrength;
      material.uniforms.uOffset!.value = [
        frame.translationX,
        frame.translationY,
      ];
      material.uniforms.uRoll!.value = (frame.rollDegrees * Math.PI) / 180;
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
