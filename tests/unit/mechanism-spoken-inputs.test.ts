import { describe, expect, it } from "vitest";
import {
  SpokenTakeSchema,
  selectedWordSchema,
  validateSpokenWordCoverage,
  spokenChecksum,
  type SpokenTake,
} from "../helpers/mechanism-spoken-inputs.ts";

function fixture(id: SpokenTake["id"] = "EU-002") {
  const count =
    id === "EU-001" ? 61 : id === "EU-002" ? 62 : id === "EU-003" ? 60 : 64;
  const overrun = id === "EU-002" ? 15 : id === "EU-003" ? 9 : 0;
  const words = Array.from({ length: count }, (_, index) => ({
    text: "Word",
    start: index / 10,
    end: (index + 1) / 10,
  }));
  const sampleCount = count * 4800 - overrun;
  const take = SpokenTakeSchema.parse({
    id,
    family:
      id === "EU-002"
        ? "cable-tie"
        : id === "EU-003"
          ? "clothespeg"
          : "tape-hook",
    sampleCount,
    sampleRate: 48000,
    channels: 1,
    normalized: {
      path: "private.wav",
      bytes: sampleCount * 4 + 44,
      sha256: "a".repeat(64),
    },
    transcript: { path: "private.json", bytes: 1, sha256: "b".repeat(64) },
    cues: [
      {
        id: "first",
        wordRangeOneBasedInclusive: [1, 10],
        startSample: 0,
        endSampleExclusive: 48000,
      },
      {
        id: "last",
        wordRangeOneBasedInclusive: [11, count],
        startSample: 48000,
        endSampleExclusive: sampleCount,
      },
    ],
    clampFinalWordEndOverrunSamples: overrun,
  });
  return { take, words };
}
describe("private spoken-input admission", () => {
  it("rounds all words and admits only the explicitly measured final corrections", () => {
    for (const id of ["EU-001", "EU-002", "EU-003", "EU-001-legacy"] as const) {
      const { take, words } = fixture(id),
        admitted = validateSpokenWordCoverage(take, words);
      expect(admitted.at(-1)!.endSampleExclusive).toBe(take.sampleCount);
      expect(admitted.at(-1)!.clampedSamples).toBe(
        take.clampFinalWordEndOverrunSamples,
      );
      expect(
        admitted.slice(0, -1).every((word) => word.clampedSamples === 0),
      ).toBe(true);
    }
  });
  it("rejects changed overrun, blanket interior clamping and out-of-order words", () => {
    const { take, words } = fixture();
    const changed = structuredClone(words);
    changed.at(-1)!.end += 1 / 48000;
    expect(() => validateSpokenWordCoverage(take, changed)).toThrow(
      /correction differs/,
    );
    const interior = structuredClone(words);
    interior[3]!.end = (take.sampleCount + 1) / 48000;
    expect(() => validateSpokenWordCoverage(take, interior)).toThrow(
      /interior word/,
    );
    const order = structuredClone(words);
    order[3]!.start = 0.1;
    expect(() => validateSpokenWordCoverage(take, order)).toThrow(
      /out of order/,
    );
  });
  it("rejects missing/overlapping coverage and stale whole-source endpoints", () => {
    const { take, words } = fixture();
    const gap = structuredClone(take);
    gap.cues[1]!.wordRangeOneBasedInclusive[0]++;
    expect(() => validateSpokenWordCoverage(gap, words)).toThrow(
      /gap or overlap/,
    );
    const lost = structuredClone(take);
    lost.cues.at(-1)!.wordRangeOneBasedInclusive[1]--;
    expect(() => validateSpokenWordCoverage(lost, words)).toThrow(
      /omits selected words/,
    );
    const short = structuredClone(take);
    short.cues.at(-1)!.endSampleExclusive--;
    expect(() => validateSpokenWordCoverage(short, words)).toThrow(
      /complete source/,
    );
    const onset = structuredClone(take);
    onset.cues[1]!.startSample++;
    expect(() => validateSpokenWordCoverage(onset, words)).toThrow(
      /first selected word/,
    );
  });
  it("checks clause identity without carrying raw transcript metadata", () => {
    const word = selectedWordSchema.parse({
      text: "Word",
      start: 0,
      end: 0.1,
      download_url: "private metadata",
      words_download_url: "private metadata",
    });
    expect(Object.keys(word)).toEqual(["text", "start", "end"]);
    const { take, words } = fixture();
    take.cues[0]!.fullCaptionTextSha256 = spokenChecksum(
      words
        .slice(0, 10)
        .map((word) => word.text)
        .join(" "),
    );
    expect(() => validateSpokenWordCoverage(take, words)).not.toThrow();
    words[0]!.text = "Changed";
    expect(() => validateSpokenWordCoverage(take, words)).toThrow(
      /text identity differs/,
    );
  });
  it("rejects a family/endpoint policy borrowed from another take", () => {
    const { take, words } = fixture();
    const family = structuredClone(take);
    family.family = "tape-hook";
    expect(() => validateSpokenWordCoverage(family, words)).toThrow(
      /family identity/,
    );
    take.clampFinalWordEndOverrunSamples = 9;
    expect(() => validateSpokenWordCoverage(take, words)).toThrow(
      /allowance differs/,
    );
  });
});
