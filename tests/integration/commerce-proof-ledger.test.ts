import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PreparedAnimationEngine } from "../../packages/animation-engine/src/prepared-animation-engine.ts";
import { prepareCommerceFile } from "../../packages/animation-engine/src/commerce-preparation.ts";
import { CommerceProofLedgerSchema } from "../../packages/scene-contract/src/commerce-proof.ts";
import { buildCommerceScene } from "../../packages/renderer-core/src/commerce-scene.ts";
import {
  commerceMeasurementStatus,
  createCommerceProofLedger,
} from "../../scripts/commerce-proof-ledger.ts";

const run = promisify(execFile);
const briefPath = resolve(
  "benchmarks/fixtures/ecommerce-motion/h03-landscape.brief.json",
);
const scenePath = resolve(
  "benchmarks/fixtures/ecommerce-motion/h03-landscape.json",
);

describe("H03 Commerce proof ledger", () => {
  let directory: string;
  let videoPath: string;
  let resultPath: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "commerce-proof-"));
    videoPath = join(directory, "h03-fixture.mp4");
    resultPath = `${videoPath}.result.json`;
    await new PreparedAnimationEngine().animate({
      scenePath,
      outputPath: videoPath,
    });
  }, 120_000);

  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("writes a technical-only CLI ledger with decoded dimensions and explicit unknowns", async () => {
    const outputPath = join(directory, "proof.json");
    await run("node", [
      "--import",
      "tsx",
      "scripts/commerce-proof-ledger.ts",
      "--kind",
      "fixture",
      "--brief",
      briefPath,
      "--scene",
      scenePath,
      "--result",
      resultPath,
      "--video",
      videoPath,
      "--output",
      outputPath,
    ]);
    const ledger = CommerceProofLedgerSchema.parse(
      JSON.parse(await readFile(outputPath, "utf8")),
    );
    expect(ledger.evidenceKind).toBe("fictional-technical-fixture");
    expect(ledger.technicalStatus).toBe("verified");
    expect(ledger.measurementStatus).toBe("pending");
    expect(ledger.releaseDecision).toBeNull();
    expect(ledger.encoded).toEqual({
      width: 1920,
      height: 1080,
      fps: 30,
      frameCount: 240,
      durationMs: 8000,
    });
    expect(ledger.machine.exportWallMs).toBeGreaterThan(0);
    expect(ledger.machine.outputBytes).toBeGreaterThan(0);
    expect(ledger.artifacts.reviewRecord).toBeNull();
    expect(ledger.operator).toEqual({
      recordedBy: null,
      productAuthorizationReference: null,
      copyApprovalReference: null,
      assetPreparationMinutes: null,
      repairMinutes: null,
      repairCount: null,
      defects: null,
      creativeReview: null,
      nextTechniqueDemand: null,
    });
  }, 120_000);

  it("rejects an MP4 changed after the result sidecar was written", async () => {
    const original = await readFile(videoPath);
    try {
      await writeFile(videoPath, Buffer.concat([original, Buffer.from([0])]));
      await expect(
        createCommerceProofLedger({
          kind: "fixture",
          briefPath,
          scenePath,
          resultPath,
          videoPath,
        }),
      ).rejects.toThrow("checksum/path differs");
    } finally {
      await writeFile(videoPath, original);
    }
  });

  it("rejects copy drift and refuses to relabel a fictional fixture as real", async () => {
    const changedBrief = JSON.parse(await readFile(briefPath, "utf8"));
    changedBrief.copy.headlines = ["Different words"];
    const alteredBriefPath = join(directory, "altered.brief.json");
    await writeFile(alteredBriefPath, JSON.stringify(changedBrief));
    await expect(
      createCommerceProofLedger({
        kind: "fixture",
        briefPath: alteredBriefPath,
        scenePath,
        resultPath,
        videoPath,
      }),
    ).rejects.toThrow("Brief copy differs");

    const reviewPath = join(directory, "review.json");
    await writeFile(
      reviewPath,
      JSON.stringify({
        schemaVersion: "commerce-proof-review-1",
        recordedBy: "Fixture operator",
        productAuthorizationReference: "fictional fixture source",
        copyApprovalReference: "fictional fixture copy",
        assetPreparationMinutes: null,
        repairMinutes: null,
        repairCount: null,
        defects: null,
        creativeReview: null,
        nextTechniqueDemand: null,
      }),
    );
    await expect(
      createCommerceProofLedger({
        kind: "real-product",
        briefPath,
        scenePath,
        resultPath,
        videoPath,
        reviewPath,
      }),
    ).rejects.toThrow("fictional fixture cannot be labeled real-product");
  });

  it("rejects a stale protected region or theme in a legacy fixture brief", async () => {
    for (const change of ["protected-region", "theme"] as const) {
      const changedBrief = JSON.parse(await readFile(briefPath, "utf8"));
      changedBrief.product.imagePath = resolve(
        dirname(briefPath),
        changedBrief.product.imagePath,
      );
      if (change === "protected-region")
        changedBrief.product.protectedRegion = [0.2, 0.2, 0.2, 0.2];
      else
        changedBrief.theme = {
          background: "#F2EDE4",
          ink: "#000000",
          accent: "#C75B39",
          muted: "#656D62",
        };
      const alteredBriefPath = join(directory, `${change}.brief.json`);
      await writeFile(alteredBriefPath, JSON.stringify(changedBrief));
      await expect(
        createCommerceProofLedger({
          kind: "fixture",
          briefPath: alteredBriefPath,
          scenePath,
          resultPath,
          videoPath,
        }),
      ).rejects.toThrow("Brief and prepared scene differ");
    }
  });

  it("binds newly prepared scenes to the exact brief bytes", async () => {
    const output = join(directory, "bound.scene.json");
    await prepareCommerceFile(briefPath, output);
    const prepared = JSON.parse(await readFile(output, "utf8"));
    const briefBytes = await readFile(briefPath);
    expect(prepared.metadata.briefChecksum).toBe(
      `sha256:${createHash("sha256").update(briefBytes).digest("hex")}`,
    );
    const preparedWithoutHash = structuredClone(prepared);
    delete preparedWithoutHash.metadata.briefChecksum;
    expect(
      buildCommerceScene(JSON.parse(briefBytes.toString("utf8")), {
        product: prepared.assets[0],
        font: prepared.fonts[0],
      }),
    ).toEqual(preparedWithoutHash);

    const boundVideo = join(directory, "bound.mp4");
    await new PreparedAnimationEngine().animate({
      scenePath: output,
      outputPath: boundVideo,
    });
    const proof = {
      kind: "fixture" as const,
      briefPath,
      scenePath: output,
      resultPath: `${boundVideo}.result.json`,
      videoPath: boundVideo,
    };
    await expect(createCommerceProofLedger(proof)).resolves.toMatchObject({
      technicalStatus: "verified",
    });

    const changedBrief = JSON.parse(briefBytes.toString("utf8"));
    changedBrief.product.imagePath = resolve(
      dirname(briefPath),
      changedBrief.product.imagePath,
    );
    changedBrief.product.protectedRegion = [0.2, 0.2, 0.2, 0.2];
    const alteredBriefPath = join(directory, "changed-bound.brief.json");
    await writeFile(alteredBriefPath, JSON.stringify(changedBrief));
    await expect(
      createCommerceProofLedger({ ...proof, briefPath: alteredBriefPath }),
    ).rejects.toThrow("Prepared scene was built from a different brief");
  }, 120_000);
});

it("records complete operator observations without a next-technique request", () => {
  const review = {
    schemaVersion: "commerce-proof-review-1" as const,
    recordedBy: "Operator",
    productAuthorizationReference: "product approval record",
    copyApprovalReference: "copy approval record",
    assetPreparationMinutes: 12,
    repairMinutes: 0,
    repairCount: 0,
    defects: [],
    creativeReview: {
      reviewer: "Creative reviewer",
      decision: "pass" as const,
      notes: "Product and copy inspected",
    },
    nextTechniqueDemand: null,
  };
  expect(commerceMeasurementStatus(review)).toBe("recorded");
  expect(commerceMeasurementStatus({ ...review, defects: null })).toBe(
    "pending",
  );
});
