import { z } from "zod";
import type { CommerceScene } from "./commerce.ts";
const number = z.number().finite();
const id = z.string().regex(/^[a-zA-Z][\w-]*$/);
const point = z.tuple([number, number]);
const box = z.tuple([
  number.nonnegative(),
  number.nonnegative(),
  number.positive(),
  number.positive(),
]);
export const CommerceGeometrySchema = z
  .object({
    node: id,
    asset: id,
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    visibleBounds: box,
    anchors: z.record(id, point),
    protectedRegions: z.array(box).max(16).default([]),
  })
  .strict();
export const CommerceAttachmentSchema = z
  .object({
    path: id,
    endpoint: z.enum(["start", "end"]),
    source: id,
    anchor: id,
    offset: point.default([0, 0]),
    protect: z.boolean().default(true),
  })
  .strict();
export const CommerceMatteSchema = z
  .object({
    target: id,
    mask: id,
    invert: z.boolean().default(false),
    space: z.literal("canvas").default("canvas"),
    order: z.literal("after-effects").default("after-effects"),
  })
  .strict();
export const CommerceVisibilitySchema = z
  .object({
    target: id,
    start: number.int().nonnegative(),
    end: number.int().positive(),
  })
  .strict();
export const CommerceTextFitSchema = z
  .object({
    target: id,
    minSize: number.int().min(16).max(180),
    maxSize: number.int().min(16).max(180),
    panel: id.optional(),
    padding: number.nonnegative().max(200).default(24),
  })
  .strict();
export type CommerceGeometry = z.infer<typeof CommerceGeometrySchema>;
export function validateCommerceSpatial(
  scene: CommerceScene,
  fail: (message: string) => void,
) {
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  const unique = (items: string[], label: string) => {
    if (new Set(items).size !== items.length) fail("Duplicate " + label);
  };
  unique(
    (scene.geometry ?? []).map((g) => g.node),
    "product geometry",
  );
  for (const geometry of scene.geometry ?? []) {
    const node = nodes.get(geometry.node),
      asset = scene.assets.find((a) => a.id === geometry.asset);
    if (!asset || asset.sha256 !== geometry.sha256) {
      fail("Product geometry asset hash mismatch");
      continue;
    }
    if (
      node?.type !== "image" ||
      node.states.length !== 1 ||
      node.states[0]!.asset !== asset.id
    )
      fail("Geometry needs one matching image state");
    for (const [x, y, w, h] of [
      geometry.visibleBounds,
      ...geometry.protectedRegions,
    ])
      if (x + w > asset.width || y + h > asset.height)
        fail("Geometry bounds exceed source image");
    for (const [x, y] of Object.values(geometry.anchors))
      if (x < 0 || y < 0 || x > asset.width || y > asset.height)
        fail("Anchor exceeds source bounds");
  }
  unique(
    (scene.attachments ?? []).map((a) => a.path + ":" + a.endpoint),
    "attachment endpoint",
  );
  for (const a of scene.attachments ?? []) {
    if (nodes.get(a.path)?.type !== "path") fail("Attachment needs a path");
    const g = scene.geometry?.find((g) => g.node === a.source);
    if (!g || !Object.hasOwn(g.anchors, a.anchor))
      fail("Attachment needs an existing product anchor");
    // Image landmarks are independent of path points; follower graphs cannot feed back into their source.
    if (a.source === a.path) fail("Cyclic attachment");
  }
  unique(
    (scene.mattes ?? []).map((m) => m.target),
    "matte target",
  );
  for (const m of scene.mattes ?? []) {
    const target = nodes.get(m.target),
      mask = nodes.get(m.mask);
    if (!target || target.parent || !mask || mask.parent || m.mask === m.target)
      fail("Matte requires independent root nodes");
    if (scene.mattes?.some((other) => other.target === m.mask))
      fail("Matte dependency cycles/chains are unsupported");
    if (scene.effects?.some((e) => "target" in e && e.target === m.mask))
      fail("Matte source uses raw alpha; effects on mask are unsupported");
  }
  unique(
    (scene.visibility ?? []).map((v) => v.target),
    "visibility target",
  );
  for (const v of scene.visibility ?? [])
    if (
      !nodes.has(v.target) ||
      nodes.get(v.target)?.parent ||
      v.end <= v.start ||
      v.end > scene.frameCount
    )
      fail("Visibility requires a root and a window inside the timeline");
  unique(
    (scene.textFits ?? []).map((f) => f.target),
    "text fit",
  );
  unique(
    (scene.textFits ?? []).flatMap((f) => (f.panel ? [f.panel] : [])),
    "fitted panel",
  );
  for (const fit of scene.textFits ?? []) {
    const node = nodes.get(fit.target),
      panel = fit.panel ? nodes.get(fit.panel) : undefined;
    if (node?.type !== "text" || !node.textBox || fit.minSize > fit.maxSize)
      fail("Text fit needs a measured text node and valid size range");
    if (fit.panel && (panel?.type !== "rect" || panel.parent !== node?.parent))
      fail("Fitted panel must share the text coordinate space");
  }
  if (
    scene.metadata.registration.status === "production" &&
    [
      scene.geometry,
      scene.attachments,
      scene.mattes,
      scene.visibility,
      scene.textFits,
    ].some((list) => list?.length)
  )
    fail("Spatial components are Experimental");
}
