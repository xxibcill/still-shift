import { pathCubics } from "../../../packages/renderer-core/src/composition/shapes/path.ts";
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
const identity: Matrix = [1, 0, 0, 1, 0, 0];
type Located = {
  state: EvaluatedLayer;
  matrix: Matrix;
  outer: Matrix;
  route: string;
  scope: string;
};
function locate(
  tree: EvaluatedLayerTree,
  matrix = identity,
  route = "root",
): Located[] {
  return tree.layers.flatMap((state) => {
    const item = {
      state,
      matrix: multiplyMatrix(matrix, state.screenMatrix),
      outer: matrix,
      route: `${route}/${state.id}`,
      scope: route === "root" ? "root" : tree.id,
    };
    return [
      item,
      ...(state.precomp ? locate(state.precomp, item.matrix, item.route) : []),
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
      if (bounds.checked && state.visible) {
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
              .map((p) => transformPoint(outer, p).join(","))
              .join(" "),
            fill: "none",
            stroke: "#afc5a1",
            "stroke-width": 1,
            "data-overlay": "bounds",
            "data-layer": item.route,
          });
        }
        const anchor = transformPoint(matrix, state.transform.anchor);
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
    if (paths.checked && selected) {
      const selection = `${selected.scope}/${selected.layer}`;
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
            list.push(transformPoint(item.matrix, item.state.transform.anchor));
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
