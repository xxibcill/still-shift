import { createIdealLeverScene } from "./clothespeg-ideal-lever.ts";
import { createNotchedLineScene } from "./clothespeg-notched-line.ts";
import { describeMechanismPackCameras } from "./camera-descriptions.ts";
import { z } from "zod";
import {
  type MechanismSceneV2,
  type MechanismFrameRequestV2,
  type MechanismPackMetadataReceipt,
} from "@still-shift/scene-contract";
import {
  createMechanismPrimitiveGeometry,
  type MechanismPrimitiveInput,
} from "./primitive-mesh.ts";
import {
  createPackTeachingShape,
  createPackScene,
  createPackMetadata,
  createPackInstance,
  evaluatePackFrame,
  mechanismPackOptions,
  offsetPackMesh,
} from "./pack-support.ts";
export const ClothespegPackParametersSchema = z
  .object({
    armLength: z.number().finite().min(5).max(8).default(6),
    armWidth: z.number().finite().min(0.6).max(1.1).default(0.8),
    clothThickness: z.number().finite().min(0.1).max(0.3).default(0.16),
  })
  .strict();
const LegacyClothespegPackInputSchema = z
  .object({
    ...mechanismPackOptions,
    variant: z.literal("wood-arms-central-spring-cloth").optional(),
    parameters: ClothespegPackParametersSchema.default({
      armLength: 6,
      armWidth: 0.8,
      clothThickness: 0.16,
    }),
  })
  .strict();
export const NotchedLinePackParametersSchema = z
  .object({
    armLength: ClothespegPackParametersSchema.shape.armLength,
    armWidth: ClothespegPackParametersSchema.shape.armWidth,
    lineRadius: z.number().finite().min(0.08).max(0.18).default(0.16),
  })
  .strict();
const NotchedLinePackInputSchema = z
  .object({
    ...mechanismPackOptions,
    variant: z.literal("notched-line"),
    parameters: NotchedLinePackParametersSchema.default({
      armLength: 6,
      armWidth: 0.8,
      lineRadius: 0.16,
    }),
  })
  .strict();
const IdealLeverPackInputSchema = z
  .object({
    ...mechanismPackOptions,
    variant: z.literal("ideal-lever-press-points"),
    parameters: ClothespegPackParametersSchema.default({
      armLength: 6,
      armWidth: 0.8,
      clothThickness: 0.16,
    }),
  })
  .strict();
export const ClothespegPackVariantSchema = z.enum([
  "wood-arms-central-spring-cloth",
  "notched-line",
  "ideal-lever-press-points",
]);
export const ClothespegPackInputSchema = z.discriminatedUnion("variant", [
  LegacyClothespegPackInputSchema,
  NotchedLinePackInputSchema,
  IdealLeverPackInputSchema,
]);
export type ClothespegPackVariant = z.infer<typeof ClothespegPackVariantSchema>;
export type ClothespegPackParameters = z.infer<
  typeof ClothespegPackParametersSchema
>;
function pegScene(
  options: z.infer<typeof LegacyClothespegPackInputSchema>,
): MechanismSceneV2 {
  const { armLength, armWidth, clothThickness } = options.parameters,
    scale = armLength / 6,
    halfGap = clothThickness / 2,
    tipX = -3.2 * scale;
  const upper: [number, number][] = [
    [tipX, halfGap],
    [tipX, 0.82],
    [-0.8 * scale, 0.92],
    [2.8 * scale, 0.8],
    [2.8 * scale, 0.55],
    [0.5 * scale, 0.23],
    [0.35 * scale, 0.43],
    [-0.05 * scale, 0.46],
    [-0.3 * scale, 0.35],
    [-0.5 * scale, 0.2],
    [-1.45 * scale, 0.2],
    [-1.6 * scale, 0.32],
    [-1.9 * scale, 0.32],
    [-2.1 * scale, halfGap],
  ];
  const definitions: MechanismPrimitiveInput[] = [
    {
      id: "upper.arm",
      partId: "upper",
      materialId: "wood",
      kind: "extruded-profile",
      points: upper,
      depth: armWidth,
    },
    {
      id: "lower.arm",
      partId: "lower",
      materialId: "wood",
      kind: "extruded-profile",
      points: upper.map(([x, y]) => [x, -y]),
      depth: armWidth,
    },
    {
      id: "cloth.contact",
      partId: "cloth",
      materialId: "cloth",
      kind: "rounded-box",
      size: [0.75 * scale, clothThickness, armWidth + 0.7],
      radius: 0.025,
      segments: 2,
    },
  ];
  const geometry = createMechanismPrimitiveGeometry({
    meshes: definitions,
    materials: [
      {
        id: "wood",
        color: options.style?.color ?? "#c89558",
        roughness: options.style?.roughness ?? 0.72,
        metalness: 0,
        texture: { kind: "wood-grain", seed: 42 },
      },
      { id: "steel", color: "#9ca3aa", roughness: 0.28, metalness: 0.9 },
      { id: "cloth", color: "#638fa1", roughness: 0.95, metalness: 0 },
    ],
  });
  geometry.meshes = geometry.meshes.map((mesh) =>
    offsetPackMesh(
      mesh,
      mesh.partId === "cloth"
        ? [tipX + 0.3 * scale, 0, 0]
        : [0, 0, -armWidth / 2],
    ),
  );
  const seats: [[number, number, number], [number, number, number]] = [
    [-0.8 * scale, 0.975, -armWidth / 2],
    [-0.8 * scale, -0.975, armWidth / 2],
  ];
  const tangents: [[number, number, number], [number, number, number]] = [
    [1, 0, 0],
    [1, 0, 0],
  ];
  const spring = createPackTeachingShape(
    {
      id: "spring",
      mesh: "spring.mesh",
      ownerPart: "model",
      generator: "seated-torsion-spring-1",
      seats: ["upper.seat", "lower.seat"],
      parameters: {
        coilCenter: [0, 0, 0],
        axis: [0, 0, 1],
        coilRadius: 0.4,
        wireRadius: 0.055,
        turns: 3,
        pitch: 0.15,
        coilSamples: 48,
        legSamples: 8,
        tubeSides: 8,
        terminalTangents: tangents,
      },
    },
    "steel",
    { generator: "seated-torsion-spring-1", seats, terminalTangents: tangents },
  );
  geometry.meshes.push(spring.mesh);
  const rest = Math.atan(halfGap / -tipX);
  return createPackScene({
    id: "clothespeg-pack",
    geometry,
    parts: [
      { id: "mount", ...(options.mount ? { transform: options.mount } : {}) },
      { id: "model", parent: "mount" },
      { id: "upper", parent: "model" },
      { id: "lower", parent: "model" },
      { id: "cloth", parent: "model" },
    ],
    rigs: [
      {
        id: "upper.hinge",
        type: "hinge",
        movingPart: "upper",
        referencePart: "model",
        axis: [0, 0, 1],
        pivot: [0, 0, 0],
        angleRange: [-0.18, rest],
        neutralAngle: 0,
      },
      {
        id: "lower.hinge",
        type: "hinge",
        movingPart: "lower",
        referencePart: "model",
        axis: [0, 0, 1],
        pivot: [0, 0, 0],
        angleRange: [-rest, 0.18],
        neutralAngle: 0,
      },
      {
        id: "upper.return",
        type: "spring-return",
        targetRig: "upper.hinge",
        restValue: rest,
        returnFrames: 12,
        easing: "smoothstep",
      },
      {
        id: "lower.return",
        type: "spring-return",
        targetRig: "lower.hinge",
        restValue: -rest,
        returnFrames: 12,
        easing: "smoothstep",
      },
    ],
    teachingShapes: [spring.declaration],
    anchors: [
      {
        id: "upper.seat",
        role: "seat",
        source: { kind: "part-local", part: "upper", position: seats[0] },
      },
      {
        id: "lower.seat",
        role: "seat",
        source: { kind: "part-local", part: "lower", position: seats[1] },
      },
      {
        id: "spring.seat.a",
        role: "seat",
        source: { kind: "shape-landmark", shape: "spring", landmark: "seat-a" },
      },
      {
        id: "spring.seat.b",
        role: "seat",
        source: { kind: "shape-landmark", shape: "spring", landmark: "seat-b" },
      },
      {
        id: "spring.coil",
        role: "camera-target",
        source: { kind: "shape-landmark", shape: "spring", landmark: "coil-b" },
      },
      {
        id: "upper.tip",
        role: "contact",
        source: {
          kind: "part-local",
          part: "upper",
          position: [tipX, halfGap, 0],
        },
      },
      {
        id: "lower.tip",
        role: "contact",
        source: {
          kind: "part-local",
          part: "lower",
          position: [tipX, -halfGap, 0],
        },
      },
      {
        id: "cloth.upper",
        role: "contact",
        source: {
          kind: "part-local",
          part: "cloth",
          position: [tipX, halfGap, 0],
        },
      },
      {
        id: "cloth.lower",
        role: "contact",
        source: {
          kind: "part-local",
          part: "cloth",
          position: [tipX, -halfGap, 0],
        },
      },
    ],
    relationships: [
      {
        id: "spring.upper.seated",
        type: "coincident",
        anchors: ["upper.seat", "spring.seat.a"],
        tolerance: 1e-8,
      },
      {
        id: "spring.lower.seated",
        type: "coincident",
        anchors: ["lower.seat", "spring.seat.b"],
        tolerance: 1e-8,
      },
      {
        id: "upper.cloth.gap",
        type: "signed-gap",
        anchors: ["cloth.upper", "upper.tip"],
        axisPart: "model",
        axis: [0, 1, 0],
        range: [0, 2],
        tolerance: 1e-8,
      },
      {
        id: "lower.cloth.gap",
        type: "signed-gap",
        anchors: ["cloth.lower", "lower.tip"],
        axisPart: "model",
        axis: [0, -1, 0],
        range: [0, 2],
        tolerance: 1e-8,
      },
    ],
    camera: {
      position: [2, 3.5, 10],
      target: [-0.2, 0, 0],
      fovDegrees: 38,
      near: 0.1,
      far: 100,
    },
  });
}
let metadata: MechanismPackMetadataReceipt | undefined;
function inspectLegacyClothespegPack() {
  if (metadata) return metadata;
  const scene = pegScene(LegacyClothespegPackInputSchema.parse({}));
  metadata = createPackMetadata(
    scene,
    {
      id: "clothespeg",
      family: "clothespeg",
      generatorId: "wood-arm-seated-spring-solid",
      factualVariant: {
        id: "wood-arms-central-spring-cloth",
        dimensionBasis: "illustrative",
        description:
          "Conventional two wooden arms with a central helical torsion spring and legs seated on the arms. No hinge pin or improved retention pin/apertures. The explanatory hinge axis follows the coil; return stops on the selected cloth before the unloaded closing pose. Dimensions, spring curve and closing bias are illustrative; no stiffness, load or force simulation.",
        sources: [
          {
            url: "https://patentimages.storage.googleapis.com/b8/0c/a4/998ed323d4412d/US4063333.pdf",
            claim:
              "Figure 7 identifies the conventional spring clothespin as prior art; the new retention pin/apertures shown in later figures are excluded.",
          },
          {
            url: "https://patents.google.com/patent/FR2676949A1/en",
            claim:
              "Two wood or plastic half-bodies use a central helical spring with ends seated in grooves.",
          },
        ],
      },
      parameters: [
        {
          id: "armLength",
          description: "Illustrative combined tip-to-handle length",
          unit: "illustrative-unit",
          minimum: 5,
          maximum: 8,
          default: 6,
        },
        {
          id: "armWidth",
          description: "Illustrative wood arm width",
          unit: "illustrative-unit",
          minimum: 0.6,
          maximum: 1.1,
          default: 0.8,
        },
        {
          id: "clothThickness",
          description:
            "Selected contact stop thickness; unloaded spring return remains beyond this stop",
          unit: "illustrative-unit",
          minimum: 0.1,
          maximum: 0.3,
          default: 0.16,
        },
      ],
      cameraTargets: describeMechanismPackCameras(scene, "clothespeg"),
      neutralPose: [
        { rig: "upper.hinge", value: 0 },
        { rig: "lower.hinge", value: 0 },
      ],
      diagnosticViews: [
        {
          id: "cloth-contact",
          cameraTarget: "approach",
          rigValues: [
            { rig: "upper.hinge", value: 0 },
            { rig: "lower.hinge", value: 0 },
          ],
        },
        {
          id: "open",
          cameraTarget: "recognition",
          rigValues: [
            { rig: "upper.hinge", value: -0.16 },
            { rig: "lower.hinge", value: 0.16 },
          ],
        },
      ],
    },
    z.toJSONSchema(ClothespegPackParametersSchema),
  );
  return metadata;
}
let lineMetadata: MechanismPackMetadataReceipt | undefined;
function notchedLineScene(options: z.infer<typeof NotchedLinePackInputSchema>) {
  const { armLength, armWidth, lineRadius } = options.parameters;
  const base = pegScene({
    ...options,
    variant: undefined,
    parameters: { armLength, armWidth, clothThickness: lineRadius },
  });
  return createNotchedLineScene(base, options.parameters);
}
function inspectNotchedLinePack(): MechanismPackMetadataReceipt {
  if (lineMetadata) return lineMetadata;
  const scene = notchedLineScene(
    NotchedLinePackInputSchema.parse({ variant: "notched-line" }),
  );
  lineMetadata = createPackMetadata(
    scene,
    {
      id: "clothespeg",
      family: "clothespeg",
      generatorId: "notched-jaws-round-line-solid",
      factualVariant: {
        id: "notched-line",
        dimensionBasis: "illustrative",
        description:
          "Conventional opposing concave jaw notches seat a round line. A central torsion spring closes both arms; the line-contact pose stops before unloaded rest. Excludes the patent-specific slot/tongue/ledge restraint improvement. Dimensions and return bias are illustrative; no friction, stiffness or holding-force claim.",
        sources: [
          {
            url: "https://patents.google.com/patent/US2590881A/en",
            claim:
              "Facing jaw notches13 seat a clothesline; the torsion coil is the fulcrum and spring wings bias the jaws together. Deep-gullet placement in figure3 illustrates displacement rather than the intended front seating.",
          },
        ],
      },
      parameters: [
        {
          id: "armLength",
          description: "Illustrative combined tip-to-handle length",
          unit: "illustrative-unit",
          minimum: 5,
          maximum: 8,
          default: 6,
        },
        {
          id: "armWidth",
          description: "Illustrative arm width along the round line",
          unit: "illustrative-unit",
          minimum: 0.6,
          maximum: 1.1,
          default: 0.8,
        },
        {
          id: "lineRadius",
          description:
            "Illustrative round-line radius and tangent jaw-notch contact; return stop is the neutral contact pose",
          unit: "illustrative-unit",
          minimum: 0.08,
          maximum: 0.18,
          default: 0.16,
        },
      ],
      cameraTargets: describeMechanismPackCameras(scene, "clothespeg"),
      neutralPose: [
        { rig: "upper.hinge", value: 0 },
        { rig: "lower.hinge", value: 0 },
      ],
      diagnosticViews: [
        {
          id: "line-contact",
          cameraTarget: "approach",
          rigValues: [
            { rig: "upper.hinge", value: 0 },
            { rig: "lower.hinge", value: 0 },
          ],
        },
        {
          id: "open",
          cameraTarget: "recognition",
          rigValues: [
            { rig: "upper.hinge", value: -0.16 },
            { rig: "lower.hinge", value: 0.16 },
          ],
        },
      ],
    },
    z.toJSONSchema(NotchedLinePackParametersSchema),
  );
  return lineMetadata;
}
let leverMetadata: MechanismPackMetadataReceipt | undefined;
function idealLeverScene(options: z.infer<typeof IdealLeverPackInputSchema>) {
  return createIdealLeverScene(
    pegScene({ ...options, variant: undefined }),
    options.parameters,
  );
}
function inspectIdealLeverPack(): MechanismPackMetadataReceipt {
  if (leverMetadata) return leverMetadata;
  const scene = idealLeverScene(
      IdealLeverPackInputSchema.parse({ variant: "ideal-lever-press-points" }),
    ),
    legacy = inspectLegacyClothespegPack();
  leverMetadata = createPackMetadata(
    scene,
    {
      id: "clothespeg",
      family: "clothespeg",
      generatorId: "wood-arm-ideal-lever-press-points-solid",
      factualVariant: {
        id: "ideal-lever-press-points",
        dimensionBasis: "illustrative",
        description:
          "Conventional wooden arms and central torsion spring with two separate teaching press pads on the same handle and a common pivot. Pads and dimensions are illustrative, not manufacturer features. A separately pinned ideal static moment model prescribes resistance and calculates input force using the calibrated perpendicular arm. Spring tracks do not supply measured torque; no friction, stiffness, grip-force or product rating claim.",
        sources: [
          ...legacy.pack.factualVariant.sources,
          {
            url: "https://openstax.org/books/college-physics-ap-courses/pages/9-5-simple-machines",
            claim:
              "Ideal static lever equilibrium balances opposing force torques about a fixed pivot using perpendicular moment arms. Its peg application and prescribed resistance are explicit idealizations.",
          },
        ],
      },
      parameters: legacy.pack.parameters,
      cameraTargets: describeMechanismPackCameras(scene, "clothespeg"),
      neutralPose: legacy.pack.neutralPose,
      diagnosticViews: legacy.pack.diagnosticViews,
    },
    z.toJSONSchema(ClothespegPackParametersSchema),
  );
  return leverMetadata;
}
export function inspectClothespegPack(
  variant: ClothespegPackVariant = "wood-arms-central-spring-cloth",
) {
  ClothespegPackVariantSchema.parse(variant);
  return variant === "notched-line"
    ? inspectNotchedLinePack()
    : variant === "ideal-lever-press-points"
      ? inspectIdealLeverPack()
      : inspectLegacyClothespegPack();
}
function createLegacyClothespeg(
  options: z.infer<typeof LegacyClothespegPackInputSchema>,
) {
  return createPackInstance(
    pegScene(options),
    inspectLegacyClothespegPack(),
    options.parameters,
    options.expectedPack,
  );
}
function createNotchedLinePeg(
  options: z.infer<typeof NotchedLinePackInputSchema>,
) {
  return createPackInstance(
    notchedLineScene(options),
    inspectNotchedLinePack(),
    options.parameters,
    options.expectedPack,
  );
}
function createIdealLeverPeg(
  options: z.infer<typeof IdealLeverPackInputSchema>,
) {
  return createPackInstance(
    idealLeverScene(options),
    inspectIdealLeverPack(),
    options.parameters,
    options.expectedPack,
  );
}
export type IdealLeverPackInstance = ReturnType<typeof createIdealLeverPeg>;
export type ClothespegPackInstance = ReturnType<typeof createLegacyClothespeg>;
export type NotchedLinePackInstance = ReturnType<typeof createNotchedLinePeg>;
export function createClothespegPack(
  input?: z.input<typeof LegacyClothespegPackInputSchema>,
): ClothespegPackInstance;
export function createClothespegPack(
  input: z.input<typeof NotchedLinePackInputSchema>,
): NotchedLinePackInstance;
export function createClothespegPack(
  input: z.input<typeof IdealLeverPackInputSchema>,
): IdealLeverPackInstance;
export function createClothespegPack(
  input: z.input<typeof ClothespegPackInputSchema>,
): ClothespegPackInstance | NotchedLinePackInstance | IdealLeverPackInstance;
export function createClothespegPack(
  input: z.input<typeof ClothespegPackInputSchema> = {},
) {
  const options = ClothespegPackInputSchema.parse(input);
  return options.variant === "notched-line"
    ? createNotchedLinePeg(options)
    : options.variant === "ideal-lever-press-points"
      ? createIdealLeverPeg(options)
      : createLegacyClothespeg(options);
}
export function evaluateClothespegPackFrame(
  instance:
    | ClothespegPackInstance
    | NotchedLinePackInstance
    | IdealLeverPackInstance,
  request: MechanismFrameRequestV2,
) {
  return evaluatePackFrame(instance, request);
}
