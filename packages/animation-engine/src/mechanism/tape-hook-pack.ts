import { describeMechanismPackCameras } from "./camera-descriptions.ts";
import { createMechanismPrimitiveMesh } from "./primitive-mesh.ts";
import { offsetPackMesh } from "./pack-support.ts";
import { z } from "zod";
import { createHash } from "node:crypto";
import { Matrix4, Vector3 } from "three";
import {
  MechanismSceneV2Schema,
  MechanismPackDocumentSchema,
  MechanismPackMetadataReceiptSchema,
  MechanismPackReferenceSchema,
  MechanismTransformSchema,
  type MechanismSceneV2,
  type MechanismPackMetadataReceipt,
  type MechanismFrameResultV2,
  type MechanismFrameRequestV2,
} from "@still-shift/scene-contract";
import { canonicalMechanismJson } from "../../../renderer-core/src/mechanism/canonical.ts";
import { MechanismEvaluationErrorV2 } from "../../../renderer-core/src/mechanism/types-v2.ts";
import { prepareMechanismSceneV2 } from "../../../renderer-core/src/mechanism/prepare-v2.ts";
import { evaluateMechanismFrameV2 } from "../../../renderer-core/src/mechanism/evaluate-v2.ts";
import { MechanismPackInvariantError } from "./pack-invariant.ts";
export { MechanismPackInvariantError } from "./pack-invariant.ts";
export type { MechanismPackInvariantLocation } from "./pack-invariant.ts";
import { createTapeHookScene } from "./tape-hook.ts";
import {
  createTapeHookMaterials,
  TAPE_HOOK_RIVET_MESH_IDS,
} from "./geometry.ts";

export const TapeHookPackParametersSchema = z
  .object({
    hookThickness: z.number().finite().min(0.04).max(0.35).default(0.18),
    bladeLength: z.number().finite().min(4).max(20).default(10),
    bladeWidth: z.number().finite().min(1).max(3).default(2),
  })
  .strict();
export const TapeHookPackInputSchema = z
  .object({
    parameters: TapeHookPackParametersSchema.default({
      hookThickness: 0.18,
      bladeLength: 10,
      bladeWidth: 2,
    }),
    mount: MechanismTransformSchema.optional(),
    style: z
      .object({
        steelColor: z
          .string()
          .regex(/^#[\da-f]{6}$/i)
          .optional(),
        steelRoughness: z.number().finite().min(0).max(1).optional(),
        steelMetalness: z.number().finite().min(0).max(1).optional(),
      })
      .strict()
      .optional(),
    expectedPack: MechanismPackReferenceSchema.optional(),
  })
  .strict();
export type TapeHookPackParameters = z.infer<
  typeof TapeHookPackParametersSchema
>;
const hash = (value: unknown) =>
  `sha256:${createHash("sha256").update(canonicalMechanismJson(value)).digest("hex")}`;
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function tapeScene(
  parameters: TapeHookPackParameters,
  mount?: z.infer<typeof MechanismTransformSchema>,
  style?: z.infer<typeof TapeHookPackInputSchema>["style"],
) {
  const legacy = createTapeHookScene(parameters),
    geometry = {
      schemaVersion: "solid-geometry-1",
      meshes: legacy.geometry.meshes.map((mesh) => {
        if (mesh.id !== "contact-board" && mesh.id !== "contact-wall")
          return mesh;
        const front = parameters.bladeWidth / 4;
        const isBoard = mesh.id === "contact-board";
        const back = isBoard ? -1.6 : -3.5;
        return offsetPackMesh(
          createMechanismPrimitiveMesh({
            id: mesh.id,
            partId: mesh.partId,
            materialId: mesh.materialId,
            kind: "rounded-box",
            size: [isBoard ? 9 : 2, isBoard ? 2.2 : 7, front - back],
            radius: 0,
          }),
          [isBoard ? 4.5 : -1, isBoard ? 0.71 : 2, (front + back) / 2],
        );
      }),
      materials: createTapeHookMaterials({
        ...(style?.steelColor !== undefined
          ? { steelColor: style.steelColor }
          : {}),
        ...(style?.steelRoughness !== undefined
          ? { steelRoughness: style.steelRoughness }
          : {}),
        ...(style?.steelMetalness !== undefined
          ? { steelMetalness: style.steelMetalness }
          : {}),
      }),
    };
  const h = parameters.hookThickness;
  const anchors = legacy.anchors.map((anchor) => ({
    id: anchor.id,
    role:
      anchor.id === "hook.innerFace" || anchor.id === "hook.outerFace"
        ? "contact"
        : "proof-target",
    source: {
      kind: "part-local",
      part: anchor.part,
      position:
        anchor.id === "hook.innerFace" || anchor.id === "hook.outerFace"
          ? [anchor.position[0], anchor.position[1], parameters.bladeWidth / 4]
          : anchor.position,
    },
  }));
  anchors.push(
    {
      id: "board.contact",
      role: "contact",
      source: {
        kind: "part-local",
        part: "board",
        position: [0, 1.25, parameters.bladeWidth / 4],
      },
    },
    {
      id: "wall.contact",
      role: "contact",
      source: {
        kind: "part-local",
        part: "wall",
        position: [0, 1.25, parameters.bladeWidth / 4],
      },
    },
    {
      id: "model.origin",
      role: "proof-target",
      source: { kind: "part-local", part: "model", position: [0, 0, 0] },
    },
    {
      id: "rivet.one.mount",
      role: "proof-target",
      source: { kind: "part-local", part: "blade", position: [0.72, 2.005, 0] },
    },
    {
      id: "rivet.two.mount",
      role: "proof-target",
      source: { kind: "part-local", part: "blade", position: [1.48, 2.005, 0] },
    },
  );
  return MechanismSceneV2Schema.parse({
    schemaVersion: "mechanism-scene-2",
    id: "tape-hook-pack",
    coordinateSystem: legacy.coordinateSystem,
    units: legacy.units,
    seed: legacy.seed,
    geometry,
    geometrySha256: hash(geometry),
    parts: [
      { id: "mount", ...(mount ? { transform: mount } : {}) },
      ...legacy.parts.map((part) => ({
        ...part,
        ...(!part.parent && part.id !== "floor" ? { parent: "mount" } : {}),
      })),
    ],
    rigs: [
      {
        id: "slider",
        type: "slider",
        movingPart: "hook",
        referencePart: "model",
        axis: [1, 0, 0],
        range: [0, h],
        neutral: 0,
      },
    ],
    teachingShapes: [],
    anchors,
    relationships: [
      {
        id: "hook.innerRange",
        type: "signed-gap",
        anchors: ["board.contact", "hook.innerFace"],
        axisPart: "model",
        axis: [1, 0, 0],
        range: [0, h],
        tolerance: 1e-8,
      },
      {
        id: "hook.outerRange",
        type: "signed-gap",
        anchors: ["wall.contact", "hook.outerFace"],
        axisPart: "model",
        axis: [1, 0, 0],
        range: [-h, 0],
        tolerance: 1e-8,
      },
      {
        id: "rivet.one.fixed",
        type: "fixed-offset",
        anchors: ["model.origin", "rivet.one.mount"],
        referencePart: "model",
        offset: [0.72, 2.005, 0],
        tolerance: 1e-8,
      },
      {
        id: "rivet.two.fixed",
        type: "fixed-offset",
        anchors: ["model.origin", "rivet.two.mount"],
        referencePart: "model",
        offset: [1.48, 2.005, 0],
        tolerance: 1e-8,
      },
    ],
    camera: legacy.camera,
    profile: legacy.profile,
    lights: legacy.lights,
  });
}
function bounds(scene: MechanismSceneV2) {
  const matrices = new Map<string, Matrix4>();
  function world(id: string): Matrix4 {
    const saved = matrices.get(id);
    if (saved) return saved;
    const part = scene.parts.find((part) => part.id === id)!,
      t = part.transform;
    const local = new Matrix4()
      .makeTranslation(...t.position)
      .multiply(new Matrix4().makeRotationX(t.rotation[0]))
      .multiply(new Matrix4().makeRotationY(t.rotation[1]))
      .multiply(new Matrix4().makeRotationZ(t.rotation[2]))
      .multiply(new Matrix4().makeScale(...t.scale))
      .multiply(
        new Matrix4().makeTranslation(-t.pivot[0], -t.pivot[1], -t.pivot[2]),
      );
    const matrix = part.parent
      ? world(part.parent).clone().multiply(local)
      : local;
    matrices.set(id, matrix);
    return matrix;
  }
  const min: [number, number, number] = [Infinity, Infinity, Infinity],
    max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const mesh of scene.geometry.meshes) {
    if (["floor", "board", "wall", "datum"].includes(mesh.partId)) continue;
    const matrix = world(mesh.partId);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const point = new Vector3(
        mesh.positions[i]!,
        mesh.positions[i + 1]!,
        mesh.positions[i + 2]!,
      )
        .applyMatrix4(matrix)
        .toArray();
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis]!, point[axis]!);
        max[axis] = Math.max(max[axis]!, point[axis]!);
      }
    }
  }
  return { min, max };
}
let metadata: MechanismPackMetadataReceipt | undefined;
/** Returned metadata contains declared counts/bounds, never mesh or texture bytes. */
export function inspectTapeHookPack(): MechanismPackMetadataReceipt {
  if (metadata) return metadata;
  const scene = tapeScene(TapeHookPackParametersSchema.parse({}));
  const pack = MechanismPackDocumentSchema.parse({
    schemaVersion: "mechanism-pack-1",
    id: "tape-hook",
    version: "1.0.0",
    family: "tape-hook",
    status: "candidate",
    generator: {
      id: "tape-hook-solid",
      version: "1",
      defaultSourceSha256: hash(scene),
      parameterSchemaSha256: hash(z.toJSONSchema(TapeHookPackParametersSchema)),
    },
    factualVariant: {
      id: "floating-hook",
      description:
        "Illustrative sliding hook with two securing rivets, selected pull/inside-face and push/outside-face contact. Reference props end at an exposed contact edge. Dimensions are authored model values; no manufacturer dimension or simulation claim.",
      dimensionBasis: "illustrative",
      sources: [
        {
          url: "https://support.stanleytools.com/hc/en-us/articles/360012677558-Why-does-the-hook-on-my-tape-measure-move",
          claim:
            "The moving hook compensates for its thickness during inside and outside measurements.",
        },
      ],
    },
    coordinateSystem: scene.coordinateSystem,
    units: scene.units,
    bounds: bounds(scene),
    boundsPart: "model",
    parts: scene.parts,
    meshes: scene.geometry.meshes.map((mesh) => ({
      id: mesh.id,
      part: mesh.partId,
      material: mesh.materialId,
      sha256: hash(mesh),
      vertices: mesh.positions.length / 3,
      triangles: mesh.indices.length / 3,
      bounds: mesh.bounds,
    })),
    materialSlots: scene.geometry.materials.map((material) => ({
      id: material.id,
      description:
        material.id === "steel" ? "Hook/rivet metal appearance" : material.id,
    })),
    anchors: scene.anchors,
    rigs: scene.rigs,
    teachingShapes: [],
    relationships: scene.relationships,
    parameters: [
      {
        id: "hookThickness",
        description: "Illustrative hook thickness; determines slider travel",
        unit: "illustrative-unit",
        minimum: 0.04,
        maximum: 0.35,
        default: 0.18,
      },
      {
        id: "bladeLength",
        description: "Illustrative blade length",
        unit: "illustrative-unit",
        minimum: 4,
        maximum: 20,
        default: 10,
      },
      {
        id: "bladeWidth",
        description: "Illustrative blade width",
        unit: "illustrative-unit",
        minimum: 1,
        maximum: 3,
        default: 2,
      },
    ],
    cameraTargets: describeMechanismPackCameras(scene, "tape-hook"),
    details: [
      {
        id: "teaching",
        description:
          "Generated rounded metal, two rivets and curved graduated blade. One declared detail; no automatic detail generation.",
      },
    ],
    variants: [{ id: "floating-hook", details: ["teaching"] }],
    neutralPose: [{ rig: "slider", value: 0 }],
    thumbnail: {
      kind: "native-preview-recipe",
      cameraTarget: "recognition",
      sourceFrame: 0,
      width: 320,
      height: 180,
    },
    diagnosticViews: [
      {
        id: "neutral",
        cameraTarget: "recognition",
        rigValues: [{ rig: "slider", value: 0 }],
      },
      {
        id: "pull",
        cameraTarget: "approach",
        rigValues: [{ rig: "slider", value: 0 }],
      },
      {
        id: "push",
        cameraTarget: "comparison",
        rigValues: [{ rig: "slider", value: 0.18 }],
      },
    ],
    compatibility: {
      sceneVersion: "mechanism-scene-2",
      nativeFrameVersion: "native3d-frame-2",
      backend: "webgl2",
      textureFont: {
        sha256:
          "sha256:a20caf8286023a6a7a85e40b1d2a4ae9fc3e3b1f9eda8f4c542dd4986af67bb1",
        weight: "600",
      },
    },
  });
  metadata = freeze(
    MechanismPackMetadataReceiptSchema.parse({
      schemaVersion: "mechanism-pack-metadata-1",
      sha256: hash(pack),
      pack,
    }),
  );
  return metadata;
}
export function createTapeHookPack(
  input: z.input<typeof TapeHookPackInputSchema> = {},
) {
  const options = TapeHookPackInputSchema.parse(input),
    receipt = inspectTapeHookPack();
  const reference = {
    id: receipt.pack.id,
    version: receipt.pack.version,
    sha256: receipt.sha256,
    variant: receipt.pack.factualVariant.id,
    detail: "teaching",
  };
  if (
    options.expectedPack &&
    canonicalMechanismJson(options.expectedPack) !==
      canonicalMechanismJson(reference)
  )
    throw new MechanismEvaluationErrorV2(
      "Tape pack revision, variant or detail differs from the expected immutable reference",
      { code: "mechanism-pack-revision", path: ["expectedPack"] },
    );
  const scene = MechanismSceneV2Schema.parse({
    ...tapeScene(options.parameters, options.mount, options.style),
    pack: reference,
  });
  return freeze({
    version: "mechanism-pack-instance-1" as const,
    pack: reference,
    parameters: options.parameters,
    scene,
    sourceSha256: hash(scene),
    meshDataSha256: hash({ meshes: scene.geometry.meshes }),
    bounds: bounds(scene),
    cameraTargets: describeMechanismPackCameras(scene, "tape-hook"),
    cameraTargetsSha256: hash(describeMechanismPackCameras(scene, "tape-hook")),
  });
}
export type TapeHookPackInstance = ReturnType<typeof createTapeHookPack>;
/** Semantic endpoint checks are explicit; an ordinary successful render does not imply contact acceptance. */
function assertTapeHookPackFrame(
  instance: TapeHookPackInstance,
  frame: MechanismFrameResultV2,
  mode: "free" | "outside-pull" | "inside-push" = "free",
) {
  const fail = (
    message: string,
    path: (string | number)[],
    relationship?: string,
  ): never => {
    throw new MechanismPackInvariantError(message, {
      code: "mechanism-pack-invariant",
      path,
      frame: frame.frame,
      pack: instance.pack,
      rig: "slider",
      parts: ["hook", "blade", "model"],
      ...(relationship ? { relationship } : {}),
    });
  };
  const rig = instance.scene.rigs.find((rig) => rig.id === "slider");
  if (
    !rig ||
    rig.type !== "slider" ||
    rig.movingPart !== "hook" ||
    rig.referencePart !== "model" ||
    rig.range[0] !== 0 ||
    rig.range[1] !== instance.parameters.hookThickness
  )
    fail("Slider limits must equal this instance's hook thickness", [
      "rigs",
      "slider",
      "range",
    ]);
  for (const id of TAPE_HOOK_RIVET_MESH_IDS)
    if (
      instance.scene.geometry.meshes.find((mesh) => mesh.id === id)?.partId !==
      "blade"
    )
      fail("Securing rivets must remain attached to the blade", [
        "geometry",
        "meshes",
        id,
        "partId",
      ]);
  for (const relation of Object.values(frame.relationships))
    if (relation.residual > relation.tolerance)
      fail(
        "Declared tape relationship failed",
        ["relationships", relation.id],
        relation.id,
      );
  const state = frame.rigs.slider;
  if (!state || state.type !== "slider")
    fail("Frame lacks its slider state", ["rigs", "slider"]);
  if (mode !== "free") {
    const contact =
        mode === "outside-pull" ? "hook.innerFace" : "hook.outerFace",
      datum = mode === "outside-pull" ? "board.contact" : "wall.contact";
    const a = frame.anchors[contact],
      b = frame.anchors[datum];
    if (!a || !b)
      return fail("Selected contact anchors are unavailable", [
        "anchors",
        contact,
      ]);
    if (Math.hypot(...a.world.map((v, axis) => v - b.world[axis]!)) > 1e-8)
      fail(
        "Selected measurement face does not meet its moving contact datum",
        ["relationships", contact],
        contact,
      );
  }
  return {
    version: "mechanism-pack-frame-check-1" as const,
    frame: frame.frame,
    pack: instance.pack,
    mode,
    status: "passed" as const,
  };
}

/** Fresh expected-state evaluation; this result does not assert actual GPU or continuous-motion acceptance. */
export function evaluateTapeHookPackFrame(
  instance: TapeHookPackInstance,
  request: MechanismFrameRequestV2,
  mode: "free" | "outside-pull" | "inside-push" = "free",
) {
  if (hash(instance.scene) !== instance.sourceSha256)
    throw new MechanismPackInvariantError(
      "Pack instance source identity changed",
      {
        code: "mechanism-pack-revision",
        path: ["sourceSha256"],
        pack: instance.pack,
      },
    );
  const frame = evaluateMechanismFrameV2(
    prepareMechanismSceneV2(instance.scene),
    request,
  );
  const check = assertTapeHookPackFrame(instance, frame, mode);
  return { method: "pure-expected-state" as const, frame, check };
}
