// Lint probe: a treatment with only its video layer and asset removed.
// `comp lint --pixels true` failed on all three treatments with a browser
// navigation error; this isolates whether the native video layer triggers it,
// and gives measured text-bounds framing for the type alone.
//   PROOF_TREATMENT=t3-minimal-centered pnpm --silent still-shift comp lint \
//     --input research/editorial-typography-proof/without-clip.ts --pixels true
const name = process.env.PROOF_TREATMENT ?? "t1-editorial-stack";
const source = await (await import(`./${name}.ts`)).default;
export default {
  ...source,
  layers: source.layers.filter(
    (layer: { type: string }) => layer.type !== "video",
  ),
  assets: source.assets.filter(
    (asset: { type: string }) => asset.type !== "video",
  ),
};
