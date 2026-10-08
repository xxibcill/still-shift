import { expect, it } from "vitest";
import {
  ProgramSnapshots,
  type SnapshotBytes,
} from "../../tools/still-shift-cli/src/composition/preview-snapshots.ts";
const captured = (revision: number): SnapshotBytes => ({
  snapshot: {
    revision,
    source: "json",
    input: "source.json",
    diagnostics: [],
    assets: {},
    composition: {
      schemaVersion: "composition-1",
      id: "snapshots",
      width: 64,
      height: 64,
      fps: 24,
      frameCount: 8,
      assets: [],
      layers: [],
    },
  },
  bytes: new Map([
    ["art", { bytes: Buffer.from(`asset-${revision}`), type: "image/svg+xml" }],
  ]),
});
it("keeps a live draft's immutable bytes independently of recent revision eviction", () => {
  const snapshots = new ProgramSnapshots(),
    first = captured(1),
    owner = {};
  snapshots.add(first);
  const lease = snapshots.retain(1, owner);
  for (let revision = 2; revision <= 8; revision++)
    snapshots.add(captured(revision));
  expect(snapshots.get(1)).toBeUndefined();
  expect(snapshots.get(6)).toBeUndefined();
  expect(snapshots.get(7)).toBeDefined();
  expect(snapshots.get(8)).toBeDefined();
  expect(snapshots.get(1, lease)).toBe(first);
  expect(snapshots.get(1, lease)!.bytes.get("art")!.bytes.toString()).toBe(
    "asset-1",
  );
  expect(snapshots.get(8, lease)).toBeUndefined();
  expect(snapshots.get(1, "missing")).toBeUndefined();
});
it("allows only the owning connection to release a retained draft", () => {
  const snapshots = new ProgramSnapshots(),
    owner = {},
    other = {};
  snapshots.add(captured(1));
  const lease = snapshots.retain(1, owner);
  snapshots.release(lease, other);
  expect(snapshots.get(1, lease)).toBeDefined();
  snapshots.release(lease, owner);
  expect(snapshots.get(1, lease)).toBeUndefined();
  expect(snapshots.get(1)).toBeDefined();
});
it("retires every draft of a disconnected owner while preserving other connections", () => {
  const snapshots = new ProgramSnapshots(),
    owner = {},
    other = {};
  snapshots.add(captured(1));
  const first = snapshots.retain(1, owner),
    second = snapshots.retain(1, owner),
    shared = snapshots.retain(1, other);
  snapshots.releaseOwner(owner);
  expect(snapshots.get(1, first)).toBeUndefined();
  expect(snapshots.get(1, second)).toBeUndefined();
  expect(snapshots.get(1, shared)).toBeDefined();
});
it("bounds retained drafts, recovers released capacity and clears server-owned resources", () => {
  const snapshots = new ProgramSnapshots(),
    owner = {};
  snapshots.add(captured(1));
  expect(() => snapshots.retain(99, owner)).toThrow(
    expect.objectContaining({ code: "comp-edit-revision", status: 409 }),
  );
  const leases = Array.from({ length: 64 }, () => snapshots.retain(1, owner));
  expect(() => snapshots.retain(1, owner)).toThrow(
    expect.objectContaining({ code: "comp-edit-limit", status: 409 }),
  );
  snapshots.release(leases[0]!, owner);
  const replacement = snapshots.retain(1, owner);
  expect(snapshots.get(1, replacement)).toBeDefined();
  snapshots.clear();
  expect(snapshots.get(1)).toBeUndefined();
  expect(snapshots.get(1, replacement)).toBeUndefined();
});
