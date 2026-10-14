import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CompositionSchema } from "../../packages/scene-contract/src/composition/composition.ts";
import { prepareCompositionNative3D } from "../../packages/animation-engine/src/composition-native3d.ts";
import { passageDiagnostics } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import { nativeSolidFixture } from "../helpers/native3d-fixture.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture(
  edit: (source: ReturnType<typeof nativeSolidFixture>) => void = () => {},
  format: "solid-scene-1" | "mechanism-scene-1" = "solid-scene-1",
  filename = "source.json",
) {
  const root = await mkdtemp(join(tmpdir(), "native-source-diagnostic-"));
  roots.push(root);
  const source = nativeSolidFixture();
  edit(source);
  const bytes = JSON.stringify(source);
  const path = join(root, filename);
  await writeFile(path, bytes);
  const composition = CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: "source-diagnostic",
    width: 128,
    height: 128,
    fps: 30,
    frameCount: 1,
    assets: [
      {
        id: "source",
        type: "native3d",
        format,
        path: filename,
        sha256: "sha256:" + createHash("sha256").update(bytes).digest("hex"),
      },
    ],
    layers: [],
  });
  return { root, path, composition };
}

describe("located native source admission", () => {
  it("locates unsupported material fields in the actual source", async () => {
    const { root, path, composition } = await fixture((source) => {
      Object.assign(source.geometry.materials[0]!, { clearcoat: 1 });
    });
    const error = await prepareCompositionNative3D(composition, root).catch(
      (error: unknown) => error,
    );
    expect(passageDiagnostics(error)).toEqual([
      expect.objectContaining({
        code: "comp-native3d-source",
        path: "assets.source.geometry.materials.0.clearcoat",
        sourcePath: path,
      }),
    ]);
    expect(passageDiagnostics(error)[0]!.message).toContain("clearcoat");
  });

  it("bounds and sanitizes unsupported source field names", async () => {
    const unsupported = "bearer fixture-secret " + "x".repeat(12_000);
    const { root, composition } = await fixture((source) => {
      Object.assign(source.geometry.materials[0]!, { [unsupported]: 1 });
    });
    const error = await prepareCompositionNative3D(composition, root).catch(
      (error: unknown) => error,
    );
    const [diagnostic] = passageDiagnostics(error);
    expect(diagnostic!.path).toMatch(
      /^assets\.source\.geometry\.materials\.0\./,
    );
    expect(diagnostic!.path!.length).toBeLessThanOrEqual(1024);
    expect(diagnostic!.message.length).toBeLessThanOrEqual(1024);
    expect(JSON.stringify(diagnostic)).not.toContain("fixture-secret");
  });

  it("preserves the specific topology code and field", async () => {
    const { root, path, composition } = await fixture((source) => {
      source.geometry.meshes[0]!.indices[0] = 999;
    });
    const error = await prepareCompositionNative3D(composition, root).catch(
      (error: unknown) => error,
    );
    expect(passageDiagnostics(error)).toEqual([
      expect.objectContaining({
        code: "mechanism-geometry-topology",
        path: "assets.source.geometry.meshes.0.indices",
        sourcePath: path,
      }),
    ]);
  });

  it("still locates a genuine declared format mismatch at format", async () => {
    const { root, path, composition } = await fixture(
      undefined,
      "mechanism-scene-1",
    );
    const error = await prepareCompositionNative3D(composition, root).catch(
      (error: unknown) => error,
    );
    expect(passageDiagnostics(error)).toEqual([
      expect.objectContaining({
        code: "comp-native3d-source",
        message: "Native source does not match its declared format",
        path: "assets.source.format",
        sourcePath: path,
      }),
    ]);
  });

  it("sanitizes the source filename for genuine format mismatches", async () => {
    const { root, composition } = await fixture(
      undefined,
      "mechanism-scene-1",
      "bearer fixture-secret source.json",
    );
    const error = await prepareCompositionNative3D(composition, root).catch(
      (error: unknown) => error,
    );
    const [diagnostic] = passageDiagnostics(error);
    expect(diagnostic!.path).toBe("assets.source.format");
    expect(diagnostic!.sourcePath).toContain("[redacted]");
    expect(JSON.stringify(diagnostic)).not.toContain("fixture-secret");
  });

  it("prepares correctly declared and checksummed source bytes", async () => {
    const { root, path, composition } = await fixture();
    const result = await prepareCompositionNative3D(composition, root);
    expect(result?.assetPaths.source).toBe(path);
    expect(result?.preparedNative3D.assets.source?.source.schemaVersion).toBe(
      "solid-scene-1",
    );
  });
});
