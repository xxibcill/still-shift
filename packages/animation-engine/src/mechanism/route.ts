import {
  AnimationEngineError,
  MechanismRouteSelectionSchema,
  type MechanismEpisode,
  type MechanismRoute,
  type MechanismRouteSelection,
} from "@still-shift/scene-contract";

function routeError(
  message: string,
  path = "route",
  diagnosticCode = "comp-native3d-source",
): never {
  throw new AnimationEngineError("SCENE_INVALID", message, {
    diagnosticCode,
    stage: "mechanism-route",
    path,
  });
}

export function selectMechanismRoute(
  episode: Pick<MechanismEpisode, "route">,
  override?: MechanismRoute,
): MechanismRouteSelection {
  return {
    sourceRoute: episode.route ?? null,
    effectiveRoute: override ?? episode.route ?? "bridge",
    selectionOrigin:
      override !== undefined
        ? "cli-override"
        : episode.route !== undefined
          ? "source"
          : "default",
  };
}

/** Legacy bridge records have no selection; an explicit native source cannot use them. */
export function followPreparedMechanismRoute(
  episode: Pick<MechanismEpisode, "route">,
  selection?: MechanismRouteSelection,
  assertion?: MechanismRoute,
): MechanismRouteSelection {
  if (!selection) {
    if (episode.route === "native3d")
      routeError("A native source requires a route-aware prepared receipt");
    selection = selectMechanismRoute(episode);
  } else {
    const parsed = MechanismRouteSelectionSchema.safeParse(selection);
    if (!parsed.success) routeError("Invalid prepared route selection");
    selection = parsed.data;
    if (selection.sourceRoute !== (episode.route ?? null))
      routeError("The authored route changed after preparation");
    if (
      (selection.selectionOrigin === "default" &&
        (selection.sourceRoute !== null ||
          selection.effectiveRoute !== "bridge")) ||
      (selection.selectionOrigin === "source" &&
        selection.effectiveRoute !== selection.sourceRoute)
    )
      routeError("Prepared route provenance is inconsistent");
  }
  if (assertion !== undefined && assertion !== selection.effectiveRoute)
    routeError(
      "The route assertion differs from the prepared execution",
      "--route",
    );
  return selection;
}

export function mechanismRouteBackend(
  selection: MechanismRouteSelection,
  backend?: "canvas2d" | "webgl2",
): "canvas2d" | "webgl2" {
  if (selection.effectiveRoute === "native3d") {
    if (backend === "canvas2d")
      routeError(
        "Native rendering requires WebGL2",
        "--backend",
        "comp-native3d-backend",
      );
    return "webgl2";
  }
  return backend ?? "canvas2d";
}

export function recordedMechanismRoute(selection: MechanismRouteSelection) {
  return selection.selectionOrigin === "default"
    ? undefined
    : { routeSelection: selection };
}
