import { describe, expect, it } from "vitest";
import { decodeRigidGltf } from "../../packages/animation-engine/src/mechanism/gltf-import.ts";
import { rigidGltfFixture, glbBytes } from "../helpers/rigid-gltf-fixture.ts";
describe("bounded rigid glTF import", () => {
  it("preserves named hierarchy and node origins while baking affine geometry", () => {
    const { document, binary } = rigidGltfFixture();
    const imported = decodeRigidGltf(glbBytes(document, binary), {
      format: "glb",
    });
    expect(imported.parts.map((p) => p.id)).toEqual([
      "model",
      "node.0",
      "node.1",
    ]);
    expect(imported.parts[2]!.parent).toBe("node.0");
    expect(imported.nodes[1]!.name).toBe("lever");
    expect(imported.parts[2]!.transform.position[1]).toBeCloseTo(2);
    const mesh = imported.meshes[0]!;
    expect(mesh.positions[4]).toBeCloseTo(2);
    expect(mesh.positions[6]).toBeCloseTo(-1);
    expect(mesh.normals).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    expect(mesh.tangents![1]).toBeCloseTo(1);
    expect(imported.materials[0]!.baseColorFactor).toEqual([0.2, 0.4, 0.6, 1]);
  });
  it("rejects embedded animation instead of flattening mechanism behavior", () => {
    const { document, binary } = rigidGltfFixture();
    expect(() =>
      decodeRigidGltf(
        glbBytes(
          { ...document, animations: [{ channels: [], samplers: [] }] },
          binary,
        ),
        { format: "glb" },
      ),
    ).toThrow(/animation/);
  });
});
