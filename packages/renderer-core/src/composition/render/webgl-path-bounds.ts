import type { Bounds } from "../evaluate/types.ts";
import { unionBounds } from "./webgl-vector-regions.ts";

/** Canvas paths retain coordinates in device space, independently of save/restore. */
export class CanvasPathBounds {
  private box: Bounds | undefined;
  private known = true;

  get bounds() {
    return this.known ? this.box : undefined;
  }

  record(ctx: CanvasRenderingContext2D, method: string, args: unknown[]) {
    if (method === "beginPath") {
      this.box = undefined;
      this.known = true;
      return;
    }
    if (!this.known) return;
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
      case "arcTo":
        this.known = false;
        return;
      default:
        return;
    }
    const matrix = ctx.getTransform();
    for (const [x, y] of points) {
      const point = matrix.transformPoint({ x: x!, y: y! });
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        this.known = false;
        return;
      }
      const box = {
        left: point.x,
        top: point.y,
        right: point.x,
        bottom: point.y,
      };
      this.box = this.box ? unionBounds(this.box, box) : box;
    }
  }
}
