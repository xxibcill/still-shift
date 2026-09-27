export type FocusPoint = readonly [number, number];
export type CropWindow = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type DepthSubjectEstimate = {
  focus: FocusPoint;
  bounds: CropWindow;
  areaFraction: number;
};

export type SubjectCropViolation = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(value, high));

export function focusCropWindow(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  focus: FocusPoint,
): CropWindow {
  if (
    [sourceWidth, sourceHeight, canvasWidth, canvasHeight].some(
      (value) => !Number.isFinite(value) || value <= 0,
    ) ||
    focus.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
  )
    throw new Error(
      "Focus crop needs positive dimensions and a normalized focus",
    );
  const sourceAspect = sourceWidth / sourceHeight;
  const canvasAspect = canvasWidth / canvasHeight;
  const width = Math.min(1, canvasAspect / sourceAspect);
  const height = Math.min(1, sourceAspect / canvasAspect);
  return {
    x: clamp(focus[0] - width / 2, 0, 1 - width),
    y: clamp(focus[1] - height / 2, 0, 1 - height),
    width,
    height,
  };
}

export function estimateDepthSubject(
  width: number,
  height: number,
  depth: Uint8Array | Uint8ClampedArray,
): DepthSubjectEstimate | null {
  if (depth.length !== width * height * 4 || width < 2 || height < 2)
    throw new Error("Depth focus pixels must match their dimensions");
  const histogram = new Uint32Array(256);
  for (let index = 0; index < width * height; index += 1)
    histogram[depth[index * 4]!] = histogram[depth[index * 4]!]! + 1;
  let lowerCount = 0;
  let lower = 0;
  let upper = 255;
  for (let value = 0; value < 256; value += 1) {
    lowerCount += histogram[value]!;
    if (lowerCount >= width * height * 0.1) {
      lower = value;
      break;
    }
  }
  let upperCount = 0;
  for (let value = 255; value >= 0; value -= 1) {
    upperCount += histogram[value]!;
    if (upperCount >= width * height * 0.1) {
      upper = value;
      break;
    }
  }
  if (upper - lower < 16) return null;
  const threshold = lower + (upper - lower) * 0.72;
  const visited = new Uint8Array(width * height);
  const minimumArea = Math.max(4, Math.round(width * height * 0.01));
  let best: { score: number; subject: DepthSubjectEstimate } | null = null;
  for (let start = 0; start < visited.length; start += 1) {
    if (visited[start] || depth[start * 4]! < threshold) continue;
    const queue = [start];
    visited[start] = 1;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let sumDepth = 0;
    let left = width;
    let top = height;
    let right = 0;
    let bottom = 0;
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head]!;
      const x = index % width;
      const y = Math.floor(index / width);
      area += 1;
      sumX += x + 0.5;
      sumY += y + 0.5;
      sumDepth += depth[index * 4]!;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
      for (const neighbor of [
        x ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ]) {
        if (
          neighbor < 0 ||
          visited[neighbor] ||
          depth[neighbor * 4]! < threshold
        )
          continue;
        visited[neighbor] = 1;
        queue.push(neighbor);
      }
    }
    if (area < minimumArea) continue;
    const touchesEdge =
      Number(left === 0) +
      Number(top === 0) +
      Number(right === width) +
      Number(bottom === height);
    // A near-depth component spanning multiple edges is usually background gradient.
    if (touchesEdge >= 2) continue;
    const focus: FocusPoint = [sumX / area / width, sumY / area / height];
    const centerDistance = Math.hypot(focus[0] - 0.5, focus[1] - 0.5);
    const score =
      area * (sumDepth / area / 255) ** 2 * (1 - centerDistance * 0.5);
    if (!best || score > best.score)
      best = {
        score,
        subject: {
          focus,
          bounds: {
            x: left / width,
            y: top / height,
            width: (right - left) / width,
            height: (bottom - top) / height,
          },
          areaFraction: area / (width * height),
        },
      };
  }
  return best?.subject ?? null;
}

export function subjectCropViolation(
  subject: DepthSubjectEstimate,
  crop: CropWindow,
  tolerance = 0,
): SubjectCropViolation | null {
  const left = Math.max(0, crop.x - subject.bounds.x - tolerance);
  const right = Math.max(
    0,
    subject.bounds.x + subject.bounds.width - crop.x - crop.width - tolerance,
  );
  const top = Math.max(0, crop.y - subject.bounds.y - tolerance);
  const bottom = Math.max(
    0,
    subject.bounds.y + subject.bounds.height - crop.y - crop.height - tolerance,
  );
  return left || right || top || bottom ? { left, right, top, bottom } : null;
}

export const estimateDepthFocus = (
  width: number,
  height: number,
  depth: Uint8Array | Uint8ClampedArray,
): FocusPoint | null =>
  estimateDepthSubject(width, height, depth)?.focus ?? null;

export function cropSafetyPixels(
  width: number,
  height: number,
  pixels: Uint8Array | Uint8ClampedArray,
  crop: CropWindow,
): { width: number; height: number; pixels: Uint8Array } {
  const left = Math.floor(crop.x * width);
  const top = Math.floor(crop.y * height);
  const right = Math.ceil((crop.x + crop.width) * width);
  const bottom = Math.ceil((crop.y + crop.height) * height);
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  const result = new Uint8Array(cropWidth * cropHeight * 4);
  for (let y = 0; y < cropHeight; y += 1) {
    const sourceStart = ((top + y) * width + left) * 4;
    result.set(
      pixels.subarray(sourceStart, sourceStart + cropWidth * 4),
      y * cropWidth * 4,
    );
  }
  return { width: cropWidth, height: cropHeight, pixels: result };
}
