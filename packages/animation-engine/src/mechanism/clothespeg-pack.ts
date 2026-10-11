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
export const ClothespegPackInputSchema = z
  .object({
    ...mechanismPackOptions,
    parameters: ClothespegPackParametersSchema.default({
      armLength: 6,
      armWidth: 0.8,
      clothThickness: 0.16,
    }),
  })
  .strict();
export type ClothespegPackParameters = z.infer<
  typeof ClothespegPackParametersSchema
>;
function pegScene(
  options: z.infer<typeof ClothespegPackInputSchema>,
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
export function inspectClothespegPack() {
  if (metadata) return metadata;
  const scene = pegScene(ClothespegPackInputSchema.parse({}));
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
export function createClothespegPack(
  input: z.input<typeof ClothespegPackInputSchema> = {},
) {
  const options = ClothespegPackInputSchema.parse(input);
  return createPackInstance(
    pegScene(options),
    inspectClothespegPack(),
    options.parameters,
    options.expectedPack,
  );
}
export type ClothespegPackInstance = ReturnType<typeof createClothespegPack>;
export function evaluateClothespegPackFrame(
  instance: ClothespegPackInstance,
  request: MechanismFrameRequestV2,
) {
  return evaluatePackFrame(instance, request);
}
