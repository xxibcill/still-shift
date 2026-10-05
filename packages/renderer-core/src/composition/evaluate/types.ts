import type { SampledShapeContent, CompiledShapes } from "../shapes/types.ts";
import type { EvaluatedEffect } from "./effects.ts";
import type {
  BezierPath,
  CompositionLayer,
  CompositionMask,
} from "@still-shift/scene-contract";
import type { Matrix, Point } from "../../node-transform.ts";
import type { PassageDiagnostic } from "../../passage-diagnostics.ts";

export type Rgba = [number, number, number, number];
export type Bounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export type PropertyValue = number | Point | Rgba | BezierPath | Point[];
export type EvaluatedTransform = {
  anchor: Point;
  position: Point;
  scale: Point;
  rotation: number;
  skewX: number;
  skewY: number;
  opacity: number;
};
export type EvaluatedMask = Omit<
  CompositionMask,
  "path" | "opacity" | "feather" | "expansion"
> & { path: BezierPath; opacity: number; feather: number; expansion: number };

export type EvaluatedLayer = {
  id: string;
  layer: CompositionLayer;
  time: number;
  /** Integer index into a layer's explicitly baked sample clock, when present. */
  sampleIndex?: number;
  visible: boolean;
  /** Content visibility also excludes nulls, groups and matte sources. */
  drawable: boolean;
  transform: EvaluatedTransform;
  constraintReference: Point;
  localMatrix: Matrix;
  worldMatrix: Matrix;
  screenMatrix: Matrix;
  /** Includes ancestor group opacity; ordinary parent opacity never inherits. */
  opacity: number;
  bounds: Bounds | null;
  masks: EvaluatedMask[];
  effects: EvaluatedEffect[];
  contents?: SampledShapeContent[];
  shapes?: CompiledShapes;
  color?: Rgba;
  state?: number;
  stateFrom?: number;
  stateMix?: number;
  reveal?: number;
  text?: string;
  timeRemap?: number;
  precomp?: EvaluatedLayerTree;
  /** The unmixed scope used by this layer's exposure sample. */
  exposure?: { tree: EvaluatedLayerTree; rootTime: number };
};

export type EvaluatedLayerTree = {
  id: string;
  time: number;
  width: number;
  height: number;
  fps: number;
  background: Rgba | null;
  /** All layer states in painter order, including invisible dependency layers. */
  layers: EvaluatedLayer[];
  diagnostics: PassageDiagnostic[];
};

export type EvaluationOptions = {
  /** Internal scope-clock overrides for temporal content sampling, keyed by instance route. */
  scopeTimes?: Readonly<Record<string, number>>;
  /** Include guide layers for inspection; the default matches export. */
  includeGuides?: boolean;
  /** Measured local text bounds, keyed by root layer id or precomp-id/layer-id.
   * Each entry is indexed by discrete text state. No font measurement occurs here. */
  textBounds?: Readonly<Record<string, readonly Bounds[]>>;
};
