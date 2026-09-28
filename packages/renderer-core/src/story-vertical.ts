import {
  StoryFormatOverrideSchema,
  StorySceneSchema,
  type StoryFormatOverride,
  type StoryScene,
} from "../../scene-contract/src/story.ts";
import { formatSize } from "../../scene-contract/src/output-format.ts";
import type { PreparedNode } from "../../scene-contract/src/prepared.ts";
import { layoutComponentBoxes } from "./component-layout.ts";
import {
  passageDiagnostics,
  type PassageDiagnostic,
} from "./passage-diagnostics.ts";
import { compileStoryScene } from "./story-scene.ts";
import {
  isStoryNodeVisible,
  storyFocalSubjects,
  storyNodeBounds,
  storySafeZoneDiagnostics,
} from "./story-safe-zones.ts";
import { storyAnchorPosition } from "./story-geometry.ts";

const output = formatSize("vertical");
const margin = 72;
const minimumFocalPixels = 96;
type NodePatch = NonNullable<StoryFormatOverride["nodes"]>[string];
type Box = { left: number; top: number; right: number; bottom: number };

const round = (value: number) => Math.round(value * 100) / 100;

/** Suggests geometry only. Callers must explicitly store the returned override. */
export function proposeVerticalLayout(scene: StoryScene): StoryFormatOverride {
  if (scene.format === "vertical")
    throw new Error("Propose vertical from a landscape story scene");
  const nodes: NonNullable<StoryFormatOverride["nodes"]> = {};
  const main = scene.nodes.filter(
    (node) =>
      !node.parent &&
      node.type !== "text" &&
      node.type !== "path" &&
      node.width > 0 &&
      node.height > 0,
  );
  const backdrops = main.filter(
    (node) =>
      node.width >= scene.width * 0.8 && node.height >= scene.height * 0.75,
  );
  const ground = main.filter(
    (node) =>
      !backdrops.includes(node) &&
      node.width >= scene.width * 0.8 &&
      node.y >= scene.height * 0.55,
  );
  const subjects = main.filter(
    (node) => !backdrops.includes(node) && !ground.includes(node),
  );
  const anchored = new Set(
    scene.connectors.flatMap((connector) => [
      connector.from.node,
      connector.to.node,
    ]),
  );
  for (const node of backdrops)
    nodes[node.id] = {
      x: 0,
      y: 0,
      width: output.width,
      height: output.height,
    };
  for (const node of ground)
    nodes[node.id] = {
      x: 0,
      y: round(output.height - node.height),
      width: output.width,
      height: node.height,
    };
  for (const node of scene.nodes) {
    if (
      node.type !== "path" ||
      node.parent ||
      scene.connectors.some((c) => c.path === node.id)
    )
      continue;
    const left = Math.min(...node.points.map((point) => point[0]));
    const right = Math.max(...node.points.map((point) => point[0]));
    if (right - left <= output.width - 2 * margin) continue;
    const pathScale = (output.width - 2 * margin) / (right - left);
    const top = Math.min(...node.points.map((point) => point[1]));
    nodes[node.id] = {
      x: round(margin - left * pathScale),
      y: round(
        Math.min(
          output.height - 240,
          ((node.y + top) / scene.height) * output.height,
        ) -
          top * pathScale,
      ),
      scale: round(pathScale),
    };
  }

  // Landscape columns become vertical bands. Nodes in one column retain their
  // relative placement, while the band boxes are laid out on the y axis.
  const bands = [0, 1, 2].map((index) =>
    subjects.filter(
      (node) =>
        Math.min(
          2,
          Math.floor(((node.x + node.width / 2) / scene.width) * 3),
        ) === index,
    ),
  );
  const occupied = bands.filter((band) => band.length);
  const unions = occupied.map((band) => ({
    left: Math.min(...band.map((node) => node.x)),
    top: Math.min(...band.map((node) => node.y)),
    right: Math.max(...band.map((node) => node.x + node.width)),
    bottom: Math.max(...band.map((node) => node.y + node.height)),
  }));
  const available = {
    x: margin,
    y: 360,
    width: output.width - 2 * margin,
    height: 1160,
  };
  const gap = occupied.length > 1 ? 56 : 0;
  const widest = Math.max(1, ...unions.map((box) => box.right - box.left));
  const totalHeight = unions.reduce(
    (sum, box) => sum + box.bottom - box.top,
    0,
  );
  const scale = Math.min(
    1.2,
    available.width / widest,
    (available.height - Math.max(0, occupied.length - 1) * gap) /
      Math.max(1, totalHeight),
  );
  const boxes = layoutComponentBoxes(
    available,
    unions.map((box) => ({
      width: (box.right - box.left) * scale,
      height: (box.bottom - box.top) * scale,
    })),
    { axis: "y", gap, align: "center", distribution: "center" },
  );
  occupied.forEach((band, index) => {
    const source = unions[index]!;
    const target = boxes[index]!;
    for (const node of band) {
      const x = target.x + (node.x - source.left) * scale;
      const y = target.y + (node.y - source.top) * scale;
      const patch: NodePatch = { x: round(x), y: round(y) };
      if (node.type === "group" || anchored.has(node.id)) {
        // Groups own child coordinate systems. Scale the root transform instead
        // of changing its box, so children keep their layout and relationships.
        patch.x = round(x - node.width * node.origin[0] * (1 - scale));
        patch.y = round(y - node.height * node.origin[1] * (1 - scale));
        patch.scale = round(scale);
      } else {
        patch.width = round(node.width * scale);
        patch.height = round(node.height * scale);
      }
      nodes[node.id] = patch;
    }
  });

  if (scene.recipe.preset === "unequal_margins") {
    const [left, right] = scene.recipe.households.map((id) =>
      scene.nodes.find((node) => node.id === id),
    );
    if (left && right) {
      const width = Math.min((output.width - 3 * margin) / 2, left.width);
      const height = (left.height * width) / left.width;
      const y = round(1030 - height);
      for (const [index, node] of [left, right].entries())
        nodes[node.id] = {
          x: round(margin + index * (width + margin)),
          y,
          width: round(width),
          height: round(height),
        };
    }
  }

  const rootText = scene.nodes.filter(
    (node): node is Extract<PreparedNode, { type: "text" }> =>
      node.type === "text" && !node.parent,
  );
  const titles = rootText.filter((node) => node.y < scene.height * 0.32);
  const footnotes = rootText.filter((node) => node.y >= scene.height * 0.8);
  const labels = rootText.filter(
    (node) => !titles.includes(node) && !footnotes.includes(node),
  );
  const textPatch = (
    node: Extract<PreparedNode, { type: "text" }>,
    x: number,
    y: number,
    maxWidth: number,
  ) => {
    const longest = Math.max(
      ...[node.text, ...(node.states ?? [])].map((value) =>
        Math.max(...value.split("\n").map((line) => line.length)),
      ),
    );
    const fontSize = Math.max(
      16,
      Math.min(
        node.fontSize,
        Math.floor(maxWidth / Math.max(1, longest * 0.62)),
      ),
    );
    const patch: NodePatch = {
      x: round(x),
      y: round(y),
      fontSize,
      align: "left",
    };
    if (node.textLayout)
      patch.lineWidth = round(Math.min(maxWidth, node.textLayout.width));
    nodes[node.id] = patch;
  };
  titles
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach((node, index) =>
      textPatch(node, margin, 86 + index * 112, output.width - 2 * margin),
    );
  footnotes
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach((node, index) =>
      textPatch(
        node,
        margin,
        output.height - 184 + index * 72,
        output.width - 2 * margin,
      ),
    );
  labels
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .forEach((node, index) => {
      const band = occupied.findIndex((group) =>
        group.some(
          (subject) =>
            Math.abs(subject.x + subject.width / 2 - node.x) < scene.width / 3,
        ),
      );
      const box = boxes[band >= 0 ? band : index % Math.max(1, boxes.length)];
      textPatch(
        node,
        margin,
        box
          ? Math.min(
              output.height - 275,
              box.y + box.height + 16 + (index % 2) * 54,
            )
          : 420 + index * 130,
        output.width - 2 * margin,
      );
    });

  const camera = scene.camera?.keys.map((key) => ({
    frame: key.frame,
    x: round(
      output.width / 2 +
        ((key.y - scene.height / 2) * output.width) / scene.height,
    ),
    y: round((key.x / scene.width) * output.height),
    zoom: round(
      Math.max(
        1,
        (key.zoom * (output.width / scene.width)) / Math.max(scale, 0.01),
      ),
    ),
  }));
  return StoryFormatOverrideSchema.parse({
    nodes,
    ...(camera?.length ? { camera: { keys: camera } } : {}),
  });
}

const outside = (bounds: Box, width: number, height: number, inset = 0) =>
  bounds.left < inset - 0.01 ||
  bounds.top < inset - 0.01 ||
  bounds.right > width - inset + 0.01 ||
  bounds.bottom > height - inset + 0.01;

/** Reports one diagnostic per problem and node, with the first offending frame. */
export function lintVertical(
  scene: StoryScene,
  options: { focusIds?: string[] } = {},
): PassageDiagnostic[] {
  const diagnostics: PassageDiagnostic[] = [];
  const checked = StorySceneSchema.safeParse(scene);
  if (!checked.success) diagnostics.push(...passageDiagnostics(checked.error));
  if (
    scene.format !== "vertical" ||
    scene.width !== output.width ||
    scene.height !== output.height
  )
    diagnostics.push({
      code: "invalid-vertical-format",
      severity: "error",
      message: "Vertical lint requires a resolved 1080x1920 story scene",
    });
  if (
    scene.format !== "vertical" ||
    !Array.isArray(scene.nodes) ||
    !Array.isArray(scene.connectors) ||
    !Number.isInteger(scene.frameCount) ||
    scene.frameCount < 1 ||
    scene.frameCount > 108000
  )
    return diagnostics;
  let rendered;
  try {
    rendered = compileStoryScene(scene, {
      validateSafeZones: false,
      onValidationError: (error) =>
        diagnostics.push(...passageDiagnostics(error)),
    });
  } catch (error) {
    diagnostics.push(...passageDiagnostics(error));
    return diagnostics;
  }
  diagnostics.push(...storySafeZoneDiagnostics(rendered, options.focusIds));
  const subjects = storyFocalSubjects(scene, options.focusIds);
  const attached = new Set(scene.connectors.map((connector) => connector.path));
  const reported = new Set<string>();
  const add = (code: string, message: string, node: string, frame: number) => {
    const key = `${code}:${node}`;
    if (reported.has(key)) return;
    reported.add(key);
    diagnostics.push({ code, severity: "error", message, node, frame });
  };
  for (let frame = 0; frame < scene.frameCount; frame++) {
    for (const node of rendered.nodes) {
      if (!isStoryNodeVisible(rendered, node, frame)) continue;
      const bounds = storyNodeBounds(rendered, node, frame);
      if (
        node.type === "text" &&
        outside(bounds, scene.width, scene.height, scene.safeInset)
      )
        add(
          "text-outside-safe-area",
          `Text ${node.id} leaves the vertical safe area at frame ${frame}`,
          node.id,
          frame,
        );
      if (subjects.has(node.id) && outside(bounds, scene.width, scene.height))
        add(
          "subject-outside-frame",
          `Focal subject ${node.id} leaves the vertical frame at frame ${frame}`,
          node.id,
          frame,
        );
      if (
        subjects.has(node.id) &&
        node.type !== "path" &&
        Math.min(bounds.right - bounds.left, bounds.bottom - bounds.top) <
          minimumFocalPixels
      )
        add(
          "subject-too-small",
          `Focal subject ${node.id} is smaller than ${minimumFocalPixels}px at frame ${frame}`,
          node.id,
          frame,
        );
      if (
        node.type === "path" &&
        !attached.has(node.id) &&
        outside(bounds, scene.width, scene.height)
      )
        add(
          "relationship-outside-frame",
          `Relationship ${node.id} leaves the vertical frame at frame ${frame}`,
          node.id,
          frame,
        );
    }
    for (const connector of scene.connectors) {
      for (const endpoint of [connector.from, connector.to]) {
        const point = storyAnchorPosition(
          rendered,
          endpoint.node,
          endpoint.point,
          frame,
        );
        if (
          point[0] < 0 ||
          point[1] < 0 ||
          point[0] > scene.width ||
          point[1] > scene.height
        )
          add(
            "relationship-outside-frame",
            `Relationship ${connector.path} has an off-frame endpoint at frame ${frame}`,
            connector.path,
            frame,
          );
      }
    }
  }
  return diagnostics;
}
