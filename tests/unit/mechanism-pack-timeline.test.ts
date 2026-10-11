import { describe, expect, it } from "vitest";
import {
  compileMechanismPackTimeline,
  sampleMechanismPackTimeline,
} from "../../packages/animation-engine/src/mechanism/pack-timeline.ts";
import { createTapeHookPack } from "../../packages/animation-engine/src/mechanism/tape-hook-pack.ts";
import { createCableTiePack } from "../../packages/animation-engine/src/mechanism/cable-tie-pack.ts";
import { createClothespegPack } from "../../packages/animation-engine/src/mechanism/clothespeg-pack.ts";
import { MechanismPackInvariantError } from "../../packages/animation-engine/src/mechanism/pack-invariant.ts";

function authored(rig = "slider", relationship = "hook.innerRange") {
  return {
    schemaVersion: "mechanism-pack-timeline-1",
    frameCount: 6,
    initialState: "ready",
    states: ["ready", "touching", "free", "returned"].map((id) => ({
      id,
      requirements: [{ rig, relationship }],
    })),
    transitions: [
      { from: "ready", to: "touching", event: "contact" },
      { from: "touching", to: "free", event: "release" },
      { from: "free", to: "returned", event: "return" },
    ],
    events: [
      { id: "begin", frame: 0, kind: "initial", state: "ready" },
      { id: "contact", frame: 1.5, kind: "contact", state: "touching" },
      { id: "release", frame: 3, kind: "release", state: "free" },
      { id: "return", frame: 4, kind: "return", state: "returned" },
    ],
  };
}
function failure(run: () => unknown) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(MechanismPackInvariantError);
    return (error as MechanismPackInvariantError).location;
  }
  throw Error("Expected located rejection");
}
const viewport = { width: 640, height: 360 };
describe("authored mechanism state timelines", () => {
  it("checks output frames and fractional event boundaries for all three candidate families", () => {
    for (const [instance, timeline] of [
      [createTapeHookPack(), authored()],
      [createCableTiePack(), authored("ratchet", "pawl.root.fixed")],
      [createClothespegPack(), authored("upper.return", "spring.upper.seated")],
    ] as const) {
      const result = compileMechanismPackTimeline(instance, timeline);
      expect(result).toMatchObject({
        checkedOutputFrames: 6,
        checkedEventFrames: 4,
        evidence: "pure-expected-state",
      });
      expect(Object.isFrozen(result.timeline.events)).toBe(true);
      const ordered = [0, 1.49, 1.5, 2, 3, 4, 5.99].map((frame) =>
        sampleMechanismPackTimeline(instance, result, frame, viewport),
      );
      expect(ordered.map((row) => row.state)).toEqual([
        "ready",
        "ready",
        "touching",
        "touching",
        "free",
        "returned",
        "returned",
      ]);
      expect(
        [...ordered]
          .reverse()
          .map((row) =>
            sampleMechanismPackTimeline(
              instance,
              result,
              row.frame.frame,
              viewport,
            ),
          ),
      ).toEqual([...ordered].reverse());
    }
  });
  it("rejects release before contact with rig, parts, relationship and first failing interval", () => {
    const timeline = authored();
    timeline.events[1] = {
      id: "early",
      frame: 1.5,
      kind: "release",
      state: "free",
    };
    expect(
      failure(() =>
        compileMechanismPackTimeline(createTapeHookPack(), timeline),
      ),
    ).toMatchObject({
      code: "mechanism-timeline-transition",
      frame: 1.5,
      rig: "slider",
      relationship: "hook.innerRange",
      parts: ["board", "hook"],
      interval: { startFrame: 1.5, endFrameExclusive: 3 },
      path: ["timeline", "events", 1],
    });
  });
  it("requires actual contact rather than treating a permitted travel range as contact", () => {
    const timeline = authored();
    const rule = { ...timeline.states[1]!.requirements[0]!, signedGap: [0, 0] };
    timeline.states[1] = { id: "touching", requirements: [rule] };
    const input = {
      ...timeline,
      rigControls: { slider: { type: "slider", value: 0.09 } },
    };
    expect(
      failure(() => compileMechanismPackTimeline(createTapeHookPack(), input)),
    ).toMatchObject({
      code: "mechanism-timeline-relationship",
      frame: 1.5,
      relationship: "hook.innerRange",
      interval: { startFrame: 1.5, endFrameExclusive: 2 },
    });
  });
  it("rejects malformed event inventories and requirement references at authored paths", () => {
    const instance = createTapeHookPack();
    for (const [change, path] of [
      [
        (v: ReturnType<typeof authored>) => {
          v.events[1]!.frame = 0;
        },
        ["timeline", "events", 1, "frame"],
      ],
      [
        (v: ReturnType<typeof authored>) => {
          v.events[3]!.frame = 6;
        },
        ["timeline", "events", 3, "frame"],
      ],
      [
        (v: ReturnType<typeof authored>) => {
          v.states[0]!.requirements[0]!.relationship = "unknown";
        },
        ["timeline", "states", 0, "requirements", 0, "relationship"],
      ],
      [
        (v: ReturnType<typeof authored>) => {
          v.states[0]!.requirements[0]!.rig = "unknown";
        },
        ["timeline", "states", 0, "requirements", 0, "rig"],
      ],
    ] as const) {
      const input = authored();
      change(input);
      expect(
        failure(() => compileMechanismPackTimeline(instance, input)).path,
      ).toEqual(path);
    }
  });
  it("preserves whole-interval ratchet prohibition and shared writer validation", () => {
    const input = {
      ...authored("ratchet", "pawl.tooth.seated"),
      rigControls: {
        ratchet: {
          type: "ratchet",
          position: { value: 0 },
          latchKeys: [
            { frame: 0, state: "engaged" },
            { frame: 3, state: "released" },
          ],
        },
      },
    };
    expect(() =>
      compileMechanismPackTimeline(createCableTiePack(), input),
    ).toThrow("no release closure");
    const peg = {
      ...authored("upper.return", "spring.upper.seated"),
      rigControls: {
        "upper.hinge": { type: "hinge", value: 0 },
        "upper.return": {
          type: "spring-return",
          states: [{ frame: 0, phase: "held", value: 0 }],
        },
      },
    };
    expect(() =>
      compileMechanismPackTimeline(createClothespegPack(), peg),
    ).toThrow("same scalar");
  });
  it("checks fractional seeks even when all discrete output/event samples pass", () => {
    const instance = createTapeHookPack();
    const input = {
      schemaVersion: "mechanism-pack-timeline-1",
      frameCount: 2,
      initialState: "contact",
      states: [
        {
          id: "contact",
          requirements: [
            {
              rig: "slider",
              relationship: "hook.innerRange",
              signedGap: [0, 0],
            },
          ],
        },
      ],
      transitions: [],
      events: [{ id: "start", frame: 0, kind: "initial", state: "contact" }],
      rigControls: {
        slider: {
          type: "slider",
          keys: [
            { frame: 0, value: 0 },
            { frame: 0.5, value: 0.09 },
            { frame: 1, value: 0 },
          ],
        },
      },
    };
    const compiled = compileMechanismPackTimeline(instance, input);
    expect(compiled.checkedOutputFrames).toBe(2);
    expect(
      failure(() =>
        sampleMechanismPackTimeline(instance, compiled, 0.5, viewport),
      ),
    ).toMatchObject({
      code: "mechanism-timeline-relationship",
      frame: 0.5,
      relationship: "hook.innerRange",
    });
  });
  it("rejects source/timeline revisions and invalid seeks", () => {
    const instance = createTapeHookPack(),
      compiled = compileMechanismPackTimeline(instance, authored());
    expect(
      failure(() =>
        sampleMechanismPackTimeline(
          instance,
          { ...compiled, timelineSha256: "changed" },
          2,
          viewport,
        ),
      ).code,
    ).toBe("mechanism-pack-revision");
    for (const frame of [-1, 6, NaN, Infinity])
      expect(
        failure(() =>
          sampleMechanismPackTimeline(instance, compiled, frame, viewport),
        ).code,
      ).toBe("mechanism-timeline-frame");
  });
});
