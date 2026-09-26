import { buildProductFloat } from "./product-float.ts";
import { commerceFormatRegistration } from "../../scene-contract/src/commerce-library.ts";
import { PreparedNodeSchema } from "../../scene-contract/src/prepared.ts";
import {
  CommerceSceneSchema,
  type CommerceBrief,
  type PreparedCommerceAssets,
} from "../../scene-contract/src/commerce.ts";

/** Move the complete supplied product image above a stationary, non-contact palm. */
export function buildCommerceFloating(
  brief: CommerceBrief,
  assets: PreparedCommerceAssets,
) {
  if (
    brief.selection.id !== "A01" ||
    brief.profile !== "feed" ||
    brief.product.preparation !== "cutout"
  )
    throw new Error(
      "Floating composition requires A01, an intact product cutout and the feed profile",
    );
  if (!brief.floating || !assets.backdrop)
    throw new Error("Floating composition needs a separate palm-up background");
  if (Math.abs(assets.backdrop.width / assets.backdrop.height - 0.8) > 0.01)
    throw new Error("The palm background needs a 4:5 photograph");
  if (
    brief.copy.callouts.length ||
    brief.copy.headlines.length ||
    brief.copy.cta ||
    brief.timing
  )
    throw new Error(
      "The basic floating composition uses no copy or entrance timing",
    );
  const width = 1080,
    height = 1350,
    travel = 18;
  const [left, top, relativeWidth] = brief.floating.placement;
  const float = buildProductFloat({
    id: "product",
    product: assets.product,
    x: left * width,
    y: top * height,
    width: relativeWidth * width,
    travel,
    fps: brief.fps,
    cycleDurationSeconds: brief.frameCount / brief.fps / 2,
    cycles: 2,
  });
  const product = float.nodes[0]!;
  if (
    float.bounds.x < 0 ||
    float.bounds.x + float.bounds.width > width ||
    float.bounds.y < 0 ||
    float.bounds.y + float.bounds.height + 40 > brief.floating.palmTop * height
  )
    throw new Error(
      "Keep the whole product in frame with at least 40 pixels of air above the hand",
    );
  const nodes = [
    {
      type: "image",
      id: "palm-background",
      width,
      height,
      fit: "cover",
      states: [{ asset: assets.backdrop.id }],
    },
  ].map((node) => PreparedNodeSchema.parse(node));
  nodes.push(...float.nodes);
  const [rx, ry, rw, rh] = brief.product.protectedRegion;
  return CommerceSceneSchema.parse({
    schemaVersion: "commerce-scene-1",
    title: brief.title,
    fps: brief.fps,
    frameCount: brief.frameCount,
    width,
    height,
    background: brief.theme.background,
    assets: [assets.product, assets.backdrop],
    fonts: [assets.font],
    nodes,
    events: float.events,
    recipe: { preset: "A01" },
    provenance: brief.product.provenance,
    metadata: {
      registration: commerceFormatRegistration(
        brief.selection,
        brief.artDirection,
        brief.profile,
      ),
      catalogVersion: brief.catalogVersion,
      selection: brief.selection,
      profile: brief.profile,
      productId: brief.product.id,
      productSource: brief.product.provenance,
      copySource: brief.copy.source,
      claimSources: [brief.floating.provenance],
      locale: brief.locale,
      protectedRegion: [
        product.x + rx * product.width,
        product.y + ry * product.height,
        rw * product.width,
        rh * product.height,
      ],
    },
  });
}
