import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Three valid Story frames keep lifecycle tests on the real rendering boundary. */
export async function writeExportScene(directory: string) {
  const source =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#247080"/></svg>';
  const sourcePath = join(directory, "source.svg");
  await writeFile(sourcePath, source);
  const scenePath = join(directory, "scene.json");
  await writeFile(
    scenePath,
    JSON.stringify({
      schemaVersion: "story-scene-1",
      title: "Export lifecycle fixture",
      fps: 24,
      frameCount: 3,
      assets: [
        {
          id: "source",
          path: sourcePath,
          sha256: `sha256:${createHash("sha256").update(source).digest("hex")}`,
          width: 16,
          height: 16,
        },
      ],
      nodes: [
        {
          id: "subject",
          type: "image",
          width: 100,
          height: 100,
          states: [{ asset: "source" }, { asset: "source" }],
        },
        {
          id: "qualifier",
          type: "text",
          x: 150,
          y: 100,
          text: "Lifecycle fixture",
          fontSize: 32,
          color: "#000000",
        },
        {
          id: "anchor",
          type: "rect",
          x: 400,
          y: 200,
          width: 50,
          height: 50,
          fill: "#336699",
        },
      ],
      recipe: {
        preset: "category_swap",
        subject: "subject",
        fromState: 0,
        toState: 1,
        swapFrame: 1,
        qualifier: "qualifier",
        stableAnchors: ["anchor"],
      },
    }),
  );
  return scenePath;
}
