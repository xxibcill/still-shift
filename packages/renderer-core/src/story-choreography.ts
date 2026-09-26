import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import type {
  StoryScene,
  StoryWindow,
  StoryMove,
} from "../../scene-contract/src/story.ts";
import type {
  StoryEntrance,
  StoryExit,
  StoryRole,
} from "../../scene-contract/src/story-motion.ts";
import type { Property } from "./prepared-scene.ts";
import type { StoryTracks } from "./story-scene.ts";

export function entrancePolicy(
  scene: StoryScene,
  node: PreparedNode,
  explicitVerb?: StoryEntrance["verb"],
): { verb: NonNullable<StoryEntrance["verb"]>; role: StoryRole } {
  if (node.type === "text") {
    const recipe = scene.recipe;
    const isLabel =
      recipe.preset === "unequal_margins" && recipe.labels.includes(node.id);
    // Root text follows the authored 52/56/64 px qualifier/label/subheading scale.
    // Recipe bindings take precedence when a label uses a larger display size.
    const isHeading =
      !isLabel &&
      ((recipe.preset === "unequal_margins" && recipe.reference === node.id) ||
        node.fontAsset === "display" ||
        (!node.parent && node.fontSize >= 64));
    const isQualifier =
      !isLabel &&
      (("qualifier" in recipe && recipe.qualifier === node.id) ||
        (!node.parent && node.fontSize <= 52));
    const verb = explicitVerb ?? (isHeading || isQualifier ? "wipe" : "attach");
    const isAction = !isLabel && (isHeading || isQualifier || verb === "wipe");
    return {
      verb,
      role: isAction ? "action" : "response",
    };
  }
  return {
    verb:
      explicitVerb ??
      (node.type === "image" || node.type === "group"
        ? "set-down"
        : node.type === "path"
          ? "draw"
          : "stamp"),
    role: "action",
  };
}
const partWindow = (
  window: StoryWindow,
  from: number,
  to: number,
  easing: StoryWindow["easing"],
): StoryWindow => {
  const length = window.end - window.start;
  return {
    ...window,
    start: window.start + length * from,
    end: window.start + length * to,
    easing,
  };
};
const direction = (
  value: "left" | "right" | "up" | "down",
  distance: number,
): [number, number] =>
  value === "left"
    ? [-distance, 0]
    : value === "right"
      ? [distance, 0]
      : value === "up"
        ? [0, -distance]
        : [0, distance];

export function compileEntrance(
  tracks: StoryTracks,
  nodes: PreparedNode[],
  event: StoryEntrance,
  subsequent = false,
) {
  const node = nodes.find((n) => n.id === event.node)!;
  const { window, distance, from = "down" } = event;
  const verb = event.verb ?? "fade";
  const start = (id: string, property: Property, value: number) => {
    if (subsequent) tracks.step(id, property, window.start, value);
    else tracks.initial(id, property, value);
  };
  const fade = (fraction = 1) => {
    start(node.id, "opacity", 0);
    tracks.add(
      node.id,
      "opacity",
      partWindow(window, 0, fraction, "out-cubic"),
      node.opacity,
    );
  };
  const slide = (dx: number, dy: number, easing: StoryWindow["easing"]) => {
    for (const [property, offset] of [
      ["x", dx],
      ["y", dy],
    ] as const) {
      if (offset === 0) continue;
      start(node.id, property, node[property] + offset);
      tracks.add(node.id, property, { ...window, easing }, node[property]);
    }
  };
  switch (verb) {
    case "fade":
      start(node.id, "opacity", 0);
      tracks.add(node.id, "opacity", window, node.opacity);
      break;
    case "set-down": {
      node.origin = [0.5, 1];
      slide(0, -(distance ?? 28), "out-quint");
      fade(0.4);
      start(node.id, "scaleY", 0.985);
      tracks.add(
        node.id,
        "scaleY",
        partWindow(window, 0.75, 1, "out-back-soft"),
        1,
      );
      const shadow = nodes.find(
        (n) => n.id === `${node.id}-shadow` && n.parent === node.id,
      );
      if (shadow) {
        start(shadow.id, "y", shadow.y + (distance ?? 28));
        tracks.add(
          shadow.id,
          "y",
          { ...window, easing: "out-quint" },
          shadow.y,
        );
        start(shadow.id, "scaleX", 0.6);
        start(shadow.id, "opacity", 0);
        tracks.add(
          shadow.id,
          "scaleX",
          partWindow(window, 0, 0.6, "out-cubic"),
          1,
        );
        tracks.add(
          shadow.id,
          "opacity",
          partWindow(window, 0, 0.6, "out-cubic"),
          shadow.opacity,
        );
      }
      break;
    }
    case "attach": {
      const [dx, dy] = direction(from, distance ?? 24);
      slide(dx, dy, "out-expo");
      fade(0.5);
      break;
    }
    case "rise":
      slide(0, distance ?? 16, "out-cubic");
      fade();
      break;
    case "wipe":
      start(node.id, "reveal", 0);
      tracks.add(node.id, "reveal", { ...window, easing: "out-expo" }, 1);
      slide(0, 8, "out-expo");
      break;
    case "draw":
      start(node.id, "reveal", 0);
      tracks.add(
        node.id,
        "reveal",
        { ...window, easing: window.easing ?? "out-cubic" },
        1,
      );
      break;
    case "stamp":
      for (const axis of ["scaleX", "scaleY"] as const) {
        start(node.id, axis, 1.06);
        tracks.add(node.id, axis, { ...window, easing: "out-back-soft" }, 1);
      }
      fade(0.3);
      break;
    case "assemble":
      for (const part of event.parts ?? []) {
        const child = nodes.find((n) => n.id === part.node)!;
        const subwindow = {
          ...window,
          start: window.start + part.offset,
          end:
            window.start +
            part.offset +
            (window.end - window.start - part.offset) * 0.8,
          easing: "out-quint" as const,
        };
        const [dx, dy] = direction(part.from, part.distance);
        for (const [property, offset] of [
          ["x", dx],
          ["y", dy],
        ] as const) {
          if (offset === 0) continue;
          start(child.id, property, child[property] + offset);
          tracks.add(child.id, property, subwindow, child[property]);
        }
        start(child.id, "opacity", 0);
        tracks.add(child.id, "opacity", subwindow, child.opacity);
      }
      start(node.id, "scaleY", 0.985);
      tracks.add(
        node.id,
        "scaleY",
        partWindow(window, 0.8, 1, "out-back-soft"),
        1,
      );
      break;
  }
}

export function compileExit(
  tracks: StoryTracks,
  nodes: PreparedNode[],
  event: StoryExit,
) {
  const node = nodes.find((n) => n.id === event.node)!;
  if (event.verb === "wipe-out" || event.verb === "retract")
    tracks.add(node.id, "reveal", event.window, 0);
  else {
    tracks.add(node.id, "opacity", event.window, 0);
    if (event.verb === "lift") {
      const [dx, dy] = direction(event.to ?? "up", event.distance ?? 20);
      if (dx) tracks.add(node.id, "x", event.window, node.x + dx);
      if (dy) tracks.add(node.id, "y", event.window, node.y + dy);
    }
  }
}

export function compileMove(tracks: StoryTracks, move: StoryMove) {
  const properties = [
    "x",
    "y",
    "scaleX",
    "scaleY",
    "rotation",
    "opacity",
  ] as const;
  if (move.keys) {
    for (const property of properties) {
      const keys = move.keys.filter((k) => k[property] !== undefined);
      keys.forEach((key, i) => {
        if (i === 0)
          tracks.step(move.node, property, key.frame, key[property]!);
        else
          tracks.add(
            move.node,
            property,
            {
              start: keys[i - 1]!.frame,
              end: key.frame,
              ...(key.easing ? { easing: key.easing } : {}),
            },
            key[property]!,
          );
      });
    }
  } else if (move.to && move.window) {
    for (const property of properties)
      if (move.to[property] !== undefined)
        tracks.add(move.node, property, move.window, move.to[property]!);
    if (move.to.scale !== undefined)
      for (const axis of ["scaleX", "scaleY"] as const)
        tracks.add(move.node, axis, move.window, move.to.scale);
  }
}
