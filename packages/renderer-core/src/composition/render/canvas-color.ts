import type { Rgba } from "../evaluate/types.ts";

const byte = (v: number) =>
  Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16)
    .padStart(2, "0");
/** `#RRGGBB`, or `#RRGGBBAA` when translucent, matching legacy hex fills. */
export function cssColor([r, g, b, a]: Rgba): string {
  return `#${byte(r)}${byte(g)}${byte(b)}${a < 1 ? byte(a) : ""}`;
}
