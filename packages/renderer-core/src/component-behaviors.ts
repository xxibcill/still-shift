import type { z } from "zod";
import { ComponentMotionSchema } from "../../scene-contract/src/components.ts";
import {
  ComponentDataV1Schema,
  ComponentStateSchema,
  ComponentTravelSchema,
  ComponentVisibilitySchema,
  ComponentPinSchema,
  ComponentTextFitSchema,
  ComponentMaskSchema,
} from "../../scene-contract/src/component-data.ts";
import type { ComponentMotion } from "../../scene-contract/src/components.ts";

type Window = ComponentMotion["window"];
/** Uniform scale starts at 1; adjacent native segments continue from their previous endpoint. */
export function scaleComponent(
  id: string,
  node: string,
  to: number,
  window: Window,
) {
  return ComponentMotionSchema.parse({
    id,
    node,
    property: "scale",
    to,
    window,
  });
}
/** The signed endpoint is absolute degrees; no shortest-turn rewriting. */
export function rotateComponent(
  id: string,
  node: string,
  to: number,
  window: Window,
) {
  return ComponentMotionSchema.parse({
    id,
    node,
    property: "rotation",
    to,
    window,
  });
}
/** One reveal writer per target. Separate whole-timeline draws cannot form a sequence. */
export function drawComponent(
  id: string,
  target: string,
  from: number,
  to: number,
  window: Window,
) {
  return ComponentDataV1Schema.parse({
    schemaVersion: "scene-components-1",
    values: [{ id, range: [0, 1], from, to, window }],
    bindings: [
      {
        kind: "property",
        value: id,
        target,
        property: "reveal",
        output: [0, 1],
      },
    ],
  });
}
export const stepComponentState = (
  input: z.input<typeof ComponentStateSchema>,
) => ComponentStateSchema.parse(input);
export const travelComponentPath = (
  input: z.input<typeof ComponentTravelSchema>,
) => ComponentTravelSchema.parse(input);
export const showComponentDuring = (
  input: z.input<typeof ComponentVisibilitySchema>,
) => ComponentVisibilitySchema.parse(input);
export const pinComponent = (input: z.input<typeof ComponentPinSchema>) =>
  ComponentPinSchema.parse(input);
export const fitComponentText = (
  input: z.input<typeof ComponentTextFitSchema>,
) => ComponentTextFitSchema.parse(input);
export const maskComponent = (input: z.input<typeof ComponentMaskSchema>) =>
  ComponentMaskSchema.parse(input);
