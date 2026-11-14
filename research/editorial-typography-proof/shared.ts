// Shared inputs for the three editorial title treatments.
//
// The clip is a local Still Shift render of the repository's own courtyard kit
// (assets/cinematic-illustrated/kit-b-courtyard, generated 2026-09-25). It lives
// under the git-ignored benchmarks/results tree, so this proof is local-only:
// the descriptor pins its exact bytes and the renderer re-verifies them.
import { fileURLToPath } from "node:url";
import { video } from "@still-shift/motion";
import { fontAsset } from "@still-shift/motion/node";

const here = import.meta.url;

export const clipAsset = {
  id: "courtyard-clip",
  type: "video" as const,
  path: fileURLToPath(
    new URL(
      "../../benchmarks/results/cinematic-illustrated/review-v3/ci-09-layered-parallax.mp4",
      here,
    ),
  ),
  sha256:
    "sha256:d5bc5a5236113d13f754b6470cf77f8507fc54889d40add09b52bac3d7e7fdcd",
  width: 1920,
  height: 1080,
  frameCount: 168,
  frameRate: { numerator: 24, denominator: 1 },
  color: {
    primaries: "bt709" as const,
    transfer: "bt709" as const,
    matrix: "bt709" as const,
    range: "tv" as const,
  },
};

export const frame = { width: 1080, height: 1920, fps: 24, frames: 168 };

/**
 * Vertical 9:16 crop of the 16:9 clip, centred on source x = 1150 so the
 * standing figure sits on the right third (vertical x ≈ 842).
 */
export function clip() {
  const scale = frame.height / clipAsset.height; // 1.7778
  const width = clipAsset.width * scale;
  const centreX = frame.width / 2 - (1150 - clipAsset.width / 2) * scale;
  return video("clip", clipAsset, {
    size: [width, frame.height],
    fit: "stretch",
  })
    .anchor("center")
    .at(centreX, frame.height / 2);
}

const font = (
  id: string,
  rel: string,
  options: Parameters<typeof fontAsset>[2],
) => fontAsset(id, rel, { relativeTo: here, ...options });

export const fonts = {
  serif: await font(
    "serif",
    "../../assets/story-motion/fonts/source-serif-4-semibold.otf",
    {
      weight: "600",
    },
  ),
  sans: await font(
    "sans",
    "../../assets/story-motion/fonts/plex-sans-semibold.ttf",
    {
      weight: "600",
    },
  ),
  mono: await font(
    "mono",
    "../../assets/story-motion/fonts/plex-mono-medium.ttf",
    {
      weight: "500",
    },
  ),
  thai: await font(
    "thai",
    "../../assets/ecommerce-motion/fonts/noto-sans-thai.ttf",
    {
      weight: "400",
      variable: {
        wght: { min: 100, default: 400, max: 900 },
        wdth: { min: 62.5, default: 100, max: 100 },
      },
    },
  ),
};

/** Title timing shared by every treatment: entrance, hold, exit (frames). */
export const beats = { enter: 12, held: 44, exit: 124, gone: 150 };
