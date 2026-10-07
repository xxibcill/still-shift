import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, open, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { CompositionSequenceManifestSchema } from "@still-shift/scene-contract";
import { runProcess } from "./subprocess.ts";
import type { CompositionOutputProfile } from "./composition-output.ts";
import type { StagedArtifact } from "./artifact-publication.ts";

export type CompositionOutputClock = {
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  durationMs: number;
};

async function checksum(path: string, signal?: AbortSignal) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path, { signal }))
    hash.update(bytes);
  return `sha256:${hash.digest("hex")}`;
}

const numbered = (pattern: string, frame: number) =>
  pattern.replace("%06d", String(frame).padStart(6, "0"));

/** Inspect output color authority without retaining compressed image payloads. */
async function verifyPng(
  path: string,
  profile: CompositionOutputProfile,
  clock: CompositionOutputClock,
) {
  const file = await open(path, "r");
  try {
    const size = (await file.stat()).size;
    const signature = Buffer.alloc(8);
    if (
      (await file.read(signature, 0, 8, 0)).bytesRead !== 8 ||
      !signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw Error("Output PNG signature is invalid");
    let offset = 8,
      header = false,
      cicp = false,
      ended = false;
    while (offset + 12 <= size) {
      const chunk = Buffer.alloc(8);
      if ((await file.read(chunk, 0, 8, offset)).bytesRead !== 8)
        throw Error("Output PNG chunk is incomplete");
      const count = chunk.readUInt32BE(0),
        type = chunk.toString("ascii", 4);
      if (offset + count + 12 > size)
        throw Error("Output PNG chunk exceeds its file");
      if (type === "IHDR" || type === "cICP") {
        if (count !== (type === "IHDR" ? 13 : 4))
          throw Error("Output PNG metadata has the wrong byte count");
        const data = Buffer.alloc(count);
        if ((await file.read(data, 0, count, offset + 8)).bytesRead !== count)
          throw Error("Output PNG metadata is incomplete");
        if (type === "IHDR") {
          if (
            header ||
            offset !== 8 ||
            data.readUInt32BE(0) !== clock.width ||
            data.readUInt32BE(4) !== clock.height ||
            data[8] !== profile.bitDepth ||
            data[9] !== 6
          )
            throw Error(
              "Output PNG dimensions, bit depth or RGBA layout differ",
            );
          header = true;
        } else {
          if (cicp || !data.equals(Buffer.from([1, 1, 0, 1])))
            throw Error("Output PNG must carry full-range BT.709 RGB cICP");
          cicp = true;
        }
      }
      if (type === "sRGB" || type === "iCCP")
        throw Error("Output PNG contains conflicting RGB transfer metadata");
      offset += count + 12;
      if (type === "IEND") {
        ended = count === 0 && offset === size;
        break;
      }
    }
    if (!header || !cicp || !ended)
      throw Error(
        "Output PNG is missing its header, color authority or complete end",
      );
  } finally {
    await file.close();
  }
}

/** A sequence's hash manifest is its final completion marker; foreign files are never replaced. */
export async function prepareCompositionOutputArtifacts(
  profile: CompositionOutputProfile,
  outputPath: string,
  clock: CompositionOutputClock,
  audio?: { path: string; sha256: string },
  signal?: AbortSignal,
) {
  const destination = resolve(outputPath);
  const sequence = profile.container === "image2";
  if (
    sequence &&
    (!/^[^%]*%06d\.png$/.test(basename(destination)) ||
      dirname(destination).includes("%"))
  )
    throw Error("PNG sequence output requires one %06d.png filename pattern");
  const manifestPath = sequence ? `${destination}.sequence.json` : destination;
  const audioDestination =
    sequence && audio ? `${destination}.audio.wav` : undefined;
  const stageDirectory = join(
    dirname(destination),
    `.${basename(destination).replace("%06d", "frames")}.${randomUUID()}.stage`,
  );
  const temporaryPath = join(
    stageDirectory,
    sequence ? "frame.%06d.png" : `output.${profile.container}`,
  );
  const stagedManifest = join(stageDirectory, "sequence.json");
  const stagedAudio = join(stageDirectory, "audio.wav");
  const destinationFrames = sequence
    ? Array.from({ length: clock.frameCount }, (_, frame) =>
        numbered(destination, frame),
      )
    : [];
  for (const path of [
    manifestPath,
    ...destinationFrames,
    ...(audioDestination ? [audioDestination] : []),
  ]) {
    signal?.throwIfAborted();
    try {
      await stat(path);
      throw Error(`Output already exists: ${path}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  await mkdir(stageDirectory, { recursive: true });
  let summary:
    | {
        outputBytes: number;
        outputChecksum: string;
        sequence?: {
          pattern: string;
          manifestPath: string;
          firstFrame: 0;
          frames: string[];
          audioPath?: string;
          audioChecksum?: string;
        };
      }
    | undefined;
  return {
    temporaryPath,
    manifestPath,
    async verify() {
      signal?.throwIfAborted();
      if (sequence)
        for (let frame = 0; frame < clock.frameCount; frame++) {
          signal?.throwIfAborted();
          await verifyPng(numbered(temporaryPath, frame), profile, clock);
        }
      const probe = await runProcess(
        "ffprobe",
        [
          "-v",
          "error",
          ...(sequence
            ? ["-framerate", String(clock.fps), "-start_number", "0"]
            : []),
          "-count_frames",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=codec_name,width,height,r_frame_rate,nb_frames,nb_read_frames,pix_fmt,bits_per_raw_sample,duration,color_range,color_space,color_transfer,color_primaries:stream_tags=alpha_mode:format=duration",
          "-of",
          "json",
          temporaryPath,
        ],
        { signal, maxBuffer: 65536 },
      );
      const parsed = JSON.parse(probe.stdout) as {
        streams?: {
          codec_name?: string;
          width?: number;
          height?: number;
          r_frame_rate?: string;
          nb_read_frames?: string;
          pix_fmt?: string;
          bits_per_raw_sample?: string;
          duration?: string;
          color_range?: string;
          color_space?: string;
          color_transfer?: string;
          color_primaries?: string;
          tags?: { alpha_mode?: string };
        }[];
        format?: { duration?: string };
      };
      const stream = parsed.streams?.[0];
      const expectedCodec = {
        prores_ks: "prores",
        libx264: "h264",
        libx265: "hevc",
        "libvpx-vp9": "vp9",
        png: "png",
      }[profile.codec];
      const pixelFormat =
        profile.format === "prores4444"
          ? "yuva444p12le"
          : profile.format === "vp9alpha"
            ? "yuv420p"
            : profile.pixelFormat;
      const duration = Number(stream?.duration ?? parsed.format?.duration);
      const prores = profile.codec === "prores_ks";
      if (
        parsed.streams?.length !== 1 ||
        stream?.codec_name !== expectedCodec ||
        stream.width !== clock.width ||
        stream.height !== clock.height ||
        stream.r_frame_rate !== `${clock.fps}/1` ||
        Number(stream.nb_read_frames) !== clock.frameCount ||
        stream.pix_fmt !== pixelFormat ||
        (profile.format === "prores4444" &&
          stream.bits_per_raw_sample !== "12") ||
        stream.color_space !== (profile.matrix === "rgb" ? "gbr" : "bt709") ||
        stream.color_transfer !== "bt709" ||
        stream.color_primaries !== "bt709" ||
        (stream.color_range !== profile.range &&
          !(prores && stream.color_range === undefined)) ||
        (profile.format === "vp9alpha" && stream.tags?.alpha_mode !== "1") ||
        (!sequence &&
          (!Number.isFinite(duration) ||
            Math.abs(duration * 1000 - clock.durationMs) > 1000 / clock.fps))
      )
        throw Error(
          `FFprobe composition output validation failed: ${JSON.stringify({ profile: profile.format, stream, duration })}`,
        );
      await runProcess(
        "ffmpeg",
        [
          "-v",
          "error",
          "-threads",
          "1",
          "-err_detect",
          "explode+crccheck",
          ...(profile.format === "vp9alpha" ? ["-c:v", "libvpx-vp9"] : []),
          ...(sequence
            ? ["-framerate", String(clock.fps), "-start_number", "0"]
            : []),
          "-i",
          temporaryPath,
          "-threads",
          "1",
          "-f",
          "null",
          "-",
        ],
        { signal },
      );
    },
    async summarize() {
      if (!sequence)
        return {
          outputBytes: (await stat(temporaryPath)).size,
          outputChecksum: await checksum(temporaryPath, signal),
        };
      const frames: string[] = [];
      let outputBytes = 0;
      for (let frame = 0; frame < clock.frameCount; frame++) {
        const path = numbered(temporaryPath, frame);
        outputBytes += (await stat(path)).size;
        frames.push(await checksum(path, signal));
      }
      const bytes = `${JSON.stringify(CompositionSequenceManifestSchema.parse({ schemaVersion: "composition-sequence-1", frames }), null, 2)}\n`;
      await writeFile(stagedManifest, bytes, { flag: "wx", signal });
      let audioChecksum: string | undefined;
      if (audio) {
        await copyFile(audio.path, stagedAudio);
        audioChecksum = await checksum(stagedAudio, signal);
        if (
          audioChecksum !== audio.sha256 ||
          audioChecksum !== (await checksum(audio.path, signal))
        )
          throw Error("Sequence PCM changed during staging");
        outputBytes += (await stat(stagedAudio)).size;
      }
      outputBytes += Buffer.byteLength(bytes);
      summary = {
        outputBytes,
        outputChecksum: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        sequence: {
          pattern: destination,
          manifestPath,
          firstFrame: 0,
          frames,
          ...(audioDestination && audioChecksum
            ? { audioPath: audioDestination, audioChecksum }
            : {}),
        },
      };
      return summary!;
    },
    publications(metadata: StagedArtifact[]): StagedArtifact[] {
      if (!sequence)
        return [...metadata, { staged: temporaryPath, destination }];
      if (!summary)
        throw Error(
          "Sequence artifacts must be verified and summarized before publication",
        );
      return [
        ...destinationFrames.map((destination, frame) => ({
          staged: numbered(temporaryPath, frame),
          destination,
        })),
        ...(audioDestination
          ? [{ staged: stagedAudio, destination: audioDestination }]
          : []),
        ...metadata,
        { staged: stagedManifest, destination: manifestPath },
      ];
    },
    dispose() {
      return rm(stageDirectory, { recursive: true, force: true });
    },
  };
}
