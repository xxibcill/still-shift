import { readdir, access } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CompositionNodeMemory } from "@still-shift/execution-runtime/export";
import { runProcess } from "@still-shift/execution-runtime/subprocess";
import { cuePlateFile } from "./cue-plate-files.ts";
import { mechanismPackHash, freezeMechanismPack } from "./pack-support.ts";
import {
  loadNativeAppearanceCodeIdentity,
  hashNativeAppearanceCodeIdentity,
} from "../native3d-appearance-identity.ts";
import { productionFailure } from "./production-queue-files.ts";

export interface MechanismProductionNativeIdentity {
  codeSha256: string;
  profileSha256: string;
  runtimeFormat: "source-ts" | "installed-js";
  runtimeFiles: number;
  nativeAppearanceCodeSha256: string;
  profile: {
    backend: "webgl2";
    transport: "raw_rgba";
    workers: 1;
    nodeVersion: string;
    ffmpegVersion: string;
    toolchainSha256: string;
  };
}
/** Conservative package runtime identity, including compiler/queue/QA and actual appearance dependencies. */
export async function loadMechanismProductionNativeIdentity(): Promise<MechanismProductionNativeIdentity> {
  const packages = fileURLToPath(new URL("../../../", import.meta.url)),
    root = dirname(packages);
  const owner = new CompositionNodeMemory(),
    rows: { name: string; bytes: number; sha256: string }[] = [];
  const storage = owner.reserve(8 * 1024 * 1024);
  try {
    const walk = async (directory: string) => {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(path);
          continue;
        }
        if (
          !entry.isFile() ||
          /\.d\.ts$/.test(entry.name) ||
          !/\.(ts|js|mjs|mts|json|css|html|py)$/.test(entry.name)
        )
          continue;
        if (rows.length >= 4096)
          productionFailure(
            "production-code-budget",
            "Runtime identity exceeds4096 files",
            directory,
          );
        const file = await cuePlateFile(path, owner, {
          maximumBytes: 32 * 1024 * 1024,
        });
        rows.push({
          name: relative(packages, path).split("\\").join("/"),
          bytes: file.bytes,
          sha256: file.sha256,
        });
      }
    };
    for (const pkg of [
      "animation-engine",
      "execution-runtime",
      "renderer-core",
      "scene-contract",
      "motion-builder",
    ])
      await walk(join(packages, pkg, "src"));
    rows.sort((a, b) => a.name.localeCompare(b.name, "en"));
    const retained = async (name: string) => {
      const direct = join(root, name),
        installed = join(root, "source", name);
      let path = direct;
      try {
        await access(path);
      } catch {
        path = installed;
      }
      return cuePlateFile(path, owner, { maximumBytes: 1024 * 1024 });
    };
    const lock = await retained("pnpm-lock.yaml"),
      toolchain = await retained("toolchain.json");
    const appearance = hashNativeAppearanceCodeIdentity(
      await loadNativeAppearanceCodeIdentity(),
    );
    const ffmpeg = await runProcess("ffmpeg", ["-version"], {
      signal: AbortSignal.timeout(10000),
      maxBuffer: 16384,
    });
    const profile = {
      backend: "webgl2" as const,
      transport: "raw_rgba" as const,
      workers: 1 as const,
      nodeVersion: process.versions.node,
      ffmpegVersion: ffmpeg.stdout.split("\n")[0]!,
      toolchainSha256: toolchain.sha256,
    };
    return freezeMechanismPack({
      codeSha256: mechanismPackHash({
        version: "mechanism-production-code-1",
        rows,
        dependencyLock: lock.sha256,
        nativeAppearanceCodeSha256: appearance,
      }),
      profileSha256: mechanismPackHash(profile),
      runtimeFiles: rows.length,
      runtimeFormat: import.meta.url.endsWith(".ts")
        ? "source-ts"
        : "installed-js",
      nativeAppearanceCodeSha256: appearance,
      profile,
    });
  } finally {
    storage.release();
    owner.dispose();
  }
}
