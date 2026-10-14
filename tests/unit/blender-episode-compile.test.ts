import { describe, expect, it } from "vitest";
import {
  compileBlenderEpisode,
  composeBlenderEpisode,
  blenderEpisodePlateKey,
  parseBlenderEpisodePlan,
  parseBlenderEpisodeSource,
} from "@still-shift/animation-engine";
import {
  blenderEpisodePlan,
  blenderEpisodeSource,
  blenderHash,
} from "../fixtures/blender-episode-support.ts";

describe("native Blender episode compilation", () => {
  it("samples shot framing/visibility absolutely and only invalidates affected clean states", () => {
    const source = blenderEpisodeSource(),
      plan = blenderEpisodePlan();
    const baseline = compileBlenderEpisode(source, plan);
    Object.assign(plan.shots[1]!, {
      framing: { orthoScale: 4, shiftX: 0.2 },
      shownParts: ["section.b", "section.a"],
    });
    const before = JSON.stringify(plan),
      changed = compileBlenderEpisode(source, plan);
    expect(changed.job.frames[29]).toMatchObject({ shownParts: [] });
    expect(changed.job.frames[29]!.framing).toBeUndefined();
    expect(changed.job.frames[30]).toMatchObject({
      framing: { orthoScale: 4, shiftX: 0.2 },
      shownParts: ["section.b", "section.a"],
    });
    const keys = (c: typeof baseline) =>
      c.job.frames.map((f) =>
        blenderEpisodePlateKey(c.job, f, blenderHash("profile")),
      );
    expect(keys(changed).slice(0, 30)).toEqual(keys(baseline).slice(0, 30));
    expect(
      keys(changed)
        .slice(30)
        .every((key, i) => key !== keys(baseline)[i + 30]),
    ).toBe(true);
    expect(
      blenderEpisodePlateKey(
        changed.job,
        { ...changed.job.frames[30]!, shownParts: ["section.a", "section.b"] },
        blenderHash("profile"),
      ),
    ).toBe(keys(changed)[30]);
    expect(JSON.stringify(plan)).toBe(before);
    Object.assign(plan.shots[1]!, { shownParts: ["slider.plate.upper"] });
    expect(() => parseBlenderEpisodePlan(plan)).toThrow();
  });
  it("rejects expanded per-frame visibility work before generating the native job", () => {
    const plan = blenderEpisodePlan();
    plan.narration.sampleCount = 3200000;
    plan.originalNarrationClock.samples = 2940000;
    plan.shots[0]!.endExclusive = 1000;
    plan.shots[1]!.start = 1000;
    plan.shots[1]!.endExclusive = 2000;
    for (const shot of plan.shots)
      shot.hiddenParts = Array.from(
        { length: 128 },
        (_, i) => "part" + String(i).padStart(3, "0") + "x".repeat(249),
      );
    expect(() => compileBlenderEpisode(blenderEpisodeSource(), plan)).toThrow(
      /expanded-track budget/,
    );
  });

  it("samples the complete whole-narration timeline from absolute controls and shot cameras", () => {
    const source = blenderEpisodeSource(),
      plan = blenderEpisodePlan();
    const before = JSON.stringify({ source, plan });
    const compiled = compileBlenderEpisode(source, plan);
    expect(compiled.frameCount).toBe(60);
    expect(compiled.job.frames[0]!.controls["slider.travel"]).toBe(0.34);
    expect(compiled.job.frames[30]!.controls["slider.travel"]).toBe(3.65);
    expect(compiled.job.frames[15]!.controls["slider.travel"]).toBeCloseTo(
      1.995,
    );
    expect(compiled.job.frames[59]!.controls["slider.travel"]).toBeCloseTo(
      0.34,
    );
    expect(compiled.job.frames[29]!.camera).toBe("camera.main");
    expect(compiled.job.frames[30]!.camera).toBe("camera.guide");
    expect(compiled.job.requireEmbeddedResources).toBe(true);
    const again = compileBlenderEpisode(source, plan);
    expect([59, 0, 30, 15, 30].map((f) => again.job.frames[f])).toEqual(
      [59, 0, 30, 15, 30].map((f) => compiled.job.frames[f]),
    );
    expect(JSON.stringify({ source, plan })).toBe(before);
  });
  it("keeps clean native keys exact for caption changes and invalidates only affected camera frames", () => {
    const before = compileBlenderEpisode(
      blenderEpisodeSource(),
      blenderEpisodePlan(),
    );
    const plan = blenderEpisodePlan();
    plan.speech[0]!.text = "Editable caption.";
    const textEdit = compileBlenderEpisode(blenderEpisodeSource(), plan);
    const keys = (c: typeof before) =>
      c.job.frames.map((f) =>
        blenderEpisodePlateKey(c.job, f, blenderHash("profile")),
      );
    expect(keys(textEdit)).toEqual(keys(before));
    expect(textEdit.speechSourceSha256).not.toBe(before.speechSourceSha256);
    plan.shots[1]!.camera = "camera.cup";
    const cameraEdit = compileBlenderEpisode(blenderEpisodeSource(), plan);
    expect(keys(cameraEdit).slice(0, 30)).toEqual(keys(before).slice(0, 30));
    expect(
      keys(cameraEdit)
        .slice(30)
        .every((k, i) => k !== keys(before)[i + 30]),
    ).toBe(true);
    expect(
      blenderEpisodePlateKey(
        before.job,
        before.job.frames[0]!,
        blenderHash("new-profile"),
      ),
    ).not.toBe(keys(before)[0]);
  });
  it("uses native editable text, exact speech metadata, shared safe-area geometry and whole audio", () => {
    const c = compileBlenderEpisode(
      blenderEpisodeSource(),
      blenderEpisodePlan(),
    );
    const result = composeBlenderEpisode(c, {
      id: "plates",
      type: "sequence",
      path: "frames/frame-%06d.png",
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
    });
    const caption = result.layers[0]!;
    expect(caption).toMatchObject({
      type: "text",
      textRole: "body",
      text: "The teeth join.",
      inPoint: 0,
      outPoint: 30,
      metadata: {
        speechCue: {
          audioLayer: "narration",
          sourceSha256: c.speechSourceSha256,
          text: "The teeth join.",
        },
      },
    });
    expect(result.layers.find((l) => l.type === "audio")).toMatchObject({
      sourceStartSample: 0,
      sourceEndSample: 96000,
      inPoint: 0,
      outPoint: 60,
    });
    expect(result.layers.at(-1)).toMatchObject({
      type: "sequence",
      sourceOutFrame: 60,
    });
  });
  it("rejects duration changes, incomplete shots, reordered cues, zero-frame text and track overflow", () => {
    const mutations = [
      (p: ReturnType<typeof blenderEpisodePlan>) => {
        p.originalNarrationClock.samples++;
      },
      (p: ReturnType<typeof blenderEpisodePlan>) => {
        p.shots[1]!.start++;
      },
      (p: ReturnType<typeof blenderEpisodePlan>) => {
        p.speech[1]!.startSample = 1;
      },
      (p: ReturnType<typeof blenderEpisodePlan>) => {
        p.speech[0]!.startSample = 1;
        p.speech[0]!.endSampleExclusive = 2;
      },
      (p: ReturnType<typeof blenderEpisodePlan>) => {
        p.controlTracks["slider.travel"][2]!.frame = 60;
      },
      (p: ReturnType<typeof blenderEpisodePlan>) => {
        p.width = 4096;
        p.height = 4096;
      },
    ];
    for (const mutate of mutations) {
      const p = blenderEpisodePlan();
      mutate(p);
      expect(() => parseBlenderEpisodePlan(p)).toThrow();
    }
  });
  it("rejects undeclared, absent or out-of-range control tracks before native execution", () => {
    for (const controls of [
      {},
      { other: [{ frame: 0, value: 1, interpolation: "hold" }] },
      { "slider.travel": [{ frame: 0, value: 4, interpolation: "hold" }] },
    ])
      expect(() =>
        compileBlenderEpisode(blenderEpisodeSource(), {
          ...blenderEpisodePlan(),
          controlTracks: controls,
        }),
      ).toThrow();
    expect(() =>
      compileBlenderEpisode(blenderEpisodeSource(), {
        ...blenderEpisodePlan(),
        sourceFrameTrack: [{ frame: 0, value: -1, interpolation: "hold" }],
      }),
    ).toThrow();
  });
  it("admits a natural partial final video frame without changing the audio clock", () => {
    const p = blenderEpisodePlan();
    p.narration.sampleCount = 96480;
    p.originalNarrationClock.samples = 88641;
    p.shots[1]!.endExclusive = 61;
    p.speech[1]!.endSampleExclusive = 96480;
    const c = compileBlenderEpisode(blenderEpisodeSource(), p);
    expect(c.frameCount).toBe(61);
    expect(c.plan.narration.sampleCount).toBe(96480);
  });
  it("rejects active or arbitrary executable input before calling getters", () => {
    let calls = 0;
    const source = blenderEpisodeSource();
    Object.defineProperty(source, "family", {
      enumerable: true,
      get: () => {
        calls++;
        return "unsafe";
      },
    });
    expect(() => parseBlenderEpisodeSource(source)).toThrow();
    expect(calls).toBe(0);
    expect(() =>
      parseBlenderEpisodePlan({ ...blenderEpisodePlan(), python: "run()" }),
    ).toThrow();
    expect(() =>
      parseBlenderEpisodeSource({
        ...blenderEpisodeSource(),
        resourcePolicy: "undeclared-files",
      }),
    ).toThrow();
  });
});
