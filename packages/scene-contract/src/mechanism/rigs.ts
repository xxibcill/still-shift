import { mechanismIdRecordV2 } from "./records-v2.ts";
import { z } from "zod";
import {
  MECHANISM_LIMITS,
  MechanismIdSchema,
  MechanismNumberSchema,
  MechanismVectorSchema,
  mechanismIssue,
} from "./primitives.ts";
import { MechanismEasingSchema } from "./scene.ts";

const sourceFrame = z.number().finite().min(0).max(MECHANISM_LIMITS.frames);
export const MechanismUnitAxisV2Schema = MechanismVectorSchema.superRefine(
  (axis, context) => {
    if (Math.abs(Math.hypot(...axis) - 1) > 1e-8)
      mechanismIssue(
        context,
        "mechanism-rig-axis",
        "Rig axis must be a unit vector",
      );
  },
);
const scalarRange = z.tuple([MechanismNumberSchema, MechanismNumberSchema]);

function checkFrameOrder(
  keys: readonly { frame: number }[],
  context: z.RefinementCtx,
) {
  for (let index = 1; index < keys.length; index++)
    if (keys[index]!.frame <= keys[index - 1]!.frame)
      mechanismIssue(
        context,
        "mechanism-key-order",
        "Keys require strictly increasing source frames",
        [index, "frame"],
      );
}

export const MechanismScalarKeysV2Schema = z
  .array(
    z
      .object({
        frame: sourceFrame,
        value: MechanismNumberSchema,
        easing: MechanismEasingSchema.default("linear"),
      })
      .strict(),
  )
  .min(1)
  .max(MECHANISM_LIMITS.keys)
  .superRefine(checkFrameOrder);

const sliderRig = z
  .object({
    id: MechanismIdSchema,
    type: z.literal("slider"),
    movingPart: MechanismIdSchema,
    referencePart: MechanismIdSchema,
    axis: MechanismUnitAxisV2Schema,
    range: scalarRange,
    neutral: MechanismNumberSchema,
  })
  .strict();
const hingeRig = z
  .object({
    id: MechanismIdSchema,
    type: z.literal("hinge"),
    movingPart: MechanismIdSchema,
    referencePart: MechanismIdSchema,
    axis: MechanismUnitAxisV2Schema,
    pivot: MechanismVectorSchema,
    angleRange: scalarRange,
    neutralAngle: MechanismNumberSchema,
  })
  .strict();
const returnRig = z
  .object({
    id: MechanismIdSchema,
    type: z.literal("spring-return"),
    targetRig: MechanismIdSchema,
    restValue: MechanismNumberSchema,
    returnFrames: z.number().finite().positive().max(MECHANISM_LIMITS.frames),
    easing: z.enum(["linear", "smoothstep"]),
  })
  .strict();
const ratchetRig = z
  .object({
    id: MechanismIdSchema,
    type: z.literal("ratchet"),
    movingPart: MechanismIdSchema,
    referencePart: MechanismIdSchema,
    axis: MechanismUnitAxisV2Schema,
    range: scalarRange,
    pitch: z.number().finite().positive().max(1000),
    toothCount: z.number().int().min(2).max(4096),
    neutralTooth: z.number().int().min(0).max(4095),
    pawlShape: MechanismIdSchema,
    pawlTipAnchor: MechanismIdSchema,
    toothDatumAnchor: MechanismIdSchema,
  })
  .strict();

export const MechanismRigV2Schema = z
  .discriminatedUnion("type", [sliderRig, hingeRig, returnRig, ratchetRig])
  .superRefine((rig, context) => {
    if (rig.type === "spring-return") {
      if (rig.targetRig === rig.id)
        mechanismIssue(
          context,
          "mechanism-rig-cycle",
          "Return cannot drive itself",
          ["targetRig"],
        );
      return;
    }
    if (rig.movingPart === rig.referencePart)
      mechanismIssue(
        context,
        "mechanism-rig-reference",
        "Moving and reference parts must differ",
        ["referencePart"],
      );
    const range = rig.type === "hinge" ? rig.angleRange : rig.range;
    const path = rig.type === "hinge" ? "angleRange" : "range";
    if (range[1] <= range[0])
      mechanismIssue(
        context,
        "mechanism-rig-range",
        "Rig range must be ordered and nonempty",
        [path],
      );
    const neutral =
      rig.type === "hinge"
        ? rig.neutralAngle
        : rig.type === "slider"
          ? rig.neutral
          : range[0] + rig.neutralTooth * rig.pitch;
    if (neutral < range[0] || neutral > range[1])
      mechanismIssue(
        context,
        "mechanism-rig-range",
        "Neutral pose lies outside rig limits",
        [
          rig.type === "hinge"
            ? "neutralAngle"
            : rig.type === "slider"
              ? "neutral"
              : "neutralTooth",
        ],
      );
    if (rig.type === "ratchet") {
      if (rig.neutralTooth >= rig.toothCount)
        mechanismIssue(
          context,
          "mechanism-ratchet-tooth",
          "Neutral tooth lies outside the declared inventory",
          ["neutralTooth"],
        );
      if (
        Math.abs(range[1] - range[0] - (rig.toothCount - 1) * rig.pitch) > 1e-8
      )
        mechanismIssue(
          context,
          "mechanism-ratchet-pitch",
          "Travel must equal the declared tooth intervals times pitch",
          ["range"],
        );
    }
  });

const scalarFields = {
  value: MechanismNumberSchema.optional(),
  keys: MechanismScalarKeysV2Schema.optional(),
};
function checkScalarWriter(
  writer: { value?: number | undefined; keys?: unknown },
  context: z.RefinementCtx,
) {
  if ((writer.value === undefined) === (writer.keys === undefined))
    mechanismIssue(
      context,
      "mechanism-scalar-writer",
      "A scalar has exactly one writer: value or keys",
    );
}
const scalarWriter = z
  .object(scalarFields)
  .strict()
  .superRefine(checkScalarWriter);
const returnState = z.discriminatedUnion("phase", [
  z
    .object({
      frame: sourceFrame,
      phase: z.literal("held"),
      value: MechanismNumberSchema,
    })
    .strict(),
  z
    .object({
      frame: sourceFrame,
      phase: z.literal("released"),
      value: MechanismNumberSchema,
      stopValue: MechanismNumberSchema,
    })
    .strict(),
]);
const returnStates = z
  .array(returnState)
  .min(1)
  .max(MECHANISM_LIMITS.keys)
  .superRefine((states, context) => {
    checkFrameOrder(states, context);
    if (states[0]!.phase !== "held")
      mechanismIssue(
        context,
        "mechanism-return-state",
        "Return track must establish an initial held state",
        [0, "phase"],
      );
    states.forEach((state, index) => {
      if (state.phase === "released" && states[index - 1]?.phase !== "held")
        mechanismIssue(
          context,
          "mechanism-return-transition",
          "Release must follow a held state",
          [index, "phase"],
        );
      if (
        state.phase === "released" &&
        state.value !== states[index - 1]?.value
      )
        mechanismIssue(
          context,
          "mechanism-return-continuity",
          "Release starts at the preceding held value",
          [index, "value"],
        );
    });
  });
const latchKeys = z
  .array(
    z
      .object({ frame: sourceFrame, state: z.enum(["engaged", "released"]) })
      .strict(),
  )
  .min(1)
  .max(MECHANISM_LIMITS.keys)
  .superRefine(checkFrameOrder);

export const MechanismRigControlV2Schema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("slider"), ...scalarFields }).strict(),
    z.object({ type: z.literal("hinge"), ...scalarFields }).strict(),
    z
      .object({ type: z.literal("spring-return"), states: returnStates })
      .strict(),
    z
      .object({ type: z.literal("ratchet"), position: scalarWriter, latchKeys })
      .strict(),
  ])
  .superRefine((control, context) => {
    if (control.type === "slider" || control.type === "hinge")
      checkScalarWriter(control, context);
  });
export const MechanismRigControlsV2Schema = mechanismIdRecordV2(
  MechanismRigControlV2Schema,
  MECHANISM_LIMITS.rigs,
);

export type MechanismScalarKeysV2 = z.infer<typeof MechanismScalarKeysV2Schema>;
export type MechanismRigV2 = z.infer<typeof MechanismRigV2Schema>;
export type MechanismRigControlV2 = z.infer<typeof MechanismRigControlV2Schema>;
export type MechanismRigControlsV2 = z.infer<
  typeof MechanismRigControlsV2Schema
>;
