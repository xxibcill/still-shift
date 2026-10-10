import type { CompositionPreview } from "../../../packages/renderer-core/src/composition/render/index.ts";
import type { EvaluationOptions } from "../../../packages/renderer-core/src/composition/evaluate/index.ts";

/** Ready catalogues and measured bounds belong to the accepted preview, never the saved document. */
export function compositionPreviewEvaluation(
  preview:
    | Pick<CompositionPreview, "evaluationOptions" | "textBounds">
    | undefined,
): EvaluationOptions {
  return preview
    ? { ...preview.evaluationOptions, textBounds: preview.textBounds }
    : {};
}
