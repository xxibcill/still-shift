import { describe, it, expect } from "vitest";
import {
  compileBlenderEpisode,
  composeBlenderEpisode,
  blenderProductionVisualPolicy,
  blenderProductionSpeechFindings,
  admitBlenderProductionVisualWork,
} from "@still-shift/animation-engine";
import {
  blenderEpisodeSource,
  blenderEpisodePlan,
  blenderHash,
} from "../fixtures/blender-episode-support.ts";
function fixture(plan = blenderEpisodePlan()) {
  const compiled = compileBlenderEpisode(blenderEpisodeSource(), plan);
  const composition = composeBlenderEpisode(compiled, {
    id: "plates",
    type: "sequence",
    path: "frame-%06d.png",
    manifestPath: "sequence.json",
    sha256: blenderHash("sequence"),
    firstFrame: 0,
    width: 320,
    height: 568,
    frameCount: compiled.frameCount,
    frameRate: { numerator: 30, denominator: 1 },
    color: {
      primaries: "bt709",
      transfer: "iec61966-2-1",
      matrix: "gbr",
      range: "pc",
    },
  });
  return { compiled, composition };
}
describe("native rendered QA source and capacity admission", () => {
  it("derives the source policy independently of changed saved text and retains native shot cuts", () => {
    const { compiled, composition } = fixture(),
      before = JSON.stringify(compiled),
      policy = blenderProductionVisualPolicy(compiled);
    composition.layers.find((l) => l.type === "text")!.text = "wrong caption";
    expect(policy.speechCaptions![0]).toMatchObject({
      text: "The teeth join.",
      layer: "speech-join",
      start: 0,
      end: 30,
      audioLayer: "narration",
      sourceSha256: compiled.speechSourceSha256,
    });
    expect(policy.intentionalCuts).toEqual([30]);
    expect(policy.shots).toEqual([
      { id: "recognition", start: 0, end: 30 },
      { id: "guide", start: 30, end: 60 },
    ]);
    expect(JSON.stringify(compiled)).toBe(before);
  });
  it("locates wrong text or self-relabelled metadata against the pinned original cue", () => {
    const { compiled, composition } = fixture();
    expect(
      blenderProductionSpeechFindings(compiled, composition).findings,
    ).toEqual([]);
    const caption = composition.layers.find((l) => l.type === "text")!;
    caption.text = "The jaw is closed.";
    const sourceCue = caption.metadata!.speechCue;
    if (!sourceCue || typeof sourceCue !== "object" || Array.isArray(sourceCue))
      throw Error("fixture speech cue missing");
    sourceCue.text = caption.text;
    const result = blenderProductionSpeechFindings(compiled, composition);
    expect(result.findings).toEqual([
      expect.objectContaining({
        code: "native-speech-source-mismatch",
        frames: [0, 29],
        nodes: ["speech-join"],
        cueId: "join",
      }),
    ]);
    expect(result.evaluatedPolicy.speechCaptions).toHaveLength(1);
    expect(result.expectedPolicy.speechCaptions).toHaveLength(2);
  });
  it("locates missing narration and accepts only the real partial final-sample coverage", () => {
    const { compiled, composition } = fixture();
    const audio = composition.layers.find((l) => l.type === "audio")!;
    audio.sourceEndSample = 94400;
    expect(
      blenderProductionSpeechFindings(compiled, composition).findings,
    ).toEqual([
      expect.objectContaining({
        code: "native-speech-audio-missing",
        frames: [30, 59],
      }),
    ]);
    audio.sourceEndSample = 95999;
    expect(
      blenderProductionSpeechFindings(compiled, composition).findings,
    ).toEqual([
      expect.objectContaining({
        code: "native-speech-audio-missing",
        frames: [30, 59],
      }),
    ]);
    const plan = blenderEpisodePlan();
    plan.narration.sampleCount = 96480;
    plan.originalNarrationClock.samples = 88641;
    plan.shots[1]!.endExclusive = 61;
    plan.speech[1]!.endSampleExclusive = 96480;
    const partial = fixture(plan);
    expect(partial.compiled.frameCount).toBe(61);
    expect(
      blenderProductionSpeechFindings(partial.compiled, partial.composition)
        .findings,
    ).toEqual([]);
    composition.layers = composition.layers.filter((l) => l.type !== "audio");
    expect(
      blenderProductionSpeechFindings(compiled, composition).findings,
    ).toHaveLength(2);
  });
  it("rejects body-role and source-boundary changes while preserving their exact interval", () => {
    const { compiled, composition } = fixture();
    composition.layers.find((l) => l.type === "text")!.textRole = "label";
    composition.layers[0]!.outPoint = 2;
    expect(
      blenderProductionSpeechFindings(compiled, composition).findings[0],
    ).toMatchObject({
      code: "native-speech-source-mismatch",
      frames: [0, 29],
      cueId: "join",
    });
  });
  it("admits the ordinary whole draft and rejects unsafe prospective work before capture or browser analysis", () => {
    expect(admitBlenderProductionVisualWork(653, 28)).toBe(
      2 * 1024 * 1024 + 653 * 28 * 4096,
    );
    expect(() => admitBlenderProductionVisualWork(2000, 514)).toThrow(
      /budget exceeded/,
    );
    expect(() => admitBlenderProductionVisualWork(0, 28)).toThrow(/bounded/);
    expect(() => admitBlenderProductionVisualWork(1, Infinity)).toThrow(
      /bounded/,
    );
  });
});
