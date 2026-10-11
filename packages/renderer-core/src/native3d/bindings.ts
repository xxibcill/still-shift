import type {
  NativeFrameSnapshotVersions,
  NativeScreenBinding,
} from "@still-shift/scene-contract";
import { inverseMatrix, transformPoint } from "../node-transform.ts";
import type { Matrix } from "../node-transform.ts";
import { passageError, PassageError } from "../passage-diagnostics.ts";
import type { NativeScreenBindingResult } from "./types.ts";
import type { EvaluatedLayer } from "../composition/evaluate/types.ts";

export function resolveNativeScreenAnchor(
  snapshot: NativeFrameSnapshotVersions,
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

function annotationPath(state: EvaluatedLayer, id: string, frame: number) {
  const content = state.contents?.find((entry) => entry.id === id);
  if (
    content?.type !== "path" ||
    content.path.vertices.length > 256 ||
    content.path.inTangents?.some((point) =>
      point.some((value) => value !== 0),
    ) ||
    content.path.outTangents?.some((point) =>
      point.some((value) => value !== 0),
    )
  )
    passageError(
      "comp-native3d-binding",
      "Native annotation requires an admitted straight path",
      { node: state.id, path: `native3D.target.${id}`, frame },
    );
  return content;
}
function bindAnnotationVertices(
  state: EvaluatedLayer,
  snapshot: NativeFrameSnapshotVersions,
  binding: NativeScreenBinding,
) {
  if (binding.target.kind !== "path-vertices")
    throw Error("Expected vertex binding");
  return binding.target.vertices.map((point, index) => {
    try {
      return resolveNativeScreenAnchor(snapshot, {
        ...binding,
        anchor: point.anchor,
        offsetPixels: [
          (binding.offsetPixels?.[0] ?? 0) + (point.offsetPixels?.[0] ?? 0),
          (binding.offsetPixels?.[1] ?? 0) + (point.offsetPixels?.[1] ?? 0),
        ],
        target: { kind: "position" },
      });
    } catch (error) {
      if (error instanceof PassageError)
        throw new PassageError(
          error.diagnostics.map((diagnostic) => ({
            ...diagnostic,
            node: state.id,
            path: diagnostic.path?.endsWith(".anchor")
              ? `${snapshot.scope}/${state.id}.native3D.target.vertices.${index}.anchor`
              : `${snapshot.scope}/${state.id}.native3D.${diagnostic.path?.split(".native3D.")[1] ?? "target"}`,
          })),
        );
      throw error;
    }
  });
}
function applyAnnotationVertices(
  state: EvaluatedLayer,
  snapshot: NativeFrameSnapshotVersions,
  binding: NativeScreenBinding,
  results: NativeScreenBindingResult[],
) {
  if (binding.target.kind !== "path-vertices")
    throw Error("Expected vertex binding");
  const content = annotationPath(
    state,
    binding.target.contentId,
    snapshot.scopeFrame,
  );
  const vertices = content.path.vertices.map(
    (point) => [...point] as [number, number],
  );
  binding.target.vertices.forEach((point, index) => {
    if (point.index >= vertices.length || !results[index]?.pixel)
      passageError(
        "comp-native3d-binding",
        "Native bound vertex is unavailable",
        {
          node: state.id,
          path: `native3D.target.vertices.${index}`,
          frame: snapshot.scopeFrame,
        },
      );
    vertices[point.index] = nativeBindingLocalPoint(
      results[index]!.pixel!,
      state.screenMatrix,
      `${snapshot.scope}/${state.id}.native3D.target.vertices.${index}`,
      snapshot.scopeFrame,
    );
  });
  content.path = { ...content.path, vertices };
}
function applyAnnotationArrow(
  state: EvaluatedLayer,
  snapshot: NativeFrameSnapshotVersions,
  binding: NativeScreenBinding,
  tip: [number, number],
) {
  if (binding.target.kind !== "path-arrow")
    throw Error("Expected arrow binding");
  const line = annotationPath(
      state,
      binding.target.contentId,
      snapshot.scopeFrame,
    ),
    head = annotationPath(
      state,
      binding.target.headContentId,
      snapshot.scopeFrame,
    );
  if (
    line.path.closed ||
    line.path.vertices.length !== 2 ||
    !head.path.closed ||
    head.path.vertices.length !== 3
  )
    passageError(
      "comp-native3d-binding",
      "Native arrow requires an open line and a closed triangle",
      { node: state.id, path: "native3D.target", frame: snapshot.scopeFrame },
    );
  const start = transformPoint(state.screenMatrix, line.path.vertices[0]!);
  const dx = tip[0] - start[0],
    dy = tip[1] - start[1],
    distance = Math.hypot(dx, dy);
  const length = Math.min(binding.target.headLengthPixels, distance * 0.45),
    halfWidth = Math.min(binding.target.headWidthPixels / 2, distance * 0.25);
  const ux = distance > 1e-12 ? dx / distance : 0,
    uy = distance > 1e-12 ? dy / distance : 0;
  const points: [number, number][] = [
    tip,
    [
      tip[0] - ux * length + uy * halfWidth,
      tip[1] - uy * length - ux * halfWidth,
    ],
    [
      tip[0] - ux * length - uy * halfWidth,
      tip[1] - uy * length + ux * halfWidth,
    ],
  ];
  const local = (point: [number, number]) =>
    nativeBindingLocalPoint(
      point,
      state.screenMatrix,
      `${snapshot.scope}/${state.id}.native3D.target`,
      snapshot.scopeFrame,
    );
  line.path = {
    ...line.path,
    vertices: [[...line.path.vertices[0]!], local(tip)],
  };
  head.path = { ...head.path, vertices: points.map(local) };
}

/** Mutates sampled content before shape compilation; never changes authored layer data. */
export function applyNativeScreenBinding(
  state: EvaluatedLayer,
  snapshot: NativeFrameSnapshotVersions,
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
  const vertexResults =
    binding.target.kind === "path-vertices"
      ? bindAnnotationVertices(state, snapshot, binding)
      : [];
  for (const point of vertexResults) {
    if (!point.shown) result.visibility = point.visibility;
    result.shown &&= point.shown;
    result.indicator ||= point.indicator;
  }
  result.indicator &&= result.shown;
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
  if (binding.target.kind === "path-vertices") {
    applyAnnotationVertices(state, snapshot, binding, vertexResults);
    return;
  }
  if (binding.target.kind === "path-arrow") {
    applyAnnotationArrow(state, snapshot, binding, result.pixel);
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
