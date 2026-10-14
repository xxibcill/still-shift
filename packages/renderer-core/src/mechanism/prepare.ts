import { MechanismSceneSchema } from "@still-shift/scene-contract";
import { matrixFromTransform } from "./matrix.ts";
import type { PreparedMechanismScene } from "./types.ts";

/** Parse, clone and freeze the indexed catalog once before evaluating any frames. */
export function prepareMechanismScene(input: unknown): PreparedMechanismScene {
  const scene = MechanismSceneSchema.parse(input);
  const orderedPartIds: string[] = [];
  const parts = new Map(scene.parts.map((part) => [part.id, part]));
  const visited = new Set<string>();
  function visit(id: string) {
    if (visited.has(id)) return;
    const part = parts.get(id)!;
    if (part.parent !== undefined) visit(part.parent);
    visited.add(id);
    orderedPartIds.push(id);
  }
  for (const part of scene.parts) visit(part.id);
  return freezeDeep({
    version: "prepared-mechanism-scene-1" as const,
    scene,
    orderedPartIds,
    baseLocalMatrices: Object.fromEntries(
      scene.parts.map((part) => [part.id, matrixFromTransform(part.transform)]),
    ),
  });
}

function freezeDeep<T extends object>(root: T): T {
  const pending: object[] = [root];
  const visited = new WeakSet<object>();
  while (pending.length) {
    const object = pending.pop()!;
    if (visited.has(object)) continue;
    visited.add(object);
    for (const value of Object.values(object))
      if (value !== null && typeof value === "object") pending.push(value);
    Object.freeze(object);
  }
  return root;
}
