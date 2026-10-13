import type {
  MechanismPackDocument,
  MechanismSceneV2,
} from "@still-shift/scene-contract";
type Target = MechanismPackDocument["cameraTargets"][number];
type Surface = Target["proofSurfaces"][number];
const unit = (v: [number, number, number]): [number, number, number] => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n) as [number, number, number];
};
/** Named intents declare physical framing/proof surfaces; editing cuts and transitions is separate. */
export function describeMechanismPackCameras(
  scene: MechanismSceneV2,
  family: MechanismPackDocument["family"],
): Target[] {
  const surface = (
    id: string,
    mesh: string,
    nearAnchor: string,
    normal: [number, number, number],
    offsetRatio: [number, number, number] = [0, 0, 0],
  ): Surface => ({ id, mesh, nearAnchor, normal: unit(normal), offsetRatio });
  const parts = (ids: string[]): Target["framing"] => ({ kind: "parts", ids });
  const meshes = (ids: string[]): Target["framing"] => ({
    kind: "meshes",
    ids,
  });
  const notchedLine =
    family === "clothespeg" && scene.parts.some((part) => part.id === "line");
  const idealLever =
    family === "clothespeg" &&
    scene.anchors.some((anchor) => anchor.id === "press.far");
  const releaseTie =
    family === "cable-tie" &&
    scene.anchors.some((anchor) => anchor.id === "release.trigger");
  const loadTie =
    family === "cable-tie" &&
    scene.anchors.some((anchor) => anchor.id === "pawl.stopFoot");
  const whole = parts(
    family === "tape-hook" ? ["hook", "blade", "housing"] : ["model"],
  );
  let focus: Target["framing"],
    contact: string,
    detail: string,
    relationship: string[],
    proof: Surface[],
    directions: [number, number, number][];
  if (family === "tape-hook") {
    const retention = scene.geometry.meshes.some(
      (mesh) => mesh.id === "hook-retention-neck",
    );
    focus = meshes(
      retention
        ? [
            "hook-front",
            "hook-retention-neck",
            ...[1, 2, 3].map((i) => `retention.rivet.${i}.top.mesh`),
          ]
        : ["hook-front", "hook-fold"],
    );
    contact = "hook.innerFace";
    detail = retention ? "retention.rivet.2.upper.center" : "hook.thickness";
    relationship = retention
      ? ["hook.innerRange", "retention.rivet.2.upper.fixed"]
      : ["hook.innerRange"];
    proof = [
      surface("inner-face", "hook-front", contact, [1, 0, 0], [0, 0, 0.12]),
    ];
    directions = [
      [0.7, 0.35, 1],
      [1, 0.1, 1],
      [0.4, 0.1, 1],
    ];
  } else if (loadTie) {
    focus = meshes([
      "pawl.body",
      "pawl.stop",
      "head.stopLedge",
      "hinge.web.mesh",
    ]);
    contact = "pawl.primaryTooth";
    detail = "pawl.stopFoot";
    relationship = [
      "primary.contact",
      "secondary.gap",
      "stop.gap",
      "hinge.pawl.attached",
    ];
    proof = [
      surface("pawl-front", "pawl.body", contact, [0, 0, 1]),
      surface("stop-front", "pawl.stop", detail, [0, 0, 1]),
    ];
    directions = [
      [0.1, 0.2, 1],
      [0, 0, 1],
      [0.3, 0.3, 1],
    ];
  } else if (family === "cable-tie") {
    focus = meshes(["pawl.mesh", "head.root"]);
    contact = "pawl.tip";
    detail = releaseTie ? "release.trigger" : "pawl.root";
    relationship = ["pawl.tooth.seated", "pawl.root.fixed"];
    proof = [surface("pawl-tip", "pawl.mesh", contact, [1, 0, 0])];
    directions = releaseTie
      ? [
          [0.8, -0.4, -1],
          [1, -0.1, -1],
          [1, -0.6, -0.7],
        ]
      : [
          [0.8, 0.4, 1],
          [1, 0.1, 1],
          [1, 0.6, 0.7],
        ];
  } else if (idealLever) {
    focus = meshes([
      "upper.arm",
      "press.near.mesh",
      "press.far.mesh",
      "spring.mesh",
    ]);
    contact = "lever.pivot";
    detail = "press.far";
    relationship = ["press.near.attached", "press.far.attached"];
    proof = [surface("far-pad-cap", "press.far.mesh", "press.far", [0, 1, 0])];
    directions = [
      [0.3, 0.8, 1],
      [0.6, 0.8, 1],
      [0.2, 1, 1],
    ];
  } else {
    focus = meshes(notchedLine ? ["line.round"] : ["spring.mesh"]);
    contact = notchedLine ? "line.front" : "upper.tip";
    detail = notchedLine ? "line.front" : "spring.coil";
    relationship = ["spring.upper.seated", "spring.lower.seated"];
    proof = notchedLine
      ? [surface("line-end", "line.round", "line.front", [0, 0, 1])]
      : [
          surface(
            "coil-front",
            "spring.mesh",
            detail,
            [0, 0, 1],
            [0.27, -0.2, 1],
          ),
          surface(
            "lower-seat-exit",
            "spring.mesh",
            "lower.seat",
            [0, 0, 1],
            [0, 0, 0.15],
          ),
        ];
    directions = [
      [0.1, 0, 1],
      [0.1, -0.1, 1],
      [0.4, 0, 1],
    ];
  }
  const intents: Target["intent"][] = [
    "recognition",
    "contact-approach",
    "macro",
    "aligned-comparison",
    "controlled-orbit",
    "return",
  ];
  return intents.map((intent, index) => {
    const id = [
      "recognition",
      "approach",
      "macro",
      "comparison",
      "orbit",
      "return",
    ][index]!;
    const comparison =
      family === "tape-hook" && intent === "aligned-comparison";
    const pegComparison =
      family === "clothespeg" &&
      !notchedLine &&
      intent === "aligned-comparison";
    const full =
      intent === "recognition" ||
      intent === "controlled-orbit" ||
      intent === "return";
    for (const surface of proof)
      if (!scene.geometry.meshes.some((mesh) => mesh.id === surface.mesh))
        throw new Error(
          `mechanism-camera-reference: absent mesh ${surface.mesh}`,
        );
    return {
      id,
      intent,
      motionIntent: `${intent}: ${family === "tape-hook" ? (comparison ? "show the push/outside face" : "show hook travel and the pull/inside face") : family === "cable-tie" ? (loadTie ? "show primary tooth contact, second-tooth seating, flexible web and frame-stop hold" : releaseTie ? "show fixed-root trigger press, catch clearance and inside tooth engagement" : "show fixed-root pawl lift and seated tooth engagement") : notchedLine ? "show opposing jaw notches and return to round-line contact" : "show seated spring and return to cloth contact"}`,
      target: {
        kind: full ? "part" : "anchor",
        id: full
          ? "model"
          : comparison
            ? "hook.outerFace"
            : intent === "macro"
              ? detail
              : contact,
      },
      framing: full ? whole : focus,
      relationships: comparison ? ["hook.outerRange"] : relationship,
      fovDegrees: intent === "macro" ? 28 : 35,
      viewDirections: (pegComparison
        ? ([
            [0.1, 0, -1],
            [0.1, 0.1, -1],
            [0.4, 0, -1],
          ] as [number, number, number][])
        : comparison
          ? ([
              [-0.7, 0.35, 1],
              [-1, 0.1, 1],
              [-0.4, 0.1, 1],
            ] as [number, number, number][])
          : directions
      ).map(unit),
      proofSurfaces: pegComparison
        ? [
            surface(
              "coil-rear",
              "spring.mesh",
              detail,
              [0, 0, -1],
              [0.27, -0.2, -1],
            ),
            surface(
              "upper-seat-exit",
              "spring.mesh",
              "upper.seat",
              [0, 0, -1],
              [0, 0, -0.15],
            ),
          ]
        : comparison
          ? [
              surface(
                "outer-face",
                "hook-front",
                "hook.outerFace",
                [-1, 0, 0],
                [0, 0, 0.12],
              ),
            ]
          : proof,
    };
  });
}
