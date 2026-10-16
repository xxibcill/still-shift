import { describe, expect, it } from "vitest";
import {
  createTapeHookPack,
  createCableTiePack,
  createClothespegPack,
  createMechanismCameraRecipeFrame,
  compileMechanismCameraRecipeClip,
} from "@still-shift/animation-engine";
import { MechanismPackInvariantError } from "../../packages/animation-engine/src/mechanism/pack-invariant.ts";
const viewport = { width: 640, height: 360 };
const reservedRegions = [
  { id: "caption", rect: { left: 12, top: 282, right: 628, bottom: 348 } },
  { id: "label", rect: { left: 470, top: 12, right: 628, bottom: 88 } },
];
function location(run: () => unknown) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(MechanismPackInvariantError);
    return (error as MechanismPackInvariantError).location;
  }
  throw new Error("Expected located camera failure");
}
describe("six actual posed camera recipes", () => {
  it("frames all six intents for three families and two sizes with protected overlay space", () => {
    const fixtures = [
      createTapeHookPack(),
      createTapeHookPack({
        parameters: { hookThickness: 0.26, bladeLength: 14, bladeWidth: 2.5 },
      }),
      createCableTiePack(),
      createCableTiePack({
        parameters: { pitch: 0.6, toothCount: 12, strapWidth: 1.4 },
      }),
      createClothespegPack(),
      createClothespegPack({
        parameters: { armLength: 8, armWidth: 1.1, clothThickness: 0.3 },
      }),
    ];
    for (const instance of fixtures)
      for (const target of instance.cameraTargets) {
        const rigControls =
          instance.pack.id === "tape-hook"
            ? {
                slider: {
                  type: "slider" as const,
                  value:
                    target.id === "comparison"
                      ? instance.scene.rigs.find((r) => r.type === "slider")!
                          .range[1]
                      : 0,
                },
              }
            : {};
        const hiddenParts =
          instance.pack.id === "tape-hook"
            ? [target.id === "comparison" ? "board" : "wall"]
            : [];
        const frame = createMechanismCameraRecipeFrame(instance, {
          ...viewport,
          target: target.id,
          frame: 0,
          rigControls,
          hiddenParts,
          reservedRegions,
        });
        expect(frame.check.status).toBe("passed");
        expect(frame.check.proofSurfaces.length).toBeGreaterThan(0);
        expect(
          frame.check.proofSurfaces.every((p) => p.visibility === "visible"),
        ).toBe(true);
        expect(frame.availableRegion.bottom).toBeLessThanOrEqual(282);
        expect(frame.camera.near).toBeGreaterThan(0);
      }
  }, 30000);
  it("keeps fixed-camera holds and random seeks independent of playback history", () => {
    const instance = createCableTiePack({ parameters: { pitch: 0.48 } }),
      rigControls = {
        ratchet: {
          type: "ratchet" as const,
          position: {
            keys: [
              { frame: 0, value: 0 },
              { frame: 6, value: 0.48 },
              { frame: 12, value: 0.96 },
            ],
          },
          latchKeys: [{ frame: 0, state: "engaged" as const }],
        },
      };
    const options = {
      ...viewport,
      target: "macro",
      rigControls,
      envelopeFrames: [0, 3, 6, 9, 12],
      reservedRegions,
    };
    const expected = createMechanismCameraRecipeFrame(instance, {
      ...options,
      frame: 3,
    });
    for (const frame of [12, 0, 9, 3])
      expect(
        createMechanismCameraRecipeFrame(instance, { ...options, frame })
          .camera,
      ).toEqual(expected.camera);
    expect(
      createMechanismCameraRecipeFrame(instance, { ...options, frame: 3 }),
    ).toEqual(expected);
  });
  it("binds spring probes to the actual posed triangles through opening and return", () => {
    const instance = createClothespegPack(),
      rigControls = {
        "upper.return": {
          type: "spring-return" as const,
          states: [
            { frame: 0, phase: "held" as const, value: 0 },
            { frame: 3, phase: "held" as const, value: -0.16 },
            {
              frame: 6,
              phase: "released" as const,
              value: -0.16,
              stopValue: 0,
            },
          ],
        },
        "lower.return": {
          type: "spring-return" as const,
          states: [
            { frame: 0, phase: "held" as const, value: 0 },
            { frame: 3, phase: "held" as const, value: 0.16 },
            { frame: 6, phase: "released" as const, value: 0.16, stopValue: 0 },
          ],
        },
      };
    const options = {
      ...viewport,
      target: "macro",
      rigControls,
      envelopeFrames: [0, 1.5, 3, 6, 9, 12, 18],
    };
    const first = createMechanismCameraRecipeFrame(instance, {
      ...options,
      frame: 0,
    });
    for (const frame of [1.5, 3, 6, 9, 12, 18]) {
      const next = createMechanismCameraRecipeFrame(instance, {
        ...options,
        frame,
      });
      expect(next.bindings.map((b) => b.id)).toEqual(
        first.bindings.map((b) => b.id),
      );
      expect(
        next.check.proofSurfaces.every((s) => s.visibility === "visible"),
      ).toBe(true);
    }
  });
  it("preserves a valid authored camera and rejects an obscured override instead of replacing it", () => {
    const instance = createCableTiePack(),
      input = { ...viewport, target: "macro", frame: 0 };
    const generated = createMechanismCameraRecipeFrame(instance, input),
      authored = createMechanismCameraRecipeFrame(instance, {
        ...input,
        authoredCamera: generated.camera,
      });
    expect(authored.camera).toEqual(generated.camera);
    expect(authored.authored).toBe(true);
    expect(authored.directionIndex).toBe(-1);
    const blocked = {
      ...generated.camera,
      position: [-5, 1, 0] as [number, number, number],
      target: [0, 0.5, 0] as [number, number, number],
      fovDegrees: 65,
    };
    expect(
      location(() =>
        createMechanismCameraRecipeFrame(instance, {
          ...input,
          authoredCamera: blocked,
        }),
      ).code,
    ).toMatch(/mechanism-camera-/);
  });
  it("reports a fully reserved viewport with region IDs and target location", () => {
    const instance = createCableTiePack();
    expect(
      location(() =>
        createMechanismCameraRecipeFrame(instance, {
          ...viewport,
          target: "macro",
          frame: 0,
          reservedRegions: [
            {
              id: "locked-caption",
              rect: { left: 0, top: 0, right: 640, bottom: 360 },
            },
          ],
        }),
      ),
    ).toMatchObject({
      code: "mechanism-camera-region",
      path: ["cameraRecipes", "macro", "reservedRegions"],
    });
  });
  it("rejects physical camera intersections and near-plane cuts with located mesh evidence", () => {
    const instance = createClothespegPack(),
      input = { ...viewport, target: "macro", frame: 0 };
    const inside = {
      position: [-1, 0.7, 0] as [number, number, number],
      target: [0, 0, 0] as [number, number, number],
      up: [0, 1, 0] as [number, number, number],
      fovDegrees: 65,
      near: 0.001,
      far: 100,
    };
    expect(
      location(() =>
        createMechanismCameraRecipeFrame(instance, {
          ...input,
          authoredCamera: inside,
        }),
      ).code,
    ).toBe("mechanism-camera-intersection");
    const normal = createMechanismCameraRecipeFrame(instance, input);
    expect(
      location(() =>
        createMechanismCameraRecipeFrame(instance, {
          ...input,
          authoredCamera: {
            ...normal.camera,
            near: Math.hypot(...normal.camera.position),
            far: 200,
          },
        }),
      ).code,
    ).toBe("mechanism-camera-near");
  });
  it("keeps cuts/holds independent of camera intent and verifies a controlled orbit at every authored sample", () => {
    const instance = createCableTiePack(),
      input = {
        ...viewport,
        target: "orbit",
        sourceFrames: [0, 1, 2, 3, 4],
        orbitDegrees: [-10, 10] as [number, number],
      };
    const orbit = compileMechanismCameraRecipeClip(instance, {
      ...input,
      editing: "hold",
    });
    expect(orbit.intentionalCut).toBe(false);
    expect(orbit.cameraKeys[0]!.position).not.toEqual(
      orbit.cameraKeys.at(-1)!.position,
    );
    expect(orbit.checks).toHaveLength(5);
    const cut = compileMechanismCameraRecipeClip(instance, {
      ...viewport,
      sourceFrames: input.sourceFrames,
      target: "recognition",
      editing: "cut",
    });
    expect(cut.intentionalCut).toBe(true);
    expect(cut.cameraKeys[0]!.position).toEqual(
      cut.cameraKeys.at(-1)!.position,
    );
  });
  it("verifies a transition from recognition into macro with its explicit start camera", () => {
    const instance = createCableTiePack();
    const fromCamera = createMechanismCameraRecipeFrame(instance, {
      ...viewport,
      target: "recognition",
      frame: 0,
    }).camera;
    const clip = compileMechanismCameraRecipeClip(instance, {
      ...viewport,
      target: "macro",
      sourceFrames: [0, 1, 2, 3, 4],
      editing: "transition",
      fromCamera,
    });
    expect(clip.cameraKeys[0]!.position).toEqual(fromCamera.position);
    expect(clip.intentionalCut).toBe(false);
    expect(clip.checks.every((c) => c.status === "passed")).toBe(true);
  });
  it("reframes a moved, rotated and nonuniformly scaled pack without authored coordinate rewrites", () => {
    const instance = createCableTiePack({
      mount: {
        position: [4, 2, -3],
        rotation: [0.2, 0.3, -0.1],
        scale: [1.2, 0.8, 1.1],
      },
    });
    const frame = createMechanismCameraRecipeFrame(instance, {
      ...viewport,
      target: "macro",
      frame: 0,
      reservedRegions,
    });
    expect(frame.check.status).toBe("passed");
  });
  it("rejects changed camera definitions, oversized frame inventories and incompatible track up directions", () => {
    const instance = createCableTiePack(),
      input = { ...viewport, target: "recognition", frame: 0 };
    expect(
      location(() =>
        createMechanismCameraRecipeFrame(
          { ...instance, cameraTargetsSha256: "sha256:" + "0".repeat(64) },
          input,
        ),
      ).code,
    ).toBe("mechanism-camera-revision");
    expect(() =>
      compileMechanismCameraRecipeClip(instance, {
        ...viewport,
        target: "macro",
        editing: "hold",
        sourceFrames: Array.from({ length: 65 }, (_, i) => i),
      }),
    ).toThrow();
    const fromCamera = createMechanismCameraRecipeFrame(instance, input).camera;
    expect(
      location(() =>
        compileMechanismCameraRecipeClip(instance, {
          ...viewport,
          target: "macro",
          editing: "transition",
          sourceFrames: [0, 1, 2],
          fromCamera: { ...fromCamera, up: [0.1, 1, 0] },
        }),
      ).code,
    ).toBe("mechanism-camera-track");
  });
  it("retains a preceding end camera for a hold and requires an explicit cut when the wider target cannot fit", () => {
    const instance = createCableTiePack();
    const macro = compileMechanismCameraRecipeClip(instance, {
      ...viewport,
      target: "macro",
      editing: "hold",
      sourceFrames: [0, 1, 2],
    });
    const held = compileMechanismCameraRecipeClip(instance, {
      ...viewport,
      target: "macro",
      editing: "hold",
      fromCamera: macro.endCamera,
      sourceFrames: [3, 4, 5],
    });
    expect(held.camera).toEqual(macro.endCamera);
    expect(held.cameraKeys[0]!.position).toEqual(
      held.cameraKeys.at(-1)!.position,
    );
    expect(
      location(() =>
        compileMechanismCameraRecipeClip(instance, {
          ...viewport,
          target: "recognition",
          editing: "hold",
          fromCamera: macro.endCamera,
          sourceFrames: [3, 4, 5],
        }),
      ).code,
    ).toBe("mechanism-camera-framing");
    const cut = compileMechanismCameraRecipeClip(instance, {
      ...viewport,
      target: "recognition",
      editing: "cut",
      fromCamera: { ...macro.endCamera, up: [0.1, 1, 0] },
      sourceFrames: [3, 4, 5],
    });
    expect(cut.intentionalCut).toBe(true);
    expect(cut.camera.position).not.toEqual(macro.endCamera.position);
    expect(
      location(() =>
        compileMechanismCameraRecipeClip(instance, {
          ...viewport,
          target: "orbit",
          editing: "hold",
          authoredCamera: macro.endCamera,
          orbitDegrees: [-8, 8],
          sourceFrames: [3, 4, 5],
        }),
      ).code,
    ).toBe("mechanism-camera-track");
  });
});
