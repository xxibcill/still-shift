import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CompositionMediaColorSchema,
  CompositionMediaRateSchema,
  resolveCompositionMediaLimits,
  type CompositionAsset,
  type CompositionMediaColor,
  type CompositionMediaLimits,
  type CompositionMediaRate,
} from "@still-shift/scene-contract";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { passageError } from "../../renderer-core/src/passage-diagnostics.ts";

type Rational = { numerator: number; denominator: number };
type VideoAsset = Extract<CompositionAsset, { type: "video" }>;
type VideoStream = {
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  time_base?: string;
  color_primaries?: string;
  color_transfer?: string;
  color_space?: string;
  color_range?: string;
  pix_fmt?: string;
  sample_aspect_ratio?: string;
  tags?: { rotate?: string };
  side_data_list?: {
    side_data_type?: string;
    rotation?: number;
    displaymatrix?: string;
  }[];
};

export type CompositionVideoProbe = {
  sourceHash: string;
  sourceBytes: number;
  width: number;
  height: number;
  frameRate: CompositionMediaRate;
  frameCount: number;
  durationSeconds: number;
  color: CompositionMediaColor;
  pixelFormat: string;
  codec: string;
  sampleAspectRatio: string;
  timeBase: Rational;
  firstPts: string;
  /** Original presentation ordinals are the array indices, never decode-cache indices. */
  presentationPts: string[];
  quantizationPhase: {
    lower: string;
    upperExclusive: string;
    denominator: string;
  };
  metadataBytes: number;
};

const gcd = (a: bigint, b: bigint): bigint => (b ? gcd(b, a % b) : a);
export function parseMediaRational(value: string): Rational {
  const match = /^(\d+)\/(\d+)$/.exec(value);
  if (!match || BigInt(match[1]!) === 0n || BigInt(match[2]!) === 0n)
    passageError(
      "comp-media-rate",
      "Media rate/timebase must be a positive rational",
      { path: "frameRate" },
    );
  const a = BigInt(match[1]!);
  const b = BigInt(match[2]!);
  const divisor = gcd(a, b);
  if (
    a / divisor > BigInt(Number.MAX_SAFE_INTEGER) ||
    b / divisor > BigInt(Number.MAX_SAFE_INTEGER)
  )
    passageError(
      "comp-media-rate",
      "Media rate/timebase exceeds exact integer bounds",
      { path: "frameRate" },
    );
  return { numerator: Number(a / divisor), denominator: Number(b / divisor) };
}

/** One rational CFR grid with one timestamp quantizer phase, using exact integer arithmetic. */
export function verifyConstantMediaPts(
  pts: readonly string[],
  frameRate: Rational,
  timeBase: Rational,
) {
  if (
    ![
      frameRate.numerator,
      frameRate.denominator,
      timeBase.numerator,
      timeBase.denominator,
    ].every((value) => Number.isSafeInteger(value) && value > 0)
  )
    passageError(
      "comp-media-rate",
      "Media timing rationals require positive safe integers",
      { path: "frameRate" },
    );
  if (
    !pts.length ||
    pts.length > 864_000 ||
    pts.some((value) => value.length > 64 || !/^-?\d+$/.test(value))
  )
    passageError(
      "comp-media-vfr",
      "Source needs bounded integer presentation timestamps",
      { path: "presentationPts" },
    );
  const stepNumerator =
    BigInt(frameRate.denominator) * BigInt(timeBase.denominator);
  const stepDenominator =
    BigInt(frameRate.numerator) * BigInt(timeBase.numerator);
  if (stepNumerator <= 0n || stepDenominator <= 0n)
    passageError("comp-media-rate", "Media timing rationals must be positive", {
      path: "frameRate",
    });
  const first = BigInt(pts[0]!);
  let lower = 0n;
  let upper = stepDenominator;
  let previous: bigint | undefined;
  for (const [index, timestamp] of pts.entries()) {
    const current = BigInt(timestamp);
    if (previous !== undefined && current <= previous)
      passageError(
        "comp-media-vfr",
        "Presentation timestamps must increase strictly",
        { path: `presentationPts[${index}]` },
      );
    previous = current;
    const at =
      (current - first) * stepDenominator - BigInt(index) * stepNumerator;
    lower = lower > at ? lower : at;
    upper = upper < at + stepDenominator ? upper : at + stepDenominator;
    if (lower >= upper)
      passageError(
        "comp-media-vfr",
        "Source timestamps do not form one quantized constant-rate timeline",
        { path: `presentationPts[${index}]` },
      );
  }
  return {
    lower: lower.toString(),
    upperExclusive: upper.toString(),
    denominator: stepDenominator.toString(),
  };
}

export async function compositionMediaChecksum(
  path: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path, { signal }))
    hash.update(bytes);
  signal?.throwIfAborted();
  return "sha256:" + hash.digest("hex");
}

function assertUnrotated(stream: VideoStream) {
  if (Number(stream.tags?.rotate ?? 0) % 360 !== 0)
    passageError(
      "comp-media-rotation",
      "Normalize rotated source media before authoring its identity",
      { path: "rotation" },
    );
  const identity = [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824];
  for (const data of stream.side_data_list ?? []) {
    if (data.rotation !== undefined && data.rotation % 360 !== 0)
      passageError(
        "comp-media-rotation",
        "Source display rotation is unsupported",
        { path: "rotation" },
      );
    if (data.side_data_type !== "Display Matrix") continue;
    const values = (data.displaymatrix ?? "").split("\n").flatMap((line) => {
      const tail = line.split(":")[1];
      return tail ? (tail.match(/-?\d+/g) ?? []).map(Number) : [];
    });
    if (
      values.length !== identity.length ||
      values.some((v, i) => v !== identity[i])
    )
      passageError(
        "comp-media-rotation",
        "Source display matrix is not identity; implicit autorotation is disabled",
        { path: "displaymatrix" },
      );
  }
}

async function checkedProbe(
  args: string[],
  path: string,
  signal: AbortSignal | undefined,
  maxBuffer: number,
) {
  try {
    return await runProcess("ffprobe", args, { signal, maxBuffer });
  } catch (error) {
    signal?.throwIfAborted();
    if (
      (error as NodeJS.ErrnoException).code ===
      "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
    )
      passageError(
        "comp-media-limit",
        "Probe metadata exceeds its bounded output budget",
        { path },
      );
    passageError(
      "comp-media-format",
      "Source cannot be decoded by the pinned media probe",
      { path },
    );
  }
}

/** Hash and inspect actual source timestamps and color, without reading container audio duration. */
export async function probeCompositionVideo(
  source: string,
  options: {
    expected?: VideoAsset;
    limits?: CompositionMediaLimits;
    signal?: AbortSignal | undefined;
  } = {},
): Promise<CompositionVideoProbe> {
  options.signal?.throwIfAborted();
  const path = resolve(source);
  const limits = resolveCompositionMediaLimits(options.limits);
  const file = await lstat(path).catch(() =>
    passageError("comp-media-format", "Source file is unavailable", { path }),
  );
  if (!file.isFile() || file.size === 0 || file.size > 2 ** 40)
    passageError(
      "comp-media-format",
      "Video must be a nonempty bounded regular file",
      { path },
    );
  const sourceHash = await compositionMediaChecksum(path, options.signal);
  if (options.expected && sourceHash !== options.expected.sha256)
    passageError(
      "comp-media-checksum",
      "Video bytes differ from their authored identity",
      { path },
    );
  const { stdout } = await checkedProbe(
    [
      "-v",
      "error",
      "-select_streams",
      "v",
      "-show_streams",
      "-of",
      "json",
      path,
    ],
    path,
    options.signal,
    1024 * 1024,
  );
  const streams = JSON.parse(stdout).streams as VideoStream[];
  if (streams.length !== 1)
    passageError("comp-media-format", "Use exactly one source video stream", {
      path,
    });
  const stream = streams[0]!;
  assertUnrotated(stream);
  const sampleAspectRatio = stream.sample_aspect_ratio ?? "unspecified";
  if (!["unspecified", "N/A", "0:1"].includes(sampleAspectRatio)) {
    const sar = parseMediaRational(sampleAspectRatio.replace(":", "/"));
    if (sar.numerator !== sar.denominator)
      passageError(
        "comp-media-format",
        "Normalize non-square source pixels before authoring their dimensions",
        { path },
      );
  }
  const width = stream.width;
  const height = stream.height;
  if (!width || !height || width > limits.maxWidth || height > limits.maxHeight)
    passageError(
      "comp-media-limit",
      "Source resolution exceeds configured limits",
      { path },
    );
  const rate = CompositionMediaRateSchema.safeParse(
    parseMediaRational(stream.r_frame_rate ?? ""),
  );
  if (!rate.success || rate.data.numerator / rate.data.denominator > 240)
    passageError(
      "comp-media-rate",
      "Source frame rate is outside supported rational bounds",
      { path },
    );
  const frameRate = rate.data;
  const timeBase = parseMediaRational(stream.time_base ?? "");
  const parsedColor = CompositionMediaColorSchema.safeParse({
    primaries: stream.color_primaries,
    transfer: stream.color_transfer,
    matrix: stream.color_space,
    range: stream.color_range,
  });
  if (
    !parsedColor.success ||
    (parsedColor.data.matrix === "gbr" && parsedColor.data.range !== "pc")
  )
    passageError(
      "comp-media-color",
      "Source needs supported explicit SDR color metadata",
      { path },
    );
  const color = parsedColor.data;
  const timestamps = await checkedProbe(
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_frames",
      "-show_entries",
      "frame=best_effort_timestamp",
      "-of",
      "compact=p=0:nk=0",
      path,
    ],
    path,
    options.signal,
    48 * 1024 * 1024,
  );
  const presentationPts = timestamps.stdout
    .split("\n")
    .filter((line) => line.startsWith("best_effort_timestamp="))
    .map((line) => line.slice("best_effort_timestamp=".length).split("|")[0]!);
  const quantizationPhase = verifyConstantMediaPts(
    presentationPts,
    frameRate,
    timeBase,
  );
  const frameCount = presentationPts.length;
  const durationSeconds =
    (frameCount * frameRate.denominator) / frameRate.numerator;
  if (durationSeconds > limits.maxDurationSeconds)
    passageError(
      "comp-media-limit",
      "Decoded source duration exceeds configured limits",
      { path },
    );
  if (
    options.expected &&
    (options.expected.width !== width ||
      options.expected.height !== height ||
      options.expected.frameCount !== frameCount ||
      options.expected.frameRate.numerator !== frameRate.numerator ||
      options.expected.frameRate.denominator !== frameRate.denominator ||
      (["primaries", "transfer", "matrix", "range"] as const).some(
        (field) => options.expected!.color[field] !== color[field],
      ))
  )
    passageError(
      "comp-media-provenance",
      "Probed video dimensions, rate, count or color differ from the authored descriptor",
      { path },
    );
  if ((await compositionMediaChecksum(path, options.signal)) !== sourceHash)
    passageError("comp-media-checksum", "Source changed during probing", {
      path,
    });
  return {
    sourceHash,
    sourceBytes: file.size,
    width,
    height,
    frameRate,
    frameCount,
    durationSeconds,
    color,
    pixelFormat: stream.pix_fmt ?? "unknown",
    codec: stream.codec_name ?? "unknown",
    sampleAspectRatio,
    timeBase,
    firstPts: presentationPts[0]!,
    presentationPts,
    quantizationPhase,
    metadataBytes:
      Buffer.byteLength(stdout) + Buffer.byteLength(timestamps.stdout),
  };
}
