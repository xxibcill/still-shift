import {
  PreparedNodeSchema,
  type CommerceScene,
} from "@still-shift/scene-contract";
import { primitiveBlurVariants } from "./composition-primitive-blur.ts";
import { motionPathVariants } from "./composition-motion-path.ts";
import { numericTypographyVariants } from "./composition-typography.ts";

export function commerceExposureVariants(id: string, source: CommerceScene) {
  if (id === "typography/commerce")
    return [
      { id: "native", scene: source },
      ...numericTypographyVariants(source),
    ].map((item) => {
      const scene = structuredClone(item.scene) as CommerceScene;
      scene.effects = [
        ...(scene.effects ?? []),
        { type: "motion-blur", shutterAngle: 360, samples: 2 },
      ];
      return { id: `${id}/motion-blur-${item.id}`, scene };
    });
  if (
    [
      "component/commerce-state",
      "commerce/atom-path",
      "component/commerce-value",
    ].includes(id)
  ) {
    const scene =
      id === "component/commerce-state"
        ? primitiveBlurVariants(id, source)[0]!.scene
        : id === "commerce/atom-path"
          ? motionPathVariants(id, source)[2]!.scene
          : structuredClone(source);
    scene.effects = [
      ...(scene.effects ?? []),
      { type: "motion-blur", shutterAngle: 360, samples: 2 },
    ];
    return [{ id: `${id}/motion-blur`, scene }];
  }
  if (id !== "commerce/atom-motion-blur") return [];
  const wide = structuredClone(source);
  wide.effects = [{ type: "motion-blur", shutterAngle: 360, samples: 32 }];
  const zero = structuredClone(source);
  zero.effects = [{ type: "motion-blur", shutterAngle: 0, samples: 2 }];
  const cuts = structuredClone(source);
  cuts.effects = [
    {
      type: "motion-blur",
      shutterAngle: 360,
      samples: 4,
    },
    {
      type: "glow",
      target: "product",
      radius: 3,
      intensity: 0.2,
      threshold: 0.1,
      active: { start: 12, end: 40 },
    },
  ];
  cuts.visibility = [{ target: "product", start: 15, end: 70 }];
  cuts.events.push({
    node: "product",
    property: "opacity",
    start: 18,
    end: 28,
    from: 0.3,
    to: 0.8,
    easing: "linear",
  });
  const layered = structuredClone(source);
  layered.nodes.find((node) => node.id === "product")!.opacity = 0.6;
  layered.nodes.push(
    PreparedNodeSchema.parse({
      id: "badge",
      parent: "product",
      type: "rect",
      x: 100,
      y: 120,
      width: 240,
      height: 160,
      fill: "#db8452",
      radius: 12,
      opacity: 0.65,
    }),
  );
  layered.nodes.push(
    PreparedNodeSchema.parse({
      id: "mask",
      type: "rect",
      x: 380,
      y: 320,
      width: 330,
      height: 480,
      fill: "#ffffff",
      radius: 20,
      opacity: 0.7,
    }),
  );
  layered.mattes = [
    {
      target: "product",
      mask: "mask",
      invert: true,
      space: "canvas",
      order: "after-effects",
    },
  ];
  layered.effects = [
    { type: "motion-blur", shutterAngle: 270, samples: 4 },
    { type: "echo", target: "product", spacing: 2, count: 3, decay: 0.5 },
    {
      type: "glow",
      target: "product",
      radius: 4,
      intensity: 0.3,
      threshold: 0.1,
    },
  ];
  return [
    { id: `${id}/wide-32`, scene: wide },
    { id: `${id}/zero`, scene: zero },
    { id: `${id}/active-cuts`, scene: cuts },
    { id: `${id}/overlap-echo-matte`, scene: layered },
  ];
}
