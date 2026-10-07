import type { RenderOp } from "./graph.ts";

export type RenderMember = { layer: string; type: string };
export function renderMembers(ops: readonly RenderOp[]): RenderMember[] {
  return ops.map((op) => ({
    layer: op.layer,
    type: op.kind === "draw" ? op.content.type : op.kind,
  }));
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

/** Measured synchronous submission wall-time spans; GPU completion is not inferred. */
export class CompositionRenderStatistics {
  private readonly rows = new Map<string, Row>();
  private readonly stack: { phase: string; childrenMs: number }[] = [];
  constructor(private readonly now = () => performance.now()) {}

  measure<T>(span: Span, work: () => T): T {
    const phase = span.phase ?? this.stack.at(-1)?.phase ?? "frame";
    const key = JSON.stringify([phase, span.stage, span.members]);
    let row = this.rows.get(key);
    if (!row) {
      if (this.rows.size >= 4096)
        throw Error(
          "Composition submission statistics exceed their entry bound",
        );
      row = {
        phase,
        stage: span.stage,
        members: span.members.map((member) => ({ ...member })),
        calls: 0,
        failures: 0,
        inclusiveMs: 0,
        exclusiveMs: 0,
      };
      this.rows.set(key, row);
    }
    const parent = this.stack.at(-1),
      active = { phase, childrenMs: 0 };
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
  }

  get statistics() {
    const rows = [...this.rows.values()].map((row) => ({
      ...row,
      members: row.members.map((member) => ({ ...member })),
    }));
    const types = new Map<
      string,
      { phase: string; type: string; calls: number; submissionWallMs: number }
    >();
    for (const row of rows) {
      const kinds = [...new Set(row.members.map((member) => member.type))];
      const type =
        kinds.length === 1
          ? kinds[0]!
          : kinds.length
            ? "mixed"
            : "graph-overhead";
      const key = JSON.stringify([row.phase, type]);
      const total = types.get(key) ?? {
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
  }
}
