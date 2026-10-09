import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createServer, type ViteDevServer } from "vite";
import type { Browser, Page } from "playwright";
import {
  AnimationEngineError,
  CompositionSequenceManifestSchema,
  MechanismFrameResultSchema,
  MechanismSceneSchema,
  MechanismSidecarSchema,
  type MechanismScene,
  type MechanismSidecar,
} from "@still-shift/scene-contract";
import {
  canonicalMechanismJson,
  type MechanismFrameResult,
} from "@still-shift/renderer-core";
import { acquireArtifactLock } from "@still-shift/execution-runtime/locks";
import { publishArtifacts } from "@still-shift/execution-runtime/publication";
import { defaultBrowserProjectRoot } from "@still-shift/execution-runtime/browser";
import {
  assertPinnedRenderEnvironment,
  launchRenderBrowser,
  probeRenderEnvironment,
  RENDER_BROWSER_PROFILE,
  type RenderEnvironment,
} from "@still-shift/execution-runtime/render-browser";
import {
  inspectCompositionPng,
  tagCompositionSrgbPng,
} from "../composition-media-color.ts";
import { MECHANISM_BRIDGE_RENDERER_VERSION } from "./browser.ts";

export const MECHANISM_CAPTURE_VERSION = "mechanism-plate-capture-1";
export const MECHANISM_CAPTURE_LIMITS = {
  frames: 4096,
  pixels: 8_388_608,
  fontBytes: 8_388_608,
} as const;
export const MECHANISM_PROOF_PROTECTION = {
  policyVersion: "visible-proof-anchor-square-1",
  scope: "visible-proof-anchor-points",
  radiusPixels: 24,
} as const;
const browserModule = fileURLToPath(new URL("./browser.ts", import.meta.url));
const RECEIPT = "capture.receipt.json";
const SIDECAR = "anchors.sidecar.json";
const MANIFEST = "sequence.manifest.json";
const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const fileSchema = z
  .object({
    path: z
      .string()
      .regex(
        /^(?:\d{6}\.png|anchors\.sidecar\.json|sequence\.manifest\.json)$/,
      ),
    sha256: hashSchema,
    bytes: z.number().int().positive(),
  })
  .strict();
const statsSchema = z
  .object({
    new3dRenders: z.number().int().min(0),
    cacheHits: z.number().int().min(0),
    wallSeconds: z.number().finite().min(0),
  })
  .strict();
const receiptSchema = z
  .object({
    schemaVersion: z.literal(MECHANISM_CAPTURE_VERSION),
    status: z.literal("complete"),
    requestHash: hashSchema,
    identity: z.record(z.string(), z.unknown()),
    plates: z
      .array(
        fileSchema.extend({
          frame: z.number().int().min(0),
          sourceFrame: z.number().int().min(0),
        }),
      )
      .min(1)
      .max(MECHANISM_CAPTURE_LIMITS.frames),
    sidecar: fileSchema.extend({ path: z.literal(SIDECAR) }),
    manifest: fileSchema.extend({ path: z.literal(MANIFEST) }),
    stats: statsSchema,
  })
  .strict();
type Receipt = z.infer<typeof receiptSchema>;
type CapturedFrame = MechanismFrameResult & {
  anchors: Record<
    string,
    MechanismFrameResult["anchors"][string] & {
      visibility: string;
      projectionErrorPixels: number;
    }
  >;
  renderer: { calls: number; triangles: number; points: number; lines: number };
};
type CaptureWindow = Window & {
  __mechanismPlateFactory?: (
    scene: MechanismScene,
    options: {
      width: number;
      height: number;
      font: { bytesBase64: string; weight: string; family: string };
    },
  ) => Promise<NonNullable<CaptureWindow["__mechanismPlateRenderer"]>>;
  __mechanismPlateRenderer?: {
    render(frame: MechanismFrameResult): CapturedFrame;
    png(): string;
    dispose(): void;
  };
};
export type MechanismCaptureOptions = {
  scene: MechanismScene;
  width: number;
  height: number;
  frames: readonly MechanismFrameResult[];
  outputDirectory: string;
  font: { path: string; sha256: string; weight: string; family: string };
  fps?: number;
  shotId?: string;
  signal?: AbortSignal;
  cacheDirectory?: string;
};
export type MechanismCaptureResult = {
  schemaVersion: typeof MECHANISM_CAPTURE_VERSION;
  requestHash: string;
  outputDirectory: string;
  patternPath: string;
  firstFrame: 0;
  sequenceManifestPath: string;
  sequenceManifestSha256: string;
  sidecarPath: string;
  sidecarSha256: string;
  receiptPath: string;
  attemptDirectory: string;
  cacheEntryDirectory?: string;
  cacheHits: number;
  new3dRenders: number;
  environment: RenderEnvironment;
  frames: Receipt["plates"];
  proofProtection: typeof MECHANISM_PROOF_PROTECTION;
};
const optionsSchema = z
  .object({
    scene: MechanismSceneSchema,
    width: z.number().int().min(16).max(4096),
    height: z.number().int().min(16).max(4096),
    frames: z
      .array(MechanismFrameResultSchema)
      .min(1)
      .max(MECHANISM_CAPTURE_LIMITS.frames),
    outputDirectory: z.string().min(1).max(4096),
    cacheDirectory: z.string().min(1).max(4096).optional(),
    font: z
      .object({
        path: z.string().min(1).max(4096),
        sha256: z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/),
        weight: z.string().regex(/^(?:normal|bold|[1-9]00)$/),
        family: z.string().min(1).max(128),
      })
      .strict(),
    fps: z.number().int().min(1).max(60).default(30),
    shotId: z
      .string()
      .regex(/^[A-Za-z][\w.-]*$/)
      .max(128)
      .optional(),
    signal: z
      .custom<AbortSignal>(
        (value) => value === undefined || value instanceof AbortSignal,
      )
      .optional(),
  })
  .strict()
  .refine(
    (options) =>
      options.width * options.height <= MECHANISM_CAPTURE_LIMITS.pixels,
    { message: "Capture exceeds the pixel budget", path: ["width"] },
  );
type CaptureInput = z.infer<typeof optionsSchema>;
type CaptureContext = {
  stage: string;
  path: string;
  attemptDirectory?: string;
};

/** JSON content identity is independent of object key order and local source paths. */
export function canonicalMechanismHash(value: unknown): string {
  return digest(Buffer.from(canonicalMechanismJson(value)));
}
function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/** Immutable clean plates; projected overlays remain above this Node/browser boundary. */
export async function captureMechanismPlates(
  options: MechanismCaptureOptions,
): Promise<MechanismCaptureResult> {
  const context: CaptureContext = {
    stage: "mechanism-capture-validate",
    path: "capture",
  };
  let server: ViteDevServer | undefined;
  let browser: Browser | undefined;
  let page: Page | undefined;
  let releaseOutput: (() => Promise<void>) | undefined;
  let releaseCache: (() => Promise<void>) | undefined;
  let abortBrowser: (() => void) | undefined;
  const started = performance.now();
  try {
    const input = optionsSchema.parse(options);
    input.frames.forEach((frame, index) =>
      validateFrameReferences(input.scene, frame, index),
    );
    context.path = "scene.geometrySha256";
    const geometryHash = canonicalMechanismHash(input.scene.geometry);
    if (geometryHash !== input.scene.geometrySha256)
      throw new Error(
        "Scene geometry hash does not match the parsed indexed catalog",
      );
    const output = resolve(input.outputDirectory);
    await mkdir(dirname(output), { recursive: true });
    context.attemptDirectory = await mkdtemp(
      join(dirname(output), `.${basename(output)}.capture-`),
    );
    checkCancelled(input.signal);
    context.path = input.font.path;
    const font = await pinnedFont(input.font);
    context.stage = "mechanism-capture-output";
    context.path = output;
    releaseOutput = await acquireArtifactLock(
      join(dirname(output), `.${basename(output)}.mechanism.lock`),
      output,
    );
    await mkdir(output, { recursive: true });
    const entries = await readdir(output);
    if (entries.length && !entries.includes(RECEIPT)) throw conflict(output);
    context.stage = "mechanism-capture-browser";
    server = await captureServer(context.attemptDirectory);
    await server.listen();
    checkCancelled(input.signal);
    const baseUrl = server.resolvedUrls?.local[0];
    if (!baseUrl)
      throw new Error("Mechanism capture server has no loopback URL");
    browser = await launchRenderBrowser();
    abortBrowser = () => {
      void browser?.close().catch(() => undefined);
    };
    input.signal?.addEventListener("abort", abortBrowser, { once: true });
    page = await browser.newPage({
      viewport: { width: input.width, height: input.height },
      deviceScaleFactor: 1,
    });
    await page.goto(baseUrl);
    const environment = await probeRenderEnvironment(page);
    assertPinnedRenderEnvironment(environment);
    const identity = await captureIdentity(
      input,
      font.sha256,
      geometryHash,
      environment,
    );
    const requestHash = canonicalMechanismHash(identity);
    checkCancelled(input.signal);
    context.stage = "mechanism-capture-cache";
    if (entries.includes(RECEIPT)) {
      const previous = await validateBundle(
        output,
        requestHash,
        input,
        identity,
      );
      if (!previous) throw conflict(output);
      return captureResult(
        previous,
        output,
        context.attemptDirectory,
        environment,
        input.frames.length,
        0,
      );
    }
    const cache = resolve(
      input.cacheDirectory ?? join(dirname(output), ".mechanism-plate-cache"),
    );
    await mkdir(cache, { recursive: true });
    releaseCache = await acquireArtifactLock(
      join(cache, `.${requestHash.slice(7)}.lock`),
      cache,
    );
    const cacheRoot = join(cache, requestHash.slice(7));
    await mkdir(cacheRoot, { recursive: true });
    const cached = await findCachedBundle(
      cacheRoot,
      requestHash,
      input,
      identity,
    );
    if (cached) {
      const receipt = await copyBundle(
        cached.directory,
        context.attemptDirectory,
        cached.receipt,
        {
          new3dRenders: 0,
          cacheHits: input.frames.length,
          wallSeconds: elapsed(started),
        },
      );
      await publishBundle(
        context.attemptDirectory,
        output,
        receipt,
        input.signal,
      );
      return {
        ...captureResult(
          receipt,
          output,
          context.attemptDirectory,
          environment,
          input.frames.length,
          0,
        ),
        cacheEntryDirectory: cached.directory,
      };
    }
    context.stage = "mechanism-capture-render";
    await startRenderer(page, baseUrl, input, font.bytes);
    const plates: Receipt["plates"] = [];
    const sidecarFrames: MechanismSidecar["frames"] = [];
    for (const [ordinal, frame] of input.frames.entries()) {
      checkCancelled(input.signal);
      context.path = `frames[${ordinal}]`;
      const rendered = await renderPlate(page, frame);
      validateRenderedFrame(rendered.frame, frame);
      const png = tagCompositionSrgbPng(Buffer.from(rendered.png, "base64"));
      validatePlatePng(png, input.width, input.height);
      const path = `${String(ordinal).padStart(6, "0")}.png`;
      await writeFile(join(context.attemptDirectory, path), png, {
        flag: "wx",
      });
      const plate = {
        frame: ordinal,
        sourceFrame: frame.frame,
        path,
        sha256: digest(png),
        bytes: png.length,
      };
      plates.push(plate);
      sidecarFrames.push(sidecarFrame(rendered.frame, plate, input));
    }
    checkCancelled(input.signal);
    const sidecar = MechanismSidecarSchema.parse({
      schemaVersion: "mechanism-sidecar-1",
      sceneId: input.scene.id,
      sceneSha256: identity.sceneSha256,
      geometrySha256: geometryHash,
      rendererProfile: environment.profile,
      rendererVersion: MECHANISM_BRIDGE_RENDERER_VERSION,
      evaluatorVersion: input.frames[0]!.version,
      width: input.width,
      height: input.height,
      fps: input.fps,
      frameCount: plates.length,
      frames: sidecarFrames,
    });
    const manifest = CompositionSequenceManifestSchema.parse({
      schemaVersion: "composition-sequence-1",
      frames: plates.map((plate) => plate.sha256),
    });
    const receipt = receiptSchema.parse({
      schemaVersion: MECHANISM_CAPTURE_VERSION,
      status: "complete",
      requestHash,
      identity,
      plates,
      sidecar: await writeJson(context.attemptDirectory, SIDECAR, sidecar),
      manifest: await writeJson(context.attemptDirectory, MANIFEST, manifest),
      stats: {
        new3dRenders: plates.length,
        cacheHits: 0,
        wallSeconds: elapsed(started),
      },
    });
    if (identity.browserModuleSha256 !== digest(await readFile(browserModule)))
      throw new Error(
        "Renderer source changed during capture; rerun against one fixed source identity",
      );
    await writeFile(
      join(context.attemptDirectory, RECEIPT),
      jsonBytes(receipt),
      { flag: "wx" },
    );
    context.stage = "mechanism-capture-publish";
    context.path = output;
    const cacheEntry = join(cacheRoot, randomUUID());
    const cacheStage = await mkdtemp(join(cacheRoot, ".staging-"));
    await copyBundle(
      context.attemptDirectory,
      cacheStage,
      receipt,
      receipt.stats,
    );
    await mkdir(cacheEntry);
    await publishBundle(cacheStage, cacheEntry, receipt, input.signal);
    await rm(cacheStage, { recursive: true, force: true });
    await publishBundle(
      context.attemptDirectory,
      output,
      receipt,
      input.signal,
    );
    return {
      ...captureResult(
        receipt,
        output,
        context.attemptDirectory,
        environment,
        0,
        plates.length,
      ),
      cacheEntryDirectory: cacheEntry,
    };
  } catch (cause) {
    const error = captureFailure(cause, context, options.signal);
    if (context.attemptDirectory)
      await writeFile(
        join(context.attemptDirectory, "failure.json"),
        jsonBytes({
          ...error.toFailure(),
          status: options.signal?.aborted ? "cancelled" : "failed",
        }),
      ).catch(() => undefined);
    throw error;
  } finally {
    if (abortBrowser)
      options.signal?.removeEventListener("abort", abortBrowser);
    if (page && !page.isClosed())
      await page
        .evaluate(() =>
          (window as CaptureWindow).__mechanismPlateRenderer?.dispose(),
        )
        .catch(() => undefined);
    await Promise.allSettled([browser?.close(), server?.close()]);
    try {
      await releaseCache?.();
    } finally {
      await releaseOutput?.();
    }
  }
}

function elapsed(started: number): number {
  return (performance.now() - started) / 1000;
}
function checkCancelled(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}
function conflict(path: string): Error {
  return Object.assign(
    new Error(`Existing output must be retained at ${path}`),
    { code: "EEXIST" },
  );
}
function captureFailure(
  cause: unknown,
  context: CaptureContext,
  signal?: AbortSignal,
): AnimationEngineError {
  const cancelled = signal?.aborted;
  const actualCause = cancelled
    ? Object.assign(new Error("Capture cancelled", { cause }), {
        code: "ABORT_ERR",
      })
    : cause;
  return new AnimationEngineError(
    cancelled
      ? "RENDER_FAILED"
      : context.stage === "mechanism-capture-validate"
        ? "SCENE_INVALID"
        : "RENDER_FAILED",
    cancelled
      ? "Mechanism plate capture was cancelled"
      : "Mechanism plate capture failed",
    {
      diagnostic: cancelled
        ? "mechanism-capture-cancelled"
        : "mechanism-capture-failed",
      stage: context.stage,
      path: context.path,
      nextAction:
        "Inspect the retained capture attempt and dependency hashes, then retry into a fresh output directory.",
      ...(context.attemptDirectory
        ? { attemptDirectory: context.attemptDirectory }
        : {}),
    },
    { cause: actualCause },
  );
}
function validateFrameReferences(
  scene: MechanismScene,
  frame: MechanismFrameResult,
  index: number,
): void {
  if (!Number.isInteger(frame.frame))
    throw new Error(
      `frames[${index}].frame must be an integer source-frame index`,
    );
  for (const [field, ids] of [
    ["parts", scene.parts.map((part) => part.id)],
    ["rigs", scene.rigs.map((rig) => rig.id)],
    ["anchors", scene.anchors.map((anchor) => anchor.id)],
  ] as const) {
    if (
      JSON.stringify(Object.keys(frame[field]).sort()) !==
      JSON.stringify([...ids].sort())
    )
      throw new Error(
        `frames[${index}].${field} does not match the scene references`,
      );
  }
  if (frame.assertions.some((assertion) => !assertion.passed))
    throw new Error(
      `frames[${index}].assertions contains a failed mechanism assertion`,
    );
}
async function pinnedFont(
  font: CaptureInput["font"],
): Promise<{ bytes: Buffer; sha256: string }> {
  const stat = await lstat(font.path);
  if (!stat.isFile() || stat.size > MECHANISM_CAPTURE_LIMITS.fontBytes)
    throw new Error("Pinned texture font must be a bounded regular file");
  const bytes = await readFile(font.path);
  const sha256 = digest(bytes);
  if (
    sha256 !==
    (font.sha256.startsWith("sha256:") ? font.sha256 : `sha256:${font.sha256}`)
  )
    throw new Error("Pinned texture font hash does not match the source bytes");
  return { bytes, sha256 };
}
async function captureServer(directory: string): Promise<ViteDevServer> {
  await writeFile(
    join(directory, "index.html"),
    "<!doctype html><meta charset=utf-8><title>Mechanism clean plate</title>",
    { flag: "wx" },
  );
  return createServer({
    root: directory,
    configFile: false,
    cacheDir: join(directory, "vite-cache"),
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true, include: [] },
    server: {
      host: "127.0.0.1",
      port: 0,
      fs: {
        allow: [directory, defaultBrowserProjectRoot, dirname(browserModule)],
      },
    },
  });
}
async function captureIdentity(
  input: CaptureInput,
  fontSha256: string,
  geometrySha256: string,
  environment: RenderEnvironment,
): Promise<Record<string, unknown>> {
  const toolchain = JSON.parse(
    await readFile(
      fileURLToPath(new URL("../../../../toolchain.json", import.meta.url)),
      "utf8",
    ),
  ) as { node: string; chromiumVersion: string };
  if (
    process.versions.node !== toolchain.node ||
    environment.browserVersion !== toolchain.chromiumVersion
  )
    throw new Error(
      "Capture requires the pinned Node and Chromium toolchain versions",
    );
  return {
    sceneSha256: canonicalMechanismHash(input.scene),
    geometrySha256,
    profileSha256: canonicalMechanismHash({
      profile: input.scene.profile,
      lights: input.scene.lights,
    }),
    stateSha256: canonicalMechanismHash(input.frames),
    fontSha256,
    fontWeight: input.font.weight,
    fontFamily: input.font.family,
    browserModuleSha256: digest(await readFile(browserModule)),
    rendererVersion: MECHANISM_BRIDGE_RENDERER_VERSION,
    evaluatorVersion: input.frames[0]!.version,
    browserProfile: RENDER_BROWSER_PROFILE,
    toolchainSha256: canonicalMechanismHash(toolchain),
    nodeVersion: process.versions.node,
    width: input.width,
    height: input.height,
    fps: input.fps,
    frameCount: input.frames.length,
    shotId: input.shotId ?? input.scene.id,
    proofProtection: MECHANISM_PROOF_PROTECTION,
    environment,
  };
}
async function startRenderer(
  page: Page,
  baseUrl: string,
  input: CaptureInput,
  font: Buffer,
): Promise<void> {
  const moduleUrl = new URL(`/@fs/${browserModule}`, baseUrl).href;
  await page.addScriptTag({
    type: "module",
    content: `import { createMechanismPlateRenderer } from ${JSON.stringify(moduleUrl)}; globalThis.__mechanismPlateFactory = createMechanismPlateRenderer;`,
  });
  await page.waitForFunction(
    () =>
      typeof (window as CaptureWindow).__mechanismPlateFactory === "function",
  );
  await page.evaluate(
    async (settings) => {
      const factory = (window as CaptureWindow).__mechanismPlateFactory;
      if (!factory)
        throw new Error("Mechanism plate factory did not initialize");
      (window as CaptureWindow).__mechanismPlateRenderer = await factory(
        settings.scene,
        settings.options,
      );
    },
    {
      scene: input.scene,
      options: {
        width: input.width,
        height: input.height,
        font: {
          bytesBase64: font.toString("base64"),
          weight: input.font.weight,
          family: input.font.family,
        },
      },
    },
  );
}
async function renderPlate(
  page: Page,
  frame: MechanismFrameResult,
): Promise<{ frame: CapturedFrame; png: string }> {
  return page.evaluate((state) => {
    const renderer = (window as CaptureWindow).__mechanismPlateRenderer;
    if (!renderer)
      throw new Error("Mechanism plate renderer did not initialize");
    return { frame: renderer.render(state), png: renderer.png() };
  }, frame);
}
function validateRenderedFrame(
  rendered: CapturedFrame,
  source: MechanismFrameResult,
): void {
  const { renderer, anchors, ...rest } = rendered;
  if (
    Object.values(renderer).some(
      (value) => !Number.isInteger(value) || value < 0,
    )
  )
    throw new Error("Browser renderer returned invalid draw statistics");
  const strippedAnchors = Object.fromEntries(
    Object.entries(anchors).map(([id, value]) => {
      const { visibility, projectionErrorPixels: error, ...anchor } = value;
      if (
        (anchor.projectionVisibility === "in-frame" &&
          visibility !== "in-frame" &&
          visibility !== "occluded") ||
        (anchor.projectionVisibility !== "in-frame" &&
          visibility !== anchor.projectionVisibility)
      )
        throw new Error(
          `Raycast visibility for anchor ${id} contradicts its geometric projection`,
        );
      if (!Number.isFinite(error) || error > 0.5 || error < 0)
        throw new Error(
          `Independent projected anchor ${id} differs by more than 0.5 pixels`,
        );
      return [id, anchor];
    }),
  );
  if (
    canonicalMechanismHash({ ...rest, anchors: strippedAnchors }) !==
    canonicalMechanismHash(source)
  )
    throw new Error("Browser rendering changed evaluated mechanism state");
}
function sidecarFrame(
  frame: CapturedFrame,
  plate: Receipt["plates"][number],
  input: CaptureInput,
): MechanismSidecar["frames"][number] {
  return {
    frame: plate.frame,
    sourceFrame: plate.sourceFrame,
    shotId: input.shotId ?? input.scene.id,
    seed: frame.seed,
    plateSha256: plate.sha256,
    camera: frame.camera,
    parts: frame.parts,
    rigs: frame.rigs,
    assertions: [...frame.assertions],
    anchors: Object.values(frame.anchors).map((anchor) => ({
      ...anchor,
      visibility:
        anchor.visibility === "in-frame" ? "visible" : anchor.visibility,
      visibilityMethod: "scene-raycast",
    })),
    protectedRegions: proofRegions(frame, input.width, input.height),
  } as MechanismSidecar["frames"][number];
}
function proofRegions(
  frame: CapturedFrame,
  width: number,
  height: number,
): MechanismSidecar["frames"][number]["protectedRegions"] {
  const radius = MECHANISM_PROOF_PROTECTION.radiusPixels;
  return Object.values(frame.anchors).flatMap((anchor) => {
    if (anchor.visibility !== "in-frame" || !anchor.pixel) return [];
    const [x, y] = anchor.pixel;
    const left = Math.max(0, x - radius),
      top = Math.max(0, y - radius);
    const right = Math.min(width, x + radius),
      bottom = Math.min(height, y + radius);
    return [
      { id: anchor.anchor, bounds: [left, top, right - left, bottom - top] },
    ];
  });
}

function validatePlatePng(bytes: Buffer, width: number, height: number): void {
  const info = inspectCompositionPng(bytes);
  if (
    info.width !== width ||
    info.height !== height ||
    info.bitDepth !== 8 ||
    info.colorType !== 6 ||
    info.colorAuthority !== "sRGB"
  )
    throw new Error(
      "Captured PNG must be tagged sRGB RGBA8 at the requested dimensions",
    );
}
function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}
async function writeJson(
  directory: string,
  path: string,
  value: unknown,
): Promise<z.infer<typeof fileSchema>> {
  const bytes = jsonBytes(value);
  await writeFile(join(directory, path), bytes, { flag: "wx" });
  return { path, sha256: digest(bytes), bytes: bytes.length };
}
function receiptFiles(receipt: Receipt) {
  return [...receipt.plates, receipt.manifest, receipt.sidecar];
}
async function validateBundle(
  directory: string,
  requestHash: string,
  input: CaptureInput,
  identity: Record<string, unknown>,
): Promise<Receipt | undefined> {
  try {
    if (!(await lstat(join(directory, RECEIPT))).isFile()) return undefined;
    const receipt = receiptSchema.parse(
      JSON.parse(await readFile(join(directory, RECEIPT), "utf8")),
    );
    if (
      receipt.requestHash !== requestHash ||
      canonicalMechanismHash(receipt.identity) !== requestHash ||
      canonicalMechanismHash(identity) !== requestHash ||
      receipt.plates.length !== input.frames.length
    )
      return undefined;
    for (const file of receiptFiles(receipt)) {
      const path = join(directory, file.path);
      const stat = await lstat(path);
      if (!stat.isFile() || stat.size !== file.bytes) return undefined;
      const bytes = await readFile(path);
      if (digest(bytes) !== file.sha256) return undefined;
      if (file.path.endsWith(".png"))
        validatePlatePng(bytes, input.width, input.height);
    }
    const manifest = CompositionSequenceManifestSchema.parse(
      JSON.parse(await readFile(join(directory, MANIFEST), "utf8")),
    );
    if (
      JSON.stringify(manifest.frames) !==
      JSON.stringify(receipt.plates.map((plate) => plate.sha256))
    )
      return undefined;
    const sidecar = MechanismSidecarSchema.parse(
      JSON.parse(await readFile(join(directory, SIDECAR), "utf8")),
    );
    if (
      sidecar.sceneId !== input.scene.id ||
      sidecar.frameCount !== input.frames.length ||
      sidecar.rendererProfile !== environmentProfile(identity) ||
      sidecar.rendererVersion !== identity.rendererVersion ||
      sidecar.evaluatorVersion !== identity.evaluatorVersion ||
      sidecar.sceneSha256 !== identity.sceneSha256 ||
      sidecar.geometrySha256 !== identity.geometrySha256 ||
      sidecar.width !== input.width ||
      sidecar.height !== input.height ||
      sidecar.fps !== input.fps
    )
      return undefined;
    for (const [ordinal, plate] of receipt.plates.entries()) {
      if (
        plate.frame !== ordinal ||
        plate.sourceFrame !== input.frames[ordinal]!.frame ||
        plate.path !== `${String(ordinal).padStart(6, "0")}.png` ||
        sidecar.frames[ordinal]?.plateSha256 !== plate.sha256 ||
        sidecar.frames[ordinal]?.sourceFrame !== plate.sourceFrame ||
        sidecar.frames[ordinal]?.shotId !== (input.shotId ?? input.scene.id)
      )
        return undefined;
    }
    return receipt;
  } catch {
    return undefined;
  }
}
function environmentProfile(identity: Record<string, unknown>): unknown {
  return (identity.environment as RenderEnvironment | undefined)?.profile;
}
async function findCachedBundle(
  root: string,
  requestHash: string,
  input: CaptureInput,
  identity: Record<string, unknown>,
): Promise<{ directory: string; receipt: Receipt } | undefined> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const directory = join(root, entry.name);
    const receipt = await validateBundle(
      directory,
      requestHash,
      input,
      identity,
    );
    if (receipt) return { directory, receipt };
  }
  return undefined;
}
async function copyBundle(
  source: string,
  destination: string,
  receipt: Receipt,
  stats: Receipt["stats"],
): Promise<Receipt> {
  for (const file of receiptFiles(receipt)) {
    const to = join(destination, file.path);
    await copyFile(join(source, file.path), to, constants.COPYFILE_EXCL);
    if (digest(await readFile(to)) !== file.sha256)
      throw new Error("Cache source changed while copying a validated bundle");
  }
  const result = { ...receipt, stats };
  await writeFile(join(destination, RECEIPT), jsonBytes(result), {
    flag: "wx",
  });
  return result;
}
async function publishBundle(
  staged: string,
  destination: string,
  receipt: Receipt,
  signal?: AbortSignal,
): Promise<void> {
  await publishArtifacts(
    [
      ...receiptFiles(receipt).map((file) => ({
        staged: join(staged, file.path),
        destination: join(destination, file.path),
      })),
      {
        staged: join(staged, RECEIPT),
        destination: join(destination, RECEIPT),
      },
    ],
    signal,
  );
}
function captureResult(
  receipt: Receipt,
  directory: string,
  attemptDirectory: string,
  environment: RenderEnvironment,
  cacheHits: number,
  new3dRenders: number,
): MechanismCaptureResult {
  return {
    schemaVersion: MECHANISM_CAPTURE_VERSION,
    requestHash: receipt.requestHash,
    outputDirectory: directory,
    patternPath: join(directory, "%06d.png"),
    firstFrame: 0,
    sequenceManifestPath: join(directory, MANIFEST),
    sequenceManifestSha256: receipt.manifest.sha256,
    sidecarPath: join(directory, SIDECAR),
    sidecarSha256: receipt.sidecar.sha256,
    receiptPath: join(directory, RECEIPT),
    attemptDirectory,
    cacheHits,
    new3dRenders,
    environment,
    frames: receipt.plates,
    proofProtection: MECHANISM_PROOF_PROTECTION,
  };
}
