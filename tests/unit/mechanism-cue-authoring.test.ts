import { describe, expect, it } from "vitest";
import { narratedCycleFixture } from "../helpers/mechanism-narrated-cycle.ts";
import {
  applyMechanismCuePatch,
  inspectMechanismCueAuthoring,
  MechanismCuePatchSchema,
} from "../../packages/animation-engine/src/mechanism/cue-authoring.ts";
const request = (
  current: ReturnType<typeof inspectMechanismCueAuthoring>,
  operations: unknown[],
) => ({
  schemaVersion: "mechanism-cue-patch-1",
  baseRevision: current.document.revision,
  baseHash: current.projectHash,
  operations,
});
describe("scoped cue authoring", () => {
  it("recompiles scoped captions, annotations and effect gains across three families without changing native picture or narration", () => {
    for (const family of ["tape-hook", "cable-tie", "clothespeg"] as const) {
      const { instance, document } = narratedCycleFixture(family, 96000),
        current = inspectMechanismCueAuthoring(instance, document),
        before = JSON.stringify(document);
      const result = applyMechanismCuePatch(
        instance,
        document,
        request(current, [
          { cue: "contact", property: "caption", value: "Here" },
          {
            cue: "contact",
            annotation: "part",
            property: "annotation",
            value: {
              text: "Tip",
              anchor: document.cues[1]!.annotations[0]!.anchor,
              position: [24, 24],
            },
          },
          { cue: "contact", sound: "tick", property: "sound-gain", value: -6 },
        ]),
      );
      expect(result.document.revision).toBe(1);
      expect(result.affectedShots).toEqual(["contact"]);
      expect(
        result.compiled.composition.layers.filter(
          (layer) => layer.type === "native3d",
        ),
      ).toEqual(
        current.compiled.composition.layers.filter(
          (layer) => layer.type === "native3d",
        ),
      );
      expect(result.document.narration).toEqual(document.narration);
      expect(result.compiled.recording).toEqual(current.compiled.recording);
      expect(JSON.stringify(document)).toBe(before);
    }
  });
  it("retimes controls and every dependent shot from a supplied cue window without changing the recording clock", () => {
    const { instance, document } = narratedCycleFixture("tape-hook", 96000),
      current = inspectMechanismCueAuthoring(instance, document);
    const result = applyMechanismCuePatch(
      instance,
      document,
      request(current, [
        {
          cue: "release",
          property: "window",
          value: { startSample: 49600, endSampleExclusive: 72000 },
        },
      ]),
    );
    expect(result.compiled.cueMap[2]!.startFrame).toBe(31);
    expect(result.affectedShots).toEqual(document.cues.map((c) => c.id));
    expect(result.compiled.timeline.timeline.rigControls).not.toEqual(
      current.compiled.timeline.timeline.rigControls,
    );
    expect(result.compiled.recording).toEqual(current.compiled.recording);
    expect(result.cacheEffects.nativePlates).toBe(
      "invalidate-whole-native-clip",
    );
  });
  it("supports authored camera cuts and stable rig-control replacement", () => {
    const { instance, document } = narratedCycleFixture("tape-hook", 96000),
      current = inspectMechanismCueAuthoring(instance, document);
    const result = applyMechanismCuePatch(
      instance,
      document,
      request(current, [
        {
          cue: "contact",
          property: "camera",
          value: { camera: instance.scene.camera, editing: "cut" },
        },
        {
          rig: "slider",
          property: "rig-control",
          value: document.controls[0]!.control,
        },
      ]),
    );
    expect(result.document.cues[1]!.editing).toBe("cut");
    expect(result.document.controls[0]!.rig).toBe("slider");
    expect(result.affectedShots).toHaveLength(4);
  });
  it("rejects overfull reading, out-of-recording cues, invalid events and out-of-range controls before changing the original", () => {
    const { instance, document } = narratedCycleFixture("tape-hook", 96000),
      current = inspectMechanismCueAuthoring(instance, document),
      before = JSON.stringify(document);
    for (const operation of [
      { cue: "contact", property: "caption", value: "x".repeat(100) },
      {
        cue: "return",
        property: "window",
        value: { startSample: 72000, endSampleExclusive: 100000 },
      },
      {
        cue: "release",
        property: "semantic",
        value: { kind: "return", state: "free", minimumActionSamples: 12000 },
      },
      {
        rig: "slider",
        property: "rig-control",
        value: { type: "slider", value: 99 },
      },
    ]) {
      expect(() =>
        applyMechanismCuePatch(
          instance,
          document,
          request(current, [operation]),
        ),
      ).toThrow();
      expect(JSON.stringify(document)).toBe(before);
    }
  });
  it("rejects stale bases, duplicate property writers, missing stable targets and annotation identity injection", () => {
    const { instance, document } = narratedCycleFixture("tape-hook", 96000),
      current = inspectMechanismCueAuthoring(instance, document);
    const caption = { cue: "contact", property: "caption", value: "Here" };
    expect(() =>
      applyMechanismCuePatch(instance, document, {
        ...request(current, [caption]),
        baseRevision: 1,
      }),
    ).toThrow("revision/hash");
    expect(() =>
      applyMechanismCuePatch(instance, document, {
        ...request(current, [caption]),
        baseHash: `sha256:${"1".repeat(64)}`,
      }),
    ).toThrow("revision/hash");
    expect(() =>
      applyMechanismCuePatch(
        instance,
        document,
        request(current, [caption, caption]),
      ),
    ).toThrow("Duplicate");
    for (const operation of [
      { ...caption, cue: "missing" },
      {
        rig: "missing",
        property: "rig-control",
        value: document.controls[0]!.control,
      },
      { cue: "contact", sound: "missing", property: "sound-gain", value: 0 },
      {
        cue: "contact",
        annotation: "missing",
        property: "annotation",
        value: { text: "Tip", anchor: "hook.tip", position: [24, 24] },
      },
    ])
      expect(() =>
        applyMechanismCuePatch(
          instance,
          document,
          request(current, [operation]),
        ),
      ).toThrow("Unknown");
    expect(() =>
      applyMechanismCuePatch(
        instance,
        document,
        request(current, [
          {
            cue: "contact",
            annotation: "part",
            property: "annotation",
            value: { ...document.cues[1]!.annotations[0], id: "replacement" },
          },
        ]),
      ),
    ).toThrow();
  });
  it("preserves complete schema diagnostics and rejects unsupported versions and revision overflow", () => {
    const { instance, document } = narratedCycleFixture("tape-hook", 96000),
      current = inspectMechanismCueAuthoring(instance, document);
    expect(() =>
      inspectMechanismCueAuthoring(instance, {
        ...document,
        schemaVersion: "mechanism-narrated-cycle-9",
      }),
    ).toThrow("Unsupported");
    expect(() =>
      applyMechanismCuePatch(instance, document, {
        ...request(current, []),
        schemaVersion: "mechanism-cue-patch-9",
      }),
    ).toThrow("Unsupported");
    const exhausted = inspectMechanismCueAuthoring(instance, {
      ...document,
      revision: 2147483647,
    });
    expect(() =>
      applyMechanismCuePatch(
        instance,
        exhausted.document,
        request(exhausted, [
          { cue: "contact", property: "caption", value: "Here" },
        ]),
      ),
    ).toThrow();
  });
  it("keeps the original operation/byte limits and has no patch route to narration/source identity", () => {
    const { instance, document } = narratedCycleFixture("tape-hook", 96000),
      current = inspectMechanismCueAuthoring(instance, document);
    expect(
      MechanismCuePatchSchema.safeParse(
        request(
          current,
          Array.from({ length: 33 }, () => ({
            cue: "contact",
            property: "caption",
            value: "Here",
          })),
        ),
      ).success,
    ).toBe(false);
    expect(
      MechanismCuePatchSchema.safeParse(
        request(
          current,
          Array.from({ length: 5 }, () => ({
            cue: "contact",
            property: "caption",
            value: "x".repeat(4000),
          })),
        ),
      ).success,
    ).toBe(false);
    for (const property of ["narration", "source", "revision"])
      expect(
        MechanismCuePatchSchema.safeParse(
          request(current, [{ cue: "contact", property, value: {} }]),
        ).success,
      ).toBe(false);
  });
});
