import { copyFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { CompositionSchema } from "@still-shift/scene-contract";
import { createNativePbrCompositionFixture } from "./native-pbr-composition-fixture.ts";
import { createNativeCompositionV2ProofFixture } from "../browser/native3d-composition-v2.ts";
/** Real imported source3 plus unchanged legacy/source2 exposure fixtures. */
export async function createNativePbrMixedFixture() {
  const pbr = await createNativePbrCompositionFixture(
    "/private/tmp/still-shift-ms2-mixed-export3-",
  );
  const legacy = await createNativeCompositionV2ProofFixture(
    "/private/tmp/still-shift-ms2-mixed-export3-input2-",
  );
  try {
    for (const file of ["mechanism.json", "solid.json"])
      await copyFile(join(legacy.directory, file), join(pbr.directory, file));
    const controller = pbr.composition.layers[0]!;
    const composition = CompositionSchema.parse({
      ...legacy.loaded.composition,
      id: "mixed-native3-export",
      assets: [...legacy.loaded.composition.assets, ...pbr.composition.assets],
      precomps: [
        ...legacy.loaded.composition.precomps!,
        {
          id: "pbr-inset",
          width: 320,
          height: 180,
          frameCount: 6,
          layers: [
            {
              ...controller,
              id: "world3",
              motionBlur: true,
              sourceStartFrame: 0.5,
            },
          ],
        },
      ],
      layers: [
        ...legacy.loaded.composition.layers,
        {
          id: "pbr-panel",
          type: "precomp",
          comp: "pbr-inset",
          motionBlur: true,
          transform: { anchor: [0, 0], position: [0, 0], scale: [0.75, 0.75] },
        },
      ],
    });
    await writeFile(
      join(pbr.directory, "composition.json"),
      JSON.stringify(composition, null, 2) + "\n",
    );
    return { directory: pbr.directory, root: legacy.root, composition };
  } finally {
    await rm(legacy.directory, { recursive: true, force: true });
  }
}
