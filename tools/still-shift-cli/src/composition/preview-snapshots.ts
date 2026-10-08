import { randomUUID } from "node:crypto";
import type { ProgramSnapshot } from "./preview.ts";
import { CompositionSaveError } from "./save.ts";

export type SnapshotBytes<Asset = { bytes: Buffer; type: string }> = {
  snapshot: ProgramSnapshot;
  bytes: Map<string, Asset>;
};
/** Recent revisions are bounded independently of resources owned by live drafts. */
export class ProgramSnapshots<
  Captured extends SnapshotBytes<unknown> = SnapshotBytes,
> {
  private recent = new Map<number, Captured>();
  private retained = new Map<string, { captured: Captured; owner: object }>();
  add(captured: Captured) {
    this.recent.set(captured.snapshot.revision, captured);
    while (this.recent.size > 2)
      this.recent.delete(this.recent.keys().next().value!);
  }
  get(revision: number, lease?: string) {
    if (lease === undefined) return this.recent.get(revision);
    const captured = this.retained.get(lease)?.captured;
    return captured?.snapshot.revision === revision ? captured : undefined;
  }
  retain(revision: number, owner: object) {
    const captured = this.recent.get(revision);
    if (!captured)
      throw new CompositionSaveError(
        409,
        "comp-edit-revision",
        "Source asset revision expired; reload before retaining it",
      );
    if (this.retained.size >= 64)
      throw new CompositionSaveError(
        409,
        "comp-edit-limit",
        "The preview already has 64 retained drafts; close an unused preview before loading another",
      );
    const lease = randomUUID();
    this.retained.set(lease, { captured, owner });
    return lease;
  }
  release(lease: string, owner: object) {
    if (this.retained.get(lease)?.owner === owner) this.retained.delete(lease);
  }
  releaseOwner(owner: object) {
    for (const [lease, retained] of this.retained)
      if (retained.owner === owner) this.retained.delete(lease);
  }
  clear() {
    this.recent.clear();
    this.retained.clear();
  }
}
