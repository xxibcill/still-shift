import {
  CommerceSceneSchema,
  type CommerceScene,
} from "../../scene-contract/src/commerce.ts";
import {
  EffectDemoSettingsSchema,
  EFFECT_DEMOS,
  type CommerceEffect,
} from "../../scene-contract/src/commerce-effects.ts";
import type {
  ComponentDemo,
  ComponentDemoKind,
} from "../../scene-contract/src/commerce-components.ts";
import { PreparedNodeSchema } from "../../scene-contract/src/prepared.ts";

export function buildCommerceEffectDemo(
  options: ComponentDemo,
  base: (kind: ComponentDemoKind) => CommerceScene,
): CommerceScene {
  const settings = EffectDemoSettingsSchema.parse(options.treatment ?? {});
  const { kind, fps, frameCount } = options;
  const amount = settings.amount;
  const entrance = [
    "motion-blur",
    "directional-blur",
    "overshoot",
    "echo",
  ].includes(kind);
  const scene = base(entrance ? "translate" : "studio");
  const end = frameCount - 1;
  const loop = { start: 0, end, cycles: options.cycles };
  const effects: CommerceEffect[] = [];
  const shadow = (): CommerceEffect => ({
    type: "height-shadow",
    target: "shadow",
    source: "product",
    restY: options.product.y,
    travel: Math.max(0.001, options.travel),
    spread: amount * 0.1,
    fade: amount * 0.22,
  });
  const drift = (): CommerceEffect => ({
    type: "drift",
    target: "product",
    ...loop,
    travelX: amount * 4,
    tilt: amount * 0.5,
  });
  const light = (): CommerceEffect => ({
    type: "background-light",
    ...loop,
    x: 440,
    y: 420,
    radius: 700,
    travel: 160,
    strength: amount * 0.3,
    color: "#FFF9E8",
  });
  if (["focus-blur", "parallax", "displacement"].includes(kind)) {
    scene.nodes.unshift(
      ...[
        { type: "group", id: "rear", width: 1080, height: 1350 },
        {
          type: "rect",
          id: "rear-arch",
          parent: "rear",
          x: 120,
          y: 140,
          width: 550,
          height: 1050,
          radius: 275,
          fill: "#D8CFB8",
        },
        {
          type: "rect",
          id: "rear-line",
          parent: "rear",
          x: 830,
          y: 0,
          width: 35,
          height: 1350,
          fill: "#E3D5BF",
        },
      ].map((node) => PreparedNodeSchema.parse(node)),
    );
  }
  switch (kind) {
    case "motion-blur":
      effects.push({
        type: "motion-blur",
        shutterAngle: Math.min(360, settings.shutterAngle * amount),
        samples: settings.samples,
      });
      break;
    case "directional-blur":
      effects.push({
        type: "directional-blur",
        target: "product",
        length: amount * 22,
        angle: 0,
        samples: settings.samples,
      });
      break;
    case "overshoot":
      effects.push({
        type: "overshoot",
        target: "product",
        axis: "x",
        start: Math.round(fps * 1.1),
        end: Math.round(fps * 2.1),
        amplitude: amount * 50,
        oscillations: 2,
      });
      break;
    case "drift":
      effects.push(drift());
      break;
    case "height-shadow":
      effects.push(shadow());
      break;
    case "focus-blur":
      effects.push(
        {
          type: "focus-blur",
          target: "rear",
          start: 0,
          end: fps * 2,
          radius: 0,
          endRadius: amount * 12,
        },
        {
          type: "focus-blur",
          target: "product",
          start: 0,
          end: fps * 2,
          radius: amount * 16,
          endRadius: 0,
        },
      );
      break;
    case "parallax":
      effects.push(
        {
          type: "parallax",
          target: "rear",
          ...loop,
          travelX: amount * 40,
          travelY: amount * 8,
          depth: 1,
        },
        {
          type: "parallax",
          target: "product",
          ...loop,
          travelX: amount * 40,
          travelY: amount * 8,
          depth: 0.15,
        },
      );
      break;
    case "light-sweep":
      effects.push({
        type: "light-sweep",
        target: "product",
        ...loop,
        region: [0.34, 0.06, 0.32, 0.24],
        width: 0.13,
        strength: amount * 0.3,
      });
      break;
    case "glow":
      effects.push({
        type: "glow",
        target: "product",
        radius: 16,
        intensity: amount * 0.3,
        threshold: 0.72,
      });
      break;
    case "echo":
      effects.push({
        type: "echo",
        target: "product",
        spacing: 3,
        count: 5,
        decay: amount * 0.35,
      });
      break;
    case "grain":
      effects.push({
        type: "grain",
        amount: amount * 0.045,
        seed: settings.seed,
      });
      break;
    case "particles":
      effects.push({
        type: "particles",
        ...loop,
        count: 48,
        radius: 3,
        opacity: amount * 0.24,
        seed: settings.seed,
        color: "#8D795C",
      });
      break;
    case "background-light":
      effects.push(light());
      break;
    case "displacement":
      effects.push({
        type: "displacement",
        target: "rear",
        ...loop,
        amount: amount * 16,
        wavelength: 340,
      });
      break;
    case "effects-studio":
      effects.push(shadow(), drift(), light());
      break;
  }
  return CommerceSceneSchema.parse({
    ...scene,
    title: EFFECT_DEMOS.find((demo) => demo.id === kind)!.name,
    effects: settings.enabled && amount > 0 ? effects : [],
  });
}
