import { createHash } from "node:crypto";

import {
  ENGINE_VERSION,
  type AnimationRequest,
} from "@still-shift/scene-contract";

export const hashBatchRequest = (
  request: AnimationRequest,
  frameTransport: "png_pipe" | "jpeg_pipe",
  depthAdapter: string,
): string =>
  `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        engineVersion: ENGINE_VERSION,
        ...(frameTransport === "png_pipe" ? {} : { frameTransport }),
        depthAdapter,
        request,
      }),
    )
    .digest("hex")}`;

type ArtifactIdentityRecord = {
  id: string;
  requestHash: string | null;
  status: string;
  result?:
    | {
        checksums: { source: string; scene: string; output: string };
      }
    | undefined;
};

export const hashBatchArtifacts = (
  records: ArtifactIdentityRecord[],
): string => {
  const identity = records.map((record) => ({
    id: record.id,
    requestHash: record.requestHash,
    status: record.status,
    checksums: record.result?.checksums ?? null,
  }));
  return `sha256:${createHash("sha256").update(JSON.stringify(identity)).digest("hex")}`;
};

type BatchRunIdentity = {
  manifestSha256?: string;
  artifactSetSha256?: string;
  itemCount: number;
  successful: number;
  reused: number;
};

export const selectBenchmarkRun = <T extends BatchRunIdentity>(
  summary: T,
  history: T[],
): T | null =>
  history.find(
    (run) =>
      Boolean(summary.manifestSha256 && summary.artifactSetSha256) &&
      run.manifestSha256 === summary.manifestSha256 &&
      run.artifactSetSha256 === summary.artifactSetSha256 &&
      run.itemCount === summary.itemCount &&
      run.successful === run.itemCount &&
      run.reused === 0,
  ) ?? (summary.reused === 0 ? summary : null);
