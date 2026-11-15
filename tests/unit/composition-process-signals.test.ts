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
  const release = ownProcessSignals({
    cancel: (signal) => calls.push(["cancel", signal]),
    force: (signal) => calls.push(["force", signal]),
    target,
    now: () => clock,
  });
  return {
    target,
    calls,
    release,
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

  it("exits a forced stop with 128 plus the signal number", () => {
    expect(signalExitCode("SIGHUP")).toBe(129);
    expect(signalExitCode("SIGINT")).toBe(130);
    expect(signalExitCode("SIGTERM")).toBe(143);
  });
});
