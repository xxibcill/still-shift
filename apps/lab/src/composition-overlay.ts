import {
  cameraFrustumOverlay,
  overlayHomographyPoint,
  spatialOverlayPoint,
} from "./composition-spatial-overlay.ts";
import {
  affineHomography,
  multiplyHomographies,
  worldPoint,
  projectWorldPoint,
  type Homography,
} from "../../../packages/renderer-core/src/composition/evaluate/spatial-geometry.ts";
import {
  flattenBezier,
  pathCubics,
} from "../../../packages/renderer-core/src/composition/shapes/path.ts";
import type { Composition } from "../../../packages/scene-contract/src/index.ts";
import {
  evaluateComp,
  type EvaluatedLayerTree,
  type EvaluatedLayer,
  type EvaluationOptions,
} from "../../../packages/renderer-core/src/composition/evaluate/index.ts";
import {
  inverseMatrix,
  multiplyMatrix,
  transformPoint,
  type Matrix,
  type Point,
} from "../../../packages/renderer-core/src/node-transform.ts";
import { isKeyed } from "../../../packages/scene-contract/src/index.ts";
import type { InspectorSelection } from "./composition-inspector.ts";
import type { CompositionScope } from "./composition-keys.ts";
const identity: Matrix = [1, 0, 0, 1, 0, 0];
type Located = {
  state: EvaluatedLayer;
  matrix: Matrix;
  outer: Matrix;
  route: string;
  scope: CompositionScope;
  tree: EvaluatedLayerTree;
  homography?: Homography;
  outerHomography?: Homography;
};
function locate(
  tree: EvaluatedLayerTree,
  matrix = identity,
  route = "root",
  outerHomography?: Homography,
): Located[] {
  return tree.layers.flatMap((state) => {
    const homography =
      state.projection || outerHomography
        ? multiplyHomographies(
            outerHomography ?? affineHomography(matrix),
            state.projection?.homography ??
              affineHomography(state.screenMatrix),
          )
        : undefined;
    const item: Located = {
      state,
      matrix: multiplyMatrix(matrix, state.screenMatrix),
      outer: matrix,
      route: `${route}/${state.id}`,
      scope: route === "root" ? null : tree.id,
      tree,
      ...(homography ? { homography } : {}),
      ...(outerHomography ? { outerHomography } : {}),
    };
    return [
      item,
      ...(state.precomp
        ? locate(state.precomp, item.matrix, item.route, item.homography)
        : []),
    ];
  });
}
export function createCompositionOverlay() {
  const root = document.getElementById(
    "composition-overlay",
  ) as unknown as SVGSVGElement;
  const bounds = document.getElementById("overlay-bounds") as HTMLInputElement,
    paths = document.getElementById("overlay-paths") as HTMLInputElement,
    safe = document.getElementById("overlay-safe") as HTMLInputElement;
  let selected: InspectorSelection | undefined,
    last:
      | {
          composition: Composition;
          frame: number;
          textBounds: EvaluationOptions["textBounds"];
        }
      | undefined;
  let cached:
    | {
        composition: Composition;
        selection: string;
        points: Map<string, Point[]>;
      }
    | undefined;
  function add(name: string, attrs: Record<string, string | number>) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attrs))
      node.setAttribute(key, String(value));
    node.setAttribute("vector-effect", "non-scaling-stroke");
    root.append(node);
    return node;
  }
  function matches(item: Located) {
    return (
      !selected ||
      (item.scope === selected.scope && item.state.id === selected.layer)
    );
  }
  function draw(
    composition: Composition,
    frame: number,
    textBounds: EvaluationOptions["textBounds"],
  ) {
    last = { composition, frame, textBounds };
    root.replaceChildren();
    root.setAttribute(
      "viewBox",
      `0 0 ${composition.width} ${composition.height}`,
    );
    const options = textBounds ? { textBounds } : {},
      items = locate(evaluateComp(composition, frame, options));
    if (safe.checked) {
      const x = composition.width * 0.05,
        y = composition.height * 0.05;
      add("rect", {
        x,
        y,
        width: composition.width - 2 * x,
        height: composition.height - 2 * y,
        fill: "none",
        stroke: "#e6c989",
        "stroke-dasharray": "8 5",
        "data-overlay": "safe-area",
      });
    }
    for (const item of items.filter(matches)) {
      const { state, matrix, outer } = item;
      const project = (point: Point) =>
        spatialOverlayPoint(state, matrix, outer, item.outerHomography, point);
      if (
        bounds.checked &&
        state.visible &&
        !["camera", "light"].includes(state.layer.type)
      ) {
        if (state.bounds) {
          const b = state.bounds,
            corners = [
              [b.left, b.top],
              [b.right, b.top],
              [b.right, b.bottom],
              [b.left, b.bottom],
            ] as Point[];
          add("polygon", {
            points: corners
              .map((p) =>
                item.outerHomography
                  ? overlayHomographyPoint(item.outerHomography, p)
                  : transformPoint(outer, p),
              )
              .filter((p): p is Point => !!p)
              .map((p) => p.join(","))
              .join(" "),
            fill: "none",
            stroke: "#afc5a1",
            "stroke-width": 1,
            "data-overlay": "bounds",
            "data-layer": item.route,
          });
        }
        const anchor = project([
          state.transform.anchor[0],
          state.transform.anchor[1],
        ]);
        if (anchor)
          add("circle", {
            cx: anchor[0],
            cy: anchor[1],
            r: Math.max(2, composition.width / 160),
            fill: "none",
            stroke: "#e6c989",
            "data-overlay": "anchor",
            "data-layer": item.route,
          });
      }
      if (paths.checked && selected) {
        for (const path of state.shapes?.paths ?? []) {
          if (!path.vertices.length) continue;
          if (item.homography) {
            let d = "",
              connected = false;
            for (const local of flattenBezier(path)) {
              const point = project(local);
              if (point) {
                d += `${connected ? " L" : " M"} ${point.join(" ")}`;
                connected = true;
              } else connected = false;
            }
            if (d)
              add("path", {
                d,
                fill: "none",
                stroke: "#c5b7dd",
                "stroke-width": 1,
                "data-overlay": "shape-path",
                "data-layer": item.route,
              });
            continue;
          }
          const start = transformPoint(matrix, path.vertices[0]!);
          let d = `M ${start.join(" ")}`;
          for (const cubic of pathCubics(path))
            d += ` C ${cubic
              .slice(1)
              .map((point) => transformPoint(matrix, point).join(" "))
              .join(" ")}`;
          if (path.closed) d += " Z";
          add("path", {
            d,
            fill: "none",
            stroke: "#c5b7dd",
            "stroke-width": 1,
            "data-overlay": "shape-path",
            "data-layer": item.route,
          });
        }
        const raw = state.layer.transform?.position;
        if (isKeyed(raw)) {
          if (state.projection && state.worldMatrix3d && item.tree.camera) {
            const byId = new Map(
              item.tree.layers.map((state) => [state.id, state]),
            );
            const parent = state.layer.parent
              ? byId.get(state.layer.parent)?.worldMatrix3d
              : undefined;
            const screen = (point: number[]) => {
              const world = parent
                ? worldPoint(parent, [point[0]!, point[1]!, point[2] ?? 0])
                : ([point[0]!, point[1]!, point[2] ?? 0] as [
                    number,
                    number,
                    number,
                  ]);
              const local = projectWorldPoint(item.tree.camera!, world);
              return local
                ? item.outerHomography
                  ? overlayHomographyPoint(item.outerHomography, local)
                  : transformPoint(outer, local)
                : null;
            };
            for (const key of raw.keys)
              for (const side of ["spatialIn", "spatialOut"] as const) {
                const tangent = (
                  key as unknown as {
                    spatialIn?: number[];
                    spatialOut?: number[];
                  }
                )[side];
                if (!tangent) continue;
                const value = key.value as number[],
                  a = screen(value),
                  b = screen(
                    [0, 1, 2].map(
                      (axis) => (value[axis] ?? 0) + (tangent[axis] ?? 0),
                    ),
                  );
                if (a && b)
                  add("line", {
                    x1: a[0],
                    y1: a[1],
                    x2: b[0],
                    y2: b[1],
                    stroke: "#e8a4bd",
                    "data-overlay": "spatial-tangent",
                  });
              }
            continue;
          }
          try {
            const parent = multiplyMatrix(
              matrix,
              inverseMatrix(state.localMatrix),
            );
            for (const key of raw.keys)
              for (const side of ["spatialIn", "spatialOut"] as const) {
                const tangent = (
                    key as unknown as { spatialIn?: Point; spatialOut?: Point }
                  )[side],
                  position = key.value as Point;
                if (!tangent) continue;
                const a = transformPoint(parent, position),
                  b = transformPoint(parent, [
                    position[0] + tangent[0],
                    position[1] + tangent[1],
                  ]);
                add("line", {
                  x1: a[0],
                  y1: a[1],
                  x2: b[0],
                  y2: b[1],
                  stroke: "#e8a4bd",
                  "data-overlay": "spatial-tangent",
                });
                add("circle", {
                  cx: b[0],
                  cy: b[1],
                  r: Math.max(2, composition.width / 200),
                  fill: "#e8a4bd",
                });
              }
          } catch {
            /* A collapsed local transform has no invertible tangent space. */
          }
        }
      }
    }
    if (bounds.checked) {
      const shown = new Set<EvaluatedLayerTree>();
      for (const item of items.filter(matches)) {
        const camera = item.tree.camera;
        if (!camera || shown.has(item.tree)) continue;
        shown.add(item.tree);
        const frustum = cameraFrustumOverlay(
          camera,
          composition.width,
          composition.height,
        );
        for (const [name, points, world] of [
          ["near", frustum.nearPoints, frustum.near],
          ["focus", frustum.focusPoints, frustum.focus],
        ] as const)
          add("polygon", {
            points: points.map((p) => p.join(",")).join(" "),
            fill: "none",
            stroke: "#8acbd0",
            "stroke-width": 1,
            "data-overlay": "camera-frustum",
            "data-plane": name,
            "data-camera": camera.id ?? "default",
            "data-world-corners": JSON.stringify(world),
          });
        for (const point of frustum.focusPoints)
          add("line", {
            x1: frustum.position[0],
            y1: frustum.position[1],
            x2: point[0],
            y2: point[1],
            stroke: "#8acbd0",
            "stroke-width": 0.7,
            "data-overlay": "camera-ray",
          });
        add("circle", {
          cx: frustum.position[0],
          cy: frustum.position[1],
          r: 2,
          fill: "#8acbd0",
          "data-overlay": "camera-position",
        });
        add("text", {
          x: frustum.label[0],
          y: frustum.label[1],
          fill: "#8acbd0",
          "font-size": Math.max(4, composition.width / 100),
          "data-overlay": "camera-label",
        }).textContent =
          `${camera.id ?? "Default camera"} · ${frustum.axes} · focus ${camera.focusDistance}`;
      }
    }
    if (paths.checked && selected) {
      const selection = JSON.stringify([selected.scope, selected.layer]);
      if (
        cached?.composition !== composition ||
        cached.selection !== selection
      ) {
        const points = new Map<string, Point[]>(),
          count = Math.min(120, composition.frameCount);
        for (let i = 0; i < count; i++)
          for (const item of locate(
            evaluateComp(
              composition,
              (i * (composition.frameCount - 1)) / Math.max(1, count - 1),
              options,
            ),
          ).filter(matches)) {
            const list = points.get(item.route) ?? [];
            const anchor = spatialOverlayPoint(
              item.state,
              item.matrix,
              item.outer,
              item.outerHomography,
              [item.state.transform.anchor[0], item.state.transform.anchor[1]],
            );
            if (anchor) list.push(anchor);
            points.set(item.route, list);
          }
        cached = { composition, selection, points };
      }
      for (const [route, points] of cached.points)
        add("polyline", {
          points: points.map((p) => p.join(",")).join(" "),
          fill: "none",
          stroke: "#a9c6df",
          "stroke-width": 1.5,
          "data-overlay": "motion-path",
          "data-layer": route,
        });
    }
  }
  for (const checkbox of [bounds, paths, safe])
    checkbox.onchange = () => {
      if (last) draw(last.composition, last.frame, last.textBounds);
    };
  return {
    select(selection: InspectorSelection | undefined) {
      selected = selection;
    },
    draw,
  };
}
