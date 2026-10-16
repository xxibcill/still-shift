import { describe, expect, it } from "vitest";
import {
  compileBlenderEpisode,
  composeBlenderEpisode,
  blenderEpisodePlateKey,
  parseBlenderEpisodePlan,
  type BlenderAnchorFrames,
} from "@still-shift/animation-engine";
import {
  blenderEpisodePlan,
  blenderEpisodeSource,
  blenderHash,
} from "../fixtures/blender-episode-support.ts";
function fixture() {
  const plan = blenderEpisodePlan();
  Object.assign(plan.shots[0]!, { highlights: { tooth: "#ffc14a" } });
  Object.assign(plan, {
    callouts: [
      {
        id: "tooth",
        text: "Tooth",
        shot: "recognition",
        anchor: "anchor.tooth",
        part: "tooth",
        start: 0,
        endExclusive: 30,
        position: [0.3, 0.2],
        color: "#ffc14a",
        controlRanges: { "slider.travel": { min: 0.34, max: 3.65 } },
      },
    ],
  });
  const compiled = compileBlenderEpisode(blenderEpisodeSource(), plan);
  const projections: BlenderAnchorFrames = Array.from(
    { length: 60 },
    (_, frame) => ({
      anchors: {
        "anchor.tooth": {
          kind: "object-origin",
          world: [0, 0, 0],
          pixel: [100 + frame, 200],
          depth: 5,
          inFrame: true,
        },
      },
      partVisibility: { tooth: true },
    }),
  );
  const sequence = {
    id: "plates",
    type: "sequence",
    path: "frame-%06d.png",
    manifestPath: "sequence.json",
    sha256: blenderHash("sequence"),
    firstFrame: 0,
    width: 320,
    height: 568,
    frameCount: 60,
    frameRate: { numerator: 30, denominator: 1 },
    color: {
      primaries: "bt709",
      transfer: "iec61966-2-1",
      matrix: "gbr",
      range: "pc",
    },
  } as const;
  return { plan, compiled, projections, sequence };
}
describe("captured native causal annotations", () => {
  it("samples native highlights/queries by shot and binds editable label/leader endpoints to the same native state", () => {
    const f = fixture(),
      result = composeBlenderEpisode(f.compiled, f.sequence, f.projections);
    expect(f.compiled.job.frames[0]).toMatchObject({
      highlights: { tooth: "#ffc14a" },
      anchors: ["anchor.tooth"],
    });
    expect(f.compiled.job.frames[30]).toMatchObject({
      highlights: {},
      anchors: [],
    });
    expect(
      result.layers.find((l) => l.id === "callout-text-tooth"),
    ).toMatchObject({
      type: "text",
      text: "Tooth",
      textRole: "label",
      metadata: { nativeCallout: { part: "tooth", anchor: "anchor.tooth" } },
    });
    const leader = result.layers.find((l) => l.id === "callout-leader-tooth");
    if (leader?.type !== "shape") throw Error("Missing native leader");
    const content = leader.contents.find((c) => c.type === "path");
    if (content?.type !== "path" || !("keys" in content.path))
      throw Error("Missing captured leader keys");
    expect(content.path.keys[0]!.value.vertices[1]).toEqual([100, 200]);
    expect(content.path.keys.at(-1)!.value.vertices[1]).toEqual([129, 200]);
  });
  it("reuses clean native state keys for label text/position edits and invalidates only highlighted/queried states", () => {
    const f = fixture(),
      before = f.compiled.job.frames.map((p) =>
        blenderEpisodePlateKey(f.compiled.job, p, blenderHash("profile")),
      );
    const plan = JSON.parse(JSON.stringify(f.plan));
    plan.callouts[0].text = "Edited tooth";
    plan.callouts[0].position = [0.6, 0.25];
    const edited = compileBlenderEpisode(blenderEpisodeSource(), plan);
    expect(
      edited.job.frames.map((p) =>
        blenderEpisodePlateKey(edited.job, p, blenderHash("profile")),
      ),
    ).toEqual(before);
    plan.shots[0].highlights.tooth = "#44ccff";
    const recolored = compileBlenderEpisode(blenderEpisodeSource(), plan);
    expect(
      recolored.job.frames
        .slice(30)
        .map((p) =>
          blenderEpisodePlateKey(recolored.job, p, blenderHash("profile")),
        ),
    ).toEqual(before.slice(30));
    expect(
      blenderEpisodePlateKey(
        recolored.job,
        recolored.job.frames[0]!,
        blenderHash("profile"),
      ),
    ).not.toBe(before[0]);
  });
  it("rejects missing/offscreen projection or hidden part evidence instead of attaching a label to an invented point", () => {
    const f = fixture();
    expect(() => composeBlenderEpisode(f.compiled, f.sequence)).toThrow();
    for (const patch of [
      { anchors: {} },
      {
        anchors: {
          "anchor.tooth": {
            ...f.projections[0]!.anchors["anchor.tooth"]!,
            inFrame: false,
          },
        },
      },
      { partVisibility: { tooth: false } },
    ]) {
      const frames = JSON.parse(JSON.stringify(f.projections));
      Object.assign(frames[1], patch);
      expect(() =>
        composeBlenderEpisode(f.compiled, f.sequence, frames),
      ).toThrow(/lacks an in-frame/);
    }
  });
  it("rejects source-control label phase mismatches and overlapping/oversized declarations before native capture", () => {
    const f = fixture(),
      plan = JSON.parse(JSON.stringify(f.plan));
    plan.callouts[0].controlRanges["slider.travel"] = { min: 3.65, max: 3.65 };
    expect(() => compileBlenderEpisode(blenderEpisodeSource(), plan)).toThrow(
      /control state at frame 0/,
    );
    plan.callouts[0].controlRanges = {};
    plan.callouts[0].endExclusive = 31;
    expect(() => parseBlenderEpisodePlan(plan)).toThrow();
    plan.callouts[0].endExclusive = 30;
    plan.callouts = Array.from({ length: 5 }, (_, i) => ({
      ...plan.callouts[0],
      id: "label" + i,
    }));
    expect(() => parseBlenderEpisodePlan(plan)).toThrow(/four native callouts/);
  });
});
