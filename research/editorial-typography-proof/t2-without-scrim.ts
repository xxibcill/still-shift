// ET3 probe: treatment 2 with its gradient scrim removed (the scrim layer is
// disabled, so its keys and order stay valid). `text-contrast` should pass T2
// with the scrim and report the white type without it.
//   pnpm --silent still-shift comp lint --pixels true --legibility true \
//     --input research/editorial-typography-proof/t2-without-scrim.ts
import source from "./t2-thai-condensed-poster.ts";

export default {
  ...source,
  layers: source.layers.map((layer) =>
    layer.id === "scrim" ? { ...layer, enabled: false } : layer,
  ),
};
