import type { BezierPath, ShapeLeaf } from "@still-shift/scene-contract";
import type { Matrix, Point } from "../../node-transform.ts";
import type { Bounds, Rgba } from "../evaluate/types.ts";
import type { ShapeTransform } from "./geometry.ts";

type Replace<T, Fields> = Omit<T, keyof Fields | "metadata" | "name"> & Fields;
type Leaf<Type extends ShapeLeaf["type"]> = Extract<ShapeLeaf, { type: Type }>;
export type SampledShapeTransform = ShapeTransform & { opacity: number };
export type GradientStop = { id: string; offset: number; color: Rgba };
type Gradient = {
  opacity: number;
  start: Point;
  end: Point;
  stops: GradientStop[];
};
type Stroke = {
  opacity: number;
  width: number;
  dashOffset: number;
  pinch: number;
  pinchAt: number;
  pinchWidth: number;
};
export type SampledShapeContent =
  | {
      id: string;
      type: "group";
      contents: SampledShapeContent[];
      transform: SampledShapeTransform;
    }
  | Replace<Leaf<"rect">, { position: Point; size: Point; roundness: number }>
  | Replace<Leaf<"ellipse">, { position: Point; size: Point }>
  | Replace<
      Leaf<"polystar">,
      {
        position: Point;
        rotation: number;
        points: number;
        outerRadius: number;
        innerRadius: number;
        outerRoundness: number;
        innerRoundness: number;
      }
    >
  | Replace<Leaf<"path">, { path: BezierPath }>
  | Replace<Leaf<"fill">, { color: Rgba; opacity: number }>
  | Replace<Leaf<"stroke">, Stroke & { color: Rgba }>
  | Replace<Leaf<"gradient-fill">, Gradient>
  | Replace<Leaf<"gradient-stroke">, Gradient & Stroke>
  | Replace<Leaf<"trim-paths">, { start: number; end: number; offset: number }>
  | Replace<
      Leaf<"repeater">,
      {
        copies: number;
        offset: number;
        startOpacity: number;
        endOpacity: number;
        transform: ShapeTransform;
      }
    >
  | Leaf<"merge-paths">
  | Replace<Leaf<"offset-path">, { amount: number }>
  | Replace<Leaf<"round-corners">, { radius: number }>
  | Replace<
      Leaf<"wiggle-paths">,
      { size: number; detail: number; frequency: number; evolution: number }
    >
  | Replace<Leaf<"zig-zag">, { size: number; ridges: number }>
  | Replace<Leaf<"pucker-bloat">, { amount: number }>
  | Replace<Leaf<"twist">, { angle: number; center: Point }>;
export type ShapePaint = Extract<
  SampledShapeContent,
  { type: "fill" | "stroke" | "gradient-fill" | "gradient-stroke" }
>;
export type ShapeDraw = {
  paint: ShapePaint;
  paths: {
    id: string;
    path: BezierPath;
    source?: { points: Point[]; span: [number, number] };
  }[];
  matrix: Matrix;
  opacity: number;
};
export type CompiledShapes = {
  draws: ShapeDraw[];
  bounds: Bounds | null;
  paths: BezierPath[];
};
