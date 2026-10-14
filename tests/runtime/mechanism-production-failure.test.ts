import { describe, expect, it } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { AnimationEngineError } from "@still-shift/scene-contract";
import { mechanismProductionFailureFinding } from "../../packages/animation-engine/src/mechanism/production-failure.ts";
import { inspectMechanismCueAuthoring } from "../../packages/animation-engine/src/mechanism/cue-authoring.ts";
import { runMechanismProductionQueue } from "../../packages/animation-engine/src/mechanism/production-queue.ts";
import { readMechanismProductionReports } from "../../packages/animation-engine/src/mechanism/production-report-io.ts";
import { compileMechanismPackTimeline } from "../../packages/animation-engine/src/mechanism/pack-timeline.ts";
import { MechanismPackInvariantError } from "../../packages/animation-engine/src/mechanism/pack-invariant.ts";
import { createTapeHookPack } from "../../packages/animation-engine/src/mechanism/tape-hook-pack.ts";
import {
  fixture,
  executor,
  product,
} from "../fixtures/mechanism-production-queue-support.ts";
import { narratedCycleFixture } from "../helpers/mechanism-narrated-cycle.ts";

function invalidTransition() {
  const { instance, document } = narratedCycleFixture("tape-hook", 96000);
  document.transitions.shift();
  return { instance, document };
}
describe("preserved production invariant findings", () => {
  it("retains a real cue transition location through its engine wrapper", () => {
    const { instance, document } = invalidTransition();
    let failure: unknown;
    try {
      inspectMechanismCueAuthoring(instance, document);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AnimationEngineError);
    expect(mechanismProductionFailureFinding(failure)).toMatchObject({
      code: "mechanism-timeline-transition",
      frame: 15,
      rig: "slider",
      parts: ["board", "hook"],
      relationship: "hook.innerRange",
      interval: { startFrame: 15, endFrameExclusive: 30 },
    });
  });
  it("retains an actual event-order failure without inventing a relationship or interval", () => {
    const timeline = {
      schemaVersion: "mechanism-pack-timeline-1",
      frameCount: 6,
      initialState: "ready",
      states: ["ready", "touching", "free"].map((id) => ({
        id,
        requirements: [{ rig: "slider", relationship: "hook.innerRange" }],
      })),
      transitions: [
        { from: "ready", to: "touching", event: "contact" },
        { from: "touching", to: "free", event: "release" },
      ],
      events: [
        { id: "begin", frame: 0, kind: "initial", state: "ready" },
        { id: "contact", frame: 1.5, kind: "contact", state: "touching" },
        { id: "release", frame: 1, kind: "release", state: "free" },
      ],
    };
    let failure: unknown;
    try {
      compileMechanismPackTimeline(createTapeHookPack(), timeline);
    } catch (error) {
      failure = error;
    }
    const finding = mechanismProductionFailureFinding(failure);
    expect(finding).toMatchObject({
      code: "mechanism-timeline-event",
      frame: 1,
      path: ["timeline", "events", 2, "frame"],
    });
    expect(finding).not.toHaveProperty("rig");
    expect(finding).not.toHaveProperty("interval");
  });
  it("keeps a real failed location in the durable journal, fresh report and restart without rerunning the healthy neighbor", async () => {
    const f = await fixture();
    let calls = 0;
    const worker = executor(async (item, context) => {
      calls++;
      if (item.id === "E01") {
        const { instance, document } = invalidTransition();
        inspectMechanismCueAuthoring(instance, document);
      }
      return product(item, context);
    });
    try {
      const state = await runMechanismProductionQueue(f.path, f.output, worker);
      expect(state.rows.map((r) => r.status)).toEqual(["failed", "passed"]);
      const finding = state.rows[0]!.attempts[0]!.finding;
      expect(finding).toMatchObject({
        code: "mechanism-timeline-transition",
        rig: "slider",
        interval: { startFrame: 15, endFrameExclusive: 30 },
      });
      const neighborPath = join(f.output, state.rows[1]!.product!.path);
      const neighbor = await readFile(neighborPath);
      const journal = JSON.parse(
        await readFile(join(f.output, "queue-state.json"), "utf8"),
      );
      expect(journal.rows[0].attempts[0].finding).toEqual(finding);
      const reports = await readMechanismProductionReports(
        f.path,
        f.output,
        worker,
      );
      expect(reports.episodes[0]!.report.attempts[0]!.finding).toEqual(finding);
      expect(
        (await runMechanismProductionQueue(f.path, f.output, worker)).rows[0]!
          .attempts[0]!.finding,
      ).toEqual(finding);
      expect(await readFile(neighborPath)).toEqual(neighbor);
      expect(calls).toBe(2);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
  it("rejects active or oversized locations and bounded cause cycles without executing getters", () => {
    let calls = 0;
    const error = new MechanismPackInvariantError("bad", {
      code: "bad",
      path: [],
      pack: createTapeHookPack().pack,
    });
    Object.defineProperty(error.location, "rig", {
      enumerable: true,
      get() {
        calls++;
        return "slider";
      },
    });
    expect(mechanismProductionFailureFinding(error)).toBeUndefined();
    expect(calls).toBe(0);
    const oversized = new MechanismPackInvariantError("oversized", {
      code: "bad",
      path: Array.from({ length: 64 }, () => "x".repeat(1024)),
      pack: createTapeHookPack().pack,
    });
    expect(mechanismProductionFailureFinding(oversized)).toBeUndefined();
    const cycle = new AnimationEngineError("SCENE_INVALID", "cycle");
    Object.defineProperty(cycle, "cause", { value: cycle });
    expect(mechanismProductionFailureFinding(cycle)).toBeUndefined();
    expect(
      mechanismProductionFailureFinding(new Error("ordinary")),
    ).toBeUndefined();
  });
});
