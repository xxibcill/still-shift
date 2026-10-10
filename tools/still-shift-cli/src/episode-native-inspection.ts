import { z } from "zod";
import {
  AnimationEngineError,
  MechanismIdSchema,
} from "@still-shift/scene-contract";
import type { LoadedMechanismEpisode } from "../../../packages/animation-engine/src/mechanism/io.ts";
import type { MechanismReceiptRow } from "../../../packages/animation-engine/src/mechanism/protocol.ts";

export const EPISODE_NATIVE_INSPECTION_VERSION =
  "mechanism-native-inspection-1";
export const EPISODE_NATIVE_INSPECTION_SELECTORS = [
  "source",
  "parts",
  "anchors",
  "materials",
  "cameras",
  "controls",
  "all",
] as const;

/** Selection only; returned rows retain the strict bounded command receipt schema. */
export const EpisodeNativeInspectionSelectionSchema = z
  .object({
    version: z
      .literal(EPISODE_NATIVE_INSPECTION_VERSION)
      .default(EPISODE_NATIVE_INSPECTION_VERSION),
    native: z.enum(EPISODE_NATIVE_INSPECTION_SELECTORS),
    shot: MechanismIdSchema.optional(),
    part: MechanismIdSchema.optional(),
    anchor: MechanismIdSchema.optional(),
    material: MechanismIdSchema.optional(),
    rig: MechanismIdSchema.optional(),
  })
  .strict()
  .superRefine((selection, context) => {
    for (const [field, category] of [
      ["part", "parts"],
      ["anchor", "anchors"],
      ["material", "materials"],
      ["rig", "controls"],
    ] as const) {
      if (
        selection[field] !== undefined &&
        selection.native !== category &&
        selection.native !== "all"
      )
        context.addIssue({
          code: "custom",
          path: [field],
          message: `--${field} requires --native ${category} or all`,
        });
    }
    if (
      selection.shot !== undefined &&
      !["cameras", "controls", "all"].includes(selection.native)
    )
      context.addIssue({
        code: "custom",
        path: ["shot"],
        message: "--shot requires --native cameras, controls or all",
      });
  });
export type EpisodeNativeInspectionSelection = z.infer<
  typeof EpisodeNativeInspectionSelectionSchema
>;

function selectionError(
  message: string,
  field: string,
  code = "mechanism-inspect-selection",
): never {
  throw new AnimationEngineError("SCENE_INVALID", message, {
    stage: "episode-command",
    diagnosticCode: code,
    path: `--${field}`,
    nextAction:
      "episode discover; episode inspect --input <episode.json> --native all --limit 100",
  });
}
export function parseEpisodeNativeInspectionSelection(
  flags: ReadonlyMap<string, string>,
): EpisodeNativeInspectionSelection | undefined {
  if (!flags.has("native")) {
    for (const field of ["part", "anchor", "material", "rig"])
      if (flags.has(field))
        selectionError(
          `--${field} requires an explicit --native selection`,
          field,
        );
    return undefined;
  }
  const value = Object.fromEntries(
    ["native", "shot", "part", "anchor", "material", "rig"]
      .filter((field) => flags.has(field))
      .map((field) => [field, flags.get(field)]),
  );
  const parsed = EpisodeNativeInspectionSelectionSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    selectionError(issue.message, String(issue.path[0] ?? "native"));
  }
  return parsed.data;
}
function vector(
  prefix: string,
  values: readonly [number, number, number],
): MechanismReceiptRow {
  return {
    [`${prefix}X`]: values[0],
    [`${prefix}Y`]: values[1],
    [`${prefix}Z`]: values[2],
  };
}
function selectDeclared<T extends { id: string }>(
  values: readonly T[],
  id: string | undefined,
  field: string,
): readonly T[] {
  if (id === undefined) return values;
  const selected = values.find((value) => value.id === id);
  if (!selected)
    selectionError(
      `Unknown original-scene ${field} ${id}`,
      field,
      "mechanism-inspect-reference",
    );
  return [selected];
}

/** Authored metadata, never a prepared recipe or an actual renderer observation. */
export function inspectEpisodeNativeMetadata(
  loaded: LoadedMechanismEpisode,
  selection: EpisodeNativeInspectionSelection,
): {
  summary: MechanismReceiptRow;
  items: MechanismReceiptRow[];
} {
  const { scene, episode } = loaded;
  const source = episode.dependencies.find(
    (dependency) => dependency.id === episode.scene,
  )!;
  const has = (category: string) =>
    selection.native === category || selection.native === "all";
  const parts = selectDeclared(scene.parts, selection.part, "part"),
    anchors = selectDeclared(scene.anchors, selection.anchor, "anchor"),
    materials = selectDeclared(
      scene.geometry.materials,
      selection.material,
      "material",
    ),
    rigs = selectDeclared(scene.rigs, selection.rig, "rig");
  const shots =
    selection.shot === undefined
      ? episode.shots
      : episode.shots.filter((shot) => shot.id === selection.shot);
  if (shots.length === 0)
    selectionError(
      `Unknown episode shot ${selection.shot}`,
      "shot",
      "mechanism-shot-reference",
    );
  const items: MechanismReceiptRow[] = [];
  const originalScope = "original-scene",
    shotScope = "episode-shot-with-source-defaults";
  if (has("source"))
    items.push({
      kind: "native-source",
      scope: originalScope,
      id: scene.id,
      schemaVersion: scene.schemaVersion,
      dependency: episode.scene,
      sourceSha256: source.sha256,
      geometrySha256: scene.geometrySha256,
      coordinateSystem: scene.coordinateSystem,
      units: scene.units.kind,
      scaleToMeters: scene.units.scaleToMeters,
      seed: scene.seed,
      parts: scene.parts.length,
      anchors: scene.anchors.length,
      materials: scene.geometry.materials.length,
      meshes: scene.geometry.meshes.length,
      rigs: scene.rigs.length,
    });
  if (has("parts"))
    for (const part of parts)
      items.push({
        kind: "native-part",
        scope: originalScope,
        id: part.id,
        parent: part.parent ?? null,
        visible: part.visible,
        ...vector("position", part.transform.position),
        ...vector("rotation", part.transform.rotation),
        ...vector("scale", part.transform.scale),
        ...vector("pivot", part.transform.pivot),
        rotationUnit: "radians-euler-xyz",
        meshCount: scene.geometry.meshes.filter(
          (mesh) => mesh.partId === part.id,
        ).length,
      });
  if (has("anchors"))
    for (const anchor of anchors)
      items.push({
        kind: "native-anchor",
        scope: originalScope,
        id: anchor.id,
        part: anchor.part,
        role: anchor.role,
        ...vector("local", anchor.position),
      });
  if (has("materials"))
    for (const material of materials)
      items.push({
        kind: "native-material",
        scope: originalScope,
        id: material.id,
        color: material.color,
        roughness: material.roughness,
        metalness: material.metalness,
        opacity: material.opacity,
        alphaMode: material.alphaMode,
        alphaCutoff: material.alphaCutoff,
        side: material.side,
        emissive: material.emissive,
        emissiveIntensity: material.emissiveIntensity,
        textureKind: material.texture?.kind ?? null,
        textureSeed: material.texture?.seed ?? null,
      });
  if (has("cameras") || has("controls"))
    for (const shot of shots) {
      const camera = shot.camera ?? scene.camera;
      items.push({
        kind: "native-shot",
        scope: shotScope,
        id: shot.id,
        purpose: shot.purpose,
        startFrame: shot.startFrame,
        endFrameExclusive: shot.endFrameExclusive,
        seed: scene.seed,
        seedOrigin: "original-scene",
        hiddenPartCount: shot.hiddenParts.length,
        frameDomain: "absolute-source-frame",
      });
      for (const id of shot.hiddenParts)
        items.push({
          kind: "native-shot-hidden-part",
          scope: shotScope,
          shot: shot.id,
          part: id,
        });
      if (has("cameras")) {
        items.push({
          kind: "native-shot-camera",
          scope: shotScope,
          shot: shot.id,
          origin:
            shot.camera === undefined
              ? "original-scene-camera"
              : "episode-shot-camera",
          ...vector("position", camera.position),
          ...vector("target", camera.target),
          ...vector("up", camera.up),
          fovDegrees: camera.fovDegrees,
          near: camera.near,
          far: camera.far,
          keyCount: shot.cameraKeys?.length ?? 0,
        });
        for (const [index, key] of (shot.cameraKeys ?? []).entries())
          items.push({
            kind: "native-camera-key",
            scope: shotScope,
            shot: shot.id,
            index,
            frame: key.frame,
            easing: key.easing,
            ...vector("position", key.position),
            ...vector("target", key.target),
            fovDegrees: key.fovDegrees ?? camera.fovDegrees,
            fovOrigin:
              key.fovDegrees === undefined
                ? "effective-base-camera"
                : "episode-camera-key",
          });
      }
      if (has("controls"))
        for (const rig of rigs) {
          const control = shot.controls[rig.id];
          const keys =
            control?.travel !== undefined
              ? []
              : (control?.travelKeys ?? rig.travelKeys);
          const travelOrigin =
            control?.travel !== undefined
              ? "episode-control-value"
              : control?.travelKeys !== undefined
                ? "episode-control-keys"
                : "original-rig-keys";
          items.push({
            kind: "native-rig-control",
            scope: shotScope,
            shot: shot.id,
            id: rig.id,
            type: rig.type,
            rootPart: rig.rootPart,
            hookPart: rig.hookPart,
            bladePart: rig.bladePart,
            innerFaceAnchor: rig.innerFaceAnchor,
            outerFaceAnchor: rig.outerFaceAnchor,
            thickness: rig.thickness,
            contactDatum: rig.contactDatum,
            travel: control?.travel ?? null,
            travelOrigin,
            keyCount: keys.length,
            contactMode: control?.contactMode ?? rig.contactMode,
            contactModeOrigin:
              control?.contactMode === undefined
                ? "original-rig"
                : "episode-control",
          });
          for (const [index, key] of keys.entries())
            items.push({
              kind: "native-control-key",
              scope: shotScope,
              shot: shot.id,
              rig: rig.id,
              index,
              frame: key.frame,
              value: key.value,
              easing: key.easing,
              origin: travelOrigin,
            });
        }
    }
  return {
    summary: {
      nativeInspectionVersion: EPISODE_NATIVE_INSPECTION_VERSION,
      nativeSelection: selection.native,
      nativeSourceScope: originalScope,
      nativeShotScope: shotScope,
      nativeSourceSha256: source.sha256,
      nativeUnits: scene.units.kind,
      nativeScaleToMeters: scene.units.scaleToMeters,
      savedRecipeScope: "unassessed",
      nativeExecution: "unassessed",
    },
    items,
  };
}
