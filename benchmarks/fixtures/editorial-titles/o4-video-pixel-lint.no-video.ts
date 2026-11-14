// O4 control — o4-video-pixel-lint.ts with only its video layer and asset
// removed. Pixel lint completing here isolates the native video layer.
import source from "./o4-video-pixel-lint.ts";

export default {
  ...source,
  layers: source.layers.filter((layer) => layer.type !== "video"),
  assets: source.assets.filter((asset) => asset.type !== "video"),
};
