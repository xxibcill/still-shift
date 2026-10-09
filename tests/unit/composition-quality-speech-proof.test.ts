import { expect, it } from "vitest";
import { composition } from "../../benchmarks/fixtures/composition/ce12/fixtures.ts";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
import type {
  CompositionPhysicalProofHold,
  CompositionQualityPolicy,
} from "../../packages/renderer-core/src/composition/quality-policy.ts";
const hash = (letter: string) => "sha256:" + letter.repeat(64);

function speechFixture() {
  const comp = composition(
    [
      {
        id: "caption",
        type: "text",
        text: "This tape measure hook",
        fontAsset: "font",
        fontSize: 24,
        color: "#ffffff",
        textRole: "body",
        inPoint: 0,
        outPoint: 33,
        transform: { position: [80, 280], anchor: [0, 0] },
      },
      {
        id: "voice",
        type: "audio",
        asset: "speech",
        role: "narration",
        inPoint: 0,
        outPoint: 90,
        sourceStartSample: 0,
        sourceEndSample: 144000,
      },
    ],
    {
      frameCount: 90,
      assets: [
        {
          id: "font",
          type: "font",
          path: "font.ttf",
          sha256: hash("a"),
          weight: "600",
        },
        {
          id: "speech",
          type: "audio",
          path: "speech.wav",
          sha256: hash("b"),
          sampleRate: 48000,
          sampleCount: 144000,
          channels: 1,
        },
      ],
      markers: [{ id: "cut", label: "cut", frame: 25 }],
    },
  );
  const policy: CompositionQualityPolicy = {
    speechCaptions: [
      {
        id: "caption",
        cueId: "cue11",
        purpose: "Follow supplied narration",
        layer: "caption",
        text: "This tape measure hook",
        start: 0,
        end: 33,
        audioLayer: "voice",
        audioSha256: hash("b"),
        sourceSha256: hash("c"),
      },
    ],
    evaluation: {
      textBounds: { caption: [{ left: 0, right: 480, top: 0, bottom: 30 }] },
    },
  };
  const { locale, ...cue } = policy.speechCaptions![0]!;
  comp.layers[0]!.metadata = {
    speechCue: { ...cue, ...(locale ? { locale } : {}) },
  };
  return { comp, policy };
}

it("retains exact source speech cues across cuts and reports the raw independent reading budget", () => {
  const { comp, policy } = speechFixture();
  const report = analyzeCompositionQuality(comp, policy);
  expect(report.speechCaptions).toEqual([
    expect.objectContaining({
      start: 0,
      end: 33,
      intactFrames: 33,
      rawRequiredFrames: 40,
      eligible: true,
      continuity: "supplied-speech-cue",
      humanReview: "required",
    }),
  ]);
  expect(
    report.diagnostics.filter((finding) => finding.code === "reading-time"),
  ).toEqual([
    expect.objectContaining({
      frames: [0, 32],
      measured: 1.1,
      severity: "warning",
      rawSeverity: "error",
      classification: "speech-following-caption",
      speechCaption: expect.objectContaining({
        cueId: "cue11",
        wordsPerSecond: (4 * 30) / 33,
      }),
    }),
  ]);
  const legacy = analyzeCompositionQuality(comp, {
    evaluation: policy.evaluation!,
  });
  expect(
    legacy.diagnostics
      .filter((finding) => finding.code === "reading-time")
      .map((finding) => finding.frames),
  ).toEqual([
    [0, 24],
    [25, 32],
  ]);
  expect(
    legacy.diagnostics.some(
      (finding) => finding.classification === "speech-following-caption",
    ),
  ).toBe(false);
});

it("speech caption eligibility requires measured intact copy throughout the cue and pinned narration coverage", () => {
  const { comp, policy } = speechFixture();
  const missing = analyzeCompositionQuality(comp, {
    ...policy,
    evaluation: { textBounds: {} },
  });
  expect(missing.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "reading-time",
      severity: "error",
      measured: 0,
    }),
  );
  comp.layers[0]!.transform!.opacity = 0.2;
  expect(
    analyzeCompositionQuality(comp, policy).speechCaptions?.[0]!.eligible,
  ).toBe(false);
  comp.layers[0]!.outPoint = 34;
  expect(() => analyzeCompositionQuality(comp, policy)).toThrow(
    /unchanged source cue boundaries/,
  );
  comp.layers[0]!.outPoint = 33;
  if (comp.layers[1]!.type !== "audio") throw new Error("fixture");
  comp.layers[1]!.sourceEndSample = 1600;
  expect(() => analyzeCompositionQuality(comp, policy)).toThrow(
    /pinned narration samples/,
  );
});

function proofFixture() {
  const proof: CompositionPhysicalProofHold = {
    id: "inside",
    purpose: "Compare aligned physical contact faces",
    layer: "plate",
    start: 0,
    end: 90,
    evidenceSha256: hash("d"),
    frames: Array.from({ length: 90 }, (_, frame) => ({
      frame,
      physicalSha256: hash("a"),
      plateSha256: hash("b"),
    })),
  };
  const comp = composition(
    [
      {
        id: "plate",
        type: "sequence",
        asset: "frames",
        size: [640, 360],
        fit: "stretch",
        inPoint: 0,
        outPoint: 90,
        startFrame: 0,
        sourceInFrame: 0,
        frameBlending: "hold",
        transform: { anchor: [0, 0], position: [0, 0] },
        metadata: { physicalProof: proof },
      },
    ],
    {
      frameCount: 90,
      assets: [
        {
          id: "frames",
          type: "sequence",
          path: "/tmp/%06d.png",
          sha256: hash("c"),
          manifestPath: "/tmp/sequence.json",
          firstFrame: 0,
          width: 640,
          height: 360,
          frameCount: 90,
          frameRate: { numerator: 30, denominator: 1 },
          color: {
            primaries: "bt709",
            transfer: "iec61966-2-1",
            matrix: "gbr",
            range: "pc",
          },
        },
      ],
    },
  );
  const policy: CompositionQualityPolicy = {
    physicalProofHolds: [proof],
    pixelHashes: Array(90).fill("same"),
  };
  return { comp, policy, proof };
}

it("classifies measured static physical proof while retaining the complete raw frozen measurement and context", () => {
  const { comp, policy } = proofFixture();
  const report = analyzeCompositionQuality(comp, policy);
  expect(report.physicalProofHolds?.[0]).toMatchObject({
    measuredFrames: 90,
    stationaryIntervals: [{ start: 0, end: 90 }],
    humanReview: "required",
  });
  expect(report.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "frozen-pixels",
      severity: "warning",
      rawSeverity: "error",
      measured: 89,
      frames: [1, 89],
      classification: "declared-physical-proof-hold",
      proofPurposes: [
        {
          id: "inside",
          purpose: "Compare aligned physical contact faces",
          evidenceSha256: hash("d"),
        },
      ],
    }),
  );
  expect(
    analyzeCompositionQuality(comp, { pixelHashes: policy.pixelHashes! })
      .diagnostics,
  ).toContainEqual(
    expect.objectContaining({ code: "frozen-pixels", severity: "error" }),
  );
});

it("proof holds cannot excuse camera or part motion, a wrong held plate, changing source pixels or other moving paint", () => {
  for (const fault of ["physical", "plate", "hold", "paint"] as const) {
    const { comp, policy, proof } = proofFixture();
    if (fault === "physical") proof.frames[20]!.physicalSha256 = hash("e");
    if (fault === "plate") proof.frames[20]!.plateSha256 = hash("e");
    if (fault === "hold") comp.layers[0]!.holdFrame = 0;
    if (fault === "paint")
      comp.layers.push({
        id: "moving",
        type: "solid",
        size: [20, 20],
        color: "#ffffff",
        transform: {
          position: {
            keys: [
              { frame: 0, value: [40, 40] },
              { frame: 89, value: [300, 40] },
            ],
          },
        },
      });
    const report = analyzeCompositionQuality(comp, policy);
    expect(report.diagnostics, fault).toContainEqual(
      expect.objectContaining({ code: "frozen-pixels", severity: "error" }),
    );
  }
});

it("proof declarations require native ordered complete capture evidence", () => {
  const { comp, policy, proof } = proofFixture();
  delete comp.layers[0]!.metadata!.physicalProof;
  expect(() => analyzeCompositionQuality(comp, policy)).toThrow(
    /capture evidence/,
  );
  comp.layers[0]!.metadata!.physicalProof = proof;
  proof.frames[2]!.frame = 9;
  expect(() => analyzeCompositionQuality(comp, policy)).toThrow(
    /complete ordered samples/,
  );
});
