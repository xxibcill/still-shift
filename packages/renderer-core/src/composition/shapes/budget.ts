import { SHAPE_LIMITS } from "@still-shift/scene-contract";
import {
  passageError,
  type PassageDiagnostic,
} from "../../passage-diagnostics.ts";
import type { Point } from "../../node-transform.ts";

type Location = Omit<PassageDiagnostic, "code" | "severity" | "message">;
type Work = { vertices: number; paths: number };

/** Shared by a frame's shape compilations, including groups and repeater copies. */
export class ShapeGeometryBudget {
  readonly location: Location;
  private readonly work: Work;
  constructor(location: Location = {}, work: Work = { vertices: 0, paths: 0 }) {
    this.location = location;
    this.work = work;
  }

  located(location: Location) {
    return new ShapeGeometryBudget(
      { ...this.location, ...location },
      this.work,
    );
  }

  vertices(count: number) {
    if (
      !Number.isSafeInteger(count) ||
      count < 0 ||
      this.work.vertices + count > SHAPE_LIMITS.generatedVertices
    )
      this.fail(
        "comp-shape-work-limit",
        "Shape geometry exceeds its generated-vertex work budget",
      );
    this.work.vertices += count;
  }

  paths(count = 1) {
    if (
      !Number.isSafeInteger(count) ||
      count < 0 ||
      this.work.paths + count > SHAPE_LIMITS.paths
    )
      this.fail(
        "comp-shape-work-limit",
        "Shape geometry exceeds its generated-path work budget",
      );
    this.work.paths += count;
  }

  point(point: Point): Point {
    if (
      point.some(
        (value) =>
          !Number.isFinite(value) ||
          Math.abs(value) > SHAPE_LIMITS.maxGeneratedCoordinate,
      )
    )
      this.fail(
        "comp-shape-coordinate",
        "Generated shape coordinates must be finite and within ±1,000,000,000",
      );
    return point;
  }

  fail(code: string, message: string): never {
    return passageError(code, message, this.location);
  }
}
