import {
  createCompositionPreview,
  evaluateComp,
} from "../../packages/renderer-core/src/index.ts";
import {
  validateComposition,
  type Composition,
} from "../../packages/scene-contract/src/index.ts";

const directory = "/examples/composition/12-puppet-acting/";
export async function checkPuppetDemo() {
  const reports = [];
  for (const name of ["composition", "prop-follow"]) {
    const comp: Composition = await (
      await fetch(`${directory}${name}.json`)
    ).json();
    const valid = validateComposition(comp);
    if (!valid.ok) throw Error(JSON.stringify(valid));
    const images = new Map<string, HTMLImageElement>();
    for (const asset of comp.assets) {
      const image = new Image();
      image.src = `${directory}${asset.path}`;
      await image.decode();
      images.set(asset.id, image);
    }
    for (const backend of ["canvas2d", "webgl2"] as const) {
      const canvas = document.createElement("canvas");
      const preview = createCompositionPreview(
        canvas,
        comp,
        { images, fonts: new Map() },
        { backend },
      );
      const hashes: string[] = [];
      let picture = "";
      try {
        for (let frame = 0; frame < comp.frameCount; frame++) {
          try {
            preview.renderFrame(frame);
          } catch (error) {
            throw Error(`${name}/${backend}/frame=${frame}: ${String(error)}`);
          } // Includes the final quantized triangle-flip guard.
          const bytes = preview.readPixels().slice();
          hashes.push(
            Array.from(
              new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            )
              .map((x) => x.toString(16).padStart(2, "0"))
              .join(""),
          );
          if (frame === 23) picture = canvas.toDataURL("image/png");
          if (name === "prop-follow") {
            const state = evaluateComp(comp, frame);
            const actor = state.layers.find((layer) => layer.id === "actor")!;
            const prop = state.layers.find((layer) => layer.id === "prop")!;
            const pin = (actor.effects[0]!.params.pins as number[][])[5]!;
            if (
              Math.abs(pin[0]! + 16 - prop.transform.position[0]) > 1e-9 ||
              Math.abs(pin[1]! + 20 - prop.transform.position[1]) > 1e-9
            )
              throw Error(`Hand pin lost the constrained prop at ${frame}`);
          }
        }
        if (new Set(hashes).size < 20) throw Error("Demo must visibly animate");
        for (const frame of [47, 0, 23, 12, 0]) {
          preview.renderFrame(frame);
          const hash = Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                preview.readPixels().slice(),
              ),
            ),
          )
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("");
          if (hash !== hashes[frame])
            throw Error(`Demo reverse seek differs at ${frame}`);
        }
        reports.push({
          name,
          backend,
          frames: hashes.length,
          uniqueFrames: new Set(hashes).size,
          hashes,
          picture,
        });
      } finally {
        preview.dispose();
      }
    }
  }
  return reports;
}
