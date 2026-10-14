import { describe, it, expect } from "vitest";
import { MechanismProductionHandoffVersionsSchema } from "@still-shift/animation-engine";
import {
  blenderCompiledFixture,
  blenderHash,
} from "../fixtures/blender-episode-support.ts";

const pin = (path: string) => ({ path, bytes: 2, sha256: blenderHash(path) });
function handoff() {
  const compiled = blenderCompiledFixture();
  return {
    schemaVersion: "mechanism-production-handoff-2",
    backend: "blender-native",
    id: "EU-004",
    question: "How does a zipper join its teeth?",
    family: "zipper",
    designVariant: "metal-tooth-zipper",
    binding: {
      inputSha256: blenderHash("input"),
      outputSha256: blenderHash("video"),
      codeSha256: blenderHash("code"),
      profileSha256: blenderHash("profile"),
    },
    sourceStatus: "generation-snapshot",
    compilation: {
      frameCount: compiled.frameCount,
      width: compiled.plan.width,
      height: compiled.plan.height,
      fps: compiled.plan.fps,
      sourceSamples: compiled.plan.narration.sampleCount,
      sourceAssetSha256: compiled.source.asset.sha256,
    },
    resume: {
      manifestPath: "/queue.json",
      outputDirectory: "/out",
      familyPath: "/source.json",
      cuePath: "/plan.json",
      qaPath: "/qa.json",
    },
    assets: {
      video: pin("items/EU-004/1/output.mp4"),
      audio: pin("items/EU-004/1/review/review-audio.wav"),
      evidence: pin("items/EU-004/1/qa-rendered-visual.json"),
      decodedReport: pin("items/EU-004/1/decoded-output.json"),
      composition: pin("items/EU-004/1/composition.json"),
      nativePlates: pin("items/EU-004/1/native-plates.json"),
    },
    summary: { shots: 2, sampledFrames: 3, images: 3, cropExceptions: 0 },
    qa: {
      technical: "passed",
      mechanical: "unreviewed",
      "sampled-visual": "passed",
      "continuous-motion": "unreviewed",
      listening: "unreviewed",
      factual: "unreviewed",
    },
    reviewedReady: false,
    nextAction:
      "Validate the current handoff before reviewing the final output.",
    qualification: "Native generation snapshot; whole reviews remain open.",
  };
}
describe("native Blender compact handoff", () => {
  it("admits a bounded native family and portable resume assets without claiming acceptance", () => {
    const input = handoff();
    expect(MechanismProductionHandoffVersionsSchema.parse(input)).toEqual(
      input,
    );
  });
  it("rejects generation snapshots claiming ready and asset paths escaping the output", () => {
    const input = handoff();
    input.reviewedReady = true;
    expect(() => MechanismProductionHandoffVersionsSchema.parse(input)).toThrow(
      /generation snapshot/,
    );
    input.reviewedReady = false;
    input.assets.video.path = "../output.mp4";
    expect(() => MechanismProductionHandoffVersionsSchema.parse(input)).toThrow(
      /owned relative/,
    );
  });
});
