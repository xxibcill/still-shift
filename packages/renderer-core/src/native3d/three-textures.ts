import { CanvasTexture, SRGBColorSpace } from "three";

/** Already loaded and hash-verified by the resource owner. No FontFace or IO here. */
export type NativeTextureFont = {
  family: string;
  weight: string;
  sha256?: string;
};
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
export function tapeTexture(family: string, weight: string) {
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
export function woodTexture(seed: number) {
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
