import type { RenderEffect } from "./graph.ts";

/** Passes the source texel through unchanged. */
export const COPY_SHADER =
  "void main() {pixel=texelFetch(source,ivec2(gl_FragCoord.xy),0);}";

/** A sampled effect must render with the definition version it was sampled at. */
export function assertEffectVersion(effect: RenderEffect, version: string) {
  if (effect.version !== undefined && effect.version !== version)
    throw Error(
      `comp-effect-version: ${effect.effect} differs from its sampled definition`,
    );
}
