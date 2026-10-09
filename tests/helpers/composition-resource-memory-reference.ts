import { PassageError } from "../../packages/renderer-core/src/passage-diagnostics.ts";
import {
  decodeRenderFont,
  prepareRenderResources,
} from "../../packages/renderer-core/src/managed-resources.ts";
import {
  COMPOSITION_MEDIA_DECODER_VERSION,
  compositionMediaFrameId,
  type Composition,
  type CompositionPreparedMedia,
} from "../../packages/scene-contract/src/index.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import {
  renderMemory,
  withManagedMemory,
} from "../../packages/renderer-core/src/managed-memory-context.ts";
import { loadCompositionResources } from "../../packages/renderer-core/src/composition/render/renderer.ts";
import { createCompositionMediaResources } from "../../packages/renderer-core/src/composition/render/media-resources.ts";
import { compositionSourceFixture } from "./composition-source-fixture.ts";

function requireProof(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}

/** Real HTTP bodies and native decoders are observed without replacing their original kernels. */
export async function checkManagedResourceMemory(options: {
  mediaHash: string;
  mediaBytes: number;
  wrongMediaHash: string;
  wrongMediaBytes: number;
}) {
  const { composition, svg } = await compositionSourceFixture(false, false);
  const imageAsset = composition.assets.find(
    (asset) => asset.type === "image",
  )!;
  const fontAsset = composition.assets.find((asset) => asset.type === "font")!;
  requireProof(fontAsset.type === "font", "Missing pinned resource font");
  const NativeImage = Image,
    NativeFontFace = FontFace;
  const nativeDecode = HTMLImageElement.prototype.decode;
  const nativeBitmap = createImageBitmap;
  const source = await fetch(fontAsset.path);
  const fontBytes = await source.arrayBuffer();
  const foreign = new NativeFontFace("CE15-resource-foreign", fontBytes, {
    weight: "700",
  });
  await foreign.load();
  document.fonts.add(foreign);
  const oracle = new NativeImage();
  oracle.src = "/_memory_source_art";
  await oracle.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 96;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(oracle, 0, 0);
  const expected = context.getImageData(0, 0, 160, 96).data;
  context.font = '700 20px "CE15-resource-foreign"';
  const expectedWidth = context.measureText("Admission ไทย 0123").width;
  const images: HTMLImageElement[] = [];
  const faces: { face: FontFace; bytes: number }[] = [];
  let bitmapCalls = 0;
  let decoderFailure: "null" | "abort" | undefined;
  let controller: AbortController | undefined;
  globalThis.Image = function (
    ...args: ConstructorParameters<typeof NativeImage>
  ) {
    const image = Reflect.construct(NativeImage, args) as HTMLImageElement;
    if (renderMemory()) images.push(image);
    return image;
  } as unknown as typeof Image;
  globalThis.FontFace = class extends NativeFontFace {
    constructor(
      family: string,
      source: string | BufferSource,
      descriptors?: FontFaceDescriptors,
    ) {
      super(family, source, descriptors);
      if (renderMemory())
        faces.push({
          face: this,
          bytes: typeof source === "string" ? 0 : source.byteLength,
        });
    }
  };
  HTMLImageElement.prototype.decode = async function () {
    if (decoderFailure === "null") throw null;
    await nativeDecode.call(this);
    if (decoderFailure === "abort") controller!.abort(null);
  };
  let imageProof: unknown;
  const failures = [];
  try {
    const memory = new ManagedMemory({
      pixels: 8 * 1024 * 1024,
      metadata: 1024 * 1024,
    });
    const beforeFaces = faces.length,
      beforeImages = images.length;
    try {
      imageProof = await withManagedMemory(memory, async () => {
        const comp = structuredClone(composition);
        const font = comp.assets.find((asset) => asset.type === "font")!;
        requireProof(font.type === "font", "Missing font");
        font.weight = "700";
        const resources = await loadCompositionResources(comp, (id) =>
          id === "art" ? "/_memory_source_art" : fontAsset.path,
        );
        const image = resources.images.get("art") as HTMLImageElement;
        const loaded = resources.fonts.get("body")!;
        requireProof(
          memory.owns(loaded.bytes!),
          "Verified font bytes have no owner",
        );
        requireProof(
          images.length === beforeImages + 1 && faces.length > beforeFaces,
          "Native resource factories were not observed",
        );
        const declared =
          160 * 96 * 4 +
          fontBytes.byteLength +
          faces.slice(beforeFaces).reduce((sum, item) => sum + item.bytes, 0);
        requireProof(
          memory.statistics.current.pixels === declared,
          `Resource phase retained unrelated temporary storage: ${memory.statistics.current.pixels} instead of ${declared}; faces ${faces
            .slice(beforeFaces)
            .map((face) => face.bytes)
            .join(",")}`,
        );
        memory.beginScratch();
        memory.endScratch();
        requireProof(
          image.naturalWidth === 160 &&
            loaded.bytes!.byteLength === fontBytes.byteLength,
          "Committed resource did not survive frame scratch",
        );
        context.clearRect(0, 0, 160, 96);
        context.drawImage(image, 0, 0);
        const actual = context.getImageData(0, 0, 160, 96).data;
        for (let byte = 0; byte < actual.length; byte++)
          requireProof(
            actual[byte] === expected[byte],
            `Managed image changed native pixel ${byte}`,
          );
        context.font = `700 20px "${loaded.family}"`;
        requireProof(
          context.measureText("Admission ไทย 0123").width === expectedWidth,
          "Managed font changed native metrics",
        );
        const before = memory.statistics;
        memory.dispose();
        requireProof(
          image.getAttribute("src") === null && loaded.bytes!.byteLength === 0,
          "Resource disposal did not clear native input owners",
        );
        requireProof(
          faces
            .slice(beforeFaces)
            .every(({ face }) => !document.fonts.has(face)),
          "Disposed owned FontFace remains registered",
        );
        requireProof(document.fonts.has(foreign), "Borrowed font was removed");
        requireProof(
          memory.statistics.reservations === 0,
          "Resource disposal retained admission",
        );
        return {
          exactImageChannels: actual.length,
          exactFontMetrics: true,
          declaredRetainedPixels: declared,
          ownedFontFaces: faces.length - beforeFaces,
          foreignFontPreserved: true,
          before,
          after: memory.statistics,
        };
      });
    } finally {
      memory.dispose();
    }
    for (const failure of [
      "checksum",
      "dimensions",
      "quota",
      "native-null",
      "abort-null",
    ] as const) {
      const comp: Composition = {
        ...composition,
        assets: [structuredClone(imageAsset)],
        layers: [],
        precomps: [],
      };
      const asset = comp.assets[0]!;
      requireProof(asset.type === "image", "Missing image");
      if (failure === "checksum") asset.sha256 = "sha256:" + "f".repeat(64);
      if (failure === "dimensions") asset.width--;
      const size = new TextEncoder().encode(svg).byteLength;
      const memory = new ManagedMemory({
        pixels:
          failure === "quota" ? size * 2 + 160 * 96 * 4 - 1 : 8 * 1024 * 1024,
        metadata: 8192,
      });
      const startImages = images.length;
      controller = new AbortController();
      decoderFailure =
        failure === "native-null"
          ? "null"
          : failure === "abort-null"
            ? "abort"
            : undefined;
      let rejected = false,
        reason: unknown;
      try {
        await withManagedMemory(memory, async () => {
          await loadCompositionResources(comp, () => "/_memory_source_art", {
            signal: controller!.signal,
          });
        });
      } catch (error) {
        rejected = true;
        reason = error;
      } finally {
        decoderFailure = undefined;
      }
      requireProof(rejected, `${failure} was accepted`);
      requireProof(
        failure === "native-null" || failure === "abort-null"
          ? reason === null
          : new RegExp(
              failure === "quota"
                ? "aggregate worker quota"
                : failure === "checksum"
                  ? "checksum differs"
                  : "Dimensions differ",
            ).test(String(reason)),
        `${failure} changed the original failure`,
      );
      requireProof(
        (failure !== "checksum" && failure !== "quota") ||
          images.length === startImages,
        `${failure} reached the native image factory`,
      );
      requireProof(
        images
          .slice(startImages)
          .every((image) => image.getAttribute("src") === null),
        `${failure} retained a native image input`,
      );
      requireProof(
        memory.statistics.reservations === 0 && !memory.hasScratch,
        `${failure} retained an asset phase`,
      );
      failures.push({
        failure,
        nativeImageFactories: images.length - startImages,
        statistics: memory.statistics,
      });
      memory.dispose();
    }
    const borrowed = new NativeFontFace(
      `StillShift-${fontAsset.sha256.slice(7)}`,
      fontBytes,
      { weight: "900" },
    );
    await borrowed.load();
    document.fonts.add(borrowed);
    const borrowedMemory = new ManagedMemory({
      pixels: 4 * 1024 * 1024,
      metadata: 8192,
    });
    let borrowedProof: unknown;
    try {
      borrowedProof = await withManagedMemory(borrowedMemory, async () => {
        const before = faces.length;
        const comp: Composition = {
          ...composition,
          assets: [{ ...fontAsset, weight: "900" }],
          layers: [],
          precomps: [],
        };
        const resources = await loadCompositionResources(
          comp,
          () => fontAsset.path,
        );
        const input = resources.fonts.get("body")!.bytes!;
        requireProof(
          faces.length === before &&
            document.fonts.has(borrowed) &&
            borrowedMemory.statistics.current.pixels === fontBytes.byteLength,
          "Borrowed native font acquired a second decoder owner",
        );
        const beforeDisposal = borrowedMemory.statistics;
        borrowedMemory.dispose();
        requireProof(
          input.byteLength === 0 &&
            document.fonts.has(borrowed) &&
            borrowedMemory.statistics.reservations === 0,
          "Borrowed native font was destroyed with verified inputs",
        );
        return {
          existingDecoderReused: true,
          foreignFontPreserved: true,
          before: beforeDisposal,
          after: borrowedMemory.statistics,
        };
      });
    } finally {
      borrowedMemory.dispose();
      document.fonts.delete(borrowed);
    }
    for (const failure of ["quota", "late-registration"] as const) {
      const memory = new ManagedMemory({
        pixels:
          failure === "quota" ? fontBytes.byteLength - 1 : fontBytes.byteLength,
        metadata: 8192,
      });
      const before = faces.length;
      let rejected = false,
        reason: unknown;
      try {
        await withManagedMemory(memory, () =>
          prepareRenderResources(() =>
            decodeRenderFont(
              "CE15-resource-late",
              fontBytes,
              { weight: "700" },
              async (face) => {
                await face.load();
                memory.dispose();
                document.fonts.add(face);
              },
            ),
          ),
        );
      } catch (error) {
        rejected = true;
        reason = error;
      }
      requireProof(
        rejected &&
          (failure === "quota"
            ? /aggregate worker quota/
            : /owner was disposed/
          ).test(String(reason)),
        `Font ${failure} changed its original failure`,
      );
      requireProof(
        faces.length - before === (failure === "quota" ? 0 : 1) &&
          faces.slice(before).every(({ face }) => !document.fonts.has(face)) &&
          memory.statistics.reservations === 0,
        `Font ${failure} retained late native registration`,
      );
      failures.push({
        failure: "font-" + failure,
        nativeFontFactories: faces.length - before,
        statistics: memory.statistics,
      });
      memory.dispose();
    }
    const sourceHash = "sha256:" + "0".repeat(64);
    const comp: Composition = {
      schemaVersion: "composition-1",
      id: "managed-native-media",
      width: 16,
      height: 16,
      fps: 24,
      frameCount: 2,
      mediaLimits: { decodedFrameBytes: 1024, decodedTextureBytes: 1024 },
      assets: [
        {
          id: "clip",
          type: "video",
          path: "clip.mkv",
          sha256: sourceHash,
          width: 16,
          height: 16,
          frameCount: 2,
          frameRate: { numerator: 24, denominator: 1 },
          color: {
            primaries: "bt709",
            transfer: "iec61966-2-1",
            matrix: "gbr",
            range: "pc",
          },
        },
      ],
      layers: [{ id: "picture", type: "video", asset: "clip" }],
    };
    const manifest = (failure?: string): CompositionPreparedMedia => ({
      schemaVersion: "composition-prepared-media-1",
      decoderVersion: COMPOSITION_MEDIA_DECODER_VERSION,
      ffmpegIdentities: [sourceHash],
      frames: [0, 1].map((ordinal) => ({
        id: compositionMediaFrameId("clip", ordinal),
        asset: "clip",
        sourceHash,
        ordinal,
        width: 16,
        height: 16,
        sha256:
          failure === "checksum"
            ? "sha256:" + "f".repeat(64)
            : failure === "dimensions"
              ? options.wrongMediaHash
              : options.mediaHash,
        byteLength:
          failure === "dimensions"
            ? options.wrongMediaBytes
            : options.mediaBytes,
      })),
    });
    let late: (() => void) | undefined;
    const bitmaps: ImageBitmap[] = [];
    globalThis.createImageBitmap = (async (...args: unknown[]) => {
      bitmapCalls++;
      if (decoderFailure === "null") throw null;
      const bitmap = (await Reflect.apply(
        nativeBitmap,
        globalThis,
        args,
      )) as ImageBitmap;
      bitmaps.push(bitmap);
      late?.();
      return bitmap;
    }) as typeof createImageBitmap;
    const bitmapMemory = new ManagedMemory({
      pixels: 1024 * 1024,
      metadata: 8192,
    });
    let mediaProof: unknown;
    try {
      mediaProof = await withManagedMemory(bitmapMemory, async () => {
        const decoded = new Map<string, CanvasImageSource>();
        const media = createCompositionMediaResources(
          comp,
          manifest(),
          () => "/_memory_media",
          decoded,
        );
        try {
          const startCalls = bitmapCalls;
          bitmapMemory.beginScratch();
          await media.prepareFrame(0);
          bitmapMemory.endScratch();
          const first = decoded.get(
            compositionMediaFrameId("clip", 0),
          ) as ImageBitmap;
          requireProof(
            bitmapMemory.statistics.current.pixels === 1024 &&
              first.width === 16,
            "Retained bitmap did not survive frame scratch",
          );
          context.clearRect(0, 0, 160, 96);
          context.drawImage(first, 0, 0);
          const pixels = context.getImageData(0, 0, 16, 16).data;
          for (let pixel = 0; pixel < 256; pixel++)
            for (let channel = 0; channel < 4; channel++)
              requireProof(
                pixels[pixel * 4 + channel] ===
                  [
                    (pixel * 17) % 251,
                    (pixel * 31) % 251,
                    (pixel * 43) % 251,
                    255,
                  ][channel],
                `Managed native bitmap changed ${pixel}/${channel}`,
              );
          bitmapMemory.beginScratch();
          await media.prepareFrame(1);
          bitmapMemory.endScratch();
          const second = decoded.get(
            compositionMediaFrameId("clip", 1),
          ) as ImageBitmap;
          requireProof(
            Number(first.width) === 0 &&
              second.width === 16 &&
              bitmapMemory.statistics.current.pixels === 1024,
            "Bitmap LRU did not release the original native owner",
          );
          const before = bitmapMemory.statistics;
          media.dispose();
          requireProof(
            Number(second.width) === 0 &&
              bitmapMemory.statistics.reservations === 0 &&
              decoded.size === 0,
            "Media disposal retained native bitmap storage",
          );
          return {
            exactBitmapChannels: pixels.length,
            nativeBitmapFactories: bitmapCalls - startCalls,
            nativeEvictionClosed: true,
            nativeDisposalClosed: true,
            before,
            after: bitmapMemory.statistics,
          };
        } finally {
          media.dispose();
        }
      });
    } finally {
      bitmapMemory.dispose();
    }
    for (const failure of [
      "checksum",
      "dimensions",
      "short",
      "long",
      "quota",
      "native-null",
      "late-disposal",
      "allocator-disposal",
    ] as const) {
      const memory = new ManagedMemory({
        pixels:
          failure === "quota" ? options.mediaBytes * 2 + 1023 : 1024 * 1024,
        metadata: 8192,
      });
      const decoded = new Map<string, CanvasImageSource>();
      const media = createCompositionMediaResources(
        comp,
        manifest(failure),
        () => `/_memory_media?case=${failure}`,
        decoded,
      );
      const startCalls = bitmapCalls,
        startBitmaps = bitmaps.length;
      decoderFailure = failure === "native-null" ? "null" : undefined;
      late =
        failure === "late-disposal"
          ? () => media.dispose()
          : failure === "allocator-disposal"
            ? () => memory.dispose()
            : undefined;
      let rejected = false,
        reason: unknown;
      try {
        await withManagedMemory(memory, async () => {
          memory.beginScratch();
          await media.prepareFrame(0);
        });
      } catch (error) {
        rejected = true;
        reason = error;
      } finally {
        decoderFailure = undefined;
        late = undefined;
        media.dispose();
        memory.dispose();
      }
      const pattern =
        failure === "checksum" || failure === "short"
          ? /comp-media-checksum/
          : failure === "long"
            ? /comp-media-limit/
            : failure === "dimensions"
              ? /comp-media-provenance/
              : failure === "quota"
                ? /aggregate worker quota/
                : failure === "allocator-disposal"
                  ? /no active owner/
                  : /AbortError/;
      const original =
        reason instanceof PassageError
          ? (reason.diagnostics[0]?.code ?? "")
          : String(reason);
      requireProof(
        rejected &&
          (failure === "native-null"
            ? reason === null
            : pattern.test(original)),
        `${failure} changed the native media failure: ${original}`,
      );
      requireProof(
        ["native-null", "late-disposal", "allocator-disposal"].includes(
          failure,
        ) || bitmapCalls === startCalls,
        `${failure} reached native bitmap decode`,
      );
      requireProof(
        bitmaps.slice(startBitmaps).every((bitmap) => bitmap.width === 0),
        `${failure} retained a native bitmap`,
      );
      requireProof(
        decoded.size === 0 && memory.statistics.reservations === 0,
        `${failure} retained media owners`,
      );
      failures.push({
        failure: "media-" + failure,
        nativeBitmapFactories: bitmapCalls - startCalls,
        statistics: memory.statistics,
      });
    }
    requireProof(
      document.fonts.has(foreign),
      "Failure cleanup removed a foreign font",
    );
    return {
      status: "passed",
      image: imageProof,
      borrowedFont: borrowedProof,
      media: mediaProof,
      failures,
      declaredScope:
        "encoded body/input copies and RGBA8 native decode capacity; opaque decoder/driver/VM RSS is separate",
    };
  } finally {
    globalThis.Image = NativeImage;
    globalThis.FontFace = NativeFontFace;
    HTMLImageElement.prototype.decode = nativeDecode;
    globalThis.createImageBitmap = nativeBitmap;
    document.fonts.delete(foreign);
    canvas.width = canvas.height = 0;
  }
}
