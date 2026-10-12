import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";

const sample = z
  .number()
  .int()
  .nonnegative()
  .max(48000 * 60);
const sha256 = z.string().regex(/^(sha256:)?[a-f0-9]{64}$/);
const fileFact = z
  .object({
    path: z.string().min(1),
    bytes: z
      .number()
      .int()
      .positive()
      .max(16 * 1024 * 1024),
    sha256,
  })
  .strict();
const association = z
  .object({
    id: z.string().min(1),
    wordRangeOneBasedInclusive: z.tuple([
      z.number().int().positive(),
      z.number().int().positive(),
    ]),
    startSample: sample,
    endSampleExclusive: sample,
    fullCaptionTextSha256: sha256.optional(),
  })
  .strict();
export const SpokenTakeSchema = z
  .object({
    id: z.enum(["EU-001", "EU-002", "EU-003", "EU-001-legacy"]),
    family: z.enum(["tape-hook", "cable-tie", "clothespeg"]),
    normalized: fileFact,
    transcript: fileFact,
    sampleCount: sample.positive(),
    sampleRate: z.literal(48000),
    channels: z.literal(1),
    cues: z.array(association).min(1).max(16),
    clampFinalWordEndOverrunSamples: z.number().int().nonnegative().max(15),
  })
  .strict();
export const SpokenInputManifestSchema = z
  .object({
    version: z.literal("ms2-supplied-speech-inputs-1"),
    scope: z.string(),
    takes: z.array(SpokenTakeSchema).length(4),
  })
  .strict();
export type SpokenTake = z.infer<typeof SpokenTakeSchema>;
export const selectedWordSchema = z.object({
  text: z.string().min(1).max(128),
  start: z.number().finite().nonnegative(),
  end: z.number().finite().positive(),
});
export type SelectedWord = z.infer<typeof selectedWordSchema>;
export const spokenChecksum = (body: Uint8Array | string) =>
  "sha256:" + createHash("sha256").update(body).digest("hex");
const prefixed = (value: string) =>
  value.startsWith("sha256:") ? value : "sha256:" + value;
const identities = {
  "EU-001": { family: "tape-hook", words: 61, overrun: 0 },
  "EU-002": { family: "cable-tie", words: 62, overrun: 15 },
  "EU-003": { family: "clothespeg", words: 60, overrun: 9 },
  "EU-001-legacy": { family: "tape-hook", words: 64, overrun: 0 },
} as const;

/** Reject all out-of-source words except the two explicitly measured final endpoints. */
export function validateSpokenWordCoverage(
  take: SpokenTake,
  input: readonly SelectedWord[],
) {
  const identity = identities[take.id];
  assert.equal(take.family, identity.family, "Spoken family identity differs");
  assert.equal(
    take.clampFinalWordEndOverrunSamples,
    identity.overrun,
    "Final endpoint allowance differs",
  );
  assert.equal(input.length, identity.words, "Spoken word count differs");
  const words = input.map((word, index) => {
    const startSample = Math.round(word.start * 48000);
    const roundedEndSampleExclusive = Math.round(word.end * 48000);
    const overrun = Math.max(0, roundedEndSampleExclusive - take.sampleCount);
    assert.ok(
      Number.isSafeInteger(startSample) &&
        Number.isSafeInteger(roundedEndSampleExclusive),
    );
    assert.ok(
      startSample >= 0 &&
        startSample < take.sampleCount &&
        roundedEndSampleExclusive > startSample,
      "Word interval is invalid",
    );
    if (index < input.length - 1)
      assert.equal(overrun, 0, "An interior word exceeds the source");
    else
      assert.equal(
        overrun,
        identity.overrun,
        "Final endpoint correction differs from the measured allowance",
      );
    return {
      text: word.text,
      startSample,
      roundedEndSampleExclusive,
      endSampleExclusive: roundedEndSampleExclusive - overrun,
      clampedSamples: overrun,
    };
  });
  for (let index = 1; index < words.length; index++)
    assert.ok(
      words[index - 1]!.endSampleExclusive <= words[index]!.startSample,
      "Words overlap or arrive out of order",
    );
  let nextWord = 1;
  for (let index = 0; index < take.cues.length; index++) {
    const cue = take.cues[index]!,
      [first, last] = cue.wordRangeOneBasedInclusive;
    assert.equal(
      first,
      nextWord,
      "Association word coverage has a gap or overlap",
    );
    assert.ok(
      last >= first && last <= words.length,
      "Association range exceeds the selected words",
    );
    assert.equal(
      cue.startSample,
      index === 0 ? 0 : words[first - 1]!.startSample,
      "Association onset differs from its first selected word",
    );
    assert.equal(
      cue.endSampleExclusive,
      index === take.cues.length - 1
        ? take.sampleCount
        : words[last]!.startSample,
      "Association end differs from the next selected word or complete source",
    );
    assert.ok(
      words[last - 1]!.endSampleExclusive <= cue.endSampleExclusive,
      "Association loses its final word",
    );
    if (cue.fullCaptionTextSha256)
      assert.equal(
        spokenChecksum(
          words
            .slice(first - 1, last)
            .map((word) => word.text)
            .join(" "),
        ),
        prefixed(cue.fullCaptionTextSha256),
        "Selected clause text identity differs",
      );
    nextWord = last + 1;
  }
  assert.equal(
    nextWord,
    words.length + 1,
    "Association coverage omits selected words",
  );
  return words;
}

async function readPinned(fact: z.infer<typeof fileFact>) {
  const body = await readFile(fact.path);
  assert.equal(body.length, fact.bytes, "Private input byte count differs");
  assert.equal(
    spokenChecksum(body),
    prefixed(fact.sha256),
    "Private input body identity differs",
  );
  return body;
}

/** Read only the selected word fields. Never serialize the raw transcript or its signed URLs. */
export async function readSpokenTake(take: SpokenTake) {
  assert.ok(
    take.transcript.bytes <= 65536,
    "Private transcript exceeds the bounded fixture size",
  );
  const transcript = JSON.parse(
    (await readPinned(take.transcript)).toString(),
  ) as { words?: unknown };
  const selected = z
    .array(selectedWordSchema)
    .max(256)
    .safeParse(transcript.words);
  assert.ok(selected.success, "Selected transcript words are invalid");
  const words = validateSpokenWordCoverage(take, selected.data);
  const audio = await readPinned(take.normalized);
  assert.equal(
    audio.length,
    44 + take.sampleCount * 4,
    "Canonical complete mono Float32 WAV length differs",
  );
  assert.equal(audio.subarray(0, 4).toString(), "RIFF");
  assert.equal(audio.subarray(8, 12).toString(), "WAVE");
  assert.equal(audio.readUInt32LE(4), audio.length - 8);
  assert.equal(audio.subarray(12, 16).toString(), "fmt ");
  assert.equal(audio.readUInt32LE(16), 16);
  assert.equal(audio.readUInt16LE(20), 3);
  assert.equal(audio.readUInt16LE(22), 1);
  assert.equal(audio.readUInt32LE(24), 48000);
  assert.equal(audio.readUInt32LE(28), 192000);
  assert.equal(audio.readUInt16LE(32), 4);
  assert.equal(audio.readUInt16LE(34), 32);
  assert.equal(audio.subarray(36, 40).toString(), "data");
  assert.equal(audio.readUInt32LE(40), take.sampleCount * 4);
  return { words, sourcePcmSha256: spokenChecksum(audio.subarray(44)) };
}

export async function readSpokenInputManifest(path: string) {
  const body = await readFile(path);
  assert.ok(
    body.length <= 65536,
    "Private input manifest exceeds the bounded fixture size",
  );
  const parsed = SpokenInputManifestSchema.safeParse(
    JSON.parse(body.toString()),
  );
  assert.ok(parsed.success, "Private input manifest is invalid");
  assert.deepEqual(
    parsed.data.takes.map((take) => take.id),
    Object.keys(identities),
    "Private take selection differs",
  );
  return { manifest: parsed.data, sha256: spokenChecksum(body) };
}
