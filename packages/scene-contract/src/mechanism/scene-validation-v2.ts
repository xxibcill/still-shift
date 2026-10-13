import type { z } from "zod";
import {
  checkUniqueIds,
  MECHANISM_LIMITS,
  mechanismIssue,
} from "./primitives.ts";
import type { MechanismKinematicSceneV2 } from "./scene-v2.ts";
import { MECHANISM_TEACHING_SHAPE_LIMITS } from "./teaching-shapes.ts";

type Scene = MechanismKinematicSceneV2;
type Path = (string | number)[];
type Context = z.RefinementCtx;

export function validateMechanismSceneV2(scene: Scene, context: Context) {
  for (const field of [
    "parts",
    "rigs",
    "teachingShapes",
    "anchors",
    "relationships",
    "lights",
  ] as const)
    checkUniqueIds(scene[field], context, [field]);
  if (
    scene.lights.filter((light) => light.castShadow).length >
    MECHANISM_LIMITS.shadowLights
  )
    mechanismIssue(
      context,
      "mechanism-resource-limit",
      "At most two shadow lights are supported",
      ["lights"],
    );
  validatePartDependencies(scene, context);
  validateGeometryOwners(scene, context);
  validateRigReferences(scene, context);
  validateShapes(scene, context);
  validateAnchors(scene, context);
  validateRelationships(scene, context);
}

function requireReference(
  ids: ReadonlySet<string>,
  id: string,
  path: Path,
  context: Context,
) {
  if (!ids.has(id))
    mechanismIssue(
      context,
      "mechanism-reference",
      `Unknown reference ${id}`,
      path,
    );
}

/** Parent and reference-frame dependencies must have one acyclic evaluation order. */
function validatePartDependencies(scene: Scene, context: Context) {
  const ids = new Set(scene.parts.map((part) => part.id));
  const dependencies = new Map<string, { id: string; path: Path }[]>();
  scene.parts.forEach((part, index) =>
    dependencies.set(
      part.id,
      part.parent === undefined
        ? []
        : [{ id: part.parent, path: ["parts", index, "parent"] }],
    ),
  );
  scene.rigs.forEach((rig, index) => {
    if (rig.type !== "spring-return")
      for (const part of rig.type === "load-seat"
        ? [rig.movingPart, rig.reactionPart]
        : [rig.movingPart])
        dependencies.get(part)?.push({
          id: rig.referencePart,
          path: ["rigs", index, "referencePart"],
        });
  });
  const complete = new Set<string>();
  const active = new Set<string>();
  function visit(id: string) {
    if (complete.has(id)) return;
    active.add(id);
    for (const dependency of dependencies.get(id) ?? []) {
      requireReference(ids, dependency.id, dependency.path, context);
      if (active.has(dependency.id)) {
        mechanismIssue(
          context,
          "mechanism-rig-cycle",
          "Part parent and rig reference frames form a cycle",
          dependency.path,
        );
      } else if (ids.has(dependency.id)) visit(dependency.id);
    }
    active.delete(id);
    complete.add(id);
  }
  for (const id of ids) visit(id);
}

function validateGeometryOwners(scene: Scene, context: Context) {
  const ids = new Set(scene.parts.map((part) => part.id));
  scene.geometry.meshes.forEach((mesh, index) =>
    requireReference(
      ids,
      mesh.partId,
      ["geometry", "meshes", index, "partId"],
      context,
    ),
  );
}

function validateRigReferences(scene: Scene, context: Context) {
  const parts = new Set(scene.parts.map((part) => part.id));
  const rigs = new Map(scene.rigs.map((rig) => [rig.id, rig]));
  const owners = new Map<string, string>();
  const returns = new Set<string>();
  scene.rigs.forEach((rig, index) => {
    const location: Path = ["rigs", index];
    if (rig.type === "spring-return") {
      const target = rigs.get(rig.targetRig);
      if (!target || (target.type !== "slider" && target.type !== "hinge")) {
        mechanismIssue(
          context,
          "mechanism-return-target",
          "Return must target a declared slider or hinge",
          [...location, "targetRig"],
        );
      } else {
        const limits =
          target.type === "slider" ? target.range : target.angleRange;
        if (rig.restValue < limits[0] || rig.restValue > limits[1])
          mechanismIssue(
            context,
            "mechanism-return-range",
            "Return rest value exceeds target limits",
            [...location, "restValue"],
          );
      }
      if (returns.has(rig.targetRig))
        mechanismIssue(
          context,
          "mechanism-control-owner",
          "A target rig has only one return writer",
          [...location, "targetRig"],
        );
      returns.add(rig.targetRig);
      return;
    }
    for (const field of ["movingPart", "referencePart"] as const)
      requireReference(parts, rig[field], [...location, field], context);
    const drivenParts =
      rig.type === "load-seat"
        ? [
            { id: rig.movingPart, field: "movingPart" },
            { id: rig.reactionPart, field: "reactionPart" },
          ]
        : [{ id: rig.movingPart, field: "movingPart" }];
    for (const { id, field } of drivenParts) {
      const previous = owners.get(id);
      if (field === "reactionPart")
        requireReference(parts, id, [...location, field], context);
      if (previous)
        mechanismIssue(
          context,
          "mechanism-control-owner",
          `${id} is already driven by ${previous}`,
          [...location, field],
        );
      owners.set(id, rig.id);
    }
    if (rig.type === "load-seat") {
      const physicalParts = new Set(
        scene.rigs.flatMap((candidate) =>
          candidate.type === "spring-return"
            ? []
            : candidate.type === "load-seat"
              ? [candidate.movingPart, candidate.reactionPart]
              : [candidate.movingPart],
        ),
      );
      for (const body of [rig.movingPart, rig.reactionPart]) {
        let parent = scene.parts.find((part) => part.id === body)?.parent;
        const visited = new Set<string>();
        while (
          parent !== undefined &&
          parent !== rig.referencePart &&
          !visited.has(parent)
        ) {
          visited.add(parent);
          if (physicalParts.has(parent))
            mechanismIssue(
              context,
              "mechanism-load-reference",
              "Independent motion between a coupled body and its reference is unsupported",
              [...location, "referencePart"],
            );
          parent = scene.parts.find((part) => part.id === parent)?.parent;
        }
      }
      for (const field of ["movingPart", "reactionPart"] as const)
        if (!isDescendant(scene, rig[field], rig.referencePart))
          mechanismIssue(
            context,
            "mechanism-load-reference",
            "Both load-seating parts must belong to the reference assembly",
            [...location, field],
          );
      if (
        isDescendant(scene, rig.movingPart, rig.reactionPart) ||
        isDescendant(scene, rig.reactionPart, rig.movingPart)
      )
        mechanismIssue(
          context,
          "mechanism-load-reference",
          "Coupled load-seating parts cannot be ancestors of one another",
          [...location, "reactionPart"],
        );
    }
    if (rig.type === "ratchet") validateRatchet(scene, rig, location, context);
  });
}

function isDescendant(scene: Scene, part: string, ancestor: string) {
  const parts = new Map(scene.parts.map((item) => [item.id, item]));
  const visited = new Set<string>();
  let current: string | undefined = part;
  while (current !== undefined && !visited.has(current)) {
    if (current === ancestor) return true;
    visited.add(current);
    current = parts.get(current)?.parent;
  }
  return false;
}

function validateRatchet(
  scene: Scene,
  rig: Extract<Scene["rigs"][number], { type: "ratchet" }>,
  path: Path,
  context: Context,
) {
  const shape = scene.teachingShapes.find(
    (shape) => shape.id === rig.pawlShape,
  );
  if (
    !shape ||
    shape.generator !== "fixed-root-pawl-curve-1" ||
    shape.driver.rig !== rig.id ||
    !isDescendant(scene, shape.ownerPart, rig.referencePart) ||
    isDescendant(scene, shape.ownerPart, rig.movingPart)
  )
    mechanismIssue(
      context,
      "mechanism-ratchet-pawl",
      "Ratchet requires its own fixed-root pawl on the reference assembly",
      [...path, "pawlShape"],
    );
  const tip = scene.anchors.find((anchor) => anchor.id === rig.pawlTipAnchor);
  if (
    !tip ||
    tip.source.kind !== "shape-landmark" ||
    tip.source.shape !== rig.pawlShape ||
    tip.source.landmark !== "tip"
  )
    mechanismIssue(
      context,
      "mechanism-ratchet-pawl",
      "Pawl tip must resolve the generated tip landmark",
      [...path, "pawlTipAnchor"],
    );
  const datum = scene.anchors.find(
    (anchor) => anchor.id === rig.toothDatumAnchor,
  );
  if (
    !datum ||
    datum.source.kind !== "part-local" ||
    !isDescendant(scene, datum.source.part, rig.movingPart)
  )
    mechanismIssue(
      context,
      "mechanism-ratchet-datum",
      "Tooth datum must be attached to the moving assembly",
      [...path, "toothDatumAnchor"],
    );
}

function validateShapes(scene: Scene, context: Context) {
  const parts = new Set(scene.parts.map((part) => part.id));
  const meshes = new Map(scene.geometry.meshes.map((mesh) => [mesh.id, mesh]));
  const owners = new Set<string>();
  let vertices = 0,
    triangles = 0,
    centerlineSamples = 0;
  scene.teachingShapes.forEach((shape, index) => {
    const path: Path = ["teachingShapes", index];
    requireReference(parts, shape.ownerPart, [...path, "ownerPart"], context);
    const mesh = meshes.get(shape.mesh);
    if (!mesh || mesh.partId !== shape.ownerPart)
      mechanismIssue(
        context,
        "mechanism-shape-owner",
        "Teaching shape must own its declared mesh on the same part",
        [...path, "mesh"],
      );
    if (owners.has(shape.mesh))
      mechanismIssue(
        context,
        "mechanism-control-owner",
        "A changing mesh has exactly one generator",
        [...path, "mesh"],
      );
    owners.add(shape.mesh);
    if (mesh) {
      vertices += mesh.positions.length / 3;
      triangles += mesh.indices.length / 3;
      shape.landmarks.forEach((landmark, landmarkIndex) => {
        if (
          landmark.vertexIndices.some(
            (vertex) => vertex >= mesh.positions.length / 3,
          )
        )
          mechanismIssue(
            context,
            "mechanism-shape-landmark",
            "Landmark membership exceeds the owned vertex inventory",
            [...path, "landmarks", landmarkIndex, "vertexIndices"],
          );
      });
    }
    if (shape.generator === "fixed-root-pawl-curve-1") {
      const rig = scene.rigs.find((rig) => rig.id === shape.driver.rig);
      if (!rig || rig.type !== "ratchet" || rig.pawlShape !== shape.id)
        mechanismIssue(
          context,
          "mechanism-shape-driver",
          "Pawl driver must be its owning ratchet",
          [...path, "driver", "rig"],
        );
    } else {
      centerlineSamples +=
        shape.generator === "seated-flexible-web-1"
          ? shape.parameters.longitudinalSegments + 1
          : shape.parameters.coilSamples + 2 * shape.parameters.legSamples;
      shape.seats.forEach((id, seat) => {
        const anchor = scene.anchors.find((anchor) => anchor.id === id);
        if (
          !anchor ||
          anchor.role !== "seat" ||
          anchor.source.kind !== "part-local"
        )
          mechanismIssue(
            context,
            "mechanism-spring-seat",
            "Seated shapes require declared rigid part-local seat anchors",
            [...path, "seats", seat],
          );
      });
    }
  });
  const limits = MECHANISM_TEACHING_SHAPE_LIMITS;
  if (
    scene.teachingShapes.length * 2 > limits.streams ||
    vertices > limits.vertices ||
    triangles > limits.triangles ||
    centerlineSamples > limits.centerlineSamples
  )
    mechanismIssue(
      context,
      "mechanism-shape-limit",
      "Aggregate changing geometry exceeds the frozen stream, vertex, triangle or centerline budget",
      ["teachingShapes"],
    );
}

function validateAnchors(scene: Scene, context: Context) {
  const parts = new Set(scene.parts.map((part) => part.id));
  const shapes = new Map(
    scene.teachingShapes.map((shape) => [shape.id, shape]),
  );
  scene.anchors.forEach((anchor, index) => {
    const path: Path = ["anchors", index, "source"];
    const source = anchor.source;
    if (source.kind === "part-local")
      requireReference(parts, source.part, [...path, "part"], context);
    else {
      const shape = shapes.get(source.shape);
      if (!shape)
        mechanismIssue(
          context,
          "mechanism-reference",
          `Unknown shape ${source.shape}`,
          [...path, "shape"],
        );
      else if (
        !shape.landmarks.some((landmark) => landmark.id === source.landmark)
      )
        mechanismIssue(
          context,
          "mechanism-shape-landmark",
          `Unknown generated landmark ${source.landmark}`,
          [...path, "landmark"],
        );
    }
  });
}

function validateRelationships(scene: Scene, context: Context) {
  const anchors = new Set(scene.anchors.map((anchor) => anchor.id));
  const parts = new Set(scene.parts.map((part) => part.id));
  scene.relationships.forEach((relationship, index) => {
    const path: Path = ["relationships", index];
    if (relationship.type === "engagement") {
      requireReference(
        anchors,
        relationship.pawlTip,
        [...path, "pawlTip"],
        context,
      );
      requireReference(
        anchors,
        relationship.toothDatum,
        [...path, "toothDatum"],
        context,
      );
      const rig = scene.rigs.find((rig) => rig.id === relationship.rig);
      if (
        !rig ||
        rig.type !== "ratchet" ||
        rig.pawlTipAnchor !== relationship.pawlTip ||
        rig.toothDatumAnchor !== relationship.toothDatum
      )
        mechanismIssue(
          context,
          "mechanism-relationship-rig",
          "Engagement must bind its ratchet's declared tip and datum",
          [...path, "rig"],
        );
    } else {
      relationship.anchors.forEach((anchor, item) =>
        requireReference(anchors, anchor, [...path, "anchors", item], context),
      );
      if (relationship.type === "signed-gap")
        requireReference(
          parts,
          relationship.axisPart,
          [...path, "axisPart"],
          context,
        );
      if (relationship.type === "fixed-offset")
        requireReference(
          parts,
          relationship.referencePart,
          [...path, "referencePart"],
          context,
        );
    }
  });
}
