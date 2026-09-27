import type { z } from "zod";
import type { StoryScene } from "./story.ts";
import type { CommerceScene } from "./commerce.ts";
import { MotionEasingSchema } from "./motion-easing.ts";

export function validateMotionCraft(
  scene: StoryScene | CommerceScene,
  ctx: z.RefinementCtx,
) {
  const fail = (code: string, path: (string | number)[], message: string) =>
    ctx.addIssue({
      code: "custom",
      path,
      message: `${code}: ${message}`,
      params: { diagnosticCode: code },
    });
  if (scene.schemaVersion === "story-scene-1" && scene.effects !== undefined) {
    if (scene.effectsVersion !== "effects-1" || !scene.motionModel)
      fail(
        "motion-opt-in",
        ["effects"],
        "requires effectsVersion effects-1 and motionModel curves-1",
      );
    for (const [i, effect] of scene.effects.entries()) {
      if (
        "target" in effect &&
        !scene.nodes.some((n) => n.id === effect.target && !n.parent)
      )
        fail(
          "motion-effect-target",
          ["effects", i, "target"],
          "effect requires a root node",
        );
      if (
        "end" in effect &&
        (effect.end <= effect.start || effect.end >= scene.frameCount)
      )
        fail("motion-effect-window", ["effects", i], "invalid effect window");
      if (
        effect.active &&
        (effect.active.end <= effect.active.start ||
          effect.active.end > scene.frameCount)
      )
        fail(
          "motion-effect-window",
          ["effects", i, "active"],
          "invalid effect active window",
        );
    }
  }
  const enabled = scene.motionModel === "curves-1";
  for (const field of [
    "entranceProfile",
    "checks",
    "intentPresets",
    "signals",
    "drivers",
    "constraints",
    "periodic",
    "spatialPaths",
    "pathMorphs",
    "textAnimators",
  ] as const)
    if (!enabled && scene[field] !== undefined)
      fail("motion-opt-in", [field], "requires motionModel curves-1");
  if (scene.schemaVersion === "story-scene-1") {
    if (!enabled && scene.recipe.preset === "generic")
      fail(
        "motion-opt-in",
        ["recipe", "preset"],
        "generic scenes require motionModel curves-1",
      );
    if (!enabled && (scene.camera?.jolts?.length ?? 0) > 1)
      fail(
        "motion-opt-in",
        ["camera", "jolts"],
        "multiple jolts require motionModel curves-1",
      );
  }
  const modern = new Set([
    "smooth",
    "interpolation",
    "bezier",
    "in",
    "out",
    "layer",
    "blend",
    "weight",
    "strokeWidth",
    "trimStart",
    "trimEnd",
    "trimOffset",
    "blur",
    "skewX",
    "skewY",
    "anchorX",
    "anchorY",
    "spatialIn",
    "spatialOut",
    "ramp",
  ]);
  const walk = (value: unknown, path: (string | number)[]) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, [...path, i]));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (
        !enabled &&
        (modern.has(key) ||
          (["fill", "stroke", "color"].includes(key) &&
            path[0] === "recipe" &&
            path[1] === "moves") ||
          (key === "easing" && !MotionEasingSchema.safeParse(child).success))
      )
        fail("motion-opt-in", [...path, key], "requires motionModel curves-1");
      walk(child, [...path, key]);
    }
  };
  // Node artwork has its own fields; only motion payloads use this gate.
  if (scene.schemaVersion === "story-scene-1") {
    walk(scene.recipe, ["recipe"]);
    walk(scene.flows, ["flows"]);
    for (const [i, move] of scene.recipe.moves.entries()) {
      for (const pose of [move.to, ...(move.keys ?? [])]) {
        if (!pose) continue;
        const additive =
          enabled &&
          (move.blend === "add" ||
            (!move.blend &&
              ["current", "carrier"].includes(move.layer ?? move.role ?? "")));
        if (!additive) {
          for (const prop of ["scaleX", "scaleY"] as const)
            if (
              pose[prop] !== undefined &&
              (pose[prop]! <= 0 || pose[prop]! > 4)
            )
              fail(
                "motion-range",
                ["recipe", "moves", i, prop],
                "scale must be positive and at most 4",
              );
          if (
            pose.opacity !== undefined &&
            (pose.opacity < 0 || pose.opacity > 1)
          )
            fail(
              "motion-range",
              ["recipe", "moves", i, "opacity"],
              "opacity must be between 0 and 1",
            );
        }
      }
    }
  } else walk(scene.events, ["events"]);
  walk(scene.componentData, ["componentData"]);
  if (!enabled) return;
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  if (scene.schemaVersion === "story-scene-1") {
    const paints: { target: string; start: number; end: number }[] = [];
    for (const [index, move] of scene.recipe.moves.entries()) {
      for (const property of ["fill", "stroke", "color"] as const) {
        const keys = move.keys?.filter((key) => key[property] !== undefined);
        if (!keys?.length && move.to?.[property] === undefined) continue;
        const blend = move.blend ?? move.window?.blend ?? "replace";
        if (blend !== "replace")
          fail(
            "motion-color-blend",
            ["recipe", "moves", index],
            "Color tracks support weighted replace blending",
          );
        const node = nodes.get(move.node);
        if (!node || !(property in node))
          fail(
            "motion-property-target",
            ["recipe", "moves", index],
            `${move.node} has no ${property}`,
          );
        const start = keys?.[0]?.frame ?? move.window!.start;
        const end = keys?.at(-1)?.frame ?? move.window!.end;
        const target = `${move.node}.${property}`;
        if (
          paints.some(
            (p) => p.target === target && start < p.end && p.start < end,
          )
        )
          fail(
            "motion-conflict",
            ["recipe", "moves", index],
            `Overlapping replace motions on ${target}`,
          );
        paints.push({ target, start, end });
      }
    }
  }
  const checkWeights = (value: unknown, path: (string | number)[]) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (
        key === "weight" &&
        Array.isArray(child) &&
        child.some((k: { frame: number }) => k.frame >= scene.frameCount)
      )
        fail("motion-frame-range", [...path, key], "weight is outside scene");
      checkWeights(child, [...path, key]);
    }
  };
  checkWeights(scene, []);
  for (const field of ["spatialPaths", "pathMorphs", "textAnimators"] as const)
    for (const [i, motion] of (scene[field] ?? []).entries()) {
      const node = nodes.get(motion.node);
      if (!node || node.type !== (field === "textAnimators" ? "text" : "path"))
        fail("motion-missing-target", [field, i, "node"], "wrong target type");
      if ("keys" in motion)
        for (const key of motion.keys)
          if (key.frame >= scene.frameCount)
            fail("motion-frame-range", [field, i], "outside scene");
      if ("end" in motion && motion.end >= scene.frameCount)
        fail("motion-frame-range", [field, i, "end"], "outside scene");
      if ("segments" in motion)
        motion.segments.forEach((segment, j) => {
          if (
            j &&
            segment[0].some((v, axis) => v !== motion.segments[j - 1]![3][axis])
          )
            fail(
              "motion-path-join",
              [field, i, "segments", j],
              "segments must meet",
            );
        });
    }
  for (const [i, motion] of (scene.intentPresets?.motions ?? []).entries()) {
    if (!nodes.has(motion.node))
      fail(
        "motion-missing-target",
        ["intentPresets", "motions", i, "node"],
        motion.node,
      );
    if (motion.window.end >= scene.frameCount)
      fail(
        "motion-frame-range",
        ["intentPresets", "motions", i, "window"],
        "outside scene",
      );
  }
  for (const [i, check] of (scene.checks ?? []).entries())
    for (const id of check.type === "stable-anchors"
      ? check.nodes
      : [check.path, ...check.sides])
      if (!nodes.has(id)) fail("motion-missing-target", ["checks", i], id);
  const signals = new Set<string>();
  for (const [i, signal] of (scene.signals ?? []).entries()) {
    if (signals.has(signal.id))
      fail("motion-duplicate-signal", ["signals", i, "id"], signal.id);
    signals.add(signal.id);
    for (const [k, key] of signal.keys.entries())
      if (key.frame >= scene.frameCount)
        fail(
          "motion-frame-range",
          ["signals", i, "keys", k, "frame"],
          "outside scene",
        );
  }
  const edges = new Map<string, Set<string>>();
  const dependency = (target: string, source: string) => {
    const deps = edges.get(target) ?? new Set();
    deps.add(source);
    edges.set(target, deps);
  };
  const target = (reference: string, path: (string | number)[]) => {
    const node = reference.split(".")[0]!;
    if (!nodes.has(node)) fail("motion-missing-target", path, reference);
    return node;
  };
  const source = (
    reference: string,
    into: string,
    path: (string | number)[],
  ) => {
    if (reference.includes(".")) dependency(into, target(reference, path));
    else if (!signals.has(reference))
      fail("motion-missing-signal", path, reference);
  };
  for (const [i, driver] of (scene.drivers ?? []).entries()) {
    const into = target(driver.target, ["drivers", i, "target"]);
    for (const ref of driver.sum ?? [driver.signal ?? driver.source!])
      source(ref, into, ["drivers", i]);
  }
  for (const [i, motion] of (scene.periodic ?? []).entries()) {
    target(motion.node, ["periodic", i, "node"]);
    if (motion.end >= scene.frameCount)
      fail("motion-frame-range", ["periodic", i, "end"], "outside scene");
  }
  for (const [i, constraint] of (scene.constraints ?? []).entries()) {
    const into = target(constraint.target, ["constraints", i, "target"]);
    const other =
      "surface" in constraint
        ? constraint.surface
        : "anchor" in constraint
          ? constraint.anchor
          : "toward" in constraint
            ? constraint.toward
            : "path" in constraint
              ? constraint.path
              : undefined;
    if (other) {
      dependency(into, target(other, ["constraints", i]));
      if (nodes.get(into)?.parent !== nodes.get(other)?.parent)
        fail(
          "motion-coordinate-space",
          ["constraints", i],
          "constrained nodes must share a parent",
        );
    }
    if (constraint.type === "follow-path") {
      if (nodes.get(constraint.path)?.type !== "path")
        fail(
          "motion-path-target",
          ["constraints", i, "path"],
          "requires path node",
        );
      source(constraint.progress, into, ["constraints", i, "progress"]);
    }
    if (
      constraint.type === "keep-in-safe-area" &&
      constraint.clamp &&
      nodes.get(into)?.parent
    )
      fail(
        "motion-coordinate-space",
        ["constraints", i],
        "Safe-area clamps require a root node; nested checks are advisory",
      );
  }
  // Existing component dependencies participate in cycle detection too.
  for (const node of scene.nodes)
    if (node.parent) dependency(node.id, node.parent);
  if (scene.componentData?.schemaVersion === "scene-components-3")
    for (const pin of scene.componentData.pins)
      dependency(pin.target, pin.anchor.node);
  if (
    scene.componentData &&
    scene.componentData.schemaVersion !== "scene-components-1"
  )
    for (const travel of scene.componentData.travels)
      dependency(travel.target, travel.path);
  const active: string[] = [],
    done = new Set<string>();
  const visit = (node: string) => {
    if (active.includes(node)) {
      fail(
        "motion-cycle",
        ["drivers"],
        [...active.slice(active.indexOf(node)), node].join(" → "),
      );
      return;
    }
    if (done.has(node)) return;
    active.push(node);
    for (const dep of edges.get(node) ?? []) visit(dep);
    active.pop();
    done.add(node);
  };
  for (const node of edges.keys()) visit(node);
}
