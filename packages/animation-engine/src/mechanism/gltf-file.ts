import { open, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { decodeRigidGltf } from "./gltf-import.ts";
import {
  gltfFail,
  readGltfContainer,
  RIGID_GLTF_LIMITS,
} from "./gltf-document.ts";
import { externalGltfUris, localGltfUri } from "./gltf-resources.ts";
import { readGltfHierarchy } from "./gltf-hierarchy.ts";
import { preflightGltfMeshes } from "./gltf-meshes.ts";
import { readGltfMaterials } from "./gltf-materials.ts";

function assertContained(
  root: string,
  path: string,
  location: (string | number)[],
) {
  const displacement = relative(root, path);
  if (
    isAbsolute(displacement) ||
    displacement === ".." ||
    displacement.startsWith("../") ||
    displacement.startsWith("..\\")
  )
    gltfFail(
      "dependency",
      "Dependency escapes the declared local root",
      location,
    );
}
async function canonicalFile(
  path: string,
  root: string,
  location: (string | number)[],
) {
  let canonical: string;
  try {
    canonical = await realpath(path);
  } catch {
    gltfFail("dependency", "Local file is missing or inaccessible", location);
  }
  assertContained(root, canonical, location);
  return canonical;
}
async function fileBytes(
  path: string,
  limit: number,
  location: (string | number)[],
) {
  let handle;
  try {
    handle = await open(
      path,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0),
    );
  } catch {
    gltfFail("dependency", "Cannot open regular local file", location);
  }
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > limit)
      gltfFail(
        "budget",
        "Regular-file byte budget exceeded before allocation",
        location,
      );
    const bytes = new Uint8Array(info.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (!read.bytesRead) break;
      offset += read.bytesRead;
    }
    const after = await handle.stat();
    if (
      offset !== info.size ||
      after.size !== info.size ||
      after.mtimeMs !== info.mtimeMs ||
      after.ctimeMs !== info.ctimeMs
    )
      gltfFail(
        "dependency",
        "Local resource changed during its bounded read",
        location,
      );
    return bytes.subarray(0, info.size);
  } finally {
    await handle.close();
  }
}
export interface ImportRigidGltfOptions {
  dependencyRoot?: string;
  scene?: number;
}
/** Read a glTF/GLB and explicit relative dependencies from a canonical local root. */
export async function importRigidGltf(
  path: string,
  options: ImportRigidGltfOptions = {},
) {
  const requested = resolve(path),
    extension = extname(requested).toLowerCase();
  if (extension !== ".gltf" && extension !== ".glb")
    gltfFail("format", "Source needs a .gltf or .glb extension", ["source"]);
  let root: string;
  try {
    root = await realpath(
      resolve(options.dependencyRoot ?? dirname(requested)),
    );
  } catch {
    gltfFail("dependency", "Dependency root is missing", ["root"]);
  }
  const sourcePath = await canonicalFile(requested, root, ["source"]);
  const bytes = await fileBytes(sourcePath, RIGID_GLTF_LIMITS.sourceBytes, [
    "source",
  ]);
  const format = extension === ".glb" ? "glb" : "gltf";
  const container = readGltfContainer(bytes, format);
  preflightGltfMeshes(
    container.document,
    readGltfHierarchy(container.document, options.scene),
  );
  readGltfMaterials(container.document);
  const paths = new Map<
    string,
    { path: string; limit: number; location: (string | number)[] }
  >();
  let totalBytes = 0;
  for (const [uri, location] of externalGltfUris(container.document)) {
    const dependency = await canonicalFile(
      resolve(dirname(sourcePath), localGltfUri(uri, location)),
      root,
      location,
    );
    const limit = container.document.images.some((image) => image.uri === uri)
      ? RIGID_GLTF_LIMITS.imageBytes
      : RIGID_GLTF_LIMITS.dependencyBytes;
    const info = await stat(dependency).catch(() =>
      gltfFail(
        "dependency",
        "Local file disappeared or became inaccessible during preflight",
        location,
      ),
    );
    totalBytes += info.size;
    if (
      !info.isFile() ||
      info.size > limit ||
      totalBytes > RIGID_GLTF_LIMITS.dependencyBytes
    )
      gltfFail(
        "budget",
        "Local dependency aggregate budget exceeded before loading",
        location,
      );
    paths.set(uri, { path: dependency, limit: info.size, location });
  }
  const dependencies = new Map<string, Uint8Array>();
  for (const [uri, definition] of paths)
    dependencies.set(
      uri,
      await fileBytes(definition.path, definition.limit, definition.location),
    );
  return decodeRigidGltf(bytes, {
    ...(options.scene === undefined ? {} : { scene: options.scene }),
    format,
    dependencies,
  });
}
