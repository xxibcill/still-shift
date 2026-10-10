import type {
  NativeFrameSnapshot,
  NativeScreenBinding,
} from "@still-shift/scene-contract";
import { inverseMatrix, transformPoint } from "../node-transform.ts";
import type { Matrix } from "../node-transform.ts";
import { passageError, PassageError } from "../passage-diagnostics.ts";
import type { NativeScreenBindingResult } from "./types.ts";
import type { EvaluatedLayer } from "../composition/evaluate/types.ts";

export function resolveNativeScreenAnchor(
  snapshot: NativeFrameSnapshot,
  binding: NativeScreenBinding,
): NativeScreenBindingResult {
  const location = {
    node: snapshot.controller,
    path: `${snapshot.scope}/${snapshot.controller}.native3D.anchor`,
    frame: snapshot.scopeFrame,
  };
  if (binding.sceneLayer !== snapshot.controller)
    passageError(
      "comp-native3d-binding",
      "Screen binding names a different controller",
      { ...location, path: location.path.replace(/anchor$/, "sceneLayer") },
    );
  if (!Object.hasOwn(snapshot.anchors, binding.anchor))
    passageError(
      "comp-native3d-binding",
      `Unknown physical anchor ${binding.anchor}`,
      location,
    );
  const anchor = snapshot.anchors[binding.anchor]!;
  if (anchor.pixel && !anchor.pixel.every(Number.isFinite))
    passageError(
      "comp-native3d-binding",
      "Physical projection contains nonfinite pixels",
      location,
    );
  const indicator =
    anchor.visibility === "outside-frame" &&
    binding.visibilityPolicy === "offscreen-indicator";
  const shown = anchor.visibility === "visible" || indicator;
  let pixel: [number, number] | null =
    shown && anchor.pixel ? [...anchor.pixel] : null;
  if (pixel && binding.target.kind !== "visibility") {
    pixel[0] += binding.offsetPixels?.[0] ?? 0;
    pixel[1] += binding.offsetPixels?.[1] ?? 0;
    if (indicator) {
      const inset = binding.insetPixels ?? 12;
      if (
        inset * 2 > snapshot.viewport.width ||
        inset * 2 > snapshot.viewport.height
      )
        passageError(
          "comp-native3d-binding",
          "Indicator inset exceeds the owning viewport",
          {
            ...location,
            path: location.path.replace(/anchor$/, "insetPixels"),
          },
        );
      pixel = [
        Math.min(snapshot.viewport.width - inset, Math.max(inset, pixel[0])),
        Math.min(snapshot.viewport.height - inset, Math.max(inset, pixel[1])),
      ];
    }
  }
  return {
    pixel,
    shown: shown && pixel !== null,
    indicator: indicator && pixel !== null,
    visibility: anchor.visibility,
  };
}

/** Settled parent/camera mapping is inverted exactly once for both position and leader endpoint. */
export function nativeBindingLocalPoint(
  pixel: [number, number],
  screenMatrix: Matrix,
  path: string,
  frame: number,
): [number, number] {
  try {
    return transformPoint(inverseMatrix(screenMatrix), pixel);
  } catch {
    return passageError(
      "comp-native3d-binding",
      "Native screen binding has a singular settled screen matrix",
      { path, frame },
    );
  }
}

/** Mutates sampled content before shape compilation; never changes authored layer data. */
export function applyNativeScreenBinding(
  state: EvaluatedLayer,
  snapshot: NativeFrameSnapshot,
  binding: NativeScreenBinding,
  parentToScreen: Matrix,
): void {
  let result: NativeScreenBindingResult;
  try {
    result = resolveNativeScreenAnchor(snapshot, binding);
  } catch (error) {
    if (error instanceof PassageError)
      throw new PassageError(
        error.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          node: state.id,
          path: `${snapshot.scope}/${state.id}.native3D.${diagnostic.path?.split(".native3D.")[1] ?? "anchor"}`,
        })),
      );
    throw error;
  }
  state.nativeFrame = snapshot;
  state.nativeScreenBinding = result;
  state.visible &&=
    binding.visibleWhen === "indicator" ? result.indicator : result.shown;
  if (!state.visible || !result.pixel || binding.target.kind === "visibility")
    return;
  const path = `${snapshot.scope}/${state.id}.native3D.target`;
  if (binding.target.kind === "position") {
    nativeBindingLocalPoint(
      result.pixel,
      state.screenMatrix,
      path,
      snapshot.scopeFrame,
    );
    const local = nativeBindingLocalPoint(
      result.pixel,
      parentToScreen,
      path,
      snapshot.scopeFrame,
    );
    state.transform.position = local;
    return;
  }
  const target = binding.target;
  const content = state.contents?.find(
    (entry) => entry.id === target.contentId,
  );
  if (
    content?.type !== "path" ||
    content.path.closed ||
    content.path.vertices.length !== 2 ||
    content.path.inTangents?.some((point) =>
      point.some((value) => value !== 0),
    ) ||
    content.path.outTangents?.some((point) =>
      point.some((value) => value !== 0),
    )
  )
    passageError(
      "comp-native3d-binding",
      "A leader requires one top-level open two-vertex straight path without handles",
      { node: state.id, path, frame: snapshot.scopeFrame },
    );
  content.path = {
    ...content.path,
    vertices: [
      [...content.path.vertices[0]!],
      nativeBindingLocalPoint(
        result.pixel,
        state.screenMatrix,
        path,
        snapshot.scopeFrame,
      ),
    ],
  };
}
