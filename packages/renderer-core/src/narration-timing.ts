import {
  NarrationTimingSchema,
  type NarrationTiming,
  type NarrationSegment,
} from "../../scene-contract/src/narration-timing.ts";

export function parseNarrationTiming(
  text: string,
  format: "json" | "srt",
): NarrationTiming {
  if (text.length > 2_000_000)
    throw new Error("Narration timing exceeds the 2 MB import limit");
  const clean = text.replace(/^\uFEFF/, "");
  if (format === "srt")
    return NarrationTimingSchema.parse({
      schemaVersion: "narration-timing-1",
      granularity: "subtitle",
      segments: parseSubtitles(clean),
    });
  const input = JSON.parse(clean);
  if (input?.schemaVersion === "narration-timing-1")
    return NarrationTimingSchema.parse(input);
  const words: unknown = Array.isArray(input)
    ? input
    : (input?.words ??
      (Array.isArray(input?.segments)
        ? input.segments.flatMap(
            (
              segment: {
                words?: {
                  word?: string;
                  text?: string;
                  start?: number;
                  end?: number;
                }[];
              } | null,
              segmentIndex: number,
            ) =>
              (segment?.words ?? []).map((word, wordIndex) => ({
                ...word,
                segmentIndex,
                wordIndex,
              })),
          )
        : undefined));
  if (!Array.isArray(words))
    throw new Error(
      "Use word timing JSON with words containing word/text, start and end in seconds, or an SRT file",
    );
  return NarrationTimingSchema.parse({
    schemaVersion: "narration-timing-1",
    granularity: "word",
    segments: words.map((word) => ({
      text: word?.word ?? word?.text,
      start: word?.start,
      end: word?.end,
      ...(word?.segmentIndex !== undefined
        ? { segmentIndex: word.segmentIndex, wordIndex: word.wordIndex }
        : {}),
    })),
  });
}

function parseSubtitles(text: string): NarrationSegment[] {
  const timestamp = "(\\d{2,}):([0-5]\\d):([0-5]\\d)[,.](\\d{3})";
  const timeLine = new RegExp(`^${timestamp}\\s+-->\\s+${timestamp}$`);
  return text
    .trim()
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((block, index) => {
      const lines = block.trim().split("\n");
      if (/^\d+$/.test(lines[0] ?? "")) lines.shift();
      const match = timeLine.exec(lines.shift() ?? "");
      if (!match)
        throw new Error(`Invalid SRT timestamp in subtitle ${index + 1}`);
      const seconds = (at: number) =>
        Number(match[at]) * 3600 +
        Number(match[at + 1]) * 60 +
        Number(match[at + 2]) +
        Number(match[at + 3]) / 1000;
      return {
        text: lines
          .join(" ")
          .replace(/<[^>]*>/g, "")
          .trim(),
        start: seconds(1),
        end: seconds(5),
      };
    });
}

export function narrationTimingEntries(
  timing: NarrationTiming,
): NarrationSegment[] {
  if (timing.granularity === "subtitle") return timing.segments;
  const entries: NarrationSegment[] = [];
  let group: NarrationSegment[] = [];
  const flush = () => {
    if (!group.length) return;
    entries.push({
      text: group.map((word) => word.text.trim()).join(" "),
      start: group[0]!.start,
      end: Math.max(...group.map((word) => word.end)),
    });
    group = [];
  };
  for (const word of timing.segments) {
    if (group.length && word.start - group.at(-1)!.end > 0.6) flush();
    group.push(word);
    if (/[.!?。！？]["”’']?$/.test(word.text.trim()) || group.length >= 14)
      flush();
  }
  flush();
  return entries;
}

const tokens = (text: string) =>
  text
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[’‘]/g, "'")
    .match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? [];

export function findNarrationPhrase(
  timing: NarrationTiming,
  phrase: string,
): NarrationSegment[] {
  const wanted = tokens(phrase);
  if (!wanted.length) throw new Error("Cue phrase must contain words");
  if (timing.granularity === "subtitle")
    return timing.segments.filter(
      (s) => tokens(s.text).join(" ") === wanted.join(" "),
    );
  const words = timing.segments.flatMap((segment) =>
    tokens(segment.text).map((text) => ({ ...segment, text })),
  );
  return words.flatMap((word, index) =>
    wanted.every((text, offset) => words[index + offset]?.text === text)
      ? [
          {
            text: phrase,
            start: word.start,
            end: words[index + wanted.length - 1]!.end,
          },
        ]
      : [],
  );
}
