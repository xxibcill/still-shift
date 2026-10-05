import { SHADOW_MODEL, type Experiment, type Plane } from "./model.ts";

export function plane(id: string, z: number): Plane {
  return {
    id,
    scope: "root",
    order: 0,
    origin: [-4, -4, z],
    u: [8, 0, 0],
    v: [0, 8, 0],
    alpha: { width: 1, height: 1, pixels: [255] },
    opacity: 1,
    castsShadow: true,
    receivesShadow: true,
  };
}

export function experiment(): Experiment {
  return {
    version: SHADOW_MODEL,
    receiver: plane("receiver", 20),
    casters: [plane("caster", 10)],
    light: { position: [0, 0, 0], radius: 0, samples: 1, enabled: true },
  };
}

/** Explicit alpha inputs stand in for future rasterized native asset adapters. */
export function fixtures(): { id: string; scene: Experiment }[] {
  const cases = [
    "hard",
    "soft-four",
    "soft-sixteen",
    "alpha-hole",
    "translucent-overlap",
    "tilted-mirrored",
    "offscreen",
    "precomp-isolation",
    "disabled",
  ];
  return cases.map((id) => {
    const scene = experiment();
    scene.receiver = {
      ...scene.receiver,
      origin: [-24, -24, 20],
      u: [48, 0, 0],
      v: [0, 48, 0],
    };
    if (id.startsWith("soft")) {
      scene.light.radius = 6;
      scene.light.samples = id === "soft-four" ? 4 : 16;
    }
    if (id === "alpha-hole")
      scene.casters[0]!.alpha = {
        width: 3,
        height: 3,
        pixels: [255, 255, 255, 255, 0, 255, 255, 255, 255],
      };
    if (id === "translucent-overlap") {
      scene.casters[0]!.opacity = 0.5;
      scene.casters.push({
        ...plane("second", 12),
        origin: [0, -4, 12],
        order: 1,
      });
    }
    if (id === "tilted-mirrored") {
      scene.casters[0]!.origin = [4, -4, 8];
      scene.casters[0]!.u = [-8, 0, 4];
      scene.casters[0]!.v = [2, 8, 0];
    }
    if (id === "offscreen") {
      scene.light.position = [100, 0, 0];
      scene.casters[0]!.origin = [46, -4, 10];
    }
    if (id === "precomp-isolation")
      scene.casters[0]!.scope = "root/precomp-instance";
    if (id === "disabled") scene.light.enabled = false;
    return { id, scene };
  });
}
