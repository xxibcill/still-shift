// EC effect render cost fixture
// (docs/editorial-typography-improvement-plan.md#ec--effect-render-cost-shadow-halo).
//
// One pilot-style display title over the committed synthetic clip at the ET7a
// reel size (720×1280, 24 fps), with one treatment chosen by `EC_VARIANT`:
//   none     plain fill
//   outline  held stroke animator (the pilot's outline)
//   halo     zero-offset light.drop-shadow (the pilot's halo)
//   shadow   offset light.drop-shadow
//   glow     light.glow 1.1.0 with tint
//   all      outline + halo + shadow + glow on one layer
// `EC_FRAMES` sets the length (default 48: 24 frames of drift, 24 held still).
// Only committed, licence-free inputs are used, so timings and render hashes
// can be reproduced anywhere.
import { comp, text } from "@still-shift/motion";
import { latin } from "../../../research/editorial-titles-et7a/fonts.ts";
import { clipAsset } from "./shared.ts";
import { video } from "@still-shift/motion";

export const EC_VARIANTS = [
  "none",
  "outline",
  "halo",
  "shadow",
  "glow",
  "all",
] as const;
export type EcVariant = (typeof EC_VARIANTS)[number];

const halo = {
  id: "halo",
  effect: "light.drop-shadow" as const,
  params: { offset: [0, 0], blur: 16, opacity: 0.9, color: "#3A0F1E" },
};
const shadow = {
  id: "shadow",
  effect: "light.drop-shadow" as const,
  params: { offset: [0, 6], blur: 12, opacity: 0.8, color: "#1A0A0A" },
};
const glow = {
  id: "glow",
  effect: "light.glow" as const,
  params: { radius: 12, intensity: 0.9, color: "#FFD27A", tint: 1 },
};

export function ecEffectCost(variant: EcVariant, frames = 48) {
  const effects =
    variant === "halo"
      ? [halo]
      : variant === "shadow"
        ? [shadow]
        : variant === "glow"
          ? [glow]
          : variant === "all"
            ? [halo, shadow, glow]
            : [];
  const drift = Math.min(frames, 24);
  return comp(
    {
      id: `ec-effect-cost-${variant}`,
      width: 720,
      height: 1280,
      fps: 24,
      frames,
      fontCoverage: "strict",
      assets: [latin.abril, clipAsset],
    },
    (c) => {
      c.textStyle("fat", { fontAsset: "abril", size: 180 });
      const title = text("plaid", {
        id: "title",
        style: "fat",
        fontSize: 180,
        color: "#FFFFFF",
      })
        .at(360, 700)
        .with({
          align: "center",
          anchor: "baseline",
          textRole: "heading",
          ...(effects.length ? { effects } : {}),
        });
      c.add(title);
      c.add(
        video("clip", clipAsset, { size: [720, 1280], fit: "stretch" })
          .anchor("center")
          .at(360, 640),
      );
      c.timeline(title.moveBy([0, -20], drift));
      if (variant === "outline" || variant === "all")
        c.textAnimator({
          node: "title",
          unit: "line",
          start: 0,
          end: 1,
          stagger: 0,
          selector: { start: 0, end: 1 },
          from: { stroke: "#111111", strokeWidth: 14 },
          to: { stroke: "#111111", strokeWidth: 14 },
        });
    },
  );
}

const variant = (process.env.EC_VARIANT ?? "halo") as EcVariant;
if (!EC_VARIANTS.includes(variant))
  throw new Error(`EC_VARIANT must be one of ${EC_VARIANTS.join(", ")}`);
export default ecEffectCost(
  variant,
  process.env.EC_FRAMES ? Number(process.env.EC_FRAMES) : undefined,
);
