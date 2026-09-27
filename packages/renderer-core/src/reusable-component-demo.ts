import commerceFixture from "../../../benchmarks/fixtures/ecommerce-motion/atoms/studio.json" with { type: "json" };
import storyFixture from "../../../benchmarks/fixtures/story-authoring/comparison-template.json" with { type: "json" };
import { CommerceSceneSchema } from "../../scene-contract/src/commerce.ts";
import { StorySceneSchema } from "../../scene-contract/src/story.ts";
import {
  ReusableDemoSchema,
  type ReusableDemo,
} from "../../scene-contract/src/reusable-component-demo.ts";
import { PreparedFontSchema } from "../../scene-contract/src/prepared.ts";
import {
  labeledMarker,
  leaderLabel,
  boundsHighlight,
  rangeBracket,
  scalarDisplay,
} from "./component-presets.ts";
import {
  instantiateComponent,
  repeatComponent,
  addCommerceComponents,
  addStoryComponents,
  type ComponentInstance,
} from "./component-instances.ts";
import { layoutComponentBoxes } from "./component-layout.ts";

/** Portable paths are relative to the generated fixtures directory. Both contexts use the same component definitions. */
export function buildReusableDemo(input: ReusableDemo) {
  const settings = ReusableDemoSchema.parse(input),
    fps = settings.fps,
    frameCount = fps * 8;
  const font = PreparedFontSchema.parse({
    ...commerceFixture.fonts[0]!,
    path: "../../../assets/ecommerce-motion/fonts/noto-sans-thai.ttf",
  });
  const style = { font, color: "#233B32", accent: "#477D65" };
  const heading = {
    type: "text",
    id: "heading",
    x: 112,
    y: 85,
    width: 1680,
    height: 100,
    fontAsset: font.id,
    fontSize: 60,
    textBox: { locale: "en", maxLines: 1, lineHeight: 1.25 },
    color: style.color,
    text:
      settings.mode === "commerce"
        ? "A few details. One product."
        : "Two households. Shared building blocks.",
  };
  const product = {
    ...commerceFixture.assets[0]!,
    path: "../../../assets/ecommerce-motion/beauty-floating-product-v1.png",
  };
  const commerce = CommerceSceneSchema.parse({
    ...commerceFixture,
    title: "Reusable components · commerce",
    fps,
    frameCount,
    width: 1920,
    height: 1080,
    assets: [product],
    fonts: [font],
    metadata: {
      ...commerceFixture.metadata,
      profile: "landscape",
      protectedRegion: [0, 0, 1, 1],
    },
    nodes: [
      heading,
      {
        type: "group",
        id: "subject-a",
        x: 560,
        y: 230,
        width: 330,
        height: 410,
      },
      {
        type: "image",
        id: "subject-art",
        parent: "subject-a",
        width: 330,
        height: 410,
        states: [{ asset: product.id }],
      },
      {
        type: "rect",
        id: "subject-b",
        x: 1090,
        y: 320,
        width: 210,
        height: 210,
        radius: 12,
        fill: "#DEDACF",
      },
    ],
    events: [
      {
        node: "subject-a",
        property: "y",
        start: 0,
        end: frameCount - 1,
        to: 210,
        easing: "smoothstep",
      },
      {
        node: "subject-b",
        property: "y",
        start: 0,
        end: frameCount - 1,
        to: 350,
        easing: "smoothstep",
      },
    ],
    geometry: [
      {
        node: "subject-art",
        asset: product.id,
        sha256: product.sha256,
        visibleBounds: [0, 0, product.width, product.height],
        anchors: { center: [product.width / 2, product.height / 2] },
        protectedRegions: [],
      },
    ],
  });
  const house = storyFixture.scene.assets.find((a) => a.id === "house")!;
  const story = StorySceneSchema.parse({
    ...storyFixture.scene,
    title: "Reusable components · story",
    fps,
    frameCount,
    background: "#F2EDE3",
    assets: [house],
    fonts: [font],
    review: { essentialText: ["heading", "room", "strained"] },
    motionGrammar: "v2",
    camera: {
      keys: [
        { frame: 0, x: 960, y: 540, zoom: 1 },
        { frame: frameCount - 1, x: 980, y: 540, zoom: 1.025 },
      ],
      depth: { heading: 0, room: 0, strained: 0 },
    },
    nodes: [
      heading,
      { type: "group", id: "house-a", x: 370, y: 265, width: 320, height: 235 },
      {
        type: "image",
        id: "house-art-a",
        parent: "house-a",
        width: 320,
        height: 235,
        states: [{ asset: "house" }],
      },
      {
        type: "group",
        id: "house-b",
        x: 1210,
        y: 265,
        width: 320,
        height: 235,
      },
      {
        type: "image",
        id: "house-art-b",
        parent: "house-b",
        width: 320,
        height: 235,
        states: [{ asset: "house" }],
      },
      {
        type: "rect",
        id: "pressure-a",
        x: 220,
        y: 355,
        width: 95,
        height: 44,
        fill: "#477D65",
      },
      {
        type: "rect",
        id: "pressure-b",
        x: 1580,
        y: 355,
        width: 95,
        height: 44,
        fill: "#A65E46",
      },
      {
        ...heading,
        id: "room",
        x: 310,
        y: 590,
        width: 440,
        height: 75,
        fontSize: 42,
        text: "More room",
        align: "center",
      },
      {
        ...heading,
        id: "strained",
        x: 1150,
        y: 590,
        width: 440,
        height: 75,
        fontSize: 42,
        text: "Less room",
        align: "center",
      },
    ],
    recipe: {
      ...storyFixture.scene.recipe,
      reference: "heading",
      pressures: [
        { node: "pressure-a", to: [270, 355], condition: "room" },
        { node: "pressure-b", to: [1540, 355], condition: "strained" },
      ],
      moves: [
        {
          node: "house-a",
          to: { y: 245 },
          window: {
            start: 0,
            end: frameCount - 1,
            easing: "linear",
            cue: "house-lift",
          },
        },
      ],
    },
  });
  const source = settings.mode === "story" ? story : commerce;
  const targets =
    settings.mode === "story"
      ? ["house-a", "house-b"]
      : ["subject-a", "subject-b"];
  const target = source.nodes.find((n) => n.id === targets[0])!;
  let instances: ComponentInstance[] = [];
  if (["instances", "layout", "stagger"].includes(settings.example)) {
    const count = settings.example === "instances" ? 3 : settings.count;
    const marker = labeledMarker({
      ...style,
      text: "First marker",
      width: 280,
      height: 110,
      fontSize: 36,
      duration: Math.round(fps * 0.75),
    });
    const boxes = layoutComponentBoxes(
      { x: 112, y: 810, width: 1696, height: 150 },
      Array.from({ length: count }, () => marker.bounds),
      {
        axis: "x",
        align: "center",
        distribution: "space-between",
        gap: settings.gap,
      },
    );
    instances = repeatComponent(source, marker, {
      ids: boxes.map((_, i) => "marker" + (i + 1)),
      start: 12,
      stagger: settings.example === "layout" ? 0 : settings.stagger,
      offsets: boxes.map((b) => [b.x, b.y]),
    });
    instances = instances.map((instance, i) => {
      const middle = i === Math.floor(count / 2),
        text = middle ? settings.middleText : "Marker " + (i + 1);
      return {
        ...instance,
        nodes: instance.nodes.map((n) =>
          n.type === "text" ? { ...n, text } : n,
        ),
        motions: instance.motions.map((m) => ({
          ...m,
          window: {
            ...m.window,
            start: m.window.start + (middle ? settings.middleDelay : 0),
            end: m.window.end + (middle ? settings.middleDelay : 0),
          },
        })),
      };
    });
  } else if (settings.example === "value") {
    instances = [
      instantiateComponent(
        scalarDisplay({
          ...style,
          from: settings.from,
          to: settings.to,
          range: [-100, 100],
          width: 860,
          window: { start: 12, end: frameCount - 25 },
          format: { decimals: settings.decimals, suffix: " units" },
        }),
        { id: "quantity", offset: [530, 800] },
      ),
    ];
  } else if (settings.example === "leader") {
    instances = [
      instantiateComponent(
        leaderLabel({
          ...style,
          text: settings.middleText,
          box: { x: target.width + 100, y: 15, width: 360, height: 100 },
          point: [target.width, target.height * 0.35],
          fontSize: 36,
        }),
        { id: "annotation", external: { target: targets[0]! } },
      ),
    ];
  } else if (settings.example === "bracket") {
    const second = source.nodes.find((n) => n.id === targets[1])!;
    instances = [
      instantiateComponent(
        rangeBracket({
          from: [target.width / 2, target.height],
          to: [second.width / 2, second.height],
          offset: 120,
          tick: 20,
          color: style.accent,
          bounds: {
            x: target.x + target.width / 2,
            y:
              Math.min(target.y + target.height, second.y + second.height) +
              100,
            width: Math.abs(
              second.x + second.width / 2 - target.x - target.width / 2,
            ),
            height:
              Math.abs(second.y + second.height - target.y - target.height) +
              20,
          },
        }),
        { id: "range", external: { from: targets[0]!, to: targets[1]! } },
      ),
    ];
  } else {
    instances = [
      instantiateComponent(
        boundsHighlight({
          width: target.width,
          height: target.height,
          kind: settings.example as "outline" | "underline",
          color: style.accent,
          padding: 18,
        }),
        { id: "focus", external: { target: targets[0]! } },
      ),
    ];
  }
  if (source.schemaVersion === "story-scene-1")
    return addStoryComponents(source, instances);
  const composed = addCommerceComponents(source, instances);
  if (settings.mode !== "isolated") return composed;
  // Retain only the component and its declared visual context. Annotation targets need their full subtrees.
  const retained = new Set(instances.flatMap((i) => i.nodes.map((n) => n.id)));
  for (const annotation of composed.componentData!.annotations)
    for (const point of annotation.points) retained.add(point.node);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of composed.nodes) {
      if (node.parent && retained.has(node.id) && !retained.has(node.parent)) {
        retained.add(node.parent);
        changed = true;
      }
      if (node.parent && retained.has(node.parent) && !retained.has(node.id)) {
        retained.add(node.id);
        changed = true;
      }
    }
  }
  return CommerceSceneSchema.parse({
    ...composed,
    nodes: composed.nodes.filter((n) => retained.has(n.id)),
    events: composed.events.filter((e) => retained.has(e.node)),
    geometry: composed.geometry?.filter((g) => retained.has(g.node)),
  });
}
