import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, realpath } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import {
  NativeAppearanceCodeIdentitySchema,
  type NativeAppearanceCodeIdentity,
} from "@still-shift/scene-contract";
import {
  canonicalMechanismJson,
  passageError,
} from "@still-shift/renderer-core";
import {
  native3DAppearanceModules,
  native3DAppearanceExternalModules,
} from "../../renderer-core/src/native3d/appearance-modules.ts";

const digest = (bytes: Uint8Array): string =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

/** Resolve from the actual importing renderer, including its installed .js rewrite. */
function nativeAppearanceRuntimeContext() {
  const descriptors = native3DAppearanceModules.filter(
    ({ name }) => name === "renderer-core/src/native3d/appearance-modules.ts",
  );
  if (descriptors.length !== 1)
    passageError(
      "comp-native3d-source",
      "Native appearance closure requires exactly one renderer descriptor",
      { path: "native3d.appearanceCode.modules" },
    );
  const url = descriptors[0]!.url;
  return { url, requireRuntime: createRequire(url) };
}

/** Node's ordinary importer ancestry, excluding NODE_PATH and global libraries. */
function nativeAppearancePackageDirectories(packageName: string): string[] {
  const { url, requireRuntime } = nativeAppearanceRuntimeContext();
  const ancestors = new Set<string>();
  for (
    let directory = dirname(fileURLToPath(url));
    ;
    directory = dirname(directory)
  ) {
    if (basename(directory) !== "node_modules")
      ancestors.add(join(directory, "node_modules"));
    if (dirname(directory) === directory) break;
  }
  return (requireRuntime.resolve.paths(packageName) ?? []).filter((directory) =>
    ancestors.has(resolve(directory)),
  );
}

async function nativeAppearancePackageRoot(
  packageName: string,
  expectedVersion: string,
): Promise<string> {
  for (const directory of nativeAppearancePackageDirectories(packageName)) {
    const candidate = join(directory, packageName, "package.json");
    let bytes: Buffer;
    try {
      bytes = await readFile(candidate);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
        continue;
      throw error;
    }
    const metadata = JSON.parse(bytes.toString("utf8")) as {
      name?: unknown;
      version?: unknown;
    };
    if (metadata.name !== packageName || metadata.version !== expectedVersion)
      passageError(
        "comp-native3d-source",
        "Actual native appearance dependency does not match its pinned package",
        { path: `native3d.appearanceCode.external.${packageName}` },
      );
    return realpath(dirname(candidate));
  }
  passageError(
    "comp-native3d-source",
    "Native appearance dependency is unavailable",
    { path: `native3d.appearanceCode.external.${packageName}` },
  );
}
async function nativeAppearanceExternalIdentities() {
  const roots = new Map<string, { version: string; root: string }>();
  const identities = [];
  for (const descriptor of native3DAppearanceExternalModules) {
    let pkg = roots.get(descriptor.packageName);
    if (!pkg) {
      pkg = {
        version: descriptor.expectedVersion,
        root: await nativeAppearancePackageRoot(
          descriptor.packageName,
          descriptor.expectedVersion,
        ),
      };
      roots.set(descriptor.packageName, pkg);
    }
    if (
      pkg.version !== descriptor.expectedVersion ||
      descriptor.packageRelativePath.includes("\\") ||
      descriptor.packageRelativePath
        .split("/")
        .some((part) => !part || part === "." || part === "..") ||
      isAbsolute(descriptor.packageRelativePath)
    )
      passageError(
        "comp-native3d-source",
        "Native appearance dependency locator is invalid",
        { path: descriptor.name },
      );
    const path = await realpath(
      resolve(pkg.root, descriptor.packageRelativePath),
    );
    const within = relative(pkg.root, path);
    if (
      !within ||
      within === ".." ||
      within.startsWith("../") ||
      within.startsWith("..\\") ||
      isAbsolute(within)
    )
      passageError(
        "comp-native3d-source",
        "Native appearance dependency file escapes its package",
        { path: descriptor.name },
      );
    identities.push({
      name: descriptor.name,
      sha256: digest(await readFile(path)),
    });
  }
  return identities;
}

/** Read a complete browser rendering closure using path-independent logical names. */
export async function loadNativeAppearanceCodeIdentity(): Promise<NativeAppearanceCodeIdentity> {
  const { requireRuntime } = nativeAppearanceRuntimeContext();
  const pathsByFormat = native3DAppearanceModules.map(({ url }) =>
    fileURLToPath(url),
  );
  if (pathsByFormat.some((path) => !/\.(?:ts|js|json)$/.test(path)))
    passageError(
      "comp-native3d-source",
      "Native source closure contains an unsupported module format",
      { path: "native3d.appearanceCode.modules" },
    );
  const formats = new Set(
    pathsByFormat
      .filter((path) => !path.endsWith(".json"))
      .map((path) => (path.endsWith(".ts") ? "source-ts" : "installed-js")),
  );
  if (formats.size !== 1)
    passageError(
      "comp-native3d-source",
      "Native source closure mixes executable runtime formats",
      { path: "native3d.appearanceCode.modules" },
    );
  const modules = await Promise.all(
    native3DAppearanceModules.map(async ({ name, url }) => ({
      name,
      sha256: digest(await readFile(url)),
    })),
  );
  modules.push(...(await nativeAppearanceExternalIdentities()));
  modules.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  // Validate Three in the same renderer-owned ancestry before its public entry
  // resolution, so a global/NODE_PATH package cannot establish appearance.
  await nativeAppearancePackageRoot("three", "0.186.0");
  const module = join(
    dirname(requireRuntime.resolve("three")),
    "three.module.js",
  );
  const paths = [
    module,
    join(dirname(module), "three.core.js"),
    requireRuntime.resolve("three/addons/environments/RoomEnvironment.js"),
    join(dirname(module), "../package.json"),
  ];
  const metadata = JSON.parse(await readFile(paths[3]!, "utf8")) as {
    version?: unknown;
  };
  const sources = await Promise.all(
    paths.map(async (path) => ({
      name:
        basename(path) === "RoomEnvironment.js"
          ? "three/addons/environments/RoomEnvironment.js"
          : basename(path) === "package.json"
            ? "three/package.json"
            : `three/build/${basename(path)}`,
      sha256: digest(await readFile(path)),
    })),
  );
  sources.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const parsed = NativeAppearanceCodeIdentitySchema.safeParse({
    runtimeFormat: [...formats][0],
    modules,
    threeRuntime: { version: metadata.version, sources },
  });
  if (!parsed.success)
    passageError(
      "comp-native3d-source",
      "Native appearance closure is invalid or unpinned",
      { path: "native3d.appearanceCode" },
    );
  return parsed.data;
}

export function hashNativeAppearanceCodeIdentity(
  identity: NativeAppearanceCodeIdentity,
): string {
  return digest(
    Buffer.from(
      canonicalMechanismJson(
        NativeAppearanceCodeIdentitySchema.parse(identity),
      ),
    ),
  );
}

/** Do not publish source/cache/encoded output if the prepared rendering closure changed. */
export async function assertNativeAppearanceCodeIdentity(
  expected: NativeAppearanceCodeIdentity,
): Promise<void> {
  if (
    hashNativeAppearanceCodeIdentity(expected) !==
    hashNativeAppearanceCodeIdentity(await loadNativeAppearanceCodeIdentity())
  )
    passageError(
      "comp-native3d-checksum",
      "Native appearance source changed after preparation",
      { path: "native3d.appearanceCode" },
    );
}
