import { authoredFontDiagnostics } from "./fonts.ts";
import {
  encodeSources,
  builderSource,
  inheritedTracks,
  type SourceTrack,
} from "./source-map.ts";
import {
  validateComposition,
  behaviourExpressions,
  CompositionAssetSchema,
  type Composition,
  type CompositionLayer,
  type CompositionAsset,
  type Precomp,
  type CompositionMarker,
  type CompositionDriver,
  type CompositionBehaviour,
  type CompositionPeriodic,
} from "@still-shift/scene-contract";
import type { Layer, Kind } from "./layers.ts";
import { frames, par, schedule, type Duration } from "./timeline.ts";
import type { Motion, Animation } from "./properties.ts";
import type { Scheduled } from "./timeline.ts";
import { applyAnimations } from "./animations.ts";
import {
  BuilderError,
  sourceLocation,
  sourceOf,
  recordSource,
  type SourceLocation,
} from "./source.ts";
import { expression, type Expression } from "./expressions.ts";
export type CompOptions = Omit<
  Composition,
  "schemaVersion" | "frameCount" | "layers" | "assets" | "id"
> & {
  id?: string;
  frames?: number;
  seconds?: number;
  assets?: CompositionAsset[];
};
export class CompositionBuilder {
  readonly composition: Composition;
  private readonly nodes: {
    id: string;
    draft: CompositionLayer;
    location: SourceLocation;
  }[] = [];
  private readonly timelines: Motion[] = [];
  private readonly tracks: SourceTrack[] = [];
  private readonly sites = new Map<string, SourceLocation>();
  constructor(options: CompOptions) {
    const {
      frames: count,
      seconds,
      id = "composition",
      assets = [],
      ...native
    } = options;
    if ((count === undefined) === (seconds === undefined))
      throw new BuilderError(
        "comp-builder-duration",
        "Specify exactly one of frames or seconds",
      );
    const frameCount = count ?? frames({ seconds: seconds! }, options.fps);
    this.composition = {
      ...structuredClone(native),
      id,
      schemaVersion: "composition-1",
      frameCount,
      layers: [],
      assets: [],
    };
    const site = sourceLocation();
    this.sites.set("comp", site);
    for (const marker of this.composition.markers ?? [])
      this.sites.set(`marker:${marker.id}`, site);
    for (const driver of this.composition.drivers ?? [])
      this.sites.set(`driver:${driver.target}`, site);
    for (const [index] of (this.composition.behaviours ?? []).entries())
      this.sites.set(`behaviour:${index}`, site);
    for (const [index] of (this.composition.periodic ?? []).entries())
      this.sites.set(`periodic:${index}`, site);
    for (const path of Object.keys(this.composition.expressions ?? {}))
      this.sites.set(`expression:${path}`, site);
    for (const precomp of this.composition.precomps ?? []) {
      this.sites.set(`precomp:${precomp.id}`, site);
      for (const child of precomp.layers)
        this.sites.set(`precomp:${precomp.id}.layer:${child.id}`, site);
    }
    assets.forEach((asset) => this.asset(asset));
  }
  add<K extends Kind>(node: Layer<K>): Layer<K> {
    if (node.autoId) {
      const base = node.id;
      let suffix = 1;
      while (this.nodes.some((existing) => existing.id === node.id))
        node.draft.id = `${base}-${++suffix}`;
    }
    if (this.nodes.some((existing) => existing.id === node.id))
      throw new BuilderError(
        "comp-builder-id",
        `Duplicate layer ${node.id}`,
        node.location,
      );
    if (node.imageAsset) this.asset(node.imageAsset);
    const draft: CompositionLayer = node.draft;
    if (draft.type === "image") {
      for (const source of draft.sources) {
        const asset = this.composition.assets.find(
          (asset) => asset.id === source.asset || asset.path === source.asset,
        );
        if (!asset || asset.type !== "image")
          throw new BuilderError(
            "comp-builder-asset",
            `Register image ${source.asset} before adding ${node.id}`,
            node.location,
          );
        source.asset = asset.id;
        if (node.inferImageSize) {
          draft.size = [asset.width, asset.height];
          node.inferImageSize = false;
        }
        if (node.pendingAnchor) node.anchor(node.pendingAnchor);
      }
    }
    if (node.nested) this.define(node.nested);
    this.nodes.push(node);
    this.sites.set(`layer:${node.id}`, node.location);
    return node;
  }
  asset(asset: CompositionAsset): CompositionAsset {
    const site = sourceOf(asset) ?? sourceLocation();
    const result = CompositionAssetSchema.safeParse(asset);
    if (!result.success)
      throw new BuilderError(
        "comp-builder-asset",
        result.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
        site,
      );
    const parsed = result.data;
    const previous = this.composition.assets.find(
      (item) => item.id === parsed.id,
    );
    if (previous && JSON.stringify(previous) !== JSON.stringify(parsed))
      throw new BuilderError(
        "comp-builder-asset",
        `Conflicting asset ${parsed.id}`,
      );
    if (!previous) this.composition.assets.push(parsed);
    this.sites.set(`asset:${parsed.id}`, site);
    return parsed;
  }
  define(source: Composition | Precomp): void {
    if ("schemaVersion" in source) {
      for (const field of [
        "camera2d",
        "signals",
        "drivers",
        "periodic",
        "expressions",
        "behaviours",
        "motionBlur",
      ] as const) {
        const value = source[field];
        const present = Array.isArray(value)
          ? value.length > 0
          : value && typeof value === "object"
            ? Object.keys(value).length > 0
            : value !== undefined;
        if (present)
          throw new BuilderError(
            "comp-builder-precomp-scope",
            `Precomp ${source.id} has root-only ${field}; author instance drivers/expressions on the containing composition`,
          );
      }
      for (const [id, style] of Object.entries(source.textStyles ?? {})) {
        const styles = (this.composition.textStyles ??= {});
        if (styles[id] && JSON.stringify(styles[id]) !== JSON.stringify(style))
          throw new BuilderError(
            "comp-builder-style",
            `Conflicting text style ${id}`,
          );
        styles[id] = structuredClone(style);
        this.sites.set(
          `textStyle:${id}`,
          builderSource(source, `textStyles.${id}`) ?? sourceLocation(),
        );
      }
    }
    const {
      id,
      name,
      width,
      height,
      frameCount,
      layers,
      markers,
      constraints,
      textAnimators,
      fps,
    } = source;
    const nested: Precomp = {
      id,
      width,
      height,
      frameCount,
      layers: structuredClone(layers),
      ...(name === undefined ? {} : { name }),
      ...(fps === undefined ? {} : { fps }),
      ...(markers === undefined ? {} : { markers }),
      ...(constraints === undefined ? {} : { constraints }),
      ...(textAnimators === undefined ? {} : { textAnimators }),
      ...("background" in source && source.background !== undefined
        ? { background: source.background }
        : {}),
    };
    const precomps = (this.composition.precomps ??= []);
    const previous = precomps.find((item) => item.id === id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(nested))
      throw new BuilderError(
        "comp-builder-precomp",
        `Conflicting precomp ${id}`,
      );
    if (!previous) {
      precomps.push(nested);
      if ("schemaVersion" in source)
        this.tracks.push(...inheritedTracks(source, id));
    }
    if ("assets" in source)
      source.assets.forEach((asset, index) => {
        this.asset(asset);
        this.sites.set(
          `asset:${asset.id}`,
          builderSource(source, `assets[${index}]`) ?? sourceLocation(),
        );
      });
    if ("precomps" in source)
      source.precomps?.forEach((child, index) => {
        this.define(child);
        this.sites.set(
          `precomp:${child.id}`,
          builderSource(source, `precomps[${index}]`) ?? sourceLocation(),
        );
        child.layers.forEach((layer, layerIndex) =>
          this.sites.set(
            `precomp:${child.id}.layer:${layer.id}`,
            builderSource(source, `precomps[${index}].layers[${layerIndex}]`) ??
              sourceLocation(),
          ),
        );
      });
    const site = sourceLocation();
    this.sites.set(
      `precomp:${id}`,
      "schemaVersion" in source ? (builderSource(source) ?? site) : site,
    );
    for (const [index, child] of layers.entries())
      this.sites.set(
        `precomp:${id}.layer:${child.id}`,
        "schemaVersion" in source
          ? (builderSource(source, `layers[${index}]`) ?? site)
          : site,
      );
  }
  marker(
    id: string,
    frame: Duration,
    options: Omit<CompositionMarker, "id" | "frame"> = {},
  ): void {
    (this.composition.markers ??= []).push({
      id: id.replace(/^cue:/, ""),
      frame: frames(frame, this.composition.fps),
      ...structuredClone(options),
    });
    this.sites.set(`marker:${id.replace(/^cue:/, "")}`, sourceLocation());
  }
  timeline(...motion: Motion[]): void {
    this.timelines.push(...motion);
  }
  expression(path: string, value: Expression | string): void {
    const parsed = typeof value === "string" ? expression(value) : value;
    const sources = (this.composition.expressions ??= {});
    if (sources[path])
      throw new BuilderError(
        "comp-builder-conflict",
        `An expression already targets ${path}`,
        parsed.location,
      );
    sources[path] = { source: parsed.source, ast: parsed.ast };
    this.sites.set(`expression:${path}`, parsed.location);
  }
  driver(driver: CompositionDriver): void {
    (this.composition.drivers ??= []).push(structuredClone(driver));
    this.sites.set(`driver:${driver.target}`, sourceLocation());
  }
  behaviour(behaviour: CompositionBehaviour): void {
    (this.composition.behaviours ??= []).push(structuredClone(behaviour));
    this.sites.set(
      `behaviour:${this.composition.behaviours!.length - 1}`,
      sourceLocation(),
    );
  }
  periodic(motion: CompositionPeriodic): void {
    (this.composition.periodic ??= []).push(structuredClone(motion));
    this.sites.set(
      `periodic:${this.composition.periodic!.length - 1}`,
      sourceLocation(),
    );
  }
  signal(value: NonNullable<Composition["signals"]>[number]): void {
    (this.composition.signals ??= []).push(structuredClone(value));
    this.sites.set(`signal:${value.id}`, sourceLocation());
  }
  constraint(value: NonNullable<Composition["constraints"]>[number]): void {
    (this.composition.constraints ??= []).push(structuredClone(value));
    this.sites.set(
      `constraint:${this.composition.constraints!.length - 1}`,
      sourceLocation(),
    );
  }
  textAnimator(value: NonNullable<Composition["textAnimators"]>[number]): void {
    (this.composition.textAnimators ??= []).push(structuredClone(value));
    this.sites.set(
      `textAnimator:${this.composition.textAnimators!.length - 1}`,
      sourceLocation(),
    );
  }
  textStyle(
    id: string,
    value: NonNullable<Composition["textStyles"]>[string],
  ): void {
    const styles = (this.composition.textStyles ??= {});
    if (styles[id] && JSON.stringify(styles[id]) !== JSON.stringify(value))
      throw new BuilderError(
        "comp-builder-style",
        `Conflicting text style ${id}`,
      );
    styles[id] = structuredClone(value);
    this.sites.set(`textStyle:${id}`, sourceLocation());
  }
  finish(): Composition {
    this.composition.layers = this.nodes.map((node) =>
      structuredClone(node.draft),
    );
    const layers = new Map(
      this.composition.layers.map((layer) => [
        layer.id,
        layer as unknown as Record<string, unknown>,
      ]),
    );
    const markers = new Map(
      (this.composition.markers ?? []).map((marker) => [
        marker.id,
        marker.frame,
      ]),
    );
    const scheduled = schedule(
      par(...this.timelines),
      this.composition.fps,
      markers,
    );
    for (const clip of scheduled) {
      if (!this.nodes.some((node) => node === clip.value.owner))
        throw new BuilderError(
          "comp-builder-owner",
          `Animation owner ${clip.value.owner.id} is not the added layer`,
          clip.value.location,
        );
    }
    const animatedTracks = applyAnimations(
      scheduled.filter(
        (clip): clip is Scheduled<Animation> => !("behaviour" in clip.value),
      ),
      layers,
      this.composition,
    );
    for (const clip of scheduled) {
      if (!("behaviour" in clip.value)) continue;
      if (clip.start >= this.composition.frameCount)
        throw new BuilderError(
          "comp-builder-duration",
          "Behaviour starts after the composition ends",
          clip.value.location,
        );
      let behaviour = clip.value.behaviour;
      if (behaviour.type === "camera-shake")
        behaviour = {
          ...behaviour,
          startFrame: clip.start + behaviour.startFrame,
        };
      for (const generated of behaviourExpressions(
        behaviour,
        this.composition.fps,
      )) {
        const value = expression(
          clip.start
            ? `frame >= ${clip.start} ? (${generated.source}) : value`
            : generated.source,
        );
        value.location = clip.value.location;
        this.expression(generated.target, value);
      }
    }
    this.composition.metadata = {
      ...this.composition.metadata,
      builder: JSON.parse(
        JSON.stringify(
          encodeSources(this.composition, this.sites, [
            ...this.tracks,
            ...animatedTracks,
          ]),
        ),
      ),
    };
    const parsed = validateComposition(this.composition);
    if (!parsed.ok) {
      const issue = parsed.diagnostics[0]!;
      throw new BuilderError(
        issue.code,
        `${issue.path}: ${issue.message}`,
        builderSource(this.composition, issue.path),
      );
    }
    const fontIssue = authoredFontDiagnostics(parsed.composition)[0];
    if (fontIssue)
      throw new BuilderError(
        fontIssue.code,
        fontIssue.message,
        builderSource(parsed.composition, fontIssue.path),
      );
    return recordSource(parsed.composition, this.sites.get("comp")!);
  }
}
export function comp(
  options: CompOptions,
  build: (composition: CompositionBuilder) => void,
): Composition {
  const context = new CompositionBuilder(options);
  const result: unknown = build(context);
  if (result && typeof result === "object" && "then" in result)
    throw new BuilderError(
      "comp-builder-async",
      "Resolve Node assets before the synchronous comp callback",
    );
  return context.finish();
}
