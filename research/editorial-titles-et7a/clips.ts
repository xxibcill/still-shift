// Local-only pilot clips (G1: the owner's reference reels, "Yes, local only").
// The repository is public: the reels, their original names and anything
// rendered over them stay in the git-ignored benchmarks/results tree. Only
// these descriptors (trimmed-segment SHA-256s) are committed; the renderer
// rejects any other bytes. See README.md for how the segments were cut.
import { fileURLToPath } from "node:url";
import { video } from "@still-shift/motion";

const reference = (name: string) =>
  fileURLToPath(
    new URL(
      `../../benchmarks/results/editorial-titles-references/${name}`,
      import.meta.url,
    ),
  );
const bt709 = {
  primaries: "bt709" as const,
  transfer: "bt709" as const,
  matrix: "bt709" as const,
  range: "tv" as const,
};

/** Reel A: try-on, 7.0 s at 30 fps, seven cuts, close-ups. */
export const reelA = {
  id: "reel-a",
  type: "video" as const,
  path: reference("reel-a.mp4"),
  sha256:
    "sha256:8faae488ffc7481bc5d9bc60b232616db7d2b12be85c359c705846567adb3bd4",
  width: 720,
  height: 1280,
  frameCount: 210,
  frameRate: { numerator: 30, denominator: 1 },
  color: bt709,
};

/** Reel B: outfit changes, 7.0 s retimed to 24 fps, jump cuts. */
export const reelB = {
  id: "reel-b",
  type: "video" as const,
  path: reference("reel-b.mp4"),
  sha256:
    "sha256:4c5b8075d029452bbdfee606658c9211ca7078a13d6561e0380afbb2b7ef10d2",
  width: 720,
  height: 1280,
  frameCount: 168,
  frameRate: { numerator: 24, denominator: 1 },
  color: bt709,
};

export type Reel = typeof reelA;

export function frameFor(reel: Reel) {
  return {
    width: reel.width,
    height: reel.height,
    fps: reel.frameRate.numerator,
    frames: reel.frameCount,
  };
}

/** Full-frame footage layer; add it last so it paints behind the title. */
export function footage(reel: Reel) {
  return video("footage", reel, { size: [reel.width, reel.height] })
    .anchor("center")
    .at(reel.width / 2, reel.height / 2);
}
