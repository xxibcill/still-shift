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

/** Supplementary opaque-solid controls; original border-filter fixtures stay frozen. */
export function solidFixtures(): { id: string; scene: Experiment }[] {
  return ["solid-hard", "solid-soft-four", "solid-soft-sixteen"].map((id) => {
    const scene = experiment();
    scene.receiver = {
      ...scene.receiver,
      origin: [-24, -24, 20],
      u: [48, 0, 0],
      v: [0, 48, 0],
    };
    scene.casters[0]!.alpha = {
      width: 8,
      height: 8,
      pixels: Array.from({ length: 64 }, () => 255),
    };
    if (id !== "solid-hard") {
      scene.light.radius = 6;
      scene.light.samples = id === "solid-soft-four" ? 4 : 16;
    }
    return { id, scene };
  });
}

export function maximumInputFixture(): Experiment {
  const scene = solidFixtures()[0]!.scene;
  scene.light.radius = 12;
  scene.light.samples = 16;
  scene.casters = Array.from({ length: 8 }, (_, index) => ({
    ...plane(`caster_${index}`, 2 + index * 2),
    order: index,
    origin: [-4 + index, -4, 2 + index * 2],
    opacity: 0.5,
    alpha: {
      width: 64,
      height: 64,
      pixels: Array.from({ length: 4096 }, (_, i) => (i % 5 === 0 ? 0 : 128)),
    },
  }));
  return scene;
}

/** Small coordinates whose Gram determinant cancels to zero in float32. */
export function nearCollinearFixture(): Experiment {
  const scene = experiment();
  scene.receiver.origin = [-8, -0.0008, 20];
  scene.receiver.u = [16, 0, 0];
  scene.receiver.v = [0, 0.0016, 0];
  scene.casters[0]!.origin = [-8, -0.0004, 10];
  scene.casters[0]!.u = [8, 0, 0];
  scene.casters[0]!.v = [8, 0.0008, 0];
  return scene;
}

/** A nonzero float32 Gram determinant can still produce large interior UV errors. */
export function unstableShearFixture(): Experiment {
  const scene = experiment();
  scene.receiver.origin = [0, 0, 20];
  scene.receiver.u = [(32 * 64) / 65, 0, 0];
  scene.receiver.v = [0, (1.6 * 0.0081 * 64) / 65, 0];
  scene.casters[0]!.origin = [0, 0, 10];
  scene.casters[0]!.u = [8, 0, 0];
  scene.casters[0]!.v = [8, 0.0081, 0];
  return scene;
}

/** Supported near-limit shears, with full-resolution alpha and interior sampling. */
export function conditionedShearFixtures(): {
  id: string;
  scene: Experiment;
}[] {
  return [0.805, 0.82, 1, 2, 8].map((shear) => {
    const scene = experiment();
    scene.receiver.origin = [0, 0, 20];
    scene.receiver.u = [31.51, 0, 0];
    scene.receiver.v = [0, 1.57 * shear, 0];
    scene.casters[0]!.origin = [0, 0, 10];
    scene.casters[0]!.u = [8, 0, 0];
    scene.casters[0]!.v = [8, shear, 0];
    scene.casters[0]!.alpha = {
      width: 64,
      height: 64,
      pixels: Array.from({ length: 4096 }, (_, i) => (i % 3 === 0 ? 0 : 255)),
    };
    return { id: `conditioned-shear-${shear}`, scene };
  });
}
