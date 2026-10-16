import { describe, expect, it } from "vitest";
import {
  compileBlenderEpisode,
  composeBlenderEpisode,
  parseBlenderEpisodePlan,
  parseBlenderCaptureJob,
} from "@still-shift/animation-engine";
import {
  blenderEpisodePlan,
  blenderEpisodeSource,
  blenderHash,
} from "../fixtures/blender-episode-support.ts";
function episodeAtFps(fps: number) {
  const plan = blenderEpisodePlan();
  plan.fps = fps;
  plan.shots[0]!.endExclusive = fps;
  plan.shots[1]!.start = fps;
  plan.shots[1]!.endExclusive = 2 * fps;
  return plan;
}
describe("native episode export FPS admission", () => {
  it.each([61, 120])("rejects %i FPS before native capture", (fps) => {
    const plan = episodeAtFps(fps);
    expect(() => parseBlenderEpisodePlan(plan)).toThrow();
    expect(() => compileBlenderEpisode(blenderEpisodeSource(), plan)).toThrow();
  });
  it("exports the supported 60 FPS boundary and retains raw capture's separate 120 FPS contract", () => {
    const compiled = compileBlenderEpisode(
      blenderEpisodeSource(),
      episodeAtFps(60),
    );
    const composition = composeBlenderEpisode(compiled, {
      id: "native-episode-plates",
      type: "sequence",
      path: "frame-%06d.png",
      manifestPath: "sequence.json",
      sha256: blenderHash("sequence"),
      firstFrame: 0,
      width: 320,
      height: 568,
      frameCount: 120,
      frameRate: { numerator: 60, denominator: 1 },
      color: {
        primaries: "bt709",
        transfer: "iec61966-2-1",
        matrix: "gbr",
        range: "pc",
      },
    });
    expect(composition.fps).toBe(60);
    expect(composition.frameCount).toBe(120);
    expect(parseBlenderCaptureJob({ ...compiled.job, fps: 120 }).fps).toBe(120);
  });
});
