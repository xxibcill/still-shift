import type { Composition } from "../../../packages/scene-contract/src/index.ts";
import {
  evaluateComp,
  type EvaluatedLayerTree,
  type EvaluationOptions,
} from "../../../packages/renderer-core/src/composition/evaluate/index.ts";
import {
  nativeInspectorContext,
  editNativeInspector,
  type NativeInspectorContext,
  type NativeInspectorEdit,
} from "./composition-native-edit.ts";
import type { JsonPath } from "./composition-document.ts";

export type NativeInspectorControlSelection = {
  camera?: number;
  part?: string;
  material?: string;
  anchor?: string;
  label?: number;
};
type Options = {
  document: () => Composition;
  evaluation: () => EvaluationOptions;
  path: JsonPath;
  frame: number;
  selection: NativeInspectorControlSelection;
  submit: (
    label: string,
    change: (document: Composition) => void,
  ) => Promise<boolean>;
  report: (error: unknown) => void;
};
/** Small declared-ID editor; ready catalogues are read transiently from the accepted preview. */
export function nativeInspectorControls(area: HTMLElement, options: Options) {
  let context: NativeInspectorContext | undefined;
  try {
    context = nativeInspectorContext(
      options.document(),
      options.path,
      options.evaluation(),
    );
  } catch (error) {
    options.report(error);
    return;
  }
  if (!context) return;
  const { controller, variant, selected } = context,
    panel = document.createElement("section"),
    title = document.createElement("h3"),
    inspection = document.createElement("pre");
  panel.id = "native-inspector";
  panel.setAttribute("aria-label", "Native physical controls");
  title.textContent = `Native scene · ${controller.id}`;
  inspection.id = "native-inspection";
  inspection.setAttribute("aria-label", "Declared native physical metadata");
  panel.append(title, inspection);
  area.append(panel);
  const addSelect = (name: string, entries: readonly string[]) => {
    const label = document.createElement("label"),
      input = document.createElement("select");
    label.textContent = name + " ";
    input.setAttribute("aria-label", name);
    entries.forEach((entry) => input.add(new Option(entry, entry)));
    label.append(input);
    panel.append(label);
    return input;
  };
  const addNumber = (name: string, value: number, min: number, max: number) => {
    const label = document.createElement("label"),
      input = document.createElement("input");
    label.textContent = name + " ";
    input.type = "number";
    input.step = "any";
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.setAttribute("aria-label", name);
    label.append(input);
    panel.append(label);
    return input;
  };
  const numberValue = (input: HTMLInputElement) =>
    input.value.trim() ? Number(input.value) : Number.NaN;
  const apply = (label: string, edit: () => NativeInspectorEdit) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = () => {
      void options.submit(label, (draft) =>
        editNativeInspector(draft, options.path, options.evaluation(), edit()),
      );
    };
    panel.append(button);
  };
  const camera = addSelect("Native camera sample", [
    "base",
    ...(controller.cameraKeys ?? []).map(
      (key, index) => `key ${index} · source frame ${key.frame}`,
    ),
  ]);
  camera.selectedIndex =
    options.selection.camera !== undefined &&
    options.selection.camera < camera.options.length
      ? options.selection.camera
      : controller.cameraKeys?.length
        ? 1
        : 0;
  const fov = addNumber(
    "Native camera FOV",
    camera.selectedIndex === 0
      ? (controller.camera?.fovDegrees ?? variant.source.camera.fovDegrees)
      : (controller.cameraKeys![camera.selectedIndex - 1]!.fovDegrees ??
          controller.camera?.fovDegrees ??
          variant.source.camera.fovDegrees),
    1,
    179,
  );
  const part = addSelect(
      "Native part",
      variant.source.parts.map((value) => value.id),
    ),
    position = ["x", "y", "z"].map((axis, index) =>
      addNumber(
        `Native part ${axis}`,
        variant.source.parts[0]!.transform.position[index]!,
        -1_000_000,
        1_000_000,
      ),
    ),
    material = addSelect(
      "Native material",
      variant.source.geometry.materials.map((value) => value.id),
    ),
    metalness = addNumber(
      "Native material metalness",
      variant.source.geometry.materials[0]!.metalness,
      0,
      1,
    ),
    roughness = addNumber(
      "Native material roughness",
      variant.source.geometry.materials[0]!.roughness,
      0,
      1,
    ),
    anchor = addSelect(
      "Native anchor",
      variant.source.anchors.map((value) => value.id),
    );
  for (const [select, key] of [
    [part, "part"],
    [material, "material"],
    [anchor, "anchor"],
  ] as const) {
    const value = options.selection[key];
    if (
      value &&
      Array.from(select.options).some((option) => option.value === value)
    )
      select.value = value;
  }
  position.forEach((input, index) => {
    input.value = String(
      variant.source.parts.find((value) => value.id === part.value)!.transform
        .position[index],
    );
  });
  const selectedMaterial = variant.source.geometry.materials.find(
    (value) => value.id === material.value,
  )!;
  metalness.value = String(selectedMaterial.metalness);
  roughness.value = String(selectedMaterial.roughness);
  let frame = options.frame;
  let labelSelect: HTMLSelectElement | undefined,
    labelText: HTMLTextAreaElement | undefined,
    chooseCurrentLabel = true;
  function update() {
    try {
      const current = nativeInspectorContext(
        options.document(),
        options.path,
        options.evaluation(),
      );
      if (!current) return;
      const snapshots: unknown[] = [],
        textSamples: {
          scope: string;
          state?: number;
          stateFrom?: number;
          stateMix?: number;
          visible: boolean;
        }[] = [];
      const collect = (
        tree: EvaluatedLayerTree,
        route = options.document().id,
      ) => {
        for (const state of tree.layers) {
          if (
            tree.id === (current.scope ?? options.document().id) &&
            state.id === current.selected.id &&
            state.layer.type === "text"
          )
            textSamples.push({
              scope: state.nativeFrame?.scope ?? route,
              ...(state.state !== undefined ? { state: state.state } : {}),
              ...(state.stateFrom !== undefined
                ? { stateFrom: state.stateFrom }
                : {}),
              ...(state.stateMix !== undefined
                ? { stateMix: state.stateMix }
                : {}),
              visible: state.visible,
            });
          if (
            tree.id === (current.scope ?? options.document().id) &&
            state.nativeFrame?.controller === current.controller.id &&
            state.nativeFrame.asset === current.controller.asset &&
            state.layer.type === "native3d"
          )
            snapshots.push({
              scope: state.nativeFrame.scope,
              sourceFrame: state.nativeFrame.sourceFrame,
              viewport: state.nativeFrame.viewport,
              sourceKey: state.nativeFrame.sourceKey,
              camera: state.nativeFrame.frame.camera,
              part: state.nativeFrame.frame.parts[part.value],
              anchor: state.nativeFrame.anchors[anchor.value],
            });
          if (state.precomp) collect(state.precomp, `${route}/${state.id}`);
        }
      };
      collect(evaluateComp(options.document(), frame, options.evaluation()));
      if (
        chooseCurrentLabel &&
        labelSelect &&
        labelText &&
        current.selected.type === "text"
      ) {
        const state = textSamples[0]?.state;
        labelSelect.selectedIndex =
          options.selection.label !== undefined &&
          options.selection.label < labelSelect.options.length
            ? options.selection.label
            : state !== undefined && current.selected.states?.[state]
              ? state + 1
              : 0;
        labelText.value =
          labelSelect.selectedIndex === 0
            ? current.selected.text
            : current.selected.states![labelSelect.selectedIndex - 1]!;
        options.selection.label = labelSelect.selectedIndex;
        chooseCurrentLabel = false;
      }
      inspection.textContent = JSON.stringify(
        {
          method: "pure-native-evaluator-current-ready-catalogue",
          controller: current.controller.id,
          asset: current.controller.asset,
          sourceKey: current.variant.sourceKey,
          sourceSha256: current.variant.sourceSha256,
          geometrySha256: current.variant.geometrySha256,
          sourceUnits: current.variant.source.units,
          part: current.variant.source.parts.find(
            (value) => value.id === part.value,
          ),
          material: current.variant.source.geometry.materials.find(
            (value) => value.id === material.value,
          ),
          anchor: current.variant.source.anchors.find(
            (value) => value.id === anchor.value,
          ),
          camera: current.controller.camera ?? current.variant.source.camera,
          cameraKeys: current.controller.cameraKeys,
          ...(current.selected.type === "text"
            ? {
                label: {
                  id: current.selected.id,
                  text: current.selected.text,
                  states: current.selected.states,
                },
              }
            : {}),
          evaluatedFrames: snapshots,
          textSamples,
        },
        null,
        2,
      );
    } catch (error) {
      options.report(error);
    }
  }
  camera.onchange = () => {
    options.selection.camera = camera.selectedIndex;
    fov.value = String(
      camera.selectedIndex === 0
        ? (controller.camera?.fovDegrees ?? variant.source.camera.fovDegrees)
        : (controller.cameraKeys![camera.selectedIndex - 1]!.fovDegrees ??
            controller.camera?.fovDegrees ??
            variant.source.camera.fovDegrees),
    );
    update();
  };
  part.onchange = () => {
    options.selection.part = part.value;
    const value = variant.source.parts.find(
      (value) => value.id === part.value,
    )!;
    position.forEach((input, index) => {
      input.value = String(value.transform.position[index]);
    });
    update();
  };
  material.onchange = () => {
    options.selection.material = material.value;
    const value = variant.source.geometry.materials.find(
      (value) => value.id === material.value,
    )!;
    metalness.value = String(value.metalness);
    roughness.value = String(value.roughness);
    update();
  };
  anchor.onchange = () => {
    options.selection.anchor = anchor.value;
    update();
  };
  apply("Apply native camera FOV", () => ({
    kind: "camera-fov",
    key: camera.selectedIndex === 0 ? "base" : camera.selectedIndex - 1,
    value: numberValue(fov),
  }));
  apply("Apply native part translation", () => ({
    kind: "part-translation",
    part: part.value,
    position: position.map(numberValue) as [number, number, number],
  }));
  apply("Apply native material", () => ({
    kind: "material-pbr",
    material: material.value,
    metalness: numberValue(metalness),
    roughness: numberValue(roughness),
  }));
  if (selected.type === "text") {
    labelSelect = addSelect("Native label copy", [
      "base",
      ...(selected.states ?? []).map((_, index) => `state ${index}`),
    ]);
    const label = document.createElement("label"),
      text = document.createElement("textarea"),
      note = document.createElement("p");
    labelText = text;
    labelSelect.onchange = () => {
      chooseCurrentLabel = false;
      options.selection.label = labelSelect!.selectedIndex;
      text.value =
        labelSelect!.selectedIndex === 0
          ? selected.text
          : selected.states![labelSelect!.selectedIndex - 1]!;
      update();
    };
    label.textContent = "Native label text ";
    text.setAttribute("aria-label", "Native label text");
    text.value = selected.text;
    text.maxLength = 4000;
    label.append(text);
    panel.append(label);
    note.textContent =
      "Edits only the selected declared copy. State timing, corrections and reading declarations stay authored; motion checks may require their context to be updated in source.";
    panel.append(note);
    apply("Apply native label text", () => ({
      kind: "label-text",
      state:
        labelSelect!.selectedIndex === 0
          ? "base"
          : labelSelect!.selectedIndex - 1,
      text: text.value,
    }));
  }
  update();
  return (value: number) => {
    frame = value;
    update();
  };
}
