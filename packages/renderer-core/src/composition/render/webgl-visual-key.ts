import { gaussianBoxWidth } from "./webgl-blur-kernel.ts";
import type { ProviderContent, TextContent } from "./graph.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  resizeRenderMetadata,
  serializeRenderMetadata,
  copySerializationMetadata,
} from "../../managed-metadata.ts";

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
      return copySerializationMetadata(record, 3, () => ({
        ...record,
        time: 0,
        sourceTime: 0,
        visualKey: key,
      }));
  }
  if (record.effect === "blur.gaussian" && record.params) {
    const params = record.params as Record<string, unknown>;
    if (typeof params.radius === "number")
      return copySerializationMetadata(record, 0, () => ({
        ...record,
        params: copySerializationMetadata(params, 0, () => ({
          ...params,
          radius: gaussianBoxWidth(params.radius as number),
        })),
      }));
  }
  return item;
}

/** Immutable definitions get identities; every evaluated drawing value remains in the key. */
type DefinitionState = {
  definitions: WeakMap<object, number> | undefined;
  sequence: number;
};
export class WebglVisualKey {
  private readonly state: DefinitionState;
  constructor(private readonly contentKey?: PreparedContentKey) {
    this.state = allocateRenderMetadata<DefinitionState>(
      256,
      () => ({ definitions: new WeakMap(), sequence: 0 }),
      false,
      (value) => {
        value.definitions = undefined;
        value.sequence = 0;
      },
    );
  }

  private identity(definition: object) {
    const definitions = this.state.definitions;
    if (!definitions) throw Error("WebGL visual definitions are disposed");
    let id = definitions.get(definition);
    if (id === undefined) {
      resizeRenderMetadata(this.state, 256 + 40 * (this.state.sequence + 1));
      id = this.state.sequence++;
      definitions.set(definition, id);
    }
    return id;
  }

  of(value: unknown): string {
    return JSON.stringify(value, this.replacer());
  }
  metadata(value: unknown) {
    return serializeRenderMetadata(value, this.replacer());
  }
  private replacer() {
    return (property: string, item: unknown) => {
      if (item === null || typeof item !== "object") return item;
      if (property === "layer" || property === "sources")
        return this.identity(item);
      return preparedVisualState(item, this.contentKey);
    };
  }
  dispose() {
    this.state.definitions = undefined;
    this.state.sequence = 0;
    releaseRenderMetadata(this.state);
  }
}

/** Shared traversal includes surfaces, projections, history, effects and mattes. */
export { hasNativeDepth as containsNativeDepth } from "./graph.ts";
