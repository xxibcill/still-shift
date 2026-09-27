import { z } from "zod";
import {
  PreparedNodeSchema,
  PreparedSceneFieldsSchema,
  PreparedFontSchema,
} from "./prepared.ts";
import {
  ComponentDataSchema,
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
export const ComponentDefinitionSchema = z
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
    componentData: ComponentDataSchema.default({
      schemaVersion: "scene-components-1",
      annotations: [],
      values: [],
      bindings: [],
    }),
  })
  .strict();
export type ComponentDefinition = z.infer<typeof ComponentDefinitionSchema>;
