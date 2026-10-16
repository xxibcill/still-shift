import { Matrix4, Quaternion, Vector3 } from "three";
import {
  gltfFail,
  referenced,
  type RigidGltfDocument,
} from "./gltf-document.ts";
import type { GltfVector } from "./gltf-types.ts";

export interface GltfHierarchy {
  selectedScene: number;
  parents: (number | undefined)[];
  order: number[];
  local: Matrix4[];
  world: Map<number, Matrix4>;
  origins: Map<number, GltfVector>;
  omittedNodes: number[];
}
function nodeMatrix(node: RigidGltfDocument["nodes"][number], index: number) {
  const path = ["nodes", index];
  if (node.matrix && (node.translation || node.rotation || node.scale))
    gltfFail("transform", "Matrix and TRS cannot coexist", path);
  const rotation = new Quaternion(...(node.rotation ?? [0, 0, 0, 1]));
  if (Math.abs(rotation.length() - 1) > 0.00001)
    gltfFail("transform", "Rotation quaternion must be normalized", [
      ...path,
      "rotation",
    ]);
  rotation.normalize();
  const matrix = node.matrix
    ? new Matrix4().fromArray(node.matrix)
    : new Matrix4().compose(
        new Vector3(...(node.translation ?? [0, 0, 0])),
        rotation,
        new Vector3(...(node.scale ?? [1, 1, 1])),
      );
  if (
    matrix.elements.some(
      (value) => !Number.isFinite(value) || Math.abs(value) > 1_000_000,
    ) ||
    !Number.isFinite(matrix.determinant()) ||
    Math.abs(matrix.determinant()) < 1e-12
  )
    gltfFail("transform", "Collapsed or nonfinite transform", path);
  if (
    [3, 7, 11].some((index) => matrix.elements[index] !== 0) ||
    matrix.elements[15] !== 1
  )
    gltfFail(
      "transform",
      "Projective matrices are not rigid affine transforms",
      [...path, "matrix"],
    );
  const translation = new Vector3(),
    scale = new Vector3(),
    quaternion = new Quaternion();
  matrix.decompose(translation, quaternion, scale);
  const rebuilt = new Matrix4().compose(translation, quaternion, scale);
  if (
    matrix.elements.some(
      (value, axis) =>
        Math.abs(value - rebuilt.elements[axis]!) >
        1e-8 * Math.max(1, Math.abs(value)),
    )
  )
    gltfFail(
      "transform",
      "Local matrix must be affine and decomposable to TRS without shear",
      [...path, "matrix"],
    );
  return matrix;
}
export function readGltfHierarchy(
  document: RigidGltfDocument,
  requestedScene?: number,
): GltfHierarchy {
  const selectedScene = requestedScene ?? document.scene ?? 0;
  if (!Number.isSafeInteger(selectedScene) || selectedScene < 0)
    gltfFail("scene", "Scene index must be a nonnegative safe integer", [
      "scene",
    ]);
  if (document.scene !== undefined)
    referenced(document.scenes, document.scene, ["scene"]);
  const scene = referenced(document.scenes, selectedScene, [
    "scenes",
    selectedScene,
  ]);
  const names = new Set<string>();
  const parents: (number | undefined)[] = Array.from({
    length: document.nodes.length,
  });
  document.nodes.forEach((node, index) => {
    if (!node.name.trim() || names.has(node.name))
      gltfFail("name", "Nodes need unique nonblank names", [
        "nodes",
        index,
        "name",
      ]);
    names.add(node.name);
    if (node.mesh !== undefined)
      referenced(document.meshes, node.mesh, ["nodes", index, "mesh"]);
    for (const child of node.children) {
      referenced(document.nodes, child, ["nodes", index, "children"]);
      if (parents[child] !== undefined)
        gltfFail(
          "hierarchy",
          "A node cannot have repeated or multiple parents",
          ["nodes", index, "children"],
        );
      parents[child] = index;
    }
  });
  const visited = new Set<number>(),
    visiting = new Set<number>();
  function validateNode(index: number) {
    if (visiting.has(index))
      gltfFail("hierarchy", "Cyclic node graph", ["nodes", index]);
    if (visited.has(index)) return;
    visiting.add(index);
    for (const child of document.nodes[index]!.children) validateNode(child);
    visiting.delete(index);
    visited.add(index);
  }
  document.nodes.forEach((_, index) => validateNode(index));
  document.scenes.forEach((candidate, index) => {
    const roots = new Set<number>();
    for (const root of candidate.nodes) {
      referenced(document.nodes, root, ["scenes", index, "nodes"]);
      if (roots.has(root) || parents[root] !== undefined)
        gltfFail("hierarchy", "Scene roots must be distinct parentless nodes", [
          "scenes",
          index,
          "nodes",
        ]);
      roots.add(root);
    }
  });
  const local = document.nodes.map(nodeMatrix);
  const order: number[] = [],
    world = new Map<number, Matrix4>(),
    origins = new Map<number, GltfVector>();
  function visit(index: number, parent: Matrix4) {
    const matrix = parent.clone().multiply(local[index]!);
    if (
      matrix.elements.some(
        (value) => !Number.isFinite(value) || Math.abs(value) > 1_000_000,
      ) ||
      !Number.isFinite(matrix.determinant()) ||
      Math.abs(matrix.determinant()) < 1e-12
    )
      gltfFail("transform", "World transform is collapsed or nonfinite", [
        "nodes",
        index,
      ]);
    const origin = new Vector3()
      .setFromMatrixPosition(matrix)
      .toArray() as GltfVector;
    if (origin.some((value) => Math.abs(value) > 1_000_000))
      gltfFail("budget", "World node origin exceeds coordinate budget", [
        "nodes",
        index,
      ]);
    order.push(index);
    world.set(index, matrix);
    origins.set(index, origin);
    for (const child of document.nodes[index]!.children) visit(child, matrix);
  }
  for (const root of scene.nodes) visit(root, new Matrix4());
  if (!order.some((index) => document.nodes[index]!.mesh !== undefined))
    gltfFail("scene", "Selected scene has no rigid mesh", [
      "scenes",
      selectedScene,
    ]);
  return {
    selectedScene,
    parents,
    order,
    local,
    world,
    origins,
    omittedNodes: document.nodes
      .map((_, index) => index)
      .filter((index) => !world.has(index)),
  };
}
