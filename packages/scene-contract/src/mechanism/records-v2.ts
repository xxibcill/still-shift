import { z } from "zod";
import { MechanismIdSchema, mechanismIssue } from "./primitives.ts";

/** Typed JSON dictionaries support every valid ID, including constructor. */
export function mechanismIdRecordV2<T extends z.ZodType>(
  value: T,
  maximum: number,
) {
  const propertyNames = z.toJSONSchema(MechanismIdSchema);
  delete propertyNames.$schema;
  return z
    .object({})
    .catchall(value)
    .superRefine((record, context) => {
      const keys = Object.keys(record);
      if (keys.length > maximum)
        mechanismIssue(
          context,
          "mechanism-resource-limit",
          "ID dictionary exceeds its declared budget",
        );
      for (const key of keys) {
        if (!MechanismIdSchema.safeParse(key).success)
          mechanismIssue(
            context,
            "mechanism-id",
            "Dictionary key must be a bounded mechanism ID",
            [key],
          );
      }
    })
    .meta({ propertyNames, maxProperties: maximum });
}
