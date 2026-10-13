import { describe, expect, it } from "vitest";
import {
  CompositionNodeMemory,
  CompositionNodeCapacityError,
  isCompositionNodeCapacityError,
} from "@still-shift/execution-runtime/export";
describe("typed composition Node capacity failures", () => {
  it("rejects before reservation and preserves foreign leases while a child recovers within the same allowance", () => {
    const parent = new CompositionNodeMemory(),
      foreign = parent.reserve(512),
      child = new CompositionNodeMemory(parent),
      pressure = parent.reserve(parent.availableBytes - 256);
    const before = parent.statistics.current.metadata;
    try {
      expect(() => child.reserve(1024)).toThrow(CompositionNodeCapacityError);
      expect(parent.statistics.current.metadata).toBe(before);
      try {
        child.reserve(1024);
      } catch (error) {
        expect(error).toMatchObject({
          code: "composition-node-capacity",
          requestedBytes: 1024,
          availableBytes: 256,
        });
      }
      pressure.release();
      child.reserve(1024);
      child.dispose();
      expect(foreign.active).toBe(true);
      expect(parent.statistics.current.metadata).toBe(512);
    } finally {
      child.dispose();
      parent.dispose();
    }
    expect(parent.statistics.reservations).toBe(0);
  });
  it("does not classify invalid requests or execute error-code getters as capacity failures", () => {
    const owner = new CompositionNodeMemory();
    let calls = 0;
    const error = new Error("foreign");
    Object.defineProperty(error, "code", {
      get() {
        calls++;
        return "composition-node-capacity";
      },
    });
    expect(isCompositionNodeCapacityError(error)).toBe(false);
    expect(calls).toBe(0);
    try {
      owner.reserve(-1);
    } catch (error) {
      expect(isCompositionNodeCapacityError(error)).toBe(false);
    } finally {
      owner.dispose();
    }
    expect(
      isCompositionNodeCapacityError(new CompositionNodeCapacityError(2, 1)),
    ).toBe(true);
  });
});
