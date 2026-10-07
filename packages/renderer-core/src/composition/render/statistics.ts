import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  resizeRenderMetadata,
  serializeRenderMetadata,
  type ManagedMetadataText,
} from "../../managed-metadata.ts";
import type { RenderOp } from "./graph.ts";

export type RenderMember = { layer: string; type: string };
const temporaryMembers = new WeakSet<RenderMember[]>();
export function renderMembers(ops: readonly RenderOp[]): RenderMember[] {
  const members = allocateRenderMetadata(32 + ops.length * 104, () =>
    ops.map((op) => ({
      layer: op.layer,
      type: op.kind === "draw" ? op.content.type : op.kind,
    })),
  );
  temporaryMembers.add(members);
  return members;
}
type Span = { stage: string; phase?: string; members: readonly RenderMember[] };
type Row = {
  stage: string;
  phase: string;
  members: RenderMember[];
  calls: number;
  failures: number;
  inclusiveMs: number;
  exclusiveMs: number;
};
type Entry = { row: Row; text: ManagedMetadataText };
type ActiveSpan = { phase: string; childrenMs: number };

/** Measured synchronous submission wall-time spans; GPU completion is not inferred. */
export class CompositionRenderStatistics {
  private readonly rows: Map<string, Entry>;
  private readonly stack: ActiveSpan[];
  private closed = false;
  constructor(private readonly now = () => performance.now()) {
    this.rows = allocateRenderMetadata(
      96,
      () => new Map<string, Entry>(),
      false,
      (rows) => {
        this.closed = true;
        for (const entry of rows.values()) {
          entry.text.release();
          releaseRenderMetadata(entry);
        }
        rows.clear();
      },
    );
    try {
      this.stack = allocateRenderMetadata(
        32,
        () => [] as ActiveSpan[],
        false,
        (stack) => {
          stack.length = 0;
        },
      );
    } catch (error) {
      releaseRenderMetadata(this.rows);
      throw error;
    }
  }

  measure<T>(span: Span, work: () => T): T {
    try {
      return this.measureSpan(span, work);
    } finally {
      const members = span.members as RenderMember[];
      if (temporaryMembers.delete(members)) releaseRenderMetadata(members);
    }
  }
  private measureSpan<T>(span: Span, work: () => T): T {
    if (this.closed)
      throw Error("Composition submission statistics are disposed");
    const phase = span.phase ?? this.stack.at(-1)?.phase ?? "frame";
    const values = allocateRenderMetadata(56, () => [
      phase,
      span.stage,
      span.members,
    ]);
    let text: ManagedMetadataText;
    try {
      text = serializeRenderMetadata(values);
    } finally {
      releaseRenderMetadata(values);
    }
    let entry = this.rows.get(text.value!);
    if (entry) text.release();
    else {
      try {
        if (this.rows.size >= 4096)
          throw Error(
            "Composition submission statistics exceed their entry bound",
          );
        resizeRenderMetadata(this.rows, 96 + (this.rows.size + 1) * 64);
        entry = allocateRenderMetadata(
          320 + span.members.length * 104,
          () => ({
            text,
            row: {
              phase,
              stage: span.stage,
              members: span.members.map((member) => ({ ...member })),
              calls: 0,
              failures: 0,
              inclusiveMs: 0,
              exclusiveMs: 0,
            },
          }),
          true,
        );
        text.retain();
        this.rows.set(text.value!, entry);
      } catch (error) {
        if (entry) releaseRenderMetadata(entry);
        text.release();
        try {
          resizeRenderMetadata(this.rows, 96 + this.rows.size * 64);
        } catch {
          /* Preserve the original quota/factory error after disposal. */
        }
        throw error;
      }
    }
    const row = entry.row;
    const parent = this.stack.at(-1);
    resizeRenderMetadata(this.stack, 32 + (this.stack.length + 1) * 104);
    const active = { phase, childrenMs: 0 };
    let failed = false;
    try {
      const start = this.now();
      this.stack.push(active);
      row.calls++;
      try {
        return work();
      } catch (error) {
        row.failures++;
        throw error;
      } finally {
        const elapsed = Math.max(0, this.now() - start);
        this.stack.pop();
        row.inclusiveMs += elapsed;
        row.exclusiveMs += Math.max(0, elapsed - active.childrenMs);
        if (parent) parent.childrenMs += elapsed;
      }
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      if (!failed)
        resizeRenderMetadata(this.stack, 32 + this.stack.length * 104);
      else {
        try {
          resizeRenderMetadata(this.stack, 32 + this.stack.length * 104);
        } catch {
          /* Preserve the original submission error after disposal. */
        }
      }
    }
  }

  get statistics() {
    if (this.closed)
      throw Error("Composition submission statistics are disposed");
    let members = 0;
    for (const { row } of this.rows.values()) members += row.members.length;
    // 512 base; per-row copies/type totals/Map slots/key arrays/kinds Set; per-member
    // copied record+pointer and both kinds-array pointers+worst-case Set entry.
    const bytes = 512 + this.rows.size * 768 + members * 160;
    return allocateRenderMetadata(
      bytes,
      () => this.snapshot(),
      false,
      (value) => {
        value.spans.length = value.byLayerType.length = 0;
      },
    );
  }
  private snapshot() {
    const rows = [...this.rows.values()].map(({ row }) => ({
      ...row,
      members: row.members.map((member) => ({ ...member })),
    }));
    const types = new Map<
      string,
      { phase: string; type: string; calls: number; submissionWallMs: number }
    >();
    const keys: ManagedMetadataText[] = [];
    try {
      for (const row of rows) {
        const kinds = [...new Set(row.members.map((member) => member.type))];
        const type =
          kinds.length === 1
            ? kinds[0]!
            : kinds.length
              ? "mixed"
              : "graph-overhead";
        const text = serializeRenderMetadata([row.phase, type]);
        const key = text.value!;
        const previous = types.get(key);
        if (previous) text.release();
        else keys.push(text);
        const total = previous ?? {
          phase: row.phase,
          type,
          calls: 0,
          submissionWallMs: 0,
        };
        total.calls += row.calls;
        total.submissionWallMs += row.exclusiveMs;
        types.set(key, total);
      }
      return {
        version: "composition-submission-statistics-1" as const,
        clock: "performance.now" as const,
        scope: "synchronous-submission-wall-time" as const,
        inclusiveMs: rows.reduce((sum, row) => sum + row.inclusiveMs, 0),
        exclusiveMs: rows.reduce((sum, row) => sum + row.exclusiveMs, 0),
        byLayerType: [...types.values()],
        spans: rows,
      };
    } finally {
      for (const text of keys) text.release();
    }
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    // Clear also in an inactive preview, where the admission helper has no lease.
    for (const entry of this.rows.values()) {
      entry.text.release();
      releaseRenderMetadata(entry);
    }
    this.rows.clear();
    this.stack.length = 0;
    releaseRenderMetadata(this.rows);
    releaseRenderMetadata(this.stack);
  }
}
