import assert from "node:assert/strict";

/** Optional matrix diagnostics retain every pixel/timing failure and a failing exit code. */
export class CompositionAcceptance {
  readonly skipExports = process.argv.includes("--skip-exports");
  private readonly keepGoing = process.argv.includes("--keep-going");
  private readonly failures: string[] = [];

  constructor() {
    if (this.skipExports)
      console.log(
        "Diagnostic matrix: exports skipped; pixel and timing gates remain enforced.",
      );
  }

  check(id: string, report: { failures: readonly unknown[]; ratio: number }) {
    const timing = `${id} render + readback ratio ${report.ratio} exceeds 1.25`;
    if (!this.keepGoing) {
      assert.deepEqual(report.failures, [], `${id} pixel parity`);
      assert.ok(report.ratio <= 1.25, timing);
      return;
    }
    if (report.failures.length) this.failures.push(`${id} pixel parity`);
    if (!(report.ratio <= 1.25)) this.failures.push(timing);
  }

  finish() {
    assert.deepEqual(this.failures, [], "Composition acceptance failures");
  }
}
