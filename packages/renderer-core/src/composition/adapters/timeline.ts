import {
  COMPOSITION_LIMITS,
  type Composition,
} from "@still-shift/scene-contract";
import { passageDiagnostics } from "../../passage-diagnostics.ts";

export type FamilyCompositionWindow = {
  start: number;
  end: number;
  composition: Composition;
};

function isSampleBudget(error: unknown) {
  const diagnostics = passageDiagnostics(error);
  return (
    diagnostics.length > 0 &&
    diagnostics.every(
      (diagnostic) =>
        (diagnostic.code === "comp-json-size" &&
          (diagnostic.node !== undefined ||
            diagnostic.path?.startsWith("layers["))) ||
        (diagnostic.code === "comp-adapter-limit" &&
          ["frameCount", "effects"].includes(diagnostic.path ?? "")),
    )
  );
}

/** Each document retains the source clock and picture graph within native budgets. */
export function compileFamilyTimeline(
  frameCount: number,
  compile: (window?: readonly [number, number]) => Composition,
): { composition: Composition; windows?: FamilyCompositionWindow[] } {
  if (frameCount <= COMPOSITION_LIMITS.maxKeys) {
    try {
      return { composition: compile() };
    } catch (error) {
      if (!isSampleBudget(error)) throw error;
    }
  }
  const windows: FamilyCompositionWindow[] = [];
  let start = 0;
  while (start < frameCount) {
    let end = Math.min(frameCount, start + COMPOSITION_LIMITS.maxKeys);
    for (;;) {
      try {
        windows.push({ start, end, composition: compile([start, end]) });
        break;
      } catch (error) {
        if (!isSampleBudget(error) || end - start <= 1) throw error;
        end = start + Math.max(1, Math.floor((end - start) / 2));
      }
    }
    start = end;
  }
  return { composition: windows[0]!.composition, windows };
}

export function familyCompositionWindowAt(
  windows: readonly FamilyCompositionWindow[],
  frame: number,
): FamilyCompositionWindow {
  if (!Number.isInteger(frame) || frame < 0 || frame >= windows.at(-1)!.end)
    throw new Error("Frame index outside composition timeline");
  let low = 0;
  let high = windows.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (windows[mid]!.end <= frame) low = mid + 1;
    else high = mid;
  }
  return windows[low]!;
}
