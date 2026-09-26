import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

import { z } from "zod";

const execFileAsync = promisify(execFile);
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const AssemblyEvidenceSchema = z.object({
  schemaVersion: z.literal("0.1"),
  outputPath: z.string().min(1),
  outputSha256: sha256,
  timelinePath: z.string().min(1),
  narrationPath: z.string().min(1),
  corpusId: z.string().min(1),
  corpusSha256: sha256,
  corpusStatus: z.enum(["incomplete", "frozen"]),
  sourceStateCount: z.number().int().positive(),
  videoFrameCount: z.number().int().positive(),
  durationSeconds: z.number().positive(),
  clipSelections: z.array(
    z.object({
      stateId: z.string().min(1),
      clipIds: z.array(z.string().min(1)).length(3),
    }),
  ),
  clipOutputChecksums: z.record(z.string(), sha256),
});

export type AssemblyEvidence = z.infer<typeof AssemblyEvidenceSchema>;

export const fileSha256 = async (path: string): Promise<string> => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return `sha256:${hash.digest("hex")}`;
};

export const verifyAssemblyEvidence = async (
  assembly: AssemblyEvidence,
  corpus: { id: string; sha256: string; status: string },
  resultChecksums: ReadonlyMap<string, string>,
): Promise<void> => {
  if (
    assembly.corpusId !== corpus.id ||
    assembly.corpusSha256 !== corpus.sha256 ||
    assembly.corpusStatus !== corpus.status
  )
    throw new Error("Assembly belongs to a different corpus revision");
  if (
    assembly.clipSelections.length !== assembly.sourceStateCount ||
    Math.abs(assembly.durationSeconds - assembly.videoFrameCount / 24) > 1 / 24
  )
    throw new Error("Assembly metadata does not match its timeline duration");

  const selectedIds = assembly.clipSelections.flatMap(
    (selection) => selection.clipIds,
  );
  const uniqueIds = new Set(selectedIds);
  if (
    uniqueIds.size !== Object.keys(assembly.clipOutputChecksums).length ||
    selectedIds.length === 0
  )
    throw new Error("Assembly clip identity is incomplete");
  for (const id of uniqueIds) {
    if (
      !resultChecksums.has(id) ||
      assembly.clipOutputChecksums[id] !== resultChecksums.get(id)
    )
      throw new Error(`Assembly clip does not match evaluation results: ${id}`);
  }

  if (!isAbsolute(assembly.outputPath) || !assembly.outputPath.endsWith(".mp4"))
    throw new Error("Assembly output path must be an absolute MP4 path");
  if ((await fileSha256(assembly.outputPath)) !== assembly.outputSha256)
    throw new Error("Assembly output checksum mismatch");

  const probe = JSON.parse(
    (
      await execFileAsync("ffprobe", [
        "-v",
        "error",
        "-count_frames",
        "-show_entries",
        "stream=codec_type,nb_read_frames,width,height,r_frame_rate",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        assembly.outputPath,
      ])
    ).stdout,
  ) as {
    streams: Array<{
      codec_type: string;
      nb_read_frames?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
    }>;
    format: { duration: string };
  };
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  if (
    Number(video?.nb_read_frames) !== assembly.videoFrameCount ||
    video?.width !== 1280 ||
    video?.height !== 720 ||
    video?.r_frame_rate !== "24/1" ||
    !probe.streams.some((stream) => stream.codec_type === "audio") ||
    Math.abs(Number(probe.format.duration) - assembly.durationSeconds) > 1 / 24
  )
    throw new Error("Assembly MP4 does not match its measured metadata");
};
