import type {
  Composition,
  CompositionLayer,
} from "../../../packages/scene-contract/src/index.ts";
import {
  type CompositionDocument,
  readJsonPath,
  type DocumentProposal,
  type JsonPath,
} from "./composition-document.ts";
import {
  compositionTracks,
  resolvedTrackRoutes,
  editedKeysCode,
  editSegmentBezier,
  editSpatialTangent,
  editTemporalHandle,
  trackGraph,
  type KeyTrack,
} from "./composition-keys.ts";
import { curveGraph, resolvedGraph } from "./composition-graph.ts";
import {
  evaluateProperty,
  type EvaluationOptions,
} from "../../../packages/renderer-core/src/composition/evaluate/index.ts";
const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const svgNS = "http://www.w3.org/2000/svg";
const svg = (name: string, attrs: Record<string, string | number>) => {
  const node = document.createElementNS(svgNS, name);
  for (const [key, value] of Object.entries(attrs))
    node.setAttribute(key, String(value));
  return node;
};
const button = (text: string, action: () => void) => {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = text;
  node.onclick = action;
  return node;
};
export type InspectorSelection = {
  scope: string;
  layer: string;
  path: JsonPath;
};
export function createCompositionInspector(options: {
  propose: (proposal: DocumentProposal) => Promise<boolean>;
  view: (document: Composition) => Promise<boolean>;
  seek: (frame: number) => void;
  selected: (selection: InspectorSelection | undefined) => void;
  evaluation: () => EvaluationOptions;
}) {
  let history: CompositionDocument | undefined,
    tracks: KeyTrack[] = [],
    selected: InspectorSelection | undefined,
    track: KeyTrack | undefined;
  let keyIndex = 0;
  let rootPath: string | undefined;
  const visibility = new Map<string, { enabled?: boolean; solo?: boolean }>();
  const message = element("edit-message"),
    fieldset = element<HTMLFieldSetElement>("inspector-edit"),
    lane = element("key-lanes");
  const report = (error: unknown) => {
    message.textContent =
      error instanceof Error ? error.message : String(error);
  };
  async function submit(
    label: string,
    change: (document: Composition) => void,
  ) {
    try {
      const proposal = history?.propose(label, change);
      if (!proposal) return true;
      if (await options.propose(proposal)) {
        message.textContent = label;
        refresh(history!);
        return true;
      }
      return false;
    } catch (error) {
      report(error);
      return false;
    }
  }
  function viewDocument(document = history!.document) {
    const draft = structuredClone(document);
    for (const [path, state] of visibility)
      Object.assign(
        readJsonPath(draft, JSON.parse(path)) as CompositionLayer,
        state,
      );
    return draft;
  }
  function layerRows() {
    const stack = element("layer-stack");
    stack.replaceChildren();
    if (!history) return;
    const document = history.document;
    for (const entry of [
      { scope: "root", value: document, path: [] as JsonPath },
      ...(document.precomps ?? []).map((value, index) => ({
        scope: value.id,
        value,
        path: ["precomps", index] as JsonPath,
      })),
    ]) {
      const title = documentNode(
        "p",
        `${entry.scope} · ${entry.value.fps ?? document.fps} fps${entry.scope === "root" ? "" : " · shared definition; instance fps shown in graph"}`,
      );
      title.className = "scope-label";
      stack.append(title);
      for (let i = entry.value.layers.length - 1; i >= 0; i--) {
        const layer = entry.value.layers[i]!,
          path = [...entry.path, "layers", i],
          key = JSON.stringify(path),
          row = documentNode("div", "");
        row.className = "layer-row";
        row.dataset.layer = layer.id;
        const pick = button(layer.name ?? layer.id, () => {
          selected = { scope: entry.scope, layer: layer.id, path };
          track = tracks.find(
            (t) => t.scope === entry.scope && t.owner === layer.id,
          );
          options.selected(selected);
          refresh(history!);
        });
        pick.setAttribute(
          "aria-pressed",
          String(
            selected?.scope === entry.scope && selected?.layer === layer.id,
          ),
        );
        row.append(pick);
        const badges = [
          layer.type,
          layer.parent ? `parent ${layer.parent}` : "",
          layer.blendMode ?? "normal",
          layer.trackMatte
            ? `${layer.trackMatte.mode}: ${layer.trackMatte.layer}`
            : "",
          ...(layer.effects ?? []).map((e) => e.effect),
        ].filter(Boolean);
        row.append(documentNode("small", badges.join(" · ")));
        const bar = documentNode("div", "");
        bar.className = "layer-bar";
        const start = layer.inPoint ?? 0,
          end = layer.outPoint ?? entry.value.frameCount;
        const range = documentNode("span", `${start}–${end}`);
        range.style.marginLeft = `${(100 * start) / entry.value.frameCount}%`;
        range.style.width = `${(100 * (end - start)) / entry.value.frameCount}%`;
        bar.append(range);
        row.append(bar);
        for (const mode of ["enabled", "solo"] as const) {
          const state =
            visibility.get(key)?.[mode] ?? layer[mode] ?? mode === "enabled";
          const toggle = button(
            mode === "enabled"
              ? state
                ? "Hide"
                : "Show"
              : state
                ? "Unsolo"
                : "Solo",
            () => {
              const previous = visibility.get(key);
              visibility.set(key, { ...visibility.get(key), [mode]: !state });
              void options.view(viewDocument()).then((ok) => {
                if (ok) {
                  layerRows();
                  message.textContent =
                    "Visibility is view-only until applied or saved.";
                } else {
                  if (previous) visibility.set(key, previous);
                  else visibility.delete(key);
                  layerRows();
                }
              });
            },
          );
          toggle.setAttribute(
            "aria-pressed",
            String(mode === "solo" ? state : !state),
          );
          row.append(toggle);
        }
        stack.append(row);
      }
    }
  }
  function keyLanes() {
    lane.replaceChildren();
    if (!history) return;
    const scope = selected?.scope ?? "root",
      owner = selected?.layer;
    const scopeDocument =
      scope === "root"
        ? history.document
        : history.document.precomps?.find((p) => p.id === scope);
    for (const marker of scopeDocument?.markers ?? [])
      lane.append(
        button(`Marker ${marker.id} · ${marker.frame}`, () => {
          if (scope === "root") options.seek(marker.frame);
          else
            message.textContent =
              "Nested marker uses its composition clock; choose an instance to seek root time.";
        }),
      );
    for (const curve of tracks.filter(
      (t) => t.scope === scope && (!owner || t.owner === owner),
    )) {
      const row = documentNode("div", "");
      row.className = "key-lane";
      row.append(
        button(curve.label, () => {
          track = curve;
          graph();
        }),
      );
      const strip = documentNode("div", "");
      strip.className = "keys-strip";
      const min = Math.min(0, curve.keys[0]!.frame),
        max = Math.max(
          1,
          scopeDocument?.frameCount ?? 1,
          curve.keys.at(-1)!.frame,
        );
      curve.keys.forEach((key, index) => {
        const marker = button("◆", () => {
          track = curve;
          graph(index);
        });
        marker.title = `Key ${index + 1}, local frame ${key.frame}`;
        marker.style.left = `${(100 * (key.frame - min)) / (max - min)}%`;
        strip.append(marker);
      });
      row.append(strip);
      lane.append(row);
    }
    if (history.document.camera2d && scope === "root")
      lane.append(
        documentNode(
          "p",
          `Camera 2D · native Hermite keys: ${history.document.camera2d.keys.map((k) => k.frame).join(", ")} (source controls)`,
        ),
      );
    if (!lane.children.length)
      lane.append(
        documentNode(
          "p",
          "No authored keys in this selection. Expressions and motion additions remain source-authored.",
        ),
      );
  }
  function graph(index = keyIndex) {
    const area = element("curve-controls"),
      chart = element("curve-graph");
    area.replaceChildren();
    chart.replaceChildren();
    element("resolved-graph").replaceChildren();
    if (!track) {
      rootPath = undefined;
      element("curve-title").textContent = "Authored curve";
      element("curve-clock").textContent = "";
      area.append(
        documentNode(
          "p",
          "Select a keyed property to inspect its authored curve.",
        ),
      );
      return;
    }
    const routes = resolvedTrackRoutes(history!.document, track);
    const route = routes.find((r) => r.path === rootPath) ?? routes[0];
    rootPath = route?.path;
    const current = { ...track, fps: route?.fps ?? track.fps };
    index = Math.min(index, current.keys.length - 1);
    keyIndex = index;
    element("curve-title").textContent = current.label;
    element("curve-clock").textContent =
      `Authored local key frames · ${current.fps} fps · speed in units/frame${current.spatial ? " · spatial path" : ""}. Resolved expressions, constraints and motion additions are visible in the preview.`;
    const points = trackGraph(current),
      all = points.flatMap((p) => [...p.value, ...p.speed]);
    if (!all.length) {
      area.append(
        documentNode(
          "p",
          "Path geometry keys are shown in lanes; edit native path data in source.",
        ),
      );
      return;
    }
    chart.append(
      curveGraph(points, "Authored value and speed curves in local key frames"),
    );
    const resolved = element("resolved-graph");
    resolved.replaceChildren();
    if (routes.length) {
      const instance = document.createElement("select");
      instance.setAttribute("aria-label", "Resolved property instance");
      routes.forEach((r) =>
        instance.add(new Option(`${r.path} · ${r.fps} fps`, r.path)),
      );
      instance.value = rootPath!;
      instance.onchange = () => {
        rootPath = instance.value;
        graph();
      };
      resolved.append(instance);
      try {
        resolved.append(
          curveGraph(
            resolvedGraph(history!.document, rootPath!, options.evaluation()),
            "Resolved value and speed curves in root composition frames",
          ),
        );
      } catch (error) {
        resolved.append(
          documentNode(
            "p",
            `Resolved graph unavailable: ${error instanceof Error ? error.message : error}`,
          ),
        );
      }
    } else
      resolved.append(
        documentNode(
          "p",
          "No native resolved property instance for this track; the authored curve remains available.",
        ),
      );
    const choose = document.createElement("select");
    choose.id = "edit-key";
    choose.setAttribute("aria-label", "Key to edit");
    current.keys.forEach((key, i) =>
      choose.add(new Option(`Key ${i + 1} · frame ${key.frame}`, String(i))),
    );
    choose.value = String(index);
    choose.onchange = () => graph(Number(choose.value));
    area.append(choose);
    const key = current.keys[index]!;
    if (current.kind === "camera")
      area.append(
        documentNode(
          "p",
          "Native camera x, y and zoom are sampled with Hermite easing and jolts. Edit these source controls directly; property temporal handles do not apply.",
        ),
      );
    if (!["discrete", "path", "camera"].includes(current.kind)) {
      for (const side of ["in", "out"] as const) {
        const handle = key[side],
          ease = input(`${side} ease`, handle?.ease ?? 0.333, 0, 1),
          speed = textInput(
            `${side} speed${current.spatial ? " (arc length)" : ""}`,
            handle?.spatialSpeed ?? handle?.speed ?? "",
          );
        const row = documentNode("div", "");
        row.className = "handle-row";
        row.append(
          ease.label,
          speed.label,
          button(`Apply ${side} handle`, () => {
            const parts = speed.input.value.trim()
              ? speed.input.value.split(",").map(Number)
              : [];
            if (
              (current.kind === "scalar" || current.spatial) &&
              parts.length > 1
            ) {
              report("This handle accepts one speed value");
              return;
            }
            const value = parts.length
              ? current.kind === "scalar" || current.spatial
                ? parts[0]
                : parts
              : undefined;
            void submit(`${current.owner} ${side} handle`, (d) =>
              editTemporalHandle(
                d,
                current,
                index,
                side,
                Number(ease.input.value),
                value,
              ),
            );
          }),
        );
        area.append(row);
      }
      if (index > 0) {
        const bezier = textInput(
          "Segment Bézier x1,y1,x2,y2",
          key.bezier ?? [0.33, 0, 0.67, 1],
        );
        area.append(
          bezier.label,
          button("Apply Bézier", () => {
            const values = bezier.input.value.split(",").map(Number);
            if (values.length !== 4) {
              report("Enter four Bézier values");
              return;
            }
            void submit("Replace segment handles with Bézier", (d) =>
              editSegmentBezier(
                d,
                current,
                index,
                values as [number, number, number, number],
              ),
            );
          }),
        );
        area.append(
          documentNode(
            "small",
            "Applying Bézier replaces this segment’s incoming/outgoing temporal handles and smoothing.",
          ),
        );
        const pad = document.createElementNS(svgNS, "svg");
        pad.setAttribute("viewBox", "0 0 320 180");
        pad.setAttribute("aria-label", "Drag segment Bézier handles");
        pad.style.maxWidth = "420px";
        pad.style.touchAction = "none";
        let values: [number, number, number, number] = [
          ...(key.bezier ?? [0.33, 0, 0.67, 1]),
        ];
        const path = svg("path", {
          fill: "none",
          stroke: "#afc5a1",
          "stroke-width": 2,
        });
        const lines = [
          svg("line", { stroke: "#6d6b5b" }),
          svg("line", { stroke: "#6d6b5b" }),
        ];
        const handles = [0, 1].map((i) =>
          svg("circle", {
            r: 7,
            stroke: "transparent",
            "stroke-width": 24,
            "pointer-events": "all",
            fill: "#e6c989",
            tabindex: 0,
            role: "button",
            "data-bezier-handle": i,
            "aria-label": `Bézier ${i ? "end" : "start"} handle; arrow keys move x, Shift arrow keys move y`,
          }),
        );
        pad.append(...lines, path, ...handles);
        function redraw() {
          const [x1, y1, x2, y2] = values;
          path.setAttribute(
            "d",
            `M24 156 C${24 + x1 * 272} ${156 - y1 * 132},${24 + x2 * 272} ${156 - y2 * 132},296 24`,
          );
          for (let i = 0; i < 2; i++) {
            const x = 24 + values[i * 2]! * 272,
              y = 156 - values[i * 2 + 1]! * 132;
            handles[i]!.setAttribute("cx", String(x));
            handles[i]!.setAttribute("cy", String(y));
            lines[i]!.setAttribute("x1", String(i ? 296 : 24));
            lines[i]!.setAttribute("y1", String(i ? 24 : 156));
            lines[i]!.setAttribute("x2", String(x));
            lines[i]!.setAttribute("y2", String(y));
          }
          bezier.input.value = values
            .map((v) => Number(v.toFixed(4)))
            .join(",");
        }
        async function apply(focusedHandle?: number) {
          const accepted = await submit("Drag segment Bézier handle", (d) =>
            editSegmentBezier(d, current, index, values),
          );
          if (accepted && focusedHandle !== undefined)
            area
              .querySelector<SVGElement>(
                `[data-bezier-handle="${focusedHandle}"]`,
              )
              ?.focus();
        }
        handles.forEach((handle, i) => {
          let dragging = false;
          handle.addEventListener("pointerdown", (event) => {
            if (fieldset.disabled) return;
            const pointer = event as PointerEvent;
            dragging = true;
            handle.setPointerCapture(pointer.pointerId);
          });
          handle.addEventListener("pointermove", (event) => {
            if (!dragging || fieldset.disabled) return;
            const pointer = event as PointerEvent,
              rectangle = pad.getBoundingClientRect();
            values[i * 2] = Math.max(
              0,
              Math.min(
                1,
                (((pointer.clientX - rectangle.left) / rectangle.width) * 320 -
                  24) /
                  272,
              ),
            );
            values[i * 2 + 1] = Math.max(
              -2,
              Math.min(
                3,
                (156 -
                  ((pointer.clientY - rectangle.top) / rectangle.height) *
                    180) /
                  132,
              ),
            );
            redraw();
          });
          handle.addEventListener("pointerup", () => {
            if (dragging && !fieldset.disabled) {
              dragging = false;
              void apply();
            }
          });
          handle.addEventListener("pointercancel", () => {
            dragging = false;
            values = [...(key.bezier ?? [0.33, 0, 0.67, 1])];
            redraw();
          });
          handle.addEventListener("keydown", (event) => {
            if (fieldset.disabled) return;
            const keyboard = event as KeyboardEvent;
            if (
              !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                keyboard.key,
              )
            )
              return;
            keyboard.preventDefault();
            const axis = i * 2 + (keyboard.shiftKey ? 1 : 0),
              delta = ["ArrowLeft", "ArrowDown"].includes(keyboard.key)
                ? -0.01
                : 0.01;
            values[axis] = Math.max(
              keyboard.shiftKey ? -2 : 0,
              Math.min(keyboard.shiftKey ? 3 : 1, values[axis]! + delta),
            );
            redraw();
            void apply(i);
          });
        });
        redraw();
        area.append(pad);
      }
    }
    if (current.kind === "vector" && current.property === "transform.position")
      for (const side of ["spatialIn", "spatialOut"] as const) {
        const tangent = textInput(side, key[side] ?? [0, 0]);
        area.append(
          tangent.label,
          button(`Apply ${side}`, () => {
            const values = tangent.input.value.split(",").map(Number);
            if (values.length !== 2) {
              report("Enter x,y tangent offsets");
              return;
            }
            void submit(side, (d) =>
              editSpatialTangent(
                d,
                current,
                index,
                side,
                values as [number, number],
              ),
            );
          }),
        );
      }
    const code = element<HTMLTextAreaElement>("edited-keys");
    code.value = editedKeysCode(current);
    element<HTMLButtonElement>("copy-keys").onclick = () => {
      void navigator.clipboard
        .writeText(code.value)
        .then(() => {
          message.textContent = "Edited keys copied as code.";
        })
        .catch(report);
    };
  }
  function refresh(next: CompositionDocument) {
    history = next;
    tracks = compositionTracks(history.document);
    track =
      tracks.find((t) => t.id === track?.id) ??
      tracks.find(
        (t) =>
          !selected ||
          (t.scope === selected.scope && t.owner === selected.layer),
      );
    element<HTMLButtonElement>("undo").disabled = !history.canUndo;
    element<HTMLButtonElement>("redo").disabled = !history.canRedo;
    element("document-state").textContent = history.dirty
      ? "Unsaved motion edits"
      : "Source unchanged";
    layerRows();
    keyLanes();
    graph();
    element<HTMLPreElement>("source-motion").textContent = JSON.stringify(
      {
        expressions: history.document.expressions,
        drivers: history.document.drivers,
        periodic: history.document.periodic,
        behaviours: history.document.behaviours,
        signals: history.document.signals,
        constraints: history.document.constraints,
        textAnimators: history.document.textAnimators,
      },
      null,
      2,
    );
  }
  for (const [id, direction] of [
    ["undo", "undo"],
    ["redo", "redo"],
  ] as const)
    element<HTMLButtonElement>(id).onclick = () => {
      const proposal = history?.[direction]();
      if (proposal)
        void options.propose(proposal).then((ok) => {
          if (ok) refresh(history!);
        });
    };
  element<HTMLButtonElement>("all-properties").onclick = () => {
    selected = undefined;
    track = undefined;
    rootPath = undefined;
    keyIndex = 0;
    options.selected(undefined);
    if (history) refresh(history);
  };
  element<HTMLButtonElement>("apply-visibility").onclick = () => {
    void submit("Apply view visibility", (d) => {
      for (const [path, state] of visibility)
        Object.assign(
          readJsonPath(d, JSON.parse(path)) as CompositionLayer,
          state,
        );
    }).then((ok) => {
      if (ok) {
        visibility.clear();
        layerRows();
      }
    });
  };
  element<HTMLButtonElement>("reset-visibility").onclick = () => {
    const previous = new Map(visibility);
    visibility.clear();
    if (history)
      void options.view(history.document).then((ok) => {
        if (!ok)
          for (const [key, value] of previous) visibility.set(key, value);
        layerRows();
      });
  };
  return {
    fieldset,
    refresh,
    viewDocument,
    appliedView() {
      visibility.clear();
      if (history) refresh(history);
    },
    frame(
      frame: number,
      composition: Composition,
      evaluation: EvaluationOptions,
    ) {
      const output = element("resolved-value");
      if (!rootPath) {
        output.textContent =
          "Select a native property instance to inspect its resolved value.";
        return;
      }
      try {
        output.textContent = `Root frame ${frame} · ${rootPath} = ${JSON.stringify(evaluateProperty(composition, rootPath, frame, evaluation))}`;
      } catch (error) {
        output.textContent =
          error instanceof Error ? error.message : String(error);
      }
    },
    reset(next: CompositionDocument) {
      message.textContent = "";
      visibility.clear();
      selected = undefined;
      track = undefined;
      options.selected(undefined);
      refresh(next);
    },
  };
}
function documentNode<K extends keyof HTMLElementTagNameMap>(
  name: K,
  text: string,
) {
  const node = document.createElement(name);
  node.textContent = text;
  return node;
}
function textInput(name: string, value: unknown) {
  const label = documentNode("label", name + " "),
    input = document.createElement("input");
  input.value = Array.isArray(value) ? value.join(",") : String(value);
  input.setAttribute("aria-label", name);
  label.append(input);
  return { label, input };
}
function input(name: string, value: number, min: number, max: number) {
  const field = textInput(name, value);
  field.input.type = "number";
  field.input.min = String(min);
  field.input.max = String(max);
  field.input.step = "0.01";
  return field;
}
