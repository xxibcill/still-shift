import {
  MechanismCameraSchema,
  MechanismTransformSchema,
  COMPOSITION_LIMITS,
  type Composition,
  type CompositionLayer,
  type Native3DLayer,
} from "../../../packages/scene-contract/src/index.ts";
import type { EvaluationOptions } from "../../../packages/renderer-core/src/composition/evaluate/index.ts";
import { native3DOverridesKey } from "../../../packages/renderer-core/src/native3d/prepare.ts";
import type { PreparedNative3DVariant } from "../../../packages/renderer-core/src/native3d/types.ts";
import {
  CompositionEditError,
  readJsonPath,
  type JsonPath,
} from "./composition-document.ts";

export type NativeInspectorContext = {
  selected: CompositionLayer;
  controller: Native3DLayer;
  controllerPath: JsonPath;
  scope: string | null;
  variant: PreparedNative3DVariant;
};
function fail(code: string, path: JsonPath, message: string): never {
  throw new CompositionEditError([
    { code, path: path.map(String).join("."), message, severity: "error" },
  ]);
}
/** Only declared IDs in the selected owning scope may identify physical data. */
export function nativeInspectorContext(
  document: Composition,
  path: JsonPath,
  evaluation: EvaluationOptions,
): NativeInspectorContext | undefined {
  const selected = readJsonPath(document, path) as CompositionLayer,
    scopePath = path.slice(0, -2),
    scope = readJsonPath(document, scopePath) as {
      id: string;
      layers: CompositionLayer[];
    };
  let owner: CompositionLayer | undefined = selected;
  const seen = new Set<string>();
  let controller: Native3DLayer | undefined;
  while (owner && !seen.has(owner.id)) {
    seen.add(owner.id);
    if (owner.type === "native3d") {
      controller = owner;
      break;
    }
    const controllerId = owner.native3D?.sceneLayer ?? owner.overlayAfter;
    if (controllerId) {
      const candidate = scope.layers.find((layer) => layer.id === controllerId);
      if (candidate?.type === "native3d") {
        controller = candidate;
        break;
      }
    }
    owner = owner.parent
      ? scope.layers.find((layer) => layer.id === owner!.parent)
      : undefined;
  }
  if (!controller) return;
  const controllerPath = [
      ...scopePath,
      "layers",
      scope.layers.indexOf(controller),
    ],
    prepared = evaluation.preparedNative3D?.[controller.asset];
  if (!prepared)
    fail(
      "comp-native3d-not-ready",
      controllerPath,
      "Physical inspection requires the accepted preview's prepared native catalogue",
    );
  const overrides = {
      ...(controller.partOverrides
        ? { partOverrides: controller.partOverrides }
        : {}),
      ...(controller.materialOverrides
        ? { materialOverrides: controller.materialOverrides }
        : {}),
    },
    key = prepared.variantKeysByOverrides[native3DOverridesKey(overrides)],
    variant = key ? prepared.variants[key] : undefined;
  if (!variant)
    fail(
      "comp-native3d-not-ready",
      controllerPath,
      "Current physical overrides have not been prepared",
    );
  return {
    selected,
    controller,
    controllerPath,
    scope: scopePath.length ? scope.id : null,
    variant,
  };
}
export type NativeInspectorEdit =
  | { kind: "camera-fov"; key: number | "base"; value: number }
  | {
      kind: "part-translation";
      part: string;
      position: [number, number, number];
    }
  | {
      kind: "material-pbr";
      material: string;
      metalness: number;
      roughness: number;
    }
  | { kind: "label-text"; state: number | "base"; text: string };
/** Mutates only the recipe draft. Proposal validation and async preparation remain the admission boundary. */
export function editNativeInspector(
  document: Composition,
  path: JsonPath,
  evaluation: EvaluationOptions,
  edit: NativeInspectorEdit,
): void {
  const context = nativeInspectorContext(document, path, evaluation);
  if (!context)
    fail(
      "comp-native3d-source",
      path,
      "Select a native controller or one of its bound annotations",
    );
  const { controller, controllerPath, variant, selected } = context;
  if (edit.kind === "camera-fov") {
    const field =
      edit.key === "base"
        ? [...controllerPath, "camera", "fovDegrees"]
        : [...controllerPath, "cameraKeys", edit.key, "fovDegrees"];
    if (!Number.isFinite(edit.value) || edit.value < 1 || edit.value > 179)
      fail(
        "comp-native3d-source",
        field,
        "Camera field of view must be finite and between 1 and 179 degrees",
      );
    if (edit.key === "base") {
      controller.camera = MechanismCameraSchema.parse(
        controller.camera ?? variant.source.camera,
      );
      controller.camera.fovDegrees = edit.value;
    } else {
      if (!Number.isInteger(edit.key) || !controller.cameraKeys?.[edit.key])
        fail("comp-native3d-source", field, "Select a declared camera key");
      controller.cameraKeys[edit.key]!.fovDegrees = edit.value;
    }
  } else if (edit.kind === "part-translation") {
    const field = [
        ...controllerPath,
        "partOverrides",
        edit.part,
        "transform",
        "position",
      ],
      part = variant.source.parts.find((value) => value.id === edit.part);
    if (!part)
      fail("comp-native3d-source", field, "Select a declared physical part ID");
    if (
      edit.position.length !== 3 ||
      edit.position.some(
        (value) => !Number.isFinite(value) || Math.abs(value) > 1_000_000,
      )
    )
      fail(
        "comp-native3d-source",
        field,
        "Part translation requires three finite coordinates within the source bounds",
      );
    controller.partOverrides ??= {};
    const override = controller.partOverrides[edit.part] ?? {},
      transform = MechanismTransformSchema.parse(
        override.transform ?? part.transform,
      );
    transform.position = [...edit.position];
    controller.partOverrides[edit.part] = { ...override, transform };
  } else if (edit.kind === "material-pbr") {
    const field = [...controllerPath, "materialOverrides", edit.material];
    if (
      !variant.source.geometry.materials.some(
        (value) => value.id === edit.material,
      )
    )
      fail(
        "comp-native3d-material",
        field,
        "Select a declared physical material ID",
      );
    for (const name of ["metalness", "roughness"] as const)
      if (!Number.isFinite(edit[name]) || edit[name] < 0 || edit[name] > 1)
        fail(
          "comp-native3d-material",
          [...field, name],
          "PBR values must be finite and between zero and one",
        );
    controller.materialOverrides ??= {};
    controller.materialOverrides[edit.material] = {
      ...controller.materialOverrides[edit.material],
      metalness: edit.metalness,
      roughness: edit.roughness,
    };
  } else {
    if (selected.type !== "text")
      fail(
        "comp-native3d-source",
        [...path, "text"],
        "Select a native-bound text layer",
      );
    const field =
      edit.state === "base"
        ? [...path, "text"]
        : [...path, "states", edit.state];
    if (
      !edit.text.length ||
      edit.text.length > COMPOSITION_LIMITS.maxTextLength
    )
      fail(
        "comp-native3d-source",
        field,
        "Label copy must contain 1 to 4000 characters",
      );
    if (edit.state === "base") selected.text = edit.text;
    else {
      if (!Number.isInteger(edit.state) || !selected.states?.[edit.state])
        fail(
          "comp-native3d-source",
          field,
          "Select a declared label text state",
        );
      selected.states[edit.state] = edit.text;
    }
  }
}
