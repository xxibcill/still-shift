import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

import {
  ownProcessSignals,
  signalExitCode,
  signalRelayWindowMs,
  type OwnedSignal,
} from "../../tools/still-shift-cli/src/composition/process-signals.ts";

function harness() {
  const target = new EventEmitter();
  let clock = 0;
  const calls: [string, OwnedSignal][] = [];
  const scheduled: { run: () => void; delayMs: number }[] = [];
  const release = ownProcessSignals({
    cancel: (signal) => calls.push(["cancel", signal]),
    force: (signal) => calls.push(["force", signal]),
    target,
    now: () => clock,
    schedule: (run, delayMs) => scheduled.push({ run, delayMs }),
  });
  return {
    target,
    calls,
    release,
    scheduled,
    setClock: (time: number) => (clock = time),
    at: (time: number, signal: OwnedSignal) => {
      clock = time;
      target.emit(signal);
    },
  };
}

describe("comp lint process signals", () => {
  it("cancels once and ignores relayed repeats of the first signal", () => {
    const { calls, at } = harness();
    at(0, "SIGINT");
    at(2, "SIGINT");
    at(5, "SIGTERM");
    at(signalRelayWindowMs - 1, "SIGHUP");

    expect(calls).toEqual([["cancel", "SIGINT"]]);
  });

  it("forces a stop on a signal after the relay window", () => {
    const { calls, at } = harness();
    at(100, "SIGHUP");
    at(100 + signalRelayWindowMs, "SIGINT");

    expect(calls).toEqual([
      ["cancel", "SIGHUP"],
      ["force", "SIGINT"],
    ]);
  });

  it("owns SIGINT, SIGTERM and SIGHUP until released", () => {
    const { target, release } = harness();
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
      expect(target.listenerCount(signal)).toBe(1);

    release();

    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
      expect(target.listenerCount(signal)).toBe(0);
  });

  it("keeps ignoring relays after an early release until the window ends", () => {
    const { target, calls, release, scheduled, setClock, at } = harness();
    at(100, "SIGINT");
    setClock(400);
    release();

    expect(scheduled.map(({ delayMs }) => delayMs)).toEqual([
      signalRelayWindowMs - 300,
    ]);
    expect(target.listenerCount("SIGINT")).toBe(1);
    at(450, "SIGINT");
    at(100 + signalRelayWindowMs + 5, "SIGTERM");
    expect(calls).toEqual([["cancel", "SIGINT"]]);

    scheduled[0]!.run();
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
      expect(target.listenerCount(signal)).toBe(0);
  });

  it("releases at once when no signal arrived or the window has passed", () => {
    const quiet = harness();
    quiet.release();
    expect(quiet.scheduled).toEqual([]);
    expect(quiet.target.listenerCount("SIGINT")).toBe(0);

    const late = harness();
    late.at(0, "SIGHUP");
    late.setClock(signalRelayWindowMs);
    late.release();
    expect(late.scheduled).toEqual([]);
    expect(late.target.listenerCount("SIGHUP")).toBe(0);
  });

  it("exits a forced stop with 128 plus the signal number", () => {
    expect(signalExitCode("SIGHUP")).toBe(129);
    expect(signalExitCode("SIGINT")).toBe(130);
    expect(signalExitCode("SIGTERM")).toBe(143);
  });
});
