import type {
  Composition,
  CompositionLayer,
  CompositionTransform,
} from "@still-shift/scene-contract";
import type { Page } from "playwright";
import type * as Render from "../../packages/renderer-core/src/index.ts";

/** Natural-size sampling must retain the established local primitive-blur pixels. */
export async function compositionAffineBlurAcceptance(page: Page) {
  return page.evaluate(async () => {
    const renderUrl = "/packages/renderer-core/src/index.ts",
      render = (await import(renderUrl)) as typeof Render,
      width = 128,
      height = 128,
      imageSize = 24;
    const source = document.createElement("canvas");
    source.width = source.height = imageSize;
    const context = source.getContext("2d", { willReadFrequently: true })!;
    context.fillStyle = "#ffffff";
    context.fillRect(3, 3, 18, 18);
    context.fillStyle = "#204080";
    context.fillRect(6, 6, 5, 12);
    context.fillStyle = "#e08020";
    context.fillRect(13, 8, 5, 8);
    const assetUrl = source.toDataURL("image/png"),
      png = await (await fetch(assetUrl)).arrayBuffer(),
      hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", png)),
      )
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
    const asset: Composition["assets"][number] = {
      id: "png",
      type: "image",
      path: "primitive-blur.png",
      width: imageSize,
      height: imageSize,
      sha256: `sha256:${hash}`,
    };
    const geometries: { name: string; transform: CompositionTransform }[] = [
      { name: "2x", transform: { scale: [2, 2, 1] } },
      { name: "nonuniform", transform: { scale: [2, 1.5, 1] } },
      {
        name: "rotated",
        transform: { scale: [2, 1.5, 1], rotation: 25 },
      },
    ];
    const documentFor = (
      transform: CompositionTransform,
      owner: "image" | "group" | "collapsed-precomp",
      radius: number,
      rasterize: "draw" | "natural-size",
    ): Composition => {
      const effects: NonNullable<CompositionLayer["effects"]> = [
        { id: "paint", effect: "blur.primitive", params: { radius } },
      ];
      const art: CompositionLayer = {
        id: "art",
        type: "image",
        threeD: true,
        size: [imageSize, imageSize],
        sources: [{ asset: asset.id }],
        fit: "stretch",
        rasterize,
        transform: {
          anchor: [imageSize / 2, imageSize / 2, 0],
          position: [width / 2, height / 2, 0],
          ...transform,
        },
        ...(owner === "image" ? { effects } : { parent: "parent" }),
      };
      const doc: Composition = {
        schemaVersion: "composition-1",
        id: "affine-primitive-blur",
        width,
        height,
        fps: 24,
        frameCount: 1,
        assets: [asset],
        layers: [{ id: "camera", type: "camera" }],
      };
      if (owner !== "image")
        doc.layers.push({
          id: "parent",
          type: "group",
          size: [width, height],
          transform: { anchor: [0, 0] },
          effects,
        });
      if (owner === "collapsed-precomp") {
        delete art.parent;
        doc.precomps = [
          {
            id: "source",
            width,
            height,
            frameCount: 1,
            layers: [art],
          },
        ];
        doc.layers.push({
          id: "nested",
          type: "precomp",
          comp: "source",
          parent: "parent",
          collapseTransforms: true,
          transform: { anchor: [0, 0] },
        });
      } else doc.layers.push(art);
      return doc;
    };
    const resources = await render.loadCompositionResources(
      documentFor(geometries[0]!.transform, "image", 0, "draw"),
      () => assetUrl,
    );
    if (!resources.pngImages?.has(asset.id))
      throw Error("Affine blur reference requires a verified decoded PNG");
    const pixelsFor = (doc: Composition, backend: "canvas2d" | "webgl2") => {
      const preview = render.createCompositionPreview(
        document.createElement("canvas"),
        doc,
        resources,
        { backend },
      );
      try {
        preview.renderFrame(0);
        return preview.readPixels().slice();
      } finally {
        preview.dispose();
      }
    };
    const reports = [];
    for (const backend of ["canvas2d", "webgl2"] as const)
      for (const geometry of geometries)
        for (const owner of ["image", "group", "collapsed-precomp"] as const)
          for (const radius of [0, 4]) {
            const reference = pixelsFor(
                documentFor(geometry.transform, owner, radius, "draw"),
                backend,
              ),
              actual = pixelsFor(
                documentFor(geometry.transform, owner, radius, "natural-size"),
                backend,
              ),
              metrics = render.compareFrames(reference, actual, width, height);
            if (!reference.some((value, index) => index % 4 === 0 && value > 0))
              throw Error(
                `${backend}/${geometry.name}/${owner}: empty reference`,
              );
            if (metrics.maxChannelDelta > 1)
              throw Error(
                `${backend}/${geometry.name}/${owner}/${radius}: natural-size changed local primitive blur ${JSON.stringify(metrics)}`,
              );
            reports.push({
              backend,
              geometry: geometry.name,
              owner,
              radius,
              metrics,
            });
          }
    return reports;
  });
}
