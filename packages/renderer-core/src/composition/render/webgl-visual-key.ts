import { gaussianBoxWidth } from "./webgl-blur-kernel.ts";
import type { ProviderContent, TextContent } from "./graph.ts";

export type PreparedContentKey = (
  content: ProviderContent | TextContent,
) => string | undefined;

export function preparedVisualState(
  item: unknown,
  contentKey?: PreparedContentKey,
): unknown {
  if (item === null || typeof item !== "object") return item;
  const record = item as Record<string, unknown>;
  if (
    (record.type === "provider" || record.type === "text") &&
    typeof record.layer === "object" &&
    record.layer !== null &&
    typeof record.time === "number"
  ) {
    const key = contentKey?.(item as ProviderContent | TextContent);
    if (key !== undefined)
      return { ...record, time: 0, sourceTime: 0, visualKey: key };
  }
  if (record.effect === "blur.gaussian" && record.params) {
    const params = record.params as Record<string, unknown>;
    if (typeof params.radius === "number")
      return {
        ...record,
        params: { ...params, radius: gaussianBoxWidth(params.radius) },
      };
  }
  return item;
}

/** Immutable definitions get identities; every evaluated drawing value remains in the key. */
export class WebglVisualKey {
  private readonly definitions = new WeakMap<object, number>();
  private sequence = 0;
  constructor(private readonly contentKey?: PreparedContentKey) {}

  private identity(definition: object) {
    let id = this.definitions.get(definition);
    if (id === undefined) {
      id = this.sequence++;
      this.definitions.set(definition, id);
    }
    return id;
  }

  of(value: unknown): string {
    return JSON.stringify(value, (property, item: unknown) => {
      if (item === null || typeof item !== "object") return item;
      if (property === "layer" || property === "sources")
        return this.identity(item);
      return preparedVisualState(item, this.contentKey);
    });
  }
}
