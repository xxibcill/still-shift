import { z } from "zod";

export const COMPOSITION_SCHEMA_VERSION = "composition-1" as const;

/** Every bound in the contract, so tools and docs can quote them. */
export const COMPOSITION_LIMITS = {
  minSize: 16,
  maxSize: 8192,
  maxFrameCount: 108_000,
  /** Keys are in layer time and may lie before the layer starts or after it ends. */
  maxKeyFrame: 216_000,
  maxKeys: 2_000,
  /** Total across the root composition and every precomp. */
  maxLayers: 2_000,
  maxPrecomps: 200,
  maxPrecompDepth: 8,
  maxParentDepth: 32,
  maxAssets: 500,
  maxMarkers: 500,
  maxMasks: 32,
  maxEffects: 32,
  maxPathVertices: 1_024,
  maxImageSources: 32,
  maxTextLength: 4_000,
  maxTextStates: 12,
  maxSignals: 200,
  maxDrivers: 500,
  maxConstraints: 200,
  maxPeriodic: 200,
  maxTextAnimators: 200,
  maxExpressions: 2_000,
  maxExpressionLength: 2_000,
  maxBehaviours: 200,
  maxPropertyPathLength: 512,
  maxMetadataBytes: 65_536,
  maxMetadataDepth: 64,
  maxJsonBytes: 65_536,
  maxJsonDepth: 64,
  maxCoordinate: 1_000_000,
  maxStretch: 100,
  maxSeed: 2_147_483_647,
} as const;

const L = COMPOSITION_LIMITS;

export const finite = z.number().finite();
/** Any authored number that is not otherwise constrained. */
export const bounded = finite.min(-L.maxCoordinate).max(L.maxCoordinate);
export const unit = finite.min(0).max(1);
export const compositionId = z
  .string()
  .regex(/^[a-zA-Z][\w-]*$/)
  .max(128);
/** Integer composition frame, as used by in/out points and markers. */
export const compFrame = finite.int().min(0).max(L.maxKeyFrame);
/** Integer frame in layer time, as used by keys. */
export const keyFrame = finite.int().min(-L.maxKeyFrame).max(L.maxKeyFrame);
export const compositionColor = z
  .string()
  .regex(/^#[\da-fA-F]{6}(?:[\da-fA-F]{2})?$/);
export const vec2 = z.tuple([bounded, bounded]);
export const vec3 = z.tuple([bounded, bounded, bounded]);
export const size2 = z.tuple([
  finite.positive().max(L.maxCoordinate),
  finite.positive().max(L.maxCoordinate),
]);
export const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const label = z.string().min(1).max(200);

type JsonBounds = {
  bytes: number;
  depth: number;
  sizeCode: string;
  depthCode: string;
  label: string;
};

/** Bound the expanded JSON tree before Zod recursively parses it. */
export function boundedJson<T extends z.ZodType>(
  schema: T,
  bounds: JsonBounds = {
    bytes: L.maxJsonBytes,
    depth: L.maxJsonDepth,
    sizeCode: "comp-json-size",
    depthCode: "comp-json-depth",
    label: "JSON payload",
  },
) {
  return z
    .unknown()
    .superRefine((value, ctx) => {
      type Entry = {
        value: unknown;
        depth: number;
        path: (string | number)[];
        exit?: boolean;
      };
      const stack: Entry[] = [{ value, depth: 0, path: [] }];
      const ancestors = new WeakSet<object>();
      const encoder = new TextEncoder();
      let bytes = 0;
      const fail = (code: string, path: (string | number)[], message: string) =>
        ctx.addIssue({
          code: "custom",
          path,
          message: `${code}: ${message}`,
          params: { diagnosticCode: code },
          fatal: true,
        });
      const addBytes = (count: number) => {
        bytes += count;
        if (bytes <= bounds.bytes) return true;
        fail(
          bounds.sizeCode,
          [],
          `${bounds.label} must serialise to at most ${bounds.bytes} bytes`,
        );
        return false;
      };
      const stringBytes = (text: string) =>
        text.length > bounds.bytes
          ? bounds.bytes + 1
          : encoder.encode(JSON.stringify(text)).length;

      while (stack.length) {
        const entry = stack.pop()!;
        const child = entry.value;
        if (child === null) {
          if (!addBytes(4)) return;
          continue;
        }
        if (typeof child !== "object") {
          if (
            typeof child !== "string" &&
            typeof child !== "boolean" &&
            !(typeof child === "number" && Number.isFinite(child))
          ) {
            fail(
              "comp-schema-type",
              entry.path,
              `${bounds.label} must contain JSON values`,
            );
            return;
          }
          const count =
            typeof child === "string"
              ? stringBytes(child)
              : JSON.stringify(child).length;
          if (!addBytes(count)) return;
          continue;
        }
        if (entry.exit) {
          ancestors.delete(child);
          continue;
        }
        if (ancestors.has(child)) {
          fail(
            "comp-schema-type",
            entry.path,
            `${bounds.label} must contain JSON values without cycles`,
          );
          return;
        }
        if (entry.depth > bounds.depth) {
          fail(
            bounds.depthCode,
            entry.path,
            `${bounds.label} may nest at most ${bounds.depth} container levels below its root`,
          );
          return;
        }
        const array = Array.isArray(child);
        const prototype = Object.getPrototypeOf(child);
        if (!array && prototype !== Object.prototype && prototype !== null) {
          fail(
            "comp-schema-type",
            entry.path,
            `${bounds.label} must contain JSON objects`,
          );
          return;
        }
        const children = array ? child.entries() : Object.entries(child);
        const count = array ? child.length : Object.keys(child).length;
        if (!addBytes(2 + Math.max(0, count - 1))) return;
        ancestors.add(child);
        stack.push({ ...entry, exit: true });
        for (const [key, nested] of children) {
          if (!array && !addBytes(stringBytes(String(key)) + 1)) return;
          stack.push({
            value: nested,
            depth: entry.depth + 1,
            path: [...entry.path, key],
          });
        }
      }
    })
    .pipe(schema);
}

/** Free-form metadata, bounded before recursive parsing. */
export const metadata = boundedJson(z.record(z.string().max(128), z.json()), {
  bytes: L.maxMetadataBytes,
  depth: L.maxMetadataDepth,
  sizeCode: "comp-metadata-size",
  depthCode: "comp-metadata-depth",
  label: "metadata",
});

/** Reported on semantic issues so validation can return stable codes. */
export type IssueReporter = (
  code: string,
  path: (string | number)[],
  message: string,
  /** 1-based character column inside an expression source string. */
  column?: number,
) => void;

export const reporter =
  (ctx: z.RefinementCtx, base: (string | number)[] = []): IssueReporter =>
  (code, path, message, column) =>
    ctx.addIssue({
      code: "custom",
      path: [...base, ...path],
      message: `${code}: ${message}`,
      params: {
        diagnosticCode: code,
        ...(column === undefined ? {} : { column }),
      },
    });
