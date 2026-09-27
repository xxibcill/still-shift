import { z } from "zod";
import {
  PreparedNodeSchema,
  PreparedSceneFieldsSchema,
  PreparedFontSchema,
} from "./prepared.ts";
import {
  ComponentDataV1Schema,
  ComponentDataV2Schema,
  ComponentIdSchema,
  ComponentWindowSchema,
} from "./component-data.ts";
export const ComponentBoundsSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive(),
    height: z.number().positive(),
  })
  .strict();
const ComponentDefinitionV1Schema = z
  .object({
    schemaVersion: z.literal("component-1"),
    nodes: z.array(PreparedNodeSchema).min(1).max(200),
    assets: z.array(PreparedSceneFieldsSchema.shape.assets.element).default([]),
    fonts: z.array(PreparedFontSchema).default([]),
    bounds: ComponentBoundsSchema,
    exports: z.record(ComponentIdSchema, ComponentIdSchema),
    externals: z.array(ComponentIdSchema).default([]),
    motions: z
      .array(
        z
          .object({
            id: ComponentIdSchema,
            node: ComponentIdSchema,
            property: z.enum(["x", "y", "opacity"]),
            to: z.number().finite(),
            window: ComponentWindowSchema,
          })
          .strict(),
      )
      .max(100)
      .default([]),
    componentData: ComponentDataV1Schema.default({
      schemaVersion: "scene-components-1",
      annotations: [],
      values: [],
      bindings: [],
    }),
  })
  .strict();
export const ComponentMotionSchema = z
  .object({
    id: ComponentIdSchema,
    node: ComponentIdSchema,
    property: z.enum(["x", "y", "opacity", "scale", "rotation"]),
    to: z.number().finite(),
    window: ComponentWindowSchema,
  })
  .strict()
  .superRefine((motion, ctx) => {
    if (
      motion.property === "scale" &&
      (motion.to <= 0 ||
        motion.to > 4 ||
        motion.window.easing === "out-back-soft")
    )
      ctx.addIssue({
        code: "custom",
        message: "Component scale must stay in (0,4] with bounded easing",
      });
  });
const ComponentDefinitionV2Schema = ComponentDefinitionV1Schema.extend({
  schemaVersion: z.literal("component-2"),
  motions: z.array(ComponentMotionSchema).max(100).default([]),
  componentData: ComponentDataV2Schema.default({
    schemaVersion: "scene-components-2",
    annotations: [],
    values: [],
    bindings: [],
    states: [],
    travels: [],
  }),
}).strict();
export const ComponentDefinitionSchema = z.discriminatedUnion("schemaVersion", [
  ComponentDefinitionV1Schema,
  ComponentDefinitionV2Schema,
]);
export type ComponentMotion = z.infer<typeof ComponentMotionSchema>;
export type ComponentDefinition = z.infer<typeof ComponentDefinitionSchema>;
