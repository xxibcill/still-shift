import {
  SIZED_LAYER_TYPES,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import type { Point } from "../../node-transform.ts";
import { scalar, unit, vector3 } from "./sample.ts";
import type { Point3, SpatialTransform } from "./spatial-geometry.ts";

type CameraLayer = Extract<CompositionLayer, { type: "camera" }>;
export type CameraValidationPhase = "intermediate" | "settled";
export type SampledCameraControls = {
  model: "one-node" | "two-node";
  pointOfInterest: Point3;
  /** Determines which optical control is primary; the other value is derived. */
  opticalMode: "zoom" | "focal-length";
  zoom: number;
  focalLength: number;
  filmSize: number;
  nearClip: number;
  farClip: number;
  depthOfField: boolean;
  focusDistance: number;
  aperture: number;
  blurLevel: number;
};

/** Samples the layer's keyed/indexed clock; parent composition and procedural clocks belong to evaluation. */
export function sampleSpatialTransform(
  layer: CompositionLayer,
  time: number,
  fps: number,
  viewport: Point,
  size: Point,
) {
  const authored = layer.transform;
  const isCamera = layer.type === "camera";
  const anchor: Point3 = SIZED_LAYER_TYPES.has(layer.type)
    ? [size[0] / 2, size[1] / 2, 0]
    : [0, 0, 0];
  const position: Point3 = isCamera
    ? [viewport[0] / 2, viewport[1] / 2, -viewport[0]]
    : [0, 0, 0];
  const transform: SpatialTransform & { opacity: number } = {
    anchor: vector3(authored?.anchor, time, fps, anchor),
    position: vector3(authored?.position, time, fps, position),
    scale: vector3(authored?.scale, time, fps, [1, 1, 1]),
    orientation: vector3(authored?.orientation, time, fps, [0, 0, 0]),
    rotation: scalar(authored?.rotation, time, fps),
    rotationX: scalar(authored?.rotationX, time, fps),
    rotationY: scalar(authored?.rotationY, time, fps),
    skewX: scalar(authored?.skewX, time, fps),
    skewY: scalar(authored?.skewY, time, fps),
    opacity: unit(scalar(authored?.opacity, time, fps, 1)),
  };
  return {
    transform,
    constraintReference: vector3(
      layer.constraintReference,
      time,
      fps,
      transform.anchor,
    ),
  };
}

/** Camera units and default selection are shared by property evaluation and inspection. */
export function sampleCameraControls(
  layer: CameraLayer,
  time: number,
  fps: number,
  viewport: Point,
  phase: CameraValidationPhase = "settled",
): SampledCameraControls {
  if (layer.zoom !== undefined && layer.focalLength !== undefined)
    throw Error(
      "Camera zoom and focalLength are mutually exclusive optical controls",
    );
  const model =
    layer.model ??
    (layer.pointOfInterest === undefined ? "one-node" : "two-node");
  if (model === "one-node" && layer.pointOfInterest !== undefined)
    throw Error("A one-node camera cannot author a point of interest");
  const filmSize = scalar(layer.filmSize, time, fps, 36);
  const opticalMode = layer.focalLength === undefined ? "zoom" : "focal-length";
  const focalLength = scalar(layer.focalLength, time, fps, 36);
  const zoom =
    opticalMode === "focal-length"
      ? (focalLength * viewport[0]) / filmSize
      : scalar(layer.zoom, time, fps, viewport[0]);
  const controls: SampledCameraControls = {
    model,
    pointOfInterest: vector3(layer.pointOfInterest, time, fps, [
      viewport[0] / 2,
      viewport[1] / 2,
      0,
    ]),
    opticalMode,
    zoom,
    focalLength:
      opticalMode === "zoom" ? (zoom * filmSize) / viewport[0] : focalLength,
    filmSize,
    nearClip: layer.nearClip ?? 0.01,
    farClip: layer.farClip ?? 10_000_000,
    depthOfField: layer.depthOfField === true,
    focusDistance: scalar(layer.focusDistance, time, fps, viewport[0]),
    aperture: scalar(layer.aperture, time, fps, 0),
    blurLevel: scalar(layer.blurLevel, time, fps, 1),
  };
  validateCameraControls(controls, phase);
  return controls;
}

/** Runtime overshoot and expression writes obey the same bounded optical domain. */
export function validateCameraControls(
  controls: SampledCameraControls,
  phase: CameraValidationPhase = "settled",
) {
  const ranges = {
    zoom: [0.001, 1_000_000],
    focalLength: [0.001, 10_000],
    filmSize: [0.001, 1000],
    nearClip: [0.001, 1_000_000],
    farClip: [0.002, 10_000_000],
    focusDistance: [0.001, 10_000_000],
    aperture: [0, 1000],
    blurLevel: [0, 100],
  } as const;
  for (const name of Object.keys(ranges) as (keyof typeof ranges)[]) {
    const value = controls[name],
      [minimum, maximum] = ranges[name];
    if (
      (name === "focalLength" && controls.opticalMode === "zoom") ||
      (name === "zoom" &&
        controls.opticalMode === "focal-length" &&
        phase === "intermediate")
    ) {
      if (!Number.isFinite(value) || value <= 0)
        throw Error(`Derived camera ${name} must be finite and positive`);
      continue;
    }
    if (!Number.isFinite(value) || value < minimum || value > maximum)
      throw Error(
        `Camera ${name} must be finite and within ${minimum}..${maximum}`,
      );
  }
  if (controls.nearClip >= controls.farClip)
    throw Error("Camera clip planes must be ordered");
  if (
    !controls.pointOfInterest.every(
      (value) => Number.isFinite(value) && Math.abs(value) <= 1_000_000,
    )
  )
    throw Error("Camera point of interest must be finite and within ±1000000");
}

/** Recompute the secondary optical value after motion/expression writes. */
export function refreshCameraControls(
  controls: SampledCameraControls,
  width: number,
  phase: CameraValidationPhase = "settled",
) {
  if (controls.opticalMode === "zoom")
    controls.focalLength = (controls.zoom * controls.filmSize) / width;
  else controls.zoom = (controls.focalLength * width) / controls.filmSize;
  validateCameraControls(controls, phase);
}
