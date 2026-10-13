import { createReadStream } from "node:fs";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { MechanismSidecarSchema } from "@still-shift/scene-contract";
import {
  readMechanismEpisode,
  patchMechanismEpisode,
} from "../../../packages/animation-engine/src/mechanism/io.ts";
import {
  checkMechanismEpisode,
  renderMechanismEpisode,
  type PreparedMechanismEpisode,
} from "../../../packages/animation-engine/src/mechanism/lifecycle.ts";
import { planOverlayOverlapRecovery } from "./overlay-overlap-policy.ts";

type RecoveryOptions = {
  preparedDirectory: string;
  finalOutput: string;
  outputDirectory: string;
  cacheDirectory: string;
  signal?: AbortSignal;
};
async function filePin(path: string) {
  const info = await stat(path);
  if (!info.isFile()) throw Error("Recovery pins require regular files");
  const digest = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path, {
    highWaterMark: 64 * 1024,
  })) {
    digest.update(chunk);
    bytes += chunk.length;
  }
  if (bytes !== info.size)
    throw Error("Recovery file size changed while hashing");
  return { path, bytes, sha256: "sha256:" + digest.digest("hex") };
}

async function save(path: string, value: unknown) {
  const bytes = JSON.stringify(value, null, 2) + "\n";
  if (Buffer.byteLength(bytes) > 32 * 1024 * 1024)
    throw Error("Recovery evidence exceeds32MiB");
  await writeFile(path, bytes, { flag: "wx" });
}
async function platePins(prepared: PreparedMechanismEpisode) {
  const pins = [];
  for (const capture of prepared.captures) {
    const sidecar = await filePin(
      resolve(prepared.outputDirectory, capture.sidecarPath),
    );
    if (sidecar.sha256 !== capture.sidecarSha256)
      throw Error("Recovery sidecar changed");
    for (const [frame, plate] of capture.frames.entries()) {
      const pin = await filePin(
        resolve(prepared.outputDirectory, capture.outputDirectory, plate.path),
      );
      if (pin.sha256 !== plate.sha256)
        throw Error("Recovery clean plate changed");
      pins.push({
        shot: capture.shotId,
        frame,
        bytes: pin.bytes,
        sha256: pin.sha256,
        sidecarSha256: sidecar.sha256,
      });
    }
  }
  return pins;
}

/** Reuse the bridge lifecycle; one position patch and one export, with retained bad evidence. */
export async function recoverEpisodeOverlap(
  input: string,
  options: RecoveryOptions,
) {
  const root = resolve(options.outputDirectory);
  await mkdir(root, { recursive: false });
  const statusPath = join(root, "recovery-state.json");
  let stage = "checking-current-bad-output",
    badCheckRecorded = false;
  const checkpoint = async (status: string, detail: unknown) =>
    writeFile(
      statusPath,
      JSON.stringify(
        {
          schemaVersion: "mechanism-overlap-recovery-state-1",
          status,
          stage,
          input: resolve(input),
          detail,
        },
        null,
        2,
      ) + "\n",
    );
  try {
    options.signal?.throwIfAborted();
    const loaded = await readMechanismEpisode(input);
    if (loaded.episode.route === "native3d")
      throw Error("Overlap recovery supports the bridge route only");
    const source = await filePin(resolve(input));
    const badOutput = await filePin(resolve(options.finalOutput));
    const dependencies = await Promise.all(
      Object.values(loaded.dependencyPaths).map(filePin),
    );
    await writeFile(join(root, "episode-before.json"), await readFile(input), {
      flag: "wx",
    });
    await checkpoint("running", {
      source,
      revision: loaded.episode.revision,
      projectHash: loaded.projectHash,
    });
    const bad = await checkMechanismEpisode(input, {
      preparedDirectory: options.preparedDirectory,
      finalOutput: options.finalOutput,
      route: "bridge",
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (bad.projectHash !== loaded.projectHash)
      throw Error("Recovery source changed during detection");
    await save(join(root, "bad-check.json"), bad);
    badCheckRecorded = true;
    const prepared = JSON.parse(
      await readFile(
        join(options.preparedDirectory, "prepared.receipt.json"),
        "utf8",
      ),
    ) as PreparedMechanismEpisode;
    if (
      prepared.schemaVersion !== "mechanism-prepared-episode-1" ||
      prepared.projectHash !== loaded.projectHash
    )
      throw Error("Recovery requires current bridge preparation");
    const captures = await Promise.all(
      prepared.captures.map(async (c) => ({
        shotId: c.shotId,
        sidecar: MechanismSidecarSchema.parse(
          JSON.parse(
            await readFile(
              resolve(options.preparedDirectory, c.sidecarPath),
              "utf8",
            ),
          ),
        ),
      })),
    );
    const bounds =
      bad.qualityReport && "textBounds" in bad.qualityReport
        ? bad.qualityReport.textBounds
        : undefined;
    const plan = planOverlayOverlapRecovery(
      loaded.episode,
      captures,
      bounds ? { textBounds: bounds } : {},
    );
    const beforePlates = await platePins(prepared);
    await save(join(root, "plan.json"), plan);
    await save(join(root, "original-plates.json"), beforePlates);
    const request = {
      schemaVersion: "mechanism-patch-1",
      baseRevision: loaded.episode.revision,
      baseHash: loaded.projectHash,
      operations: [
        { ...plan.target, property: "position" as const, value: plan.position },
      ],
    };
    await save(join(root, "patch-request.json"), request);
    options.signal?.throwIfAborted();
    stage = "patching-one-label";
    const patch = await patchMechanismEpisode(input, request);
    await save(join(root, "patch-result.json"), patch);
    const expected = structuredClone(loaded.episode);
    expected.revision++;
    expected.shots
      .find((s) => s.id === plan.target.shot)!
      .labels.find((l) => l.id === plan.target.label)!.position = plan.position;
    if (
      JSON.stringify((await readMechanismEpisode(input)).episode) !==
      JSON.stringify(expected)
    )
      throw Error("Recovery changed fields outside its scoped position patch");
    stage = "exporting-one-revision";
    await checkpoint("running", { patch, planPath: join(root, "plan.json") });
    const rendered = await renderMechanismEpisode(input, {
      outputDirectory: join(root, "fixed"),
      cacheDirectory: options.cacheDirectory,
      route: "bridge",
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (rendered.schemaVersion !== "mechanism-render-result-1")
      throw Error("Recovery route changed");
    if (
      rendered.new3dRenders !== 0 ||
      rendered.cacheHits !== loaded.episode.output.frameCount
    )
      throw Error(
        "Recovery must reuse every current clean plate with zero new3D",
      );
    if (
      JSON.stringify(await platePins(rendered.prepared)) !==
      JSON.stringify(beforePlates)
    )
      throw Error("Recovery changed original clean plates or sidecars");
    for (const pin of dependencies) {
      const actual = await filePin(pin.path);
      if (JSON.stringify(actual) !== JSON.stringify(pin))
        throw Error("Recovery dependency changed");
    }
    if (
      JSON.stringify(await filePin(badOutput.path)) !==
      JSON.stringify(badOutput)
    )
      throw Error("Recovery changed the retained bad output");
    stage = "rechecking-final-file";
    const checked = await checkMechanismEpisode(input, {
      preparedDirectory: rendered.prepared.outputDirectory,
      finalOutput: rendered.outputPath,
      route: "bridge",
      ...(options.signal ? { signal: options.signal } : {}),
    });
    const after = checked.overlayReport;
    if (!after) throw Error("Recovery final overlay report is absent");
    const sameTarget = (f: { shot?: string; label?: string }) =>
      f.shot === plan.target.shot && f.label === plan.target.label;
    if (after.findings.some(sameTarget))
      throw Error("Recovery target still fails final checks");
    if (
      JSON.stringify(after.findings.filter((f) => !sameTarget(f))) !==
      JSON.stringify(plan.before.findings.filter((f) => !sameTarget(f)))
    )
      throw Error("Recovery changed neighbor findings");
    await save(join(root, "final-check.json"), checked);
    const result = {
      schemaVersion: "mechanism-overlap-recovery-result-1",
      status: "passed",
      sourceBefore: source,
      retainedBadOutput: badOutput,
      projectHash: checked.projectHash,
      revision: expected.revision,
      affectedShots: patch.affectedShots,
      position: plan.position,
      candidatesTested: plan.trials.length,
      patches: 1,
      renders: 1,
      cleanPlates: beforePlates.length,
      new3dRenders: rendered.new3dRenders,
      cacheHits: rendered.cacheHits,
      neighborsUnchanged: true,
      recovered: true,
      finalCheckValid: checked.valid,
      remainingFindings: checked.findings.length,
      outputPath: rendered.outputPath,
      evidenceDirectory: root,
      qualification:
        "Scoped bridge overlap recovery with current measured glyphs, exact-CAS patch, whole final-file recheck and unchanged clean plates. Other mechanical/visual/continuous/listening findings remain; no whole/pilot acceptance.",
    };
    await save(join(root, "recovery-result.json"), result);
    await checkpoint("passed", result);
    return result;
  } catch (error) {
    await checkpoint(options.signal?.aborted ? "cancelled" : "failed", {
      diagnostic: String(error),
      badCheckPath: badCheckRecorded ? join(root, "bad-check.json") : null,
    });
    throw error;
  }
}
