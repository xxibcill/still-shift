import { z } from "zod";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import type { CompositionPhysicalProofHold } from "@still-shift/renderer-core";
import { MechanismHashSchema } from "@still-shift/scene-contract";
import type { compileBlenderEpisode } from "./blender-episode-compile.ts";
import {
  checkBlenderEpisodePlates,
  type BlenderEpisodePlates,
} from "./blender-episode-plates.ts";
import type { BlenderProductionIdentity } from "./blender-production-identity.ts";
import {
  readProductionJSON,
  productionOwnedPath,
} from "./production-queue-files.ts";
import { mechanismPackHash } from "./pack-support.ts";

type Compiled = ReturnType<typeof compileBlenderEpisode>;
const matrix = z.array(z.number().finite()).length(16);
const observedPhysicalState = z.object({
  sourceAssetSha256: MechanismHashSchema,
  camera: z.object({ worldMatrix: matrix }).passthrough(),
  actualControls: z.record(z.string(), z.number().finite()),
  highlights: z.record(z.string(), z.string()),
  parts: z
    .array(
      z
        .object({
          name: z.string(),
          visible: z.boolean(),
          worldMatrix: matrix,
          vertices: z.number().int().nonnegative(),
          triangles: z.number().int().nonnegative(),
          positionsSha256: MechanismHashSchema,
          triangleIndicesSha256: MechanismHashSchema,
        })
        .passthrough(),
    )
    .min(1)
    .max(2048),
});

/** Authenticated evaluated geometry explains a static interval; purpose alone never supplies physical evidence. */
export async function readBlenderEpisodeProofHolds(
  compiled: Compiled,
  map: BlenderEpisodePlates,
  identity: BlenderProductionIdentity,
  root: string,
  nodeMemory: CompositionNodeMemory,
  signal?: AbortSignal,
) {
  const shots = compiled.plan.shots.filter((s) => s.proofPurpose !== undefined);
  if (!shots.length)
    return { holds: [] as CompositionPhysicalProofHold[], release: () => {} };
  const owner = new CompositionNodeMemory(nodeMemory);
  try {
    const authentication = new CompositionNodeMemory(owner);
    try {
      await checkBlenderEpisodePlates(
        map,
        compiled,
        identity,
        root,
        authentication,
        signal,
      );
    } finally {
      authentication.dispose();
    }
    owner.reserve(compiled.frameCount * 2048);
    const hashes = new Map<string, string>();
    const holds: CompositionPhysicalProofHold[] = [];
    for (const shot of shots) {
      const frames: CompositionPhysicalProofHold["frames"] = [];
      for (let frame = shot.start; frame < shot.endExclusive; frame++) {
        signal?.throwIfAborted();
        const pin = map.frames[frame]!;
        let physicalSha256 = hashes.get(pin.observation.sha256);
        if (!physicalSha256) {
          const loaded = await readProductionJSON(
            await productionOwnedPath(root, pin.observation.path),
            observedPhysicalState,
            owner,
            2 * 1024 * 1024,
            signal,
          );
          try {
            if (loaded.sha256 !== pin.observation.sha256)
              throw Error(
                "Native proof observation changed after authentication",
              );
            physicalSha256 = mechanismPackHash({
              producer: identity.profileSha256,
              physical: loaded.value,
            });
            hashes.set(pin.observation.sha256, physicalSha256);
          } finally {
            loaded.release();
          }
        }
        frames.push({ frame, plateSha256: pin.image.sha256, physicalSha256 });
      }
      holds.push({
        id: shot.id,
        purpose: shot.proofPurpose!,
        layer: "native-plates-" + shot.id,
        start: shot.start,
        end: shot.endExclusive,
        sourceStartFrame: shot.start,
        evidenceSha256: mechanismPackHash({
          schemaVersion: "blender-shot-proof-1",
          shot,
          frames,
          producer: identity.profileSha256,
          sourceAsset: compiled.source.asset.sha256,
          mapSha256: mechanismPackHash(map),
        }),
        frames,
      });
    }
    return { holds, release: () => owner.dispose() };
  } catch (error) {
    owner.dispose();
    throw error;
  }
}
