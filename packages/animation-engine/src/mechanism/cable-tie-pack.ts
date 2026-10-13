import { createReleasableCableScene } from "./cable-tie-release.ts";
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
import { MechanismPackInvariantError } from "./pack-invariant.ts";
export const CableTiePackParametersSchema = z
  .object({
    pitch: z.number().finite().min(0.35).max(0.7).default(0.5),
    strapWidth: z.number().finite().min(0.65).max(1.4).default(1),
    toothCount: z.number().int().min(6).max(12).default(8),
  })
  .strict();
export const CableTiePackVariantSchema = z.enum([
  "outside-serrated-integral-pawl-cutaway",
  "inside-serrated-extended-trigger-cutaway",
]);
export type CableTiePackVariant = z.infer<typeof CableTiePackVariantSchema>;
export const CableTiePackInputSchema = z
  .object({
    ...mechanismPackOptions,
    variant: CableTiePackVariantSchema.optional(),
    parameters: CableTiePackParametersSchema.default({
      pitch: 0.5,
      strapWidth: 1,
      toothCount: 8,
    }),
  })
  .strict();
export type CableTiePackParameters = z.infer<
  typeof CableTiePackParametersSchema
>;
function cableScene(
  options: z.infer<typeof CableTiePackInputSchema>,
): MechanismSceneV2 {
  const { pitch, strapWidth, toothCount } = options.parameters,
    length = 1.25,
    thickness = 0.1,
    tilt = 0.34;
  const tipY = 0.12 + 0.2 + (thickness * Math.cos(tilt)) / 2;
  const root: [number, number, number] = [
    -length * Math.cos(tilt),
    tipY + length * Math.sin(tilt),
    0,
  ];
  const definitions: MechanismPrimitiveInput[] = [
    {
      id: "strap.body",
      partId: "strap",
      materialId: "nylon",
      kind: "rounded-box",
      size: [(toothCount + 6) * pitch, 0.24, strapWidth],
      radius: 0.035,
      segments: 2,
    },
    {
      id: "head.base",
      partId: "head",
      materialId: "nylon",
      kind: "rounded-box",
      size: [2.2, 0.25, strapWidth + 0.55],
      radius: 0.08,
      segments: 2,
    },
    {
      id: "head.back",
      partId: "head",
      materialId: "nylon",
      kind: "rounded-box",
      size: [2.2, 1.2, 0.25],
      radius: 0.08,
      segments: 2,
    },
    {
      id: "head.root",
      partId: "head",
      materialId: "nylon",
      kind: "rounded-box",
      size: [0.35, 0.4, strapWidth + 0.25],
      radius: 0.06,
      segments: 2,
    },
  ];
  for (let index = 0; index < toothCount; index++) {
    const x = -index * pitch;
    definitions.push({
      id: `strap.tooth.${index}`,
      partId: "strap",
      materialId: "nylon",
      kind: "extruded-profile",
      points: [
        [x - pitch * 0.82, 0.12],
        [x, 0.32],
        [x, 0.12],
      ],
      depth: strapWidth * 0.85,
    });
  }
  const geometry = createMechanismPrimitiveGeometry({
    meshes: definitions,
    materials: [
      {
        id: "nylon",
        color: options.style?.color ?? "#4f493d",
        roughness: options.style?.roughness ?? 0.54,
        metalness: 0,
      },
    ],
  });
  geometry.meshes = geometry.meshes.map((mesh) =>
    offsetPackMesh(
      mesh,
      mesh.id === "strap.body"
        ? [(-(toothCount - 1) * pitch) / 2, 0, 0]
        : mesh.id === "head.base"
          ? [-0.5, -0.32, 0]
          : mesh.id === "head.back"
            ? [-0.5, 0.3, -strapWidth / 2 - 0.15]
            : mesh.id === "head.root"
              ? [root[0] - 0.12, root[1], 0]
              : [0, 0, (-strapWidth * 0.85) / 2],
    ),
  );
  const pawl = createPackTeachingShape(
    {
      id: "pawl",
      mesh: "pawl.mesh",
      ownerPart: "pawl.root",
      generator: "fixed-root-pawl-curve-1",
      driver: { rig: "ratchet", channel: "pawlDeflection" },
      parameters: {
        length,
        thickness,
        width: strapWidth * 0.8,
        maxDeflection: 0.38,
        longitudinalSegments: 12,
      },
    },
    "nylon",
    { generator: "fixed-root-pawl-curve-1", deflection: 0 },
  );
  geometry.meshes.push(pawl.mesh);
  return createPackScene({
    id: "cable-tie-pack",
    geometry,
    parts: [
      { id: "mount", ...(options.mount ? { transform: options.mount } : {}) },
      { id: "model", parent: "mount" },
      { id: "head", parent: "model" },
      { id: "strap", parent: "model" },
      {
        id: "pawl.root",
        parent: "head",
        transform: { position: root, rotation: [0, 0, -tilt] },
      },
    ],
    rigs: [
      {
        id: "ratchet",
        type: "ratchet",
        movingPart: "strap",
        referencePart: "model",
        axis: [1, 0, 0],
        range: [0, (toothCount - 1) * pitch],
        pitch,
        toothCount,
        neutralTooth: 0,
        releasePolicy: "non-releasable",
        pawlShape: "pawl",
        pawlTipAnchor: "pawl.tip",
        toothDatumAnchor: "strap.tooth.datum",
      },
    ],
    teachingShapes: [pawl.declaration],
    anchors: [
      {
        id: "head.root",
        role: "proof-target",
        source: { kind: "part-local", part: "head", position: root },
      },
      {
        id: "pawl.root",
        role: "proof-target",
        source: { kind: "shape-landmark", shape: "pawl", landmark: "root" },
      },
      {
        id: "pawl.tip",
        role: "contact",
        source: { kind: "shape-landmark", shape: "pawl", landmark: "tip" },
      },
      {
        id: "strap.outerSurface",
        role: "proof-target",
        source: {
          kind: "part-local",
          part: "strap",
          position: [-(toothCount - 1) * pitch, 0, strapWidth / 2],
        },
      },
      {
        id: "strap.tooth.datum",
        role: "contact",
        source: { kind: "part-local", part: "strap", position: [0, tipY, 0] },
      },
    ],
    relationships: [
      {
        id: "pawl.root.fixed",
        type: "coincident",
        anchors: ["head.root", "pawl.root"],
        tolerance: 1e-8,
      },
      {
        id: "pawl.tooth.seated",
        type: "engagement",
        rig: "ratchet",
        pawlTip: "pawl.tip",
        toothDatum: "strap.tooth.datum",
        requiredAt: "ratchet-seated",
        clearance: [-1e-8, 1e-8],
        tolerance: 1e-8,
      },
    ],
    camera: {
      position: [0, 5, Math.max(10, (2 * toothCount + 5) * pitch * 1.2)],
      target: [0, 0.2, 0],
      fovDegrees: 38,
      near: 0.1,
      far: 100,
    },
  });
}
function variantScene(options: z.infer<typeof CableTiePackInputSchema>) {
  const release =
    options.variant === "inside-serrated-extended-trigger-cutaway";
  const base = cableScene(
    release
      ? { ...options, style: { color: "#d7cfb4", ...options.style } }
      : options,
  );
  return release ? createReleasableCableScene(base, options.parameters) : base;
}
const metadataByVariant = new Map<
  CableTiePackVariant,
  MechanismPackMetadataReceipt
>();
export function inspectCableTiePack(
  variant: CableTiePackVariant = "outside-serrated-integral-pawl-cutaway",
) {
  variant = CableTiePackVariantSchema.parse(variant);
  const saved = metadataByVariant.get(variant);
  if (saved) return saved;
  const release = variant === "inside-serrated-extended-trigger-cutaway",
    scene = variantScene(
      CableTiePackInputSchema.parse(release ? { variant } : {}),
    );
  const metadata = createPackMetadata(
    scene,
    {
      id: "cable-tie",
      family: "cable-tie",
      generatorId: release
        ? "inside-serrated-release-trigger-solid"
        : "outside-serrated-tie-solid",
      factualVariant: release
        ? {
            id: variant,
            dimensionBasis: "illustrative",
            description:
              "Inside-serrated cutaway tie with a fixed-root flexible pawl and wider extended trigger beyond the locking tip. The trigger and catch bend from one shared scalar; pressing away from the tail permits backward withdrawal. Three separated reference cables identify the bundle side. Exposed straight tail and omitted front/roof simplify the demonstration; dimensions and release curvature are illustrative, with no force/manufacturer dimension claim.",
            sources: [
              {
                url: "https://www.hellermanntyton.com/products/cable-ties-releasable/relk2r/115-02202",
                claim:
                  "RELK2R is inside serrated, uses a plastic pawl and extended trigger; pressing the extended pawl down releases the strap.",
              },
              {
                url: "https://www.hellermanntyton.com/shared/assets/PDP_PS_RELK_Series_com.pdf",
                claim:
                  "The manufacturer's closure diagram shows a protruding extended pawl alongside the tail, with finger-operated release.",
              },
            ],
          }
        : {
            id: "outside-serrated-integral-pawl-cutaway",
            dimensionBasis: "illustrative",
            description:
              "Outside-serrated one-piece nylon tie, integral fixed-root pawl, exposed head cutaway and straight toothed tail. The front head wall and roof are omitted to show engagement. This standard non-releasable variant has no release lever; dimensions, tooth lift and material appearance are illustrative, not manufacturer geometry or a force simulation.",
            sources: [
              {
                url: "https://www.hellermanntyton.com/products/cable-ties-outside-serrated/t50sos/118-00062",
                claim:
                  "OS-series outside-serrated PA66 tie, plastic pawl closure and no releasable closure.",
              },
              {
                url: "https://www.hellermanntyton.com/competences/cable-ties-and-fixings",
                claim:
                  "One-piece plastic cable ties use an integral pawl locking against strap serrations.",
              },
            ],
          },
      parameters: [
        {
          id: "pitch",
          description: "Illustrative tooth pitch and ratchet step",
          unit: "illustrative-unit",
          minimum: 0.35,
          maximum: 0.7,
          default: 0.5,
        },
        {
          id: "strapWidth",
          description: "Illustrative strap width",
          unit: "illustrative-unit",
          minimum: 0.65,
          maximum: 1.4,
          default: 1,
        },
        {
          id: "toothCount",
          description: "Visible teeth and available seated positions",
          unit: "ratio",
          minimum: 6,
          maximum: 12,
          default: 8,
        },
      ],
      cameraTargets: describeMechanismPackCameras(scene, "cable-tie"),
      neutralPose: [{ rig: "ratchet", value: 0 }],
      diagnosticViews: [
        {
          id: "seated",
          cameraTarget: "macro",
          rigValues: [{ rig: "ratchet", value: 0 }],
        },
        {
          id: "advancing",
          cameraTarget: "macro",
          rigValues: [{ rig: "ratchet", value: 0.25 }],
        },
        {
          id: "next-seat",
          cameraTarget: "approach",
          rigValues: [{ rig: "ratchet", value: 0.5 }],
        },
      ],
    },
    z.toJSONSchema(CableTiePackParametersSchema),
  );
  metadataByVariant.set(variant, metadata);
  return metadata;
}
export function createCableTiePack(
  input: z.input<typeof CableTiePackInputSchema> = {},
) {
  const options = CableTiePackInputSchema.parse(input);
  return createPackInstance(
    variantScene(options),
    inspectCableTiePack(options.variant),
    options.parameters,
    options.expectedPack,
  );
}
export type CableTiePackInstance = ReturnType<typeof createCableTiePack>;
/** Non-releasable product behavior is narrower than the generic ratchet's teaching controls. */
export function evaluateCableTiePackFrame(
  instance: CableTiePackInstance,
  request: MechanismFrameRequestV2,
) {
  const control = request.rigControls?.ratchet;
  if (
    instance.pack.variant !== "inside-serrated-extended-trigger-cutaway" &&
    control?.type === "ratchet" &&
    control.latchKeys.some((key) => key.state === "released")
  )
    throw new MechanismPackInvariantError(
      "The selected standard tie has no release closure",
      {
        code: "mechanism-pack-transition",
        path: ["rigControls", "ratchet", "latchKeys"],
        pack: instance.pack,
        rig: "ratchet",
        parts: ["head", "strap", "pawl.root"],
      },
    );
  return evaluatePackFrame(instance, request);
}
