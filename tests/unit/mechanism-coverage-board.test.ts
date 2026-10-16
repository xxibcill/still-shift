import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  CoverageBoardSchema,
  coverageSelectionHash,
  inspectCoverageBoard,
  type CoverageBoard,
} from "../../scripts/mechanism/coverage-board.ts";

const baseline = CoverageBoardSchema.parse(
  JSON.parse(
    await readFile(
      new URL(
        "../../docs/mechanism-topic-family-coverage.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);
function edit(change: (board: CoverageBoard) => void, refreeze = false) {
  const board = structuredClone(baseline);
  change(board);
  if (refreeze) board.selection.sha256 = coverageSelectionHash(board);
  return board;
}

describe("frozen mechanism candidate coverage board", () => {
  it("reports routing and actual unsupported coverage separately without mutating the board", () => {
    const before = JSON.stringify(baseline);
    expect(inspectCoverageBoard(baseline)).toMatchObject({
      proposedDistinctEpisodes: 10,
      selectedDistinctEpisodes: 10,
      supportedDistinctEpisodes: 0,
      coverage: 0,
      candidateRouting: {
        "existing-pack-rig": 5,
        "new-asset-existing-rig": 3,
        "new-behavior": 2,
      },
      newAssetEpisodes: { count: 5, ids: ["E02", "E05", "E06", "E09", "E10"] },
      newBehaviorEpisodes: { count: 2, ids: ["E06", "E10"] },
      admittedNewAssets: 0,
      admittedNewRigTypes: 0,
    });
    expect(JSON.stringify(baseline)).toBe(before);
  });
  it("reports an empty selected denominator as unavailable", () => {
    const board = edit((value) => {
      value.selection.selectedEpisodeIds = [];
    }, true);
    expect(inspectCoverageBoard(board)).toMatchObject({
      selectedDistinctEpisodes: 0,
      coverage: null,
    });
  });
  it("rejects duplicate IDs, selection IDs, questions, answers and explanation keys even after explicit refreezing", () => {
    const changes: ((board: CoverageBoard) => void)[] = [
      (board) => {
        board.episodes[1]!.id = "E01";
        board.selection.selectedEpisodeIds[1] = "E01";
      },
      (board) => {
        board.selection.selectedEpisodeIds[1] = "E01";
      },
      (board) => {
        board.episodes[1]!.question = `  ${board.episodes[0]!.question.toUpperCase()}  `;
      },
      (board) => {
        board.episodes[1]!.answer = board.episodes[0]!.answer;
      },
      (board) => {
        board.episodes[1]!.explanationKey = board.episodes[0]!.explanationKey;
      },
    ];
    for (const change of changes)
      expect(() => inspectCoverageBoard(edit(change, true))).toThrow(
        /Duplicate/,
      );
  });
  it("detects undisclosed changes to selected content, criteria, sources and cohort membership", () => {
    const changes: ((board: CoverageBoard) => void)[] = [
      (board) => {
        board.selection.selectedEpisodeIds.pop();
      },
      (board) => {
        board.episodes[0]!.answer += " changed";
      },
      (board) => {
        board.supportCriteria[0] += " changed";
      },
      (board) => {
        board.selectionCriteria[0] += " changed";
      },
      (board) => {
        board.sources[0]!.claim += " changed";
      },
    ];
    for (const change of changes)
      expect(() => inspectCoverageBoard(edit(change))).toThrow(
        /Frozen selection changed/,
      );
  });
  it("rejects stale pack identities, unknown reused rigs and unrelated overlap/source IDs", () => {
    const changes: ((board: CoverageBoard) => void)[] = [
      (board) => {
        board.episodes[0]!.requiredPack.base.sha256 = `sha256:${"0".repeat(64)}`;
      },
      (board) => {
        board.episodes[0]!.reusedRigIds = ["missing-rig"];
      },
      (board) => {
        board.episodes[0]!.overlap.relatedEpisodes = ["missing-episode"];
      },
      (board) => {
        board.episodes[0]!.factualVariant.sources = ["missing-source"];
      },
    ];
    for (const change of changes)
      expect(() => inspectCoverageBoard(edit(change, true))).toThrow();
  });
  it("requires disclosed asset and behavior work for each non-existing route", () => {
    const changes: ((board: CoverageBoard) => void)[] = [
      (board) => {
        board.episodes[1]!.assetWork = [];
      },
      (board) => {
        board.episodes[1]!.requiredPack.plannedAssetId = null;
      },
      (board) => {
        board.episodes[5]!.behaviorWork = [];
      },
      (board) => {
        board.episodes[5]!.plannedBehaviorId = null;
      },
      (board) => {
        board.episodes[0]!.assetWork = ["undisclosed asset"];
      },
    ];
    for (const change of changes)
      expect(() => inspectCoverageBoard(edit(change, true))).toThrow();
  });
  it("cannot inflate support through a claimed validated row or caller-provided count", () => {
    const rowClaim = structuredClone(baseline) as unknown as {
      episodes: { support: { state: string } }[];
    };
    rowClaim.episodes[0]!.support.state = "validated";
    expect(() => inspectCoverageBoard(rowClaim)).toThrow();
    expect(() =>
      inspectCoverageBoard({ ...baseline, supportedDistinctEpisodes: 10 }),
    ).toThrow();
  });
});
