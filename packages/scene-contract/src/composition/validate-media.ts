import type {
  Composition,
  CompositionAsset,
  CompositionScope,
} from "./composition.ts";
import type { CompositionLayer } from "./layers.ts";
import { resolveCompositionMediaLimits } from "./media.ts";
import { CompositionPcmClock } from "./audio-clock.ts";
import { isResolvedProperty, resolvePropertyPath } from "./resolve.ts";
import type { IssueReporter } from "./primitives.ts";

type Path = (string | number)[];
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export function checkMediaAssets(comp: Composition, fail: IssueReporter) {
  const limits = resolveCompositionMediaLimits(comp.mediaLimits);
  if (
    comp.assets.some((a) => ["video", "sequence", "audio"].includes(a.type)) &&
    comp.frameCount / comp.fps > limits.maxDurationSeconds
  )
    fail(
      "comp-media-limit",
      ["frameCount"],
      "Composition exceeds the configured media duration",
    );
  comp.assets.forEach((asset, index) => {
    const path = ["assets", index];
    if (asset.type === "audio") {
      if (asset.sampleCount / 48000 > limits.maxDurationSeconds)
        fail(
          "comp-media-limit",
          [...path, "sampleCount"],
          "Audio exceeds the configured source duration",
        );
      return;
    }
    if (asset.type !== "video" && asset.type !== "sequence") return;
    const { numerator, denominator } = asset.frameRate;
    if (gcd(numerator, denominator) !== 1 || numerator / denominator > 240)
      fail(
        "comp-media-rate",
        [...path, "frameRate"],
        "Source rate must be reduced and no greater than 240 fps",
      );
    if (
      (asset.frameCount * denominator) / numerator >
        limits.maxDurationSeconds ||
      asset.width > limits.maxWidth ||
      asset.height > limits.maxHeight
    )
      fail(
        "comp-media-limit",
        path,
        "Source exceeds the configured duration or resolution",
      );
    if (asset.color.matrix === "gbr" && asset.color.range !== "pc")
      fail(
        "comp-media-color",
        [...path, "color"],
        "RGB source samples must use full range",
      );
    if (
      asset.type === "sequence" &&
      (!/^(?:[^%]*\/)?[^/%]*%0[1-9]\d?d[^/%]*\.png$/.test(asset.path) ||
        asset.color.matrix !== "gbr")
    )
      fail(
        "comp-media-sequence",
        [...path, "path"],
        "Sequences require one numbered PNG pattern and full-range RGB metadata with a supported transfer",
      );
  });
}

export function checkMediaLayer(
  layer: CompositionLayer,
  asset: CompositionAsset | undefined,
  path: Path,
  fail: IssueReporter,
) {
  if (
    (layer.type === "video" || layer.type === "sequence") &&
    asset &&
    asset.type === layer.type
  ) {
    const begin = layer.sourceInFrame ?? 0;
    const end = layer.sourceOutFrame ?? asset.frameCount;
    if (begin >= end || end > asset.frameCount)
      fail(
        "comp-media-trim",
        path,
        "Visual source trim must be nonempty and inside the pinned frame count",
      );
  }
  if (layer.type !== "audio" || asset?.type !== "audio") return;
  const begin = layer.sourceStartSample ?? 0;
  const end = layer.sourceEndSample ?? asset.sampleCount;
  if (
    begin >= end ||
    end > asset.sampleCount ||
    (layer.fadeInSamples ?? 0) > end - begin ||
    (layer.fadeOutSamples ?? 0) > end - begin
  )
    fail(
      "comp-media-trim",
      path,
      "Audio trim and fades must fit the actual decoded source interval",
    );
  if (
    layer.threeD ||
    layer.masks?.length ||
    layer.effects?.length ||
    layer.trackMatte
  )
    fail(
      "comp-media-audio-property",
      path,
      "Audio layers do not accept visual effects, masks, mattes or spatial projection",
    );
  if (layer.role === "narration" && changedClock(layer))
    fail(
      "comp-media-narration-clock",
      path,
      "Narration must retain its source clock",
    );
}

const changedClock = (layer: CompositionLayer) =>
  (layer.stretch !== undefined && layer.stretch !== 1) ||
  layer.holdFrame !== undefined ||
  layer.posterizeFps !== undefined ||
  layer.sampleTimes !== undefined ||
  ("timeRemap" in layer && layer.timeRemap !== undefined) ||
  (layer.type === "precomp" && layer.loop !== undefined);

export type CompositionProtectedNarration = {
  key: string;
  asset: Extract<CompositionAsset, { type: "audio" }>;
  startSample: number;
  sourceStartSample: number;
  sourceEndSample: number;
};

/** The validation walk also supplies exact authorized intervals to passage assembly. */
export function compositionProtectedNarration(comp: Composition) {
  return checkProtectedNarration(comp, (code, _path, message) => {
    throw new Error(`${code}: ${message}`);
  });
}

/** Validate every authored reachable voice before any preview/export range is selected. */
export function checkProtectedNarration(
  comp: Composition,
  fail: IssueReporter,
) {
  const voices: CompositionProtectedNarration[] = [];
  if (
    ![comp, ...(comp.precomps ?? [])].some((scope) =>
      scope.layers.some(
        (layer) => layer.type === "audio" && layer.role === "narration",
      ),
    )
  )
    return voices;
  const clockWriters = new Set<string>();
  for (const target of [
    ...Object.keys(comp.expressions ?? {}),
    ...(comp.drivers ?? []).map((d) => d.target),
    ...(comp.periodic ?? []).flatMap((d) => (d.target ? [d.target] : [])),
  ]) {
    if (!target.endsWith(".timeRemap")) continue;
    const resolved = resolvePropertyPath(comp, target);
    if (isResolvedProperty(resolved)) clockWriters.add(resolved.path);
  }
  const assets = new Map(comp.assets.map((a) => [a.id, a]));
  const walk = (
    scope: CompositionScope,
    route: string[],
    origin: CompositionPcmClock,
    begin: number,
    end: number,
    altered: boolean,
    ancestors: Set<string>,
  ) => {
    const fps = scope.fps ?? comp.fps;
    scope.layers.forEach((layer, index) => {
      const key = [...route, layer.id].join("/");
      const clockChanged =
        altered || changedClock(layer) || clockWriters.has(key + ".timeRemap");
      const visibility = (candidate: CompositionLayer) => [
        origin.place(candidate.inPoint ?? 0, fps).sample,
        origin.place(candidate.outPoint ?? scope.frameCount, fps).sample,
      ];
      let [visibleBegin, visibleEnd] = visibility(layer);
      const parents = new Set<string>();
      for (let id = layer.parent; id && !parents.has(id); ) {
        parents.add(id);
        const parent = scope.layers.find((candidate) => candidate.id === id);
        if (!parent) break;
        if (parent.type === "group") {
          const [a, b] = visibility(parent);
          visibleBegin = Math.max(visibleBegin!, a!);
          visibleEnd = Math.min(visibleEnd!, b!);
        }
        id = parent.parent;
      }
      const nextBegin = Math.max(begin, visibleBegin!);
      const nextEnd = Math.min(end, visibleEnd!);
      const placementClock = origin.place(layer.startFrame ?? 0, fps);
      const placement = placementClock.sample;
      const path: Path =
        scope === comp
          ? ["layers", index]
          : ["precomps", comp.precomps!.indexOf(scope), "layers", index];
      if (layer.type === "audio" && layer.role === "narration") {
        if (clockChanged)
          fail(
            "comp-media-narration-clock",
            path,
            `Narration instance ${key} inherits a changed source clock`,
          );
        const asset = assets.get(layer.asset);
        if (asset?.type === "audio") {
          voices.push({
            key,
            asset,
            startSample: placement,
            sourceStartSample: layer.sourceStartSample ?? 0,
            sourceEndSample: layer.sourceEndSample ?? asset.sampleCount,
          });
          const length =
            (layer.sourceEndSample ?? asset.sampleCount) -
            (layer.sourceStartSample ?? 0);
          if (placement < nextBegin || placement + length > nextEnd)
            fail(
              "comp-media-narration-range",
              path,
              `The complete authorized narration interval ${key} must fit picture and all inherited visibility windows`,
            );
        }
      }
      if (
        layer.type !== "precomp" ||
        ancestors.has(layer.comp) ||
        route.length >= 8
      )
        return;
      const nested = comp.precomps?.find((p) => p.id === layer.comp);
      if (!nested) return;
      walk(
        nested,
        [...route, layer.id],
        placementClock,
        Math.max(nextBegin, placement),
        Math.min(
          nextEnd,
          placementClock.place(nested.frameCount, nested.fps ?? comp.fps)
            .sample,
        ),
        clockChanged,
        new Set([...ancestors, layer.comp]),
      );
    });
  };
  const origin = new CompositionPcmClock();
  walk(
    comp,
    [],
    origin,
    0,
    origin.place(comp.frameCount, comp.fps).sample,
    false,
    new Set(),
  );
  return voices;
}
