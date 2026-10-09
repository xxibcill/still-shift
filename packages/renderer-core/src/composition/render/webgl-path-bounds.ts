import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../managed-metadata.ts";
import type { Bounds } from "../evaluate/types.ts";
import { unionBounds } from "./webgl-vector-regions.ts";

/** Canvas paths retain coordinates in device space, independently of save/restore. */
export class CanvasPathBounds {
  private readonly state = allocateRenderMetadata<{
    box: Bounds | undefined;
    known: boolean;
  }>(
    256,
    () => ({ box: undefined, known: true }),
    false,
    (value) => {
      value.box = undefined;
      value.known = false;
    },
  );
  dispose() {
    this.state.box = undefined;
    this.state.known = false;
    releaseRenderMetadata(this.state);
  }

  get bounds() {
    return this.state.known ? this.state.box : undefined;
  }

  record(ctx: CanvasRenderingContext2D, method: string, args: unknown[]) {
    if (method === "beginPath") {
      this.state.box = undefined;
      this.state.known = true;
      return;
    }
    if (!this.state.known) return;
    if (method === "arcTo") {
      this.state.known = false;
      return;
    }
    const count =
      method === "moveTo" || method === "lineTo"
        ? 1
        : method === "quadraticCurveTo"
          ? 2
          : method === "bezierCurveTo"
            ? 3
            : method === "rect" ||
                method === "roundRect" ||
                method === "arc" ||
                method === "ellipse"
              ? 4
              : 0;
    if (!count) return;
    // Original point tuples/outer array and native matrix, before their factories.
    const temporary = allocateRenderMetadata<{
      points: number[][] | undefined;
      matrix: DOMMatrix | undefined;
    }>(
      320 + 80 * count,
      () => ({ points: undefined, matrix: undefined }),
      false,
      (value) => {
        if (value.points) {
          for (const point of value.points) point.length = 0;
          value.points.length = 0;
        }
        value.points = undefined;
        value.matrix = undefined;
      },
    );
    try {
      const values = args as number[];
      let points: number[][];
      switch (method) {
        case "moveTo":
        case "lineTo":
          points = [[values[0]!, values[1]!]];
          break;
        case "quadraticCurveTo":
          points = [
            [values[0]!, values[1]!],
            [values[2]!, values[3]!],
          ];
          break;
        case "bezierCurveTo":
          points = [
            [values[0]!, values[1]!],
            [values[2]!, values[3]!],
            [values[4]!, values[5]!],
          ];
          break;
        case "rect":
        case "roundRect": {
          const [x, y, width, height] = values as [
            number,
            number,
            number,
            number,
          ];
          points = [
            [x, y],
            [x + width, y],
            [x + width, y + height],
            [x, y + height],
          ];
          break;
        }
        case "arc":
        case "ellipse": {
          const [x, y, rx] = values as [number, number, number];
          const ry = method === "arc" ? rx : values[3]!;
          const angle = method === "arc" ? 0 : values[4]!;
          const dx = Math.hypot(rx * Math.cos(angle), ry * Math.sin(angle));
          const dy = Math.hypot(rx * Math.sin(angle), ry * Math.cos(angle));
          points = [
            [x - dx, y - dy],
            [x + dx, y - dy],
            [x + dx, y + dy],
            [x - dx, y + dy],
          ];
          break;
        }
        default:
          return;
      }
      temporary.points = points;
      const matrix = (temporary.matrix = ctx.getTransform());
      for (const [x, y] of points) {
        // Input/native point, point box and possible union stay admitted through consumption.
        const current = allocateRenderMetadata<{ point: DOMPoint | undefined }>(
          384,
          () => ({ point: matrix.transformPoint({ x: x!, y: y! }) }),
          false,
          (value) => {
            value.point = undefined;
          },
        );
        try {
          const point = current.point!;
          if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            this.state.known = false;
            return;
          }
          const box = {
            left: point.x,
            top: point.y,
            right: point.x,
            bottom: point.y,
          };
          this.state.box = this.state.box
            ? unionBounds(this.state.box, box)
            : box;
        } finally {
          releaseRenderMetadata(current);
        }
      }
    } finally {
      releaseRenderMetadata(temporary);
    }
  }
}
