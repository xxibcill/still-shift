import { constants } from "node:os";

export const ownedSignals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
export type OwnedSignal = (typeof ownedSignals)[number];

/**
 * Repeats this soon after the first signal are relays of the same request: a
 * terminal signals the whole process group and tsx (or pnpm) forwards it again
 * within milliseconds. A signal after this window is the user asking again.
 */
export const signalRelayWindowMs = 1_000;

type SignalTarget = {
  on(event: OwnedSignal, listener: () => void): unknown;
  off(event: OwnedSignal, listener: () => void): unknown;
};

/**
 * Own SIGINT, SIGTERM and SIGHUP while a command cleans up after itself. The
 * first signal calls `cancel`; repeats inside the relay window are ignored; a
 * later one calls `force`, so a stalled cleanup can still be interrupted from
 * the keyboard. Listeners stay registered until the returned release runs,
 * because tsx's relay exits the process when no listener remains.
 */
export function ownProcessSignals(options: {
  cancel: (signal: OwnedSignal) => void;
  force: (signal: OwnedSignal) => void;
  target?: SignalTarget;
  now?: () => number;
  relayWindowMs?: number;
}): () => void {
  const target = options.target ?? process,
    now = options.now ?? (() => performance.now()),
    relayWindowMs = options.relayWindowMs ?? signalRelayWindowMs;
  let first: number | undefined;
  const listeners = ownedSignals.map((signal) => {
    const listener = () => {
      if (first === undefined) {
        first = now();
        options.cancel(signal);
      } else if (now() - first >= relayWindowMs) options.force(signal);
    };
    target.on(signal, listener);
    return [signal, listener] as const;
  });
  return () => {
    for (const [signal, listener] of listeners) target.off(signal, listener);
  };
}

/** Conventional exit status for a process ended by `signal`: 128 + its number. */
export function signalExitCode(signal: OwnedSignal): number {
  return 128 + constants.signals[signal];
}
