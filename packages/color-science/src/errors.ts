/** Errors from the color-science core: invalid input, never a silent fallback. */
export class ColorScienceError extends Error {
  override readonly name = "ColorScienceError";
}
