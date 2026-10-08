import { WebglDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { WebglDepthImages } from "../../packages/renderer-core/src/composition/render/webgl-depth-image.ts";
import { WebglPngImages } from "../../packages/renderer-core/src/composition/render/webgl-png-images.ts";
import { createWebgl2Backend } from "../../packages/renderer-core/src/composition/render/webgl2.ts";
import type {
  ImageContent,
  DepthImageContent,
} from "../../packages/renderer-core/src/composition/render/graph.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import {
  withManagedMemory,
  createRenderCanvas,
  allocateRenderPixels,
  readRenderImageData,
  renderMemory,
  readRenderResponsePixels,
  releaseRenderCanvas,
} from "../../packages/renderer-core/src/managed-memory-context.ts";
import { createCanvas2dBackend } from "../../packages/renderer-core/src/composition/render/canvas2d.ts";

/** Pooled native surfaces and exposure storage remain charged until their actual release. */
export async function checkManagedCanvasPool() {
  const memory = new ManagedMemory({ pixels: 400000, metadata: 8192 });
  try {
    return await withManagedMemory(memory, async () => {
      const backend = createCanvas2dBackend({
        images: { images: new Map(), sizes: new Map() },
        drawText: () => {},
        poolByteLimit: 256,
      });
      memory.beginScratch();
      const first = backend.createSurface(8, 8);
      const second = backend.createSurface(8, 8);
      backend.releaseSurface(first);
      backend.releaseSurface(second);
      memory.endScratch();
      if (
        first.canvas.width !== 0 ||
        second.canvas.width !== 8 ||
        memory.statistics.current.pixels !== 256
      )
        throw Error(
          "Managed Canvas pool did not evict and retain actual storage",
        );
      memory.beginScratch();
      const reused = backend.createSurface(8, 8);
      if (reused !== second) throw Error("Managed Canvas pool changed reuse");
      backend.releaseSurface(reused);
      const dropped = backend.createSurface(16, 16);
      backend.releaseSurface(dropped);
      memory.endScratch();
      if (
        dropped.canvas.width !== 0 ||
        memory.statistics.current.pixels !== 256
      )
        throw Error("Over-pool Canvas retained backing admission");
      const canvas = createRenderCanvas();
      canvas.width = canvas.height = 8;
      const target = backend.wrap(canvas, canvas.getContext("2d")!);
      memory.beginScratch();
      backend.accumulateExposure!(target, 4, (sample) => {
        target.ctx.fillStyle = `rgb(${[0, 255, 127, 64][sample]},20,40)`;
        target.ctx.fillRect(0, 0, 8, 8);
      });
      const actual = backend.readPixels(target);
      const exposureChannels = actual.length;
      for (let byte = 0; byte < actual.length; byte++)
        if (actual[byte] !== [112, 20, 40, 255][byte % 4])
          throw Error(`Managed exposure changed actual byte ${byte}`);
      memory.endScratch();
      if (Number(memory.statistics.current.pixels) !== 1536)
        throw Error(
          "Managed exposure did not retain exactly its accumulator and canvases",
        );
      backend.dispose();
      releaseRenderCanvas(canvas);
      if (
        Number(second.canvas.width) !== 0 ||
        Number(memory.statistics.current.pixels) !== 0
      )
        throw Error(
          "Managed backend disposal retained Canvas/exposure storage",
        );
      return {
        status: "passed",
        exactExposureChannels: exposureChannels,
        evictedCanvasDestroyed: true,
        overPoolCanvasDestroyed: true,
        retainedPoolReused: true,
        statistics: memory.statistics,
      };
    });
  } finally {
    memory.dispose();
  }
}

/** Actual native admission, exact kernel pixels and explicit scratch destruction. */
export async function checkManagedMemoryPrimitives() {
  const memory = new ManagedMemory({ pixels: 400000, metadata: 8192 });
  const baseline = document.createElement("canvas");
  baseline.width = baseline.height = 16;
  const paint = (canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        context.fillStyle = `rgba(${x * 17},${y * 17},${(x + y) * 8},${(x * 16 + y) / 255})`;
        context.fillRect(x, y, 1, 1);
      }
    return context;
  };
  const expected = paint(baseline).getImageData(0, 0, 16, 16).data;
  let nativeWidthCalls = 0;
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    "width",
  )!;
  Object.defineProperty(HTMLCanvasElement.prototype, "width", {
    ...descriptor,
    set(this: HTMLCanvasElement, value: number) {
      nativeWidthCalls++;
      descriptor.set!.call(this, value);
    },
  });
  try {
    return await withManagedMemory(memory, async () => {
      memory.beginScratch();
      const canvas = createRenderCanvas();
      canvas.width = canvas.height = 16;
      const context = paint(canvas);
      const calls = nativeWidthCalls;
      let rejected = false;
      try {
        canvas.width = 32768;
      } catch (error) {
        rejected = /aggregate worker quota/.test(String(error));
      }
      if (!rejected || canvas.width !== 16 || nativeWidthCalls !== calls)
        throw Error("Over-quota Canvas reached the native setter");
      const pixels = readRenderImageData(context, 0, 0, 16, 16).data;
      for (let i = 0; i < pixels.length; i++)
        if (pixels[i] !== expected[i])
          throw Error(`Managed native Canvas changed pixel ${i}`);
      const view = allocateRenderPixels(16, () => new Uint8Array(16));
      memory.retain(new Uint8ClampedArray(view.buffer).buffer);
      memory.endScratch();
      if (
        Number(canvas.width) !== 0 ||
        Number(canvas.height) !== 0 ||
        memory.statistics.current.pixels !== 16
      )
        throw Error(
          "Scratch did not release actual Canvas storage or preserve retained aliases",
        );
      memory.release(view.buffer);
      memory.beginScratch();
      const committed = createRenderCanvas();
      committed.width = committed.height = 16;
      paint(committed);
      memory.commitScratch();
      memory.beginScratch();
      const discarded = createRenderCanvas();
      discarded.width = discarded.height = 8;
      memory.endScratch();
      if (discarded.width !== 0 || committed.width !== 16)
        throw Error("Construction commit lost Canvas ownership");
      let overlapRejected = false;
      try {
        await withManagedMemory(memory, async () => {});
      } catch (error) {
        overlapRejected = /cannot overlap/.test(String(error));
      }
      if (!overlapRejected || renderMemory() !== memory)
        throw Error("Allocator page scope ownership changed");
      memory.beginScratch();
      const response = await fetch("/_memory_primitives");
      const received = new Uint8Array(
        await readRenderResponsePixels(response, 180000),
      );
      const responseBytes = received.length;
      for (let byte = 0; byte < received.length; byte++)
        if (received[byte] !== (byte * 37) % 251)
          throw Error(`Managed BYOB changed actual response byte ${byte}`);
      if (Number(memory.statistics.current.pixels) !== 181024)
        throw Error("Managed BYOB retained a receive block after copying");
      memory.endScratch();
      if (received.byteLength !== 0)
        throw Error("Managed scratch did not detach actual response storage");
      const responseFailures = [];
      for (const size of [179999, 180001, 400000]) {
        memory.beginScratch();
        const response = await fetch("/_memory_primitives");
        const body = response.body!;
        const getReader = body.getReader;
        let reads = 0;
        Object.defineProperty(body, "getReader", {
          value: (...args: unknown[]) => {
            reads++;
            return Reflect.apply(getReader, body, args);
          },
        });
        let rejected = false;
        try {
          await readRenderResponsePixels(response, size);
        } catch (error) {
          rejected = (
            size === 400000 ? /aggregate worker quota/ : /exact body size/
          ).test(String(error));
        } finally {
          memory.endScratch();
        }
        if (
          !rejected ||
          (size === 400000 && reads !== 0) ||
          Number(memory.statistics.current.pixels) !== 1024 ||
          memory.statistics.reservations !== 1
        )
          throw Error(
            "Managed response failure changed admission, ownership or original bounds",
          );
        responseFailures.push({
          size,
          rejected: true,
          readerAcquisitions: reads,
        });
      }
      memory.beginScratch();
      let originalFailure: unknown = "not thrown";
      try {
        await readRenderResponsePixels(
          new Response(
            new ReadableStream({
              type: "bytes",
              start(controller) {
                controller.error(null);
              },
            }),
          ),
          16,
        );
      } catch (error) {
        originalFailure = error;
      } finally {
        memory.endScratch();
      }
      if (
        originalFailure !== null ||
        Number(memory.statistics.current.pixels) !== 1024
      )
        throw Error(
          "Managed response replaced the original null failure or retained storage",
        );
      const before = memory.statistics;
      memory.dispose();
      if (
        Number(committed.width) !== 0 ||
        Number(committed.height) !== 0 ||
        Number(memory.statistics.current.pixels) !== 0
      )
        throw Error("Disposal retained native Canvas storage");
      return {
        status: "passed",
        exactChannelComparisons: expected.length,
        rejectedBeforeNativeSetter: true,
        scratchCanvasDestroyed: true,
        committedCanvasDestroyed: true,
        retainedBackingStoreAlias: true,
        scopeOverlapRejected: true,
        exactResponseBytes: responseBytes,
        scratchResponseDetached: true,
        responseFailures,
        originalNullStreamFailurePreserved: true,
        before,
        after: memory.statistics,
      };
    });
  } finally {
    Object.defineProperty(HTMLCanvasElement.prototype, "width", descriptor);
    memory.dispose();
    baseline.width = baseline.height = 0;
  }
}

/** Actual byte/float storage, quota denial and native pool destruction on the pinned GPU. */
export async function checkManagedGpuStorage() {
  const memory = new ManagedMemory({ pixels: 400000, metadata: 8192 });
  try {
    return await withManagedMemory(memory, async () => {
      const canvas = createRenderCanvas();
      canvas.width = canvas.height = 16;
      const device = new WebglDevice(canvas, true, 256);
      const gl = device.gl;
      let storageCalls = 0;
      const nativeStorage = gl.texStorage2D;
      gl.texStorage2D = (...args) => {
        storageCalls++;
        return nativeStorage.apply(gl, args);
      };
      memory.beginScratch();
      const first = device.surface(8, 8);
      const second = device.surface(8, 8);
      device.release(first);
      device.release(second);
      memory.endScratch();
      if (
        !gl.isTexture(first.texture) ||
        gl.isTexture(second.texture) ||
        memory.statistics.current.pixels !== 1280
      )
        throw Error(
          "GPU pool changed actual retained/evicted texture ownership",
        );
      const reused = device.surface(8, 8);
      if (reused !== first) throw Error("Managed GPU pool changed reuse");
      const calls = storageCalls;
      let denied = false;
      try {
        device.surface(512, 512);
      } catch (error) {
        denied = /aggregate worker quota/.test(String(error));
      }
      if (!denied || storageCalls !== calls || device.allocated !== 1)
        throw Error("Over-quota GPU storage reached a native allocation");
      memory.beginScratch();
      const bytes = allocateRenderPixels(256, () => new Uint8Array(256));
      for (let byte = 0; byte < bytes.length; byte++)
        bytes[byte] = byte % 4 === 3 ? 255 : (byte * 17) % 256;
      device.uploadBytes(reused, bytes);
      const actual = device.read(reused);
      const byteChannels = actual.length;
      for (let byte = 0; byte < actual.length; byte++)
        if (actual[byte] !== bytes[byte])
          throw Error(`Managed GPU byte transfer changed ${byte}`);
      memory.endScratch();
      if (bytes.byteLength !== 0 || actual.byteLength !== 0)
        throw Error("GPU readback scratch retained native backing stores");
      memory.beginScratch();
      const floatA = device.surface(4, 4, true),
        floatB = device.surface(4, 4, true);
      const values = allocateRenderPixels(256, () => new Float32Array(64));
      for (let value = 0; value < values.length; value++)
        values[value] = Math.fround((value - 31) / 17);
      device.uploadFloats(floatA, values);
      device.swap(floatA, floatB);
      const floats = device.readFloats(floatB);
      const floatChannels = floats.length;
      for (let value = 0; value < floats.length; value++)
        if (floats[value] !== values[value])
          throw Error(`Managed GPU float transfer changed ${value}`);
      memory.endScratch();
      if (
        !gl.isTexture(floatA.texture) ||
        !gl.isTexture(floatB.texture) ||
        floats.byteLength !== 0
      )
        throw Error("Texture swap changed native storage ownership");
      device.discard(floatA);
      device.discard(floatB);
      const beforeFailure = memory.statistics.current.pixels;
      gl.texStorage2D = () => {
        throw null;
      };
      let reason: unknown = "not thrown";
      try {
        device.surface(4, 4);
      } catch (error) {
        reason = error;
      }
      gl.texStorage2D = nativeStorage;
      if (
        reason !== null ||
        memory.statistics.current.pixels !== beforeFailure ||
        device.allocated !== 1
      )
        throw Error(
          "GPU storage failure changed original reason or retained allocation",
        );
      device.release(reused);
      device.dispose();
      if (gl.isTexture(first.texture))
        throw Error("GPU disposal retained a native pooled texture");
      releaseRenderCanvas(canvas);
      if (
        Number(memory.statistics.current.pixels) !== 0 ||
        memory.statistics.reservations !== 0
      )
        throw Error("GPU storage disposal retained admission");
      return {
        status: "passed",
        exactByteChannels: byteChannels,
        exactFloatChannels: floatChannels,
        deniedBeforeNativeStorage: true,
        nativePoolReused: true,
        evictedNativeTextureDeleted: true,
        textureSwapOwnershipPreserved: true,
        originalNullStorageFailurePreserved: true,
        readbackScratchDetached: true,
        statistics: memory.statistics,
      };
    });
  } finally {
    memory.dispose();
  }
}

/** Existing native depth kernel stays byte exact while mesh, textures and four-sample MSAA are admitted. */
export async function checkManagedDepthStorage() {
  // Asset decoding is outside this storage slice; use the same actual native source for both kernels.
  const source = document.createElement("canvas");
  source.width = 32;
  source.height = 24;
  const context = source.getContext("2d")!;
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 32; x++) {
      context.fillStyle = `rgba(${x * 7},${y * 9},${(x + y) * 4},${((x + y) % 4) / 4 + 0.25})`;
      context.fillRect(x, y, 1, 1);
    }
  const images = {
    images: new Map([
      ["source", source],
      ["depth", source],
    ]),
    sizes: new Map<string, readonly [number, number]>([
      ["source", [32, 24]],
      ["depth", [32, 24]],
    ]),
  };
  const content = (width: number, height: number): DepthImageContent => ({
    type: "depth-image",
    shaderVersion: "composition-image-plane-0.4.0",
    width,
    height,
    sourceHash: "sha256:" + "a".repeat(64),
    depthHash: "sha256:" + "b".repeat(64),
    sourceSize: [32, 24],
    layer: {
      id: "native-depth",
      type: "depth-image",
      size: [width, height],
      sourceAsset: "source",
      depth: { asset: "depth", encoding: "r8-unorm", width: 32, height: 24 },
      overscan: 0.1,
    },
    motion: { scale: 1.05, strength: 0.03, offset: [0.01, -0.02], roll: 3 },
  });
  const sizes = [
    [16, 12],
    [20, 14],
    [16, 12],
  ] as const;
  const baselineCanvas = document.createElement("canvas");
  baselineCanvas.width = baselineCanvas.height = 32;
  const baselineDevice = new WebglDevice(baselineCanvas, true);
  const baseline = new WebglDepthImages(baselineDevice, images);
  const expected: Uint8Array[] = [];
  try {
    for (const [width, height] of sizes) {
      const surface = baseline.draw(content(width, height));
      expected.push(baselineDevice.read(surface));
      baselineDevice.release(surface);
    }
  } finally {
    baseline.dispose();
    baselineDevice.dispose();
    baselineCanvas.width = baselineCanvas.height = 0;
  }
  const memory = new ManagedMemory({
    pixels: 16 * 1024 * 1024,
    // Reach the original pixel/native checks after pre-admitting the pinned V8
    // renderer DOMString bound; actual renderer text retires after its predicate.
    metadata: 2 * 2 ** 29 + 128 * 1024,
  });
  try {
    return await withManagedMemory(memory, async () => {
      const canvas = createRenderCanvas();
      canvas.width = canvas.height = 32;
      const device = new WebglDevice(canvas, true);
      const depth = new WebglDepthImages(device, images);
      const gl = device.gl;
      const buffers: WebGLBuffer[] = [],
        textures: WebGLTexture[] = [],
        colors: WebGLRenderbuffer[] = [];
      const bufferBytes: number[] = [],
        msaaBytes: number[] = [];
      const createBuffer = gl.createBuffer,
        createTexture = gl.createTexture,
        createColor = gl.createRenderbuffer,
        bufferData = gl.bufferData,
        msaa = gl.renderbufferStorageMultisample;
      gl.createBuffer = () => {
        const buffer = createBuffer.call(gl);
        if (buffer) buffers.push(buffer);
        return buffer;
      };
      gl.createTexture = () => {
        const texture = createTexture.call(gl);
        if (texture) textures.push(texture);
        return texture;
      };
      gl.createRenderbuffer = () => {
        const color = createColor.call(gl);
        if (color) colors.push(color);
        return color;
      };
      // Reflect preserves WebGL's overloaded signature while recording actual submitted byte sizes.
      gl.bufferData = (...args: unknown[]) => {
        const value = args[1];
        bufferBytes.push(
          typeof value === "number"
            ? value
            : value instanceof ArrayBuffer || ArrayBuffer.isView(value)
              ? value.byteLength
              : 0,
        );
        return Reflect.apply(bufferData, gl, args);
      };
      gl.renderbufferStorageMultisample = (...args) => {
        msaaBytes.push(args[1] * args[3] * args[4] * 4);
        return msaa.apply(gl, args);
      };
      let channels = 0;
      try {
        for (const [index, [width, height]] of sizes.entries()) {
          memory.beginScratch();
          try {
            const surface = depth.draw(content(width, height));
            const actual = device.read(surface),
              reference = expected[index]!;
            channels += actual.length;
            for (let byte = 0; byte < actual.length; byte++)
              if (actual[byte] !== reference[byte])
                throw Error(`Managed depth changed ${index}/${byte}`);
            device.release(surface);
          } finally {
            memory.endScratch();
          }
        }
        if (
          buffers.length !== 2 ||
          bufferBytes.length !== 2 ||
          colors.length !== 3 ||
          msaaBytes.some(
            (bytes, index) =>
              bytes !== sizes[index]![0] * sizes[index]![1] * 16,
          )
        )
          throw Error(
            "Managed depth did not exercise actual native mesh/MSAA storage",
          );
        if (colors.slice(0, 2).some((color) => gl.isRenderbuffer(color)))
          throw Error("Resized MSAA retained native color storage");
      } finally {
        depth.dispose();
        device.dispose();
        releaseRenderCanvas(canvas);
      }
      if (
        buffers.some((buffer) => gl.isBuffer(buffer)) ||
        textures.some((texture) => gl.isTexture(texture)) ||
        colors.some((color) => gl.isRenderbuffer(color)) ||
        memory.statistics.current.pixels !== 0 ||
        memory.statistics.reservations !== 0
      )
        throw Error("Depth disposal retained actual GPU handles or admission");
      return {
        status: "passed",
        exactChannels: channels,
        actualBufferBytes: bufferBytes,
        actualMultisampleBytes: msaaBytes,
        resizedMultisampleDeleted: true,
        nativeBuffersTexturesColorsDeleted: true,
        statistics: memory.statistics,
      };
    });
  } finally {
    memory.dispose();
    source.width = source.height = 0;
  }
}

/** Real PNG sampling reuses retained float coordinate buffers after each frame's scratch is destroyed. */
export async function checkManagedPngStorage() {
  const source = document.createElement("canvas");
  source.width = 384;
  source.height = 256;
  const context = source.getContext("2d")!;
  for (let y = 16; y < 240; y += 4)
    for (let x = 16; x < 368; x += 4) {
      context.fillStyle = `rgba(${x % 256},${y % 256},${(x + y) % 256},0.75)`;
      context.fillRect(x, y, 4, 4);
    }
  const image = new Image();
  image.src = source.toDataURL();
  await image.decode();
  source.width = source.height = 0;
  const options = {
    images: {
      images: new Map([["png", image]]),
      pngImages: new Set(["png"]),
      sizes: new Map<string, readonly [number, number]>([["png", [384, 256]]]),
    },
    drawText: () => {},
  };
  const content: ImageContent = {
    type: "image",
    width: 384,
    height: 256,
    fit: "contain",
    rasterize: "draw",
    sources: [{ asset: "png" }],
    state: 0,
  };
  const scales = [0.2, 0.21, 0.18, 0.2];
  const draw = (gpu: ReturnType<typeof createWebgl2Backend>, scale: number) => {
    gpu.clear(gpu.target, [0.2, 0.3, 0.4, 1]);
    gpu.drawImage(
      gpu.target,
      content,
      [scale, 0, 0, scale, 4.25, 2.5],
      0.7,
      "normal",
      [],
    );
    gpu.present();
    return gpu.readPixels(gpu.target);
  };
  const baselineCanvas = document.createElement("canvas");
  baselineCanvas.width = 96;
  baselineCanvas.height = 64;
  const baseline = createWebgl2Backend(baselineCanvas, options);
  const expected = scales.map((scale) => draw(baseline, scale));
  baseline.dispose();
  baselineCanvas.width = baselineCanvas.height = 0;
  const memory = new ManagedMemory({
    pixels: 8 * 1024 * 1024,
    metadata: 128 * 1024,
  });
  try {
    return await withManagedMemory(memory, async () => {
      const canvas = createRenderCanvas();
      canvas.width = 96;
      canvas.height = 64;
      const gpu = createWebgl2Backend(canvas, options);
      let channels = 0,
        sampled = 0;
      const original = WebglPngImages.prototype.draw;
      WebglPngImages.prototype.draw = function (...args) {
        const accepted = original.apply(this, args);
        if (accepted) sampled++;
        return accepted;
      };
      try {
        for (const [index, scale] of scales.entries()) {
          memory.beginScratch();
          try {
            const actual = draw(gpu, scale),
              reference = expected[index]!;
            channels += actual.length;
            for (let byte = 0; byte < actual.length; byte++)
              if (actual[byte] !== reference[byte])
                throw Error(`Managed PNG changed ${index}/${byte}`);
          } finally {
            memory.endScratch();
          }
        }
        if (sampled !== scales.length)
          throw Error(
            "Managed PNG did not exercise actual retained coordinate storage",
          );
      } finally {
        WebglPngImages.prototype.draw = original;
        gpu.dispose();
        releaseRenderCanvas(canvas);
      }
      if (
        memory.statistics.current.pixels !== 0 ||
        memory.statistics.reservations !== 0
      )
        throw Error("Managed PNG disposal retained native/coordinate storage");
      return {
        status: "passed",
        frames: scales.length,
        actualNativeSamplingCalls: sampled,
        exactChannels: channels,
        coordinateStorageSurvivesFrameScratch: true,
        statistics: memory.statistics,
      };
    });
  } finally {
    memory.dispose();
    image.removeAttribute("src");
  }
}
