import { fileURLToPath } from "node:url";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { cuePlateFile } from "./cue-plate-files.ts";
import { loadMechanismProductionNativeIdentity } from "./production-native-identity.ts";
import { mechanismPackHash, freezeMechanismPack } from "./pack-support.ts";

export async function loadBlenderProductionIdentity(blenderExecutable: string) {
  const owner = new CompositionNodeMemory();
  try {
    const receiver = await loadMechanismProductionNativeIdentity();
    const executable = await cuePlateFile(blenderExecutable, owner, {
      maximumBytes: 512 * 1024 * 1024,
    });
    const worker = await cuePlateFile(
      fileURLToPath(new URL("../blender-capture-worker.py", import.meta.url)),
      owner,
      { maximumBytes: 1024 * 1024 },
    );
    const version = await runProcess(blenderExecutable, ["--version"], {
      maxBuffer: 65536,
      signal: AbortSignal.timeout(10000),
    });
    if (!version.stdout.startsWith("Blender "))
      throw Error(
        "Native producer executable must identify its Blender version",
      );
    const profile = {
      backend: "blender-native" as const,
      blenderExecutableSha256: executable.sha256,
      blenderVersion: version.stdout.trim(),
      workerSha256: worker.sha256,
      receiverProfileSha256: receiver.profileSha256,
    };
    return freezeMechanismPack({
      codeSha256: receiver.codeSha256,
      profileSha256: mechanismPackHash(profile),
      profile,
    });
  } finally {
    owner.dispose();
  }
}
export type BlenderProductionIdentity = Awaited<
  ReturnType<typeof loadBlenderProductionIdentity>
>;
