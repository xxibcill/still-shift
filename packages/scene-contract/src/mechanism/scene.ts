import { z } from "zod";
import { MechanismGeometrySchema } from "./geometry.ts";
import {
  checkUniqueIds,
  MECHANISM_LIMITS,
  MechanismHashSchema,
  MechanismIdSchema,
  MechanismNumberSchema,
  MechanismVectorSchema,
  mechanismIssue,
} from "./primitives.ts";

const positiveScale = z.tuple([
  z.number().finite().positive().max(1000),
  z.number().finite().positive().max(1000),
  z.number().finite().positive().max(1000),
]);
export const MechanismTransformSchema = z
  .object({
    position: MechanismVectorSchema.default([0, 0, 0]),
    /** Radians, Euler XYZ; matrix T(position) Rxyz S(scale) T(-pivot). */
    rotation: MechanismVectorSchema.default([0, 0, 0]),
    scale: positiveScale.default([1, 1, 1]),
    pivot: MechanismVectorSchema.default([0, 0, 0]),
  })
  .strict();
export const MechanismPartSchema = z
  .object({
    id: MechanismIdSchema,
    parent: MechanismIdSchema.optional(),
    transform: MechanismTransformSchema.default({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      pivot: [0, 0, 0],
    }),
    visible: z.boolean().default(true),
  })
  .strict();
export const MechanismCameraSchema = z
  .object({
    position: MechanismVectorSchema,
    target: MechanismVectorSchema,
    up: MechanismVectorSchema.default([0, 1, 0]),
    fovDegrees: z.number().finite().min(1).max(179),
    near: z.number().finite().min(0.001).max(1_000_000),
    far: z.number().finite().min(0.002).max(10_000_000),
  })
  .strict()
  .superRefine((camera, context) => {
    const direction = camera.target.map(
      (value, axis) => value - camera.position[axis]!,
    );
    const cross = [
      direction[1]! * camera.up[2] - direction[2]! * camera.up[1],
      direction[2]! * camera.up[0] - direction[0]! * camera.up[2],
      direction[0]! * camera.up[1] - direction[1]! * camera.up[0],
    ];
    if (Math.hypot(...direction) < 1e-9 || Math.hypot(...cross) < 1e-9)
      mechanismIssue(
        context,
        "mechanism-camera-direction",
        "Camera direction and up must form a valid view basis",
        ["target"],
      );
    if (camera.far <= camera.near)
      mechanismIssue(
        context,
        "mechanism-camera-clipping",
        "Camera far must exceed near",
        ["far"],
      );
  });
export const MechanismEasingSchema = z.enum(["linear", "smoothstep", "hold"]);
const sampleFrame = z.number().finite().min(0).max(MECHANISM_LIMITS.frames);
export const MechanismTravelKeysSchema = z
  .array(
    z
      .object({
        frame: sampleFrame,
        value: z.number().finite().min(0).max(1),
        easing: MechanismEasingSchema.default("linear"),
      })
      .strict(),
  )
  .min(1)
  .max(MECHANISM_LIMITS.keys)
  .superRefine((keys, context) => {
    for (let index = 1; index < keys.length; index++)
      if (keys[index]!.frame <= keys[index - 1]!.frame)
        mechanismIssue(
          context,
          "mechanism-key-order",
          "Control keys require strictly increasing frames",
          [index, "frame"],
        );
  });
export const MechanismRigControlSchema = z
  .object({
    travel: z.number().finite().min(0).max(1).optional(),
    travelKeys: MechanismTravelKeysSchema.optional(),
    contactMode: z.enum(["free", "pull", "push"]).optional(),
  })
  .strict()
  .refine(
    (control) =>
      control.travel === undefined || control.travelKeys === undefined,
    { message: "A control has one travel writer: value or keys" },
  );
export const MechanismControlsSchema = z
  .record(MechanismIdSchema, MechanismRigControlSchema)
  .refine((controls) => Object.keys(controls).length <= MECHANISM_LIMITS.rigs, {
    message: "Rig control writer budget exceeded",
  });
export const MechanismCameraKeysSchema = z
  .array(
    z
      .object({
        frame: sampleFrame,
        position: MechanismVectorSchema,
        target: MechanismVectorSchema,
        fovDegrees: z.number().finite().min(1).max(179).optional(),
        easing: MechanismEasingSchema.default("smoothstep"),
      })
      .strict(),
  )
  .min(1)
  .max(MECHANISM_LIMITS.keys)
  .superRefine((keys, context) => {
    for (let index = 1; index < keys.length; index++)
      if (keys[index]!.frame <= keys[index - 1]!.frame)
        mechanismIssue(
          context,
          "mechanism-key-order",
          "Camera keys require strictly increasing frames",
          [index, "frame"],
        );
  });
export const MechanismTapeHookRigSchema = z
  .object({
    id: MechanismIdSchema,
    type: z.literal("tape-hook-slider"),
    rootPart: MechanismIdSchema,
    hookPart: MechanismIdSchema,
    bladePart: MechanismIdSchema,
    rivetMeshIds: z.array(MechanismIdSchema).min(1).max(32),
    thickness: z.number().finite().positive().max(1000),
    innerFaceAnchor: MechanismIdSchema.default("hook.innerFace"),
    outerFaceAnchor: MechanismIdSchema.default("hook.outerFace"),
    travelKeys: MechanismTravelKeysSchema.default([
      { frame: 0, value: 0, easing: "hold" },
    ]),
    contactMode: z.enum(["free", "pull", "push"]).default("free"),
    contactDatum: MechanismNumberSchema.default(0),
  })
  .strict();
export const MechanismAnchorSchema = z
  .object({
    id: MechanismIdSchema,
    part: MechanismIdSchema,
    position: MechanismVectorSchema,
    role: z.enum([
      "physical-inner-face",
      "physical-outer-face",
      "proof-target",
    ]),
  })
  .strict();
export const MechanismLightSchema = z
  .object({
    id: MechanismIdSchema,
    type: z.enum(["directional", "spot"]),
    position: MechanismVectorSchema,
    target: MechanismVectorSchema,
    color: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .default("#ffffff"),
    intensity: z.number().finite().min(0).max(100),
    castShadow: z.boolean().default(false),
    shadowMapSize: z
      .number()
      .int()
      .min(128)
      .max(MECHANISM_LIMITS.shadowMapSize)
      .default(1024),
    shadowBias: z.number().finite().min(-1).max(1).default(0),
    shadowNormalBias: z.number().finite().min(0).max(1).default(0),
    shadowRadius: z.number().finite().min(0).max(10).default(1),
    angle: z
      .number()
      .finite()
      .min(0.01)
      .max(Math.PI / 2)
      .default(Math.PI / 4),
    penumbra: z.number().finite().min(0).max(1).default(0.2),
  })
  .strict();
export const MechanismRenderProfileSchema = z
  .object({
    toneMapping: z.literal("aces-filmic"),
    exposure: z.number().finite().min(0.001).max(10),
    output: z.literal("srgb-rgba8-straight"),
    background: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .default("#cbd1d1"),
    transparent: z.boolean().default(false),
    environment: z.literal("room").default("room"),
    environmentIntensity: z.number().finite().min(0).max(10).default(0.95),
    fog: z
      .object({
        color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
        near: z.number().finite().min(0).max(10000),
        far: z.number().finite().positive().max(10000),
      })
      .strict()
      .refine((value) => value.far > value.near, "Fog far must exceed near")
      .optional(),
  })
  .strict();

export const MechanismSceneSchema = z
  .object({
    schemaVersion: z.literal("mechanism-scene-1"),
    id: MechanismIdSchema,
    geometrySha256: MechanismHashSchema,
    coordinateSystem: z.literal("right-handed-y-up"),
    units: z
      .object({
        kind: z.enum(["illustrative", "meter", "millimeter"]),
        scaleToMeters: z.number().finite().positive().max(1000),
      })
      .strict(),
    seed: z.number().int().min(0).max(2_147_483_647).default(0),
    geometry: MechanismGeometrySchema,
    parts: z.array(MechanismPartSchema).min(1).max(MECHANISM_LIMITS.parts),
    rigs: z.array(MechanismTapeHookRigSchema).min(1).max(MECHANISM_LIMITS.rigs),
    anchors: z
      .array(MechanismAnchorSchema)
      .min(1)
      .max(MECHANISM_LIMITS.anchors),
    camera: MechanismCameraSchema,
    profile: MechanismRenderProfileSchema,
    lights: z.array(MechanismLightSchema).max(8).default([]),
  })
  .strict()
  .superRefine(validateScene);
export type MechanismScene = z.infer<typeof MechanismSceneSchema>;
export type MechanismSceneInput = z.input<typeof MechanismSceneSchema>;
export type MechanismCameraInput = z.input<typeof MechanismCameraSchema>;
export type MechanismCameraKeysInput = z.input<
  typeof MechanismCameraKeysSchema
>;
export type MechanismControlsInput = z.input<typeof MechanismControlsSchema>;
export type MechanismCamera = z.infer<typeof MechanismCameraSchema>;
export type MechanismCameraKeys = z.infer<typeof MechanismCameraKeysSchema>;
export type MechanismTransform = z.infer<typeof MechanismTransformSchema>;
export type MechanismRigControl = z.infer<typeof MechanismRigControlSchema>;
export type MechanismControls = z.infer<typeof MechanismControlsSchema>;
export type MechanismTapeHookRig = z.infer<typeof MechanismTapeHookRigSchema>;
export type MechanismAnchor = z.infer<typeof MechanismAnchorSchema>;

type SceneFields = {
  geometry: z.infer<typeof MechanismGeometrySchema>;
  parts: z.infer<typeof MechanismPartSchema>[];
  rigs: MechanismTapeHookRig[];
  anchors: MechanismAnchor[];
  lights: z.infer<typeof MechanismLightSchema>[];
};
function validateScene(scene: SceneFields, context: z.RefinementCtx) {
  for (const field of ["parts", "rigs", "anchors", "lights"] as const)
    checkUniqueIds(scene[field], context, [field]);
  if (
    scene.lights.filter((light) => light.castShadow).length >
    MECHANISM_LIMITS.shadowLights
  )
    mechanismIssue(
      context,
      "mechanism-resource-limit",
      "At most two shadow lights are supported",
      ["lights"],
    );
  const parts = new Map(scene.parts.map((part) => [part.id, part]));
  scene.parts.forEach((part, index) =>
    checkParent(part, index, parts, context),
  );
  scene.geometry.meshes.forEach((mesh, index) => {
    if (!parts.has(mesh.partId))
      mechanismIssue(
        context,
        "mechanism-part-reference",
        `Unknown part ${mesh.partId}`,
        ["geometry", "meshes", index, "partId"],
      );
  });
  scene.anchors.forEach((anchor, index) => {
    if (!parts.has(anchor.part))
      mechanismIssue(
        context,
        "mechanism-part-reference",
        `Unknown part ${anchor.part}`,
        ["anchors", index, "part"],
      );
  });
  const owners = new Set<string>();
  scene.rigs.forEach((rig, index) =>
    validateRig(scene, rig, index, parts, owners, context),
  );
}
function checkParent(
  part: z.infer<typeof MechanismPartSchema>,
  index: number,
  parts: Map<string, z.infer<typeof MechanismPartSchema>>,
  context: z.RefinementCtx,
) {
  const seen = new Set([part.id]);
  let parent = part.parent;
  while (parent !== undefined) {
    if (seen.has(parent)) {
      mechanismIssue(
        context,
        "mechanism-parent-cycle",
        `Cyclic parent chain at ${parent}`,
        ["parts", index, "parent"],
      );
      return;
    }
    seen.add(parent);
    const ancestor = parts.get(parent);
    if (!ancestor) {
      mechanismIssue(
        context,
        "mechanism-part-reference",
        `Unknown parent ${parent}`,
        ["parts", index, "parent"],
      );
      return;
    }
    parent = ancestor.parent;
  }
}
function validateRig(
  scene: SceneFields,
  rig: MechanismTapeHookRig,
  index: number,
  parts: Map<string, z.infer<typeof MechanismPartSchema>>,
  owners: Set<string>,
  context: z.RefinementCtx,
) {
  const location = ["rigs", index];
  for (const field of ["rootPart", "hookPart", "bladePart"] as const)
    if (!parts.has(rig[field]))
      mechanismIssue(
        context,
        "mechanism-part-reference",
        `Unknown rig part ${rig[field]}`,
        [...location, field],
      );
  for (const part of [rig.rootPart, rig.hookPart]) {
    if (owners.has(part))
      mechanismIssue(
        context,
        "mechanism-control-owner",
        `Multiple rig writers for ${part}`,
        location,
      );
    owners.add(part);
  }
  if (
    rig.rootPart === rig.hookPart ||
    rig.hookPart === rig.bladePart ||
    rig.rootPart === rig.bladePart
  )
    mechanismIssue(
      context,
      "mechanism-rig-hierarchy",
      "Root, hook and blade must be different parts",
      location,
    );
  if (
    parts.get(rig.hookPart)?.parent !== rig.rootPart ||
    parts.get(rig.bladePart)?.parent !== rig.rootPart
  )
    mechanismIssue(
      context,
      "mechanism-rig-hierarchy",
      "Hook and blade must be direct children of the rig root",
      location,
    );
  const hook = parts.get(rig.hookPart)?.transform;
  if (
    hook &&
    (hook.position[0] !== 0 ||
      hook.rotation.some((v) => v !== 0) ||
      hook.scale.some((v) => v !== 1) ||
      hook.pivot.some((v) => v !== 0))
  )
    mechanismIssue(
      context,
      "mechanism-rig-axis",
      "Tape hook uses an unrotated unit-scale local +X slider",
      [...location, "hookPart"],
    );
  if (rig.thickness !== scene.geometry.dimensions.hookThickness)
    mechanismIssue(
      context,
      "mechanism-travel-thickness",
      "Rig thickness must match immutable geometry thickness",
      [...location, "thickness"],
    );
  for (const id of rig.rivetMeshIds) {
    const mesh = scene.geometry.meshes.find((mesh) => mesh.id === id);
    if (!mesh || mesh.partId !== rig.bladePart)
      mechanismIssue(
        context,
        "mechanism-fixed-rivet",
        `Rivet ${id} must be mounted on blade ${rig.bladePart}`,
        [...location, "rivetMeshIds"],
      );
  }
  for (const [field, role, x] of [
    ["innerFaceAnchor", "physical-inner-face", 0],
    ["outerFaceAnchor", "physical-outer-face", -rig.thickness],
  ] as const) {
    const anchor = scene.anchors.find((anchor) => anchor.id === rig[field]);
    if (
      !anchor ||
      anchor.role !== role ||
      anchor.part !== rig.hookPart ||
      anchor.position[0] !== x
    )
      mechanismIssue(
        context,
        "mechanism-contact-anchor",
        `${field} must name the actual hook face at local x ${x}`,
        [...location, field],
      );
  }
}
