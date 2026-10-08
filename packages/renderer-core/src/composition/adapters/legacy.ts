import {
  COMPOSITION_LIMITS,
  PreparedSceneSchema,
  validateComposition,
  type Composition,
  type CompositionLayer,
  type PreparedScene,
} from "@still-shift/scene-contract";
import {
  compilePreparedScene,
  type LegacyIllustratedScene,
  evaluatePreparedNode,
  sampleTrack,
} from "../../prepared-scene.ts";
import { passageError, PassageError } from "../../passage-diagnostics.ts";
import { params, preparedNodeLayer } from "./prepared.ts";

export const LEGACY_ADAPTER_VERSION = "legacy-composition-0.1.1";

/** Freeze millisecond recipes at integer frames; playback uses only native data. */
export function legacyToComposition(
  source: PreparedScene,
  options: { id?: string } = {},
): Composition {
  return compiledLegacyToComposition(
    compilePreparedScene(PreparedSceneSchema.parse(source)),
    options,
  );
}

/** Accept a prepared recipe scene; native playback never re-enters its tracks. */
export function compiledLegacyToComposition(
  scene: LegacyIllustratedScene,
  options: { id?: string } = {},
): Composition {
  const frameCount = scene.timeline.frameCount;
  if (!Number.isInteger(frameCount) || frameCount > COMPOSITION_LIMITS.maxKeys)
    passageError(
      "comp-adapter-limit",
      `Legacy adaptation needs an integer timeline of at most ${COMPOSITION_LIMITS.maxKeys} frames`,
      { path: "durationMs" },
    );
  const layers: CompositionLayer[] = [];
  const signals: NonNullable<Composition["signals"]> = [];
  const constraints: NonNullable<Composition["constraints"]> = [];
  const ids = new Set(scene.nodes.map((node) => node.id));
  const unique = (name: string) => {
    while (ids.has(name)) name += "-helper";
    ids.add(name);
    return name;
  };
  const visit = (parent: string | undefined) => {
    for (const node of scene.nodes.filter((node) => node.parent === parent)) {
      const samples = Array.from({ length: frameCount }, (_, frame) =>
        evaluatePreparedNode(scene, node, frame),
      );
      const layer = preparedNodeLayer(scene, node, samples);
      if (node.type === "text" && layer.type === "provider") {
        if (node.container) layer.provider = "commerce.text@1.2.0";
        else if (node.textBox) layer.provider = "commerce.text@1.0.0";
      }
      const follower = scene.followers[node.id];
      if (follower) {
        const path = scene.nodes.find((node) => node.id === follower.path)!;
        if (path.type !== "path")
          passageError("comp-constraint-path", "Legacy follower needs a path", {
            node: node.id,
          });
        const carrier = unique(`${node.id}-legacy-contour`);
        const progress = unique(`${node.id}-legacy-progress`);
        // Legacy followers ignore the painted path's rotation. A helper in their
        // shared parent space preserves that rule and the follower's anchor offset.
        layers.push({
          id: carrier,
          type: "shape",
          ...(node.parent ? { parent: node.parent } : {}),
          transform: {
            anchor: [0, 0],
            position: [
              path.x + node.width * (node.origin[0] - 0.5),
              path.y + node.height * (node.origin[1] - 0.5),
            ],
            opacity: 0,
          },
          contents: [
            {
              id: "contour",
              type: "path",
              path: { closed: false, vertices: path.points },
            },
          ],
          source: { family: scene.schemaVersion, id: follower.path },
        });
        const values = Array.from({ length: frameCount }, (_, frame) =>
          sampleTrack(follower.keys, (frame * 1000) / scene.fps),
        );
        signals.push({
          id: progress,
          keys: values.flatMap((value, frame) =>
            frame === 0 ||
            frame === frameCount - 1 ||
            value !== values[frame - 1]
              ? [{ frame, value, interpolation: "hold" as const }]
              : [],
          ),
        });
        constraints.push({
          type: "follow-path",
          target: node.id,
          path: carrier,
          progress,
        });
        // Position is solved by the constraint; retaining baked follower x/y would
        // hide the editable path relationship without contributing to playback.
        layer.transform!.position = [
          node.x + node.width * node.origin[0],
          node.y + node.height * node.origin[1],
        ];
      }
      layers.push(layer);
      visit(node.id);
    }
  };
  visit(undefined);
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: options.id ?? "legacy-adapter",
    width: scene.width,
    height: scene.height,
    fps: scene.fps,
    frameCount,
    background: scene.background,
    assets: [
      ...scene.assets.map((asset) => ({ ...asset, type: "image" as const })),
      ...(scene.fonts ?? []).map((asset) => ({
        ...asset,
        type: "font" as const,
      })),
    ],
    layers: layers.reverse(),
    ...(signals.length ? { signals, constraints } : {}),
    ...(scene.format ? { format: scene.format } : {}),
    metadata: params(
      {
        adapter: LEGACY_ADAPTER_VERSION,
        title: scene.title,
        provenance: scene.provenance ?? "",
        legacyPreset: scene.recipe.preset,
        recipeClock: "milliseconds baked at integer frames",
        followerCoordinates: "stored path points in follower parent space",
      },
      "metadata",
    ),
  };
  const validation = validateComposition(composition);
  if (!validation.ok) throw new PassageError(validation.diagnostics);
  return validation.composition;
}
