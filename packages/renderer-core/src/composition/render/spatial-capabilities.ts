import { passageError } from "../../passage-diagnostics.ts";
import type { RenderOp, SurfaceNode } from "./graph.ts";
import { validateFlatLighting } from "./flat-lighting.ts";
import {
  localSurfaceBounds,
  type ProjectivePlacement,
} from "./projective-placement.ts";
/** Check the complete spatial graph before a retained target is cleared or drawn. */
export function requireSpatialCapabilities(
  root: SurfaceNode,
  capabilities: {
    projective: boolean;
    lighting?: boolean;
    depthImage?: boolean;
    validateSurface?:
      | ((width: number, height: number, node: string) => void)
      | undefined;
  },
) {
  const check = (placement: ProjectivePlacement, node: string) => {
    if (
      ![
        ...placement.homography,
        ...placement.inverse,
        ...(placement.depth ?? []),
      ].every((value) => Number.isFinite(Math.fround(value)))
    )
      passageError(
        "comp-3d-transform",
        "Projection coefficients exceed finite WebGL2 precision",
        { node },
      );
    if (!placement.affineMatrix && !capabilities.projective)
      passageError(
        "comp-feature-backend",
        "True perspective requires the composition WebGL2 backend; Canvas supports affine camera projection",
        { node },
      );
  };
  const visit = (ops: readonly RenderOp[], width: number, height: number) => {
    for (const op of ops) {
      for (const clip of op.clips)
        if (clip.projection) check(clip.projection, op.layer);
      if (op.kind === "project") {
        check(op.placement, op.layer);
        capabilities.validateSurface?.(
          op.surface.width,
          op.surface.height,
          op.layer,
        );
        const padding = op.focusPadding ?? 0;
        const limit = op.effects.some(
          (effect) =>
            effect.id === "camera-focus" && effect.effect === "blur.gaussian",
        )
          ? 386
          : 130;
        if (!Number.isInteger(padding) || padding < 0 || padding > limit)
          passageError(
            "comp-3d-surface-budget",
            `Focus padding must be an integer within 0..${limit}`,
            { node: op.layer },
          );
        const screen = localSurfaceBounds(
          {
            left: 0,
            top: 0,
            right: width + padding * 2,
            bottom: height + padding * 2,
          },
          op.layer,
        );
        capabilities.validateSurface?.(screen.width, screen.height, op.layer);
        visit(op.surface.ops, op.surface.width, op.surface.height);
      } else if (op.kind === "draw") {
        if (op.content.type === "depth-image" && !capabilities.depthImage)
          passageError(
            "comp-feature-backend",
            "Depth displacement requires the composition WebGL2 backend; prepare an explicit flat-image equivalent for Canvas",
            { node: op.layer },
          );
        if (op.projection) check(op.projection, op.layer);
        if (op.content.type === "surface")
          visit(
            op.content.surface.ops,
            op.content.surface.width,
            op.content.surface.height,
          );
      } else {
        if (op.kind === "isolate") {
          if (op.lighting) {
            validateFlatLighting(op.lighting, op.layer, width, height);
            if (!capabilities.lighting)
              passageError(
                "comp-feature-backend",
                "Flat-surface lighting requires the composition WebGL2 backend",
                { node: op.layer },
              );
          }
          visit(op.ops, width, height);
        } else
          for (const history of op.history ?? [])
            visit(history.ops, width, height);
      }
      if (op.kind !== "draw") {
        if (op.kind !== "project")
          for (const mask of op.masks)
            if (mask.projected) {
              if (!capabilities.projective)
                passageError(
                  "comp-feature-backend",
                  "Projective group masks require the composition WebGL2 backend",
                  { node: op.layer },
                );
              if (mask.projected.placement)
                check(mask.projected.placement, op.layer);
              capabilities.validateSurface?.(
                mask.projected.width,
                mask.projected.height,
                op.layer,
              );
            }
        for (const effect of op.effects)
          for (const input of Object.values(effect.layerInputs ?? {}))
            visit(input, width, height);
        if (op.matte) visit(op.matte.ops, width, height);
      }
    }
  };
  visit(root.ops, root.width, root.height);
}
