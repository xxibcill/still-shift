import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { imageSize } from "image-size";
import { z } from "zod";
import {
  CommerceAnimationResultSchema,
  CommerceBriefSchema,
  CommerceSceneSchema,
  COMMERCE_PROFILES,
} from "../packages/scene-contract/src/commerce.ts";
import {
  CommerceProofLedgerSchema,
  CommerceProofReviewSchema,
  type CommerceProofLedger,
} from "../packages/scene-contract/src/commerce-proof.ts";
import { buildCommerceScene } from "../packages/renderer-core/src/commerce-scene.ts";

const run = promisify(execFile);
const digest = async (path: string) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return `sha256:${hash.digest("hex")}`;
};
const artifact = async (path: string) => ({ path, sha256: await digest(path) });
const requireMatch = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const readJson = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as unknown;

const RenderManifestSchema = z
  .object({
    schemaVersion: z.literal("commerce-render-1"),
    sourcePath: z.string(),
    sourceChecksum: z.string(),
    scene: z.record(z.string(), z.unknown()),
    assetPaths: z.record(z.string(), z.string()),
  })
  .passthrough();
const ProbeSchema = z.object({
  streams: z
    .array(
      z.object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        r_frame_rate: z.string(),
        nb_read_frames: z.string().regex(/^\d+$/),
      }),
    )
    .min(1),
});

async function probeVideo(videoPath: string) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-count_frames",
    "-show_entries",
    "stream=width,height,r_frame_rate,nb_read_frames",
    "-of",
    "json",
    videoPath,
  ]);
  const stream = ProbeSchema.parse(JSON.parse(stdout)).streams[0]!;
  const [numerator, denominator] = stream.r_frame_rate.split("/").map(Number);
  requireMatch(
    Number.isFinite(numerator) &&
      Number.isFinite(denominator) &&
      denominator! > 0,
    "ffprobe returned an invalid frame rate",
  );
  return {
    width: stream.width,
    height: stream.height,
    fps: numerator! / denominator!,
    frameCount: Number(stream.nb_read_frames),
  };
}

export type CommerceProofInput = {
  kind: "fixture" | "real-product";
  briefPath: string;
  scenePath: string;
  resultPath: string;
  videoPath: string;
  reviewPath?: string;
};

export function commerceMeasurementStatus(
  review: z.infer<typeof CommerceProofReviewSchema> | null,
): "pending" | "recorded" {
  return review &&
    review.assetPreparationMinutes !== null &&
    review.repairMinutes !== null &&
    review.repairCount !== null &&
    review.defects !== null &&
    review.creativeReview !== null
    ? "recorded"
    : "pending";
}

/** Verifies one H03 export; operator measurements remain explicit external inputs. */
export async function createCommerceProofLedger(
  input: CommerceProofInput,
): Promise<CommerceProofLedger> {
  const briefPath = resolve(input.briefPath);
  const scenePath = resolve(input.scenePath);
  const resultPath = resolve(input.resultPath);
  const videoPath = resolve(input.videoPath);
  const manifestPath = `${videoPath}.scene.json`;
  requireMatch(
    resultPath === `${videoPath}.result.json`,
    "Result sidecar must accompany the supplied MP4",
  );
  const brief = CommerceBriefSchema.parse(await readJson(briefPath));
  const scene = CommerceSceneSchema.parse(await readJson(scenePath));
  const result = CommerceAnimationResultSchema.parse(
    await readJson(resultPath),
  );
  const manifest = RenderManifestSchema.parse(await readJson(manifestPath));
  const review = input.reviewPath
    ? CommerceProofReviewSchema.parse(await readJson(resolve(input.reviewPath)))
    : null;

  if (input.kind === "real-product")
    requireMatch(
      !/fictional|synthetic fixture|not a real product/i.test(
        `${brief.product.provenance} ${brief.copy.source}`,
      ),
      "A fictional fixture cannot be labeled real-product proof",
    );

  requireMatch(
    brief.selection.kind === "format" && brief.selection.id === "H03",
    "Proof ledger currently supports H03 only",
  );
  requireMatch(
    scene.metadata.selection.kind === "format" &&
      scene.metadata.selection.id === "H03" &&
      scene.recipe.preset === "H03",
    "Prepared scene is not H03",
  );
  requireMatch(
    isDeepStrictEqual(scene.metadata.selection, brief.selection) &&
      scene.metadata.profile === brief.profile &&
      scene.metadata.locale === brief.locale &&
      scene.metadata.productId === brief.product.id &&
      scene.metadata.productSource === brief.product.provenance &&
      scene.metadata.copySource === brief.copy.source &&
      isDeepStrictEqual(
        scene.metadata.claimSources,
        brief.copy.callouts.map((callout) => callout.source),
      ) &&
      scene.title === brief.title &&
      scene.provenance === brief.product.provenance &&
      scene.fps === brief.fps &&
      scene.frameCount === brief.frameCount,
    "Brief and prepared scene differ",
  );
  const profile = COMMERCE_PROFILES[brief.profile];
  requireMatch(
    scene.width === profile.width && scene.height === profile.height,
    "Prepared scene dimensions differ from profile",
  );
  for (const [id, expected] of [
    ["product-name", brief.product.name],
    ...brief.copy.headlines.map(
      (text, index) => [`headline-${index}`, text] as const,
    ),
    ["cta", brief.copy.cta],
  ] as [string, string][]) {
    const node = scene.nodes.find((candidate) => candidate.id === id);
    requireMatch(
      node?.type === "text" && node.text === expected,
      `Brief copy differs from scene node ${id}`,
    );
  }

  const productImagePath = resolve(dirname(briefPath), brief.product.imagePath);
  const productImage = await artifact(productImagePath);
  const productAsset = scene.assets.find(
    (candidate) => candidate.id === "product-image",
  );
  requireMatch(
    Boolean(productAsset),
    "Prepared scene lacks product-image asset",
  );
  requireMatch(
    productAsset!.sha256 === productImage.sha256,
    "Brief product image differs from prepared scene asset",
  );
  const productDimensions = imageSize(await readFile(productImagePath));
  requireMatch(
    productDimensions.width === productAsset!.width &&
      productDimensions.height === productAsset!.height,
    "Product image dimensions differ from prepared scene asset",
  );
  for (const dependency of [...scene.assets, ...scene.fonts]) {
    const path = resolve(dirname(scenePath), dependency.path);
    requireMatch(
      (await digest(path)) === dependency.sha256,
      `Prepared dependency checksum differs: ${dependency.id}`,
    );
    requireMatch(
      manifest.assetPaths[dependency.id] === path,
      `Render manifest dependency path differs: ${dependency.id}`,
    );
    if ("width" in dependency) {
      const size = imageSize(await readFile(path));
      requireMatch(
        size.width === dependency.width && size.height === dependency.height,
        `Prepared dependency dimensions differ: ${dependency.id}`,
      );
    }
  }

  if (scene.metadata.briefChecksum) {
    requireMatch(
      scene.metadata.briefChecksum === (await digest(briefPath)),
      "Prepared scene was built from a different brief",
    );
  } else {
    requireMatch(
      input.kind === "fixture",
      "Real-product proof requires a scene prepared with a bound brief checksum",
    );
    const backdrop = scene.assets.find(
      (candidate) => candidate.id === "backdrop-image",
    );
    const rebuilt = buildCommerceScene(brief, {
      product: productAsset!,
      font: scene.fonts[0]!,
      ...(backdrop ? { backdrop } : {}),
    });
    requireMatch(
      isDeepStrictEqual(scene, rebuilt),
      "Brief and prepared scene differ",
    );
  }

  const preparedScene = await artifact(scenePath);
  const renderManifest = await artifact(manifestPath);
  const video = await artifact(videoPath);
  requireMatch(
    resolve(manifest.sourcePath) === scenePath &&
      manifest.sourceChecksum === preparedScene.sha256 &&
      result.checksums.source === preparedScene.sha256 &&
      result.checksums.scene === renderManifest.sha256 &&
      result.checksums.output === video.sha256 &&
      resolve(result.outputPath) === videoPath &&
      resolve(result.sceneManifestPath) === manifestPath,
    "Render sidecar or manifest checksum/path differs from supplied artifacts",
  );
  const reportedChecksums = z
    .object({
      sourceChecksum: z.string(),
      sceneChecksum: z.string(),
      outputChecksum: z.string(),
    })
    .parse(result.metrics);
  requireMatch(
    reportedChecksums.sourceChecksum === preparedScene.sha256 &&
      reportedChecksums.sceneChecksum === renderManifest.sha256 &&
      reportedChecksums.outputChecksum === video.sha256,
    "Export metrics checksum differs from supplied artifacts",
  );
  for (const [key, value] of Object.entries(scene)) {
    requireMatch(
      isDeepStrictEqual(manifest.scene[key], value),
      `Render manifest scene differs at ${key}`,
    );
  }
  const durationMs = (scene.frameCount * 1000) / scene.fps;
  requireMatch(
    manifest.scene.durationMs === durationMs &&
      result.preset === "H03" &&
      result.fps === scene.fps &&
      result.frameCount === scene.frameCount &&
      result.durationMs === durationMs &&
      result.metrics.width === scene.width &&
      result.metrics.height === scene.height,
    "Result timing or dimensions differ from prepared scene",
  );
  const probe = await probeVideo(videoPath);
  requireMatch(
    probe.width === scene.width &&
      probe.height === scene.height &&
      probe.fps === scene.fps &&
      probe.frameCount === scene.frameCount,
    "Decoded video dimensions, frame rate or frame count differ from scene",
  );
  const videoSize = (await stat(videoPath)).size;
  const metrics = result.metrics as typeof result.metrics & {
    encodePathWallMs?: unknown;
    validationWallMs?: unknown;
    frameRenderAverageMs?: unknown;
    ffmpegCpuMs?: unknown;
    outputBytes?: unknown;
  };
  const machine = z
    .object({
      source: z.literal("commerce-result-1 sidecar"),
      exportWallMs: z.number().finite().nonnegative(),
      encodePathWallMs: z.number().finite().nonnegative(),
      validationWallMs: z.number().finite().nonnegative(),
      frameRenderAverageMs: z.number().finite().nonnegative(),
      ffmpegCpuMs: z.number().finite().nonnegative(),
      outputBytes: z.number().int().positive(),
    })
    .parse({
      source: "commerce-result-1 sidecar",
      exportWallMs: metrics.totalWallMs,
      encodePathWallMs: metrics.encodePathWallMs,
      validationWallMs: metrics.validationWallMs,
      frameRenderAverageMs: metrics.frameRenderAverageMs,
      ffmpegCpuMs: metrics.ffmpegCpuMs,
      outputBytes: metrics.outputBytes,
    });
  requireMatch(
    machine.outputBytes === videoSize,
    "Result output byte count differs from MP4",
  );
  if (input.kind === "real-product") {
    requireMatch(
      Boolean(review),
      "Real-product proof requires a review record",
    );
    requireMatch(
      Boolean(
        review?.productAuthorizationReference && review.copyApprovalReference,
      ),
      "Real-product proof requires product authorization and copy approval references",
    );
  } else requireMatch(!review, "Fixture proof must remain technical-only");

  const measurementStatus = commerceMeasurementStatus(review);

  return CommerceProofLedgerSchema.parse({
    schemaVersion: "commerce-proof-ledger-1",
    evidenceKind:
      input.kind === "fixture" ? "fictional-technical-fixture" : "real-product",
    technicalStatus: "verified",
    measurementStatus,
    releaseDecision: null,
    selection: { kind: "format", id: "H03" },
    productId: brief.product.id,
    profile: brief.profile,
    artifacts: {
      brief: await artifact(briefPath),
      preparedScene,
      productImage,
      reviewRecord: input.reviewPath
        ? await artifact(resolve(input.reviewPath))
        : null,
      renderManifest,
      resultSidecar: await artifact(resultPath),
      video,
    },
    encoded: {
      width: probe.width,
      height: probe.height,
      fps: scene.fps,
      frameCount: probe.frameCount,
      durationMs,
    },
    machine,
    operator: review
      ? {
          recordedBy: review.recordedBy,
          productAuthorizationReference: review.productAuthorizationReference,
          copyApprovalReference: review.copyApprovalReference,
          assetPreparationMinutes: review.assetPreparationMinutes,
          repairMinutes: review.repairMinutes,
          repairCount: review.repairCount,
          defects: review.defects,
          creativeReview: review.creativeReview,
          nextTechniqueDemand: review.nextTechniqueDemand,
        }
      : {
          recordedBy: null,
          productAuthorizationReference: null,
          copyApprovalReference: null,
          assetPreparationMinutes: null,
          repairMinutes: null,
          repairCount: null,
          defects: null,
          creativeReview: null,
          nextTechniqueDemand: null,
        },
  });
}

function parseArguments(args: string[]): CommerceProofInput & {
  outputPath: string;
} {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--"))
      throw new Error("Expected --name value argument pairs");
    const name = key.slice(2);
    if (
      ![
        "kind",
        "brief",
        "scene",
        "result",
        "video",
        "review",
        "output",
      ].includes(name) ||
      values.has(name)
    )
      throw new Error(`Unknown or repeated argument: ${key}`);
    values.set(name, value);
  }
  const required = (name: string) => {
    const value = values.get(name);
    if (!value) throw new Error(`Missing --${name}`);
    return value;
  };
  const kind = required("kind");
  if (kind !== "fixture" && kind !== "real-product")
    throw new Error("--kind must be fixture or real-product");
  return {
    kind,
    briefPath: required("brief"),
    scenePath: required("scene"),
    resultPath: required("result"),
    videoPath: required("video"),
    ...(values.has("review") ? { reviewPath: values.get("review")! } : {}),
    outputPath: required("output"),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const { outputPath, ...input } = parseArguments(process.argv.slice(2));
    const ledger = await createCommerceProofLedger(input);
    const target = resolve(outputPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(ledger, null, 2) + "\n", {
      flag: "wx",
    });
    process.stdout.write(`${target}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
