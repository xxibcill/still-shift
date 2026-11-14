// Control for treatment 1, pass 1: identical layers and attach constraints with
// every text animator removed. Comparing its hold frame with the pass-1 render
// isolates how animation excursions change the measured bounds that attached
// layers follow (O1 in the proof results).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const exported = new URL(
  "./pass1/t1-editorial-stack.composition.json",
  import.meta.url,
);
const pass1 = JSON.parse(readFileSync(exported, "utf8"));
const control = { ...pass1 };
delete control.textAnimators;
// Exported asset paths are relative to the JSON file; rebase them to absolute.
control.assets = pass1.assets.map((asset: { path: string }) => ({
  ...asset,
  path: fileURLToPath(new URL(asset.path, exported)),
}));
export default control;
