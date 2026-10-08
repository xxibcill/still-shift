import { createServer as createPortProbe } from "node:net";
import { createHash, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import * as animation from "@still-shift/animation-engine";
import { createProgramPreview } from "../../tools/still-shift-cli/src/composition/preview.ts";
import { comp, image } from "@still-shift/motion";
import { imageAsset } from "@still-shift/motion/node";
import type { Composition } from "@still-shift/scene-contract";
import { mediaFloat32Wave } from "../helpers/composition-media-audio.ts";
import {
  mediaPngChunk,
  mediaRgbaPng,
} from "../helpers/composition-media-png.ts";
const directories: string[] = [],
  sessions: Awaited<ReturnType<typeof createProgramPreview>>[] = [];
async function directory() {
  const root = await mkdtemp(join(tmpdir(), "composition-preview-"));
  directories.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.close()));
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
it("serves immutable asset snapshots, keeps the last valid rebuild and watches helper/asset edits", async () => {
  const root = await directory(),
    extra = await directory(),
    input = join(root, "program.ts"),
    helper = join(extra, "helper.ts"),
    art = join(root, "art.svg");
  const original =
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="12"><rect width="8" height="12" fill="red"/></svg>';
  await writeFile(art, original);
  await writeFile(helper, "export const x=4;");
  await writeFile(
    input,
    `import{comp,image}from'@still-shift/motion';import{imageAsset}from'@still-shift/motion/node';import{x}from${JSON.stringify(helper)};const asset=await imageAsset('art','./art.svg',{relativeTo:import.meta.url});export default comp({width:64,height:64,fps:24,frames:24},c=>c.add(image('drawing',asset).at(x,8)));`,
  );
  const session = await createProgramPreview(input, {
    watch: true,
    port: await freePort(),
  });
  sessions.push(session);
  const base = new URL(session.url).origin;
  const first = session.snapshot()!;
  expect(first.composition.layers[0]!.transform!.position).toEqual([4, 8]);
  expect(await (await fetch(base + first.assets.art!)).text()).toBe(original);
  await writeFile(helper, "export const x=9;");
  await expect
    .poll(() => session.snapshot()?.revision, { timeout: 6000 })
    .toBeGreaterThan(first.revision);
  const next = session.snapshot()!;
  expect(next.composition.layers[0]!.transform!.position).toEqual([9, 8]);
  await writeFile(art, "invalid image");
  await expect
    .poll(
      async () =>
        (
          (await (await fetch(base + "/composition/program")).json()) as {
            diagnostics: unknown[];
          }
        ).diagnostics.length,
      { timeout: 6000 },
    )
    .toBeGreaterThan(0);
  expect(session.snapshot()!.revision).toBe(next.revision);
  expect(await (await fetch(base + next.assets.art!)).text()).toBe(original);
  const repaired = original.replace("red", "blue");
  await writeFile(art, repaired);
  await expect
    .poll(() => session.snapshot()?.revision, { timeout: 6000 })
    .toBeGreaterThan(next.revision);
  expect(
    await (await fetch(base + session.snapshot()!.assets.art!)).text(),
  ).toBe(repaired);
  expect(
    (
      await fetch(
        base + "/composition/program-asset?revision=1&id=../../AGENTS.md",
      )
    ).status,
  ).toBe(404);
  expect(
    (await fetch(base + "/composition/program-asset?revision=999&id=art"))
      .status,
  ).toBe(404);
});
it("recovers an initially failed build after editing a successfully read image", async () => {
  const root = await directory(),
    input = join(root, "program.ts"),
    art = join(root, "art.svg");
  await writeFile(art, '<svg width="8" height="12"/>');
  await writeFile(
    input,
    `import{comp,solid}from'@still-shift/motion';import{imageAsset}from'@still-shift/motion/node';const art=await imageAsset('art',${JSON.stringify(art)});export default comp({width:64,height:64,fps:24,frames:24},c=>c.add(solid('box',{size:[art.width-8,8],color:'#223344'})));`,
  );
  const session = await createProgramPreview(input, {
    watch: true,
    port: await freePort(),
  });
  sessions.push(session);
  expect(session.snapshot()).toBeUndefined();
  const base = new URL(session.url).origin;
  expect(
    (await (await fetch(base + "/composition/program")).json()).diagnostics,
  ).toEqual([expect.objectContaining({ code: "comp-schema-range" })]);
  await writeFile(art, '<svg width="9" height="12"/>');
  await expect
    .poll(() => session.snapshot()?.composition.layers[0], { timeout: 6000 })
    .toMatchObject({ type: "solid", size: [1, 8] });
}, 10000);

it("recovers a failed edit after repairing a newly read font", async () => {
  const root = await directory(),
    input = join(root, "program.ts"),
    font = join(root, "font.ttf");
  await writeFile(
    input,
    `import{comp}from'@still-shift/motion';export default comp({width:64,height:64,fps:24,frames:24},()=>{});`,
  );
  const session = await createProgramPreview(input, {
    watch: true,
    port: await freePort(),
  });
  sessions.push(session);
  const first = session.snapshot()!;
  await writeFile(font, "initial font bytes");
  await writeFile(
    input,
    `import{comp}from'@still-shift/motion';import{fontAsset}from'@still-shift/motion/node';const font=await fontAsset('font',${JSON.stringify(font)});export default comp({width:64,height:64,fps:24,frames:font.sha256===${JSON.stringify(`sha256:${createHash("sha256").update("initial font bytes").digest("hex")}`)}?0:24},()=>{});`,
  );
  const base = new URL(session.url).origin;
  await expect
    .poll(
      async () =>
        (await (await fetch(base + "/composition/program")).json()).diagnostics,
      { timeout: 6000 },
    )
    .toEqual([expect.objectContaining({ code: "comp-schema-range" })]);
  expect(session.snapshot()!.revision).toBe(first.revision);
  await writeFile(font, "repaired font bytes");
  await expect
    .poll(() => session.snapshot()?.revision, { timeout: 6000 })
    .toBeGreaterThan(first.revision);
  expect(session.snapshot()!.composition.frameCount).toBe(24);
}, 10000);

it("recovers when an initially missing imported module is created", async () => {
  const root = await directory(),
    input = join(root, "program.ts"),
    helper = join(root, "missing.ts");
  await writeFile(
    input,
    `import{comp}from'@still-shift/motion';import{count}from'./missing.ts';export default comp({width:64,height:64,fps:24,frames:count},()=>{});`,
  );
  const session = await createProgramPreview(input, {
    watch: true,
    port: await freePort(),
  });
  sessions.push(session);
  expect(session.snapshot()).toBeUndefined();
  await writeFile(helper, "export const count=24;");
  await expect
    .poll(() => session.snapshot()?.composition.frameCount, { timeout: 6000 })
    .toBe(24);
});
it("recovers when an initially missing builder image asset is created", async () => {
  const root = await directory(),
    input = join(root, "program.ts"),
    art = join(root, "missing.svg");
  await writeFile(
    input,
    `import{comp,image}from'@still-shift/motion';import{imageAsset}from'@still-shift/motion/node';const asset=await imageAsset('art','./missing.svg',{relativeTo:import.meta.url});export default comp({width:64,height:64,fps:24,frames:24},c=>c.add(image('drawing',asset)));`,
  );
  const session = await createProgramPreview(input, {
    watch: true,
    port: await freePort(),
  });
  sessions.push(session);
  expect(session.snapshot()).toBeUndefined();
  await writeFile(
    art,
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="12"/>',
  );
  await expect
    .poll(() => session.snapshot()?.composition.assets[0]?.id, {
      timeout: 6000,
    })
    .toBe("art");
});

it("recovers after repairing an initially schema-invalid builder image asset", async () => {
  const root = await directory(),
    input = join(root, "program.ts"),
    art = join(root, "invalid.svg");
  await writeFile(art, '<svg width="0" height="12"/>');
  await writeFile(
    input,
    `import{comp,image}from'@still-shift/motion';import{imageAsset}from'@still-shift/motion/node';const asset=await imageAsset('art','./invalid.svg',{relativeTo:import.meta.url});export default comp({width:64,height:64,fps:24,frames:24},c=>c.add(image('drawing',asset)));`,
  );
  const session = await createProgramPreview(input, {
    watch: true,
    port: await freePort(),
  });
  sessions.push(session);
  expect(session.snapshot()).toBeUndefined();
  const base = new URL(session.url).origin;
  expect(
    (await (await fetch(base + "/composition/program")).json()).diagnostics,
  ).toEqual([expect.objectContaining({ code: "comp-builder-asset" })]);
  const repaired = '<svg width="8" height="12"/>';
  await writeFile(art, repaired);
  await expect
    .poll(() => session.snapshot()?.composition.assets[0], { timeout: 6000 })
    .toMatchObject({
      id: "art",
      width: 8,
      height: 12,
    });
  expect(
    await (await fetch(base + session.snapshot()!.assets.art!)).text(),
  ).toBe(repaired);
});

it("serves native JSON assets through a logical directory alias while watching canonical paths", async () => {
  const root = await directory(),
    physical = join(root, "physical", "nested"),
    alias = join(root, "alias"),
    art = join(root, "art.svg");
  await mkdir(physical, { recursive: true });
  await symlink(physical, alias, "dir");
  const original =
    '<svg width="8" height="12"><rect width="8" height="12" fill="red"/></svg>';
  await writeFile(art, original);
  const asset = await imageAsset("art", art),
    composition = comp({ width: 64, height: 64, fps: 24, frames: 24 }, (c) =>
      c.add(image("drawing", asset)),
    );
  composition.assets[0]!.path = relative(alias, await realpath(art));
  const input = join(alias, "native.json");
  await writeFile(input, JSON.stringify(composition));
  const session = await createProgramPreview(input, {
    watch: true,
    port: await freePort(),
  });
  sessions.push(session);
  const first = session.snapshot()!,
    base = new URL(session.url).origin;
  expect(first.input).toBe(input);
  expect(first.composition.assets[0]!.path).toBe(await realpath(art));
  expect(await (await fetch(base + first.assets.art!)).text()).toBe(original);
  composition.layers[0]!.transform!.position = [9, 8];
  await writeFile(input, JSON.stringify(composition));
  await expect
    .poll(() => session.snapshot()?.revision, { timeout: 6000 })
    .toBeGreaterThan(first.revision);
  expect(
    session.snapshot()!.composition.layers[0]!.transform!.position,
  ).toEqual([9, 8]);
  expect(
    await (await fetch(base + session.snapshot()!.assets.art!)).text(),
  ).toBe(original);
});

async function freePort(): Promise<number> {
  const probe = createPortProbe();
  await new Promise<void>((yes, no) => {
    probe.once("error", no);
    probe.listen(0, "127.0.0.1", yes);
  });
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  const port = address.port;
  await new Promise<void>((yes, no) =>
    probe.close((error) => (error ? no(error) : yes())),
  );
  return port;
}
it.each([
  ["./missing.js", "missing.ts"],
  ["./missing", "missing.ts"],
  ["./missing.mjs", "missing.mts"],
  ["./nested", "nested/index.ts"],
])(
  "recovers TypeScript resolution candidates for initially missing %s",
  async (specifier, helperName) => {
    const root = await directory(),
      input = join(root, "program.ts"),
      helper = join(root, helperName);
    await writeFile(
      input,
      `import{comp}from'@still-shift/motion';import{count}from${JSON.stringify(specifier)};export default comp({width:64,height:64,fps:24,frames:count},()=>{});`,
    );
    const session = await createProgramPreview(input, {
      watch: true,
      port: await freePort(),
    });
    sessions.push(session);
    expect(session.snapshot()).toBeUndefined();
    await mkdir(join(root, helperName.includes("/") ? "nested" : "."), {
      recursive: true,
    });
    await writeFile(helper, "export const count=24;");
    await expect
      .poll(() => session.snapshot()?.composition.frameCount, { timeout: 6000 })
      .toBe(24);
  },
);

it("rebuilds CommonJS helper and transitive JSON data edits", async () => {
  const root = await directory(),
    input = join(root, "program.cts"),
    helper = join(root, "helper.cts"),
    data = join(root, "data.json");
  await writeFile(data, JSON.stringify({ count: 24 }));
  await writeFile(
    helper,
    `const data=require('./data.json');export const count=data.count;`,
  );
  await writeFile(
    input,
    `const{count}=require('./helper.cts');export default {schemaVersion:'composition-1',id:'commonjs',width:64,height:64,fps:24,frameCount:count,layers:[],assets:[]};`,
  );
  const session = await createProgramPreview(input, {
    watch: true,
    port: await freePort(),
  });
  sessions.push(session);
  expect(session.snapshot()?.composition.frameCount).toBe(24);
  await writeFile(data, JSON.stringify({ count: 48 }));
  await expect
    .poll(() => session.snapshot()?.composition.frameCount, { timeout: 6000 })
    .toBe(48);
  await writeFile(helper, "export const count=72;");
  await expect
    .poll(() => session.snapshot()?.composition.frameCount, { timeout: 6000 })
    .toBe(72);
});

it.each(["./missing.cts", "./missing", "absolute"])(
  "recovers initially missing CommonJS dependency %s",
  async (specifier) => {
    const root = await directory(),
      input = join(root, "program.cts"),
      helper = join(
        root,
        specifier.endsWith(".cts") ? "missing.cts" : "missing.ts",
      );
    await writeFile(
      input,
      `const{count}=require(${JSON.stringify(specifier === "absolute" ? helper : specifier)});export default {schemaVersion:'composition-1',id:'commonjs',width:64,height:64,fps:24,frameCount:count,layers:[],assets:[]};`,
    );
    const session = await createProgramPreview(input, {
      watch: true,
      port: await freePort(),
    });
    sessions.push(session);
    expect(session.snapshot()).toBeUndefined();
    await writeFile(helper, "export const count=24;");
    await expect
      .poll(() => session.snapshot()?.composition.frameCount, { timeout: 6000 })
      .toBe(24);
  },
);

it("keeps retained native prepare captures and still assets through rebuilds and peer prepares", async () => {
  const root = await directory(),
    input = join(root, "composition.json");
  const art = '<svg width="8" height="12"/>';
  const voice = mediaFloat32Wave(8000, 2, () => 0.125);
  const hash = (bytes: string | Buffer) =>
    `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  await writeFile(join(root, "art.svg"), art);
  await writeFile(join(root, "voice.wav"), voice.wav);
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: "retained-native",
    width: 64,
    height: 64,
    fps: 24,
    frameCount: 4,
    assets: [
      {
        id: "art",
        type: "image",
        path: "art.svg",
        sha256: hash(art),
        width: 8,
        height: 12,
      },
      {
        id: "voice",
        type: "audio",
        path: "voice.wav",
        sha256: hash(voice.wav),
        sampleRate: 48000,
        sampleCount: 8000,
        channels: 2,
      },
    ],
    layers: [
      {
        id: "drawing",
        type: "image",
        size: [8, 12],
        sources: [{ asset: "art" }],
      },
      { id: "voice", type: "audio", asset: "voice" },
    ],
  };
  await writeFile(input, JSON.stringify(composition));
  const session = await createProgramPreview(input, { port: await freePort() });
  sessions.push(session);
  const first = session.snapshot()!;
  expect(first.preparedAudio).toBeDefined();
  const base = new URL(session.url).origin;
  const socket = new WebSocket(
    `${base.replace("http:", "ws:")}/?token=${session.server.config.webSocketToken}`,
    "vite-hmr",
  );
  try {
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("Preview websocket failed")),
        { once: true },
      );
    });
    const leases: string[] = [];
    for (let index = 0; index < 4; index++) {
      const request = String(index);
      leases.push(
        await new Promise<string>((resolve, reject) => {
          const receive = (event: MessageEvent) => {
            const payload = JSON.parse(String(event.data));
            if (
              payload.event !== "composition-program:retained" ||
              payload.data.request !== request
            )
              return;
            socket.removeEventListener("message", receive);
            if (payload.data.lease) resolve(payload.data.lease);
            else reject(new Error(JSON.stringify(payload.data.diagnostics)));
          };
          socket.addEventListener("message", receive);
          socket.send(
            JSON.stringify({
              type: "custom",
              event: "composition-program:retain",
              data: { request, revision: first.revision },
            }),
          );
        }),
      );
    }
    for (let index = 0; index < 3; index++) {
      composition.layers[0]!.transform = { position: [index + 1, 0] };
      await writeFile(input, JSON.stringify(composition));
      await session.rebuild();
    }
    expect(session.snapshot()!.revision).toBe(first.revision + 3);
    expect((await fetch(base + first.assets.art!)).status).toBe(404);
    const captures: Record<string, string>[] = [];
    for (const lease of leases) {
      const response = await fetch(base + "/composition/program-prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-still-shift-composition": "1",
        },
        body: JSON.stringify({
          revision: first.revision,
          document: first.document,
          lease,
        }),
      });
      expect(response.status).toBe(200);
      const prepared = await response.json();
      expect(prepared.preparedAudio).toBeDefined();
      captures.push(prepared.assets);
    }
    for (const assets of captures) {
      expect(await (await fetch(base + assets.art!)).text()).toBe(art);
      const master = await fetch(base + assets["__audio:mix"]!);
      expect(master.status).toBe(200);
      expect(Buffer.from(await master.arrayBuffer()).subarray(58)).toEqual(
        voice.pcm,
      );
    }
  } finally {
    socket.close();
  }
}, 30000);

it("retains each native capture until its candidate or program owner releases it", async () => {
  const root = await directory(),
    input = join(root, "composition.json");
  const hash = (bytes: Buffer) =>
    `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const frames: string[] = [];
  for (let frame = 0; frame < 2; frame++) {
    const rgba = Buffer.alloc(8 * 8 * 4, frame ? 255 : 128);
    const png = mediaRgbaPng(8, 8, rgba, [
      mediaPngChunk("sRGB", Buffer.from([0])),
    ]);
    frames.push(hash(png));
    await writeFile(join(root, `frame-${frame}.png`), png);
  }
  const manifest = Buffer.from(
    JSON.stringify({ schemaVersion: "composition-sequence-1", frames }),
  );
  await writeFile(join(root, "manifest.json"), manifest);
  const composition: Composition = {
    schemaVersion: "composition-1",
    id: "owned-captures",
    width: 64,
    height: 64,
    fps: 24,
    frameCount: 2,
    assets: [
      {
        id: "frames",
        type: "sequence",
        path: "frame-%01d.png",
        manifestPath: "manifest.json",
        firstFrame: 0,
        sha256: hash(manifest),
        width: 8,
        height: 8,
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
    layers: [{ id: "movie", type: "sequence", asset: "frames" }],
    mediaLimits: { decodedFrameBytes: 8 * 8 * 4 },
  };
  await writeFile(input, JSON.stringify(composition));
  const session = await createProgramPreview(input, { port: await freePort() });
  sessions.push(session);
  const first = session.snapshot()!,
    base = new URL(session.url).origin;
  const socket = new WebSocket(
    `${base.replace("http:", "ws:")}/?token=${session.server.config.webSocketToken}`,
    "vite-hmr",
  );
  try {
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("Preview websocket failed")),
        { once: true },
      );
    });
    const retain = (request: string) =>
      new Promise<string>((resolve, reject) => {
        const receive = (event: MessageEvent) => {
          const payload = JSON.parse(String(event.data));
          if (
            payload.event !== "composition-program:retained" ||
            payload.data.request !== request
          )
            return;
          socket.removeEventListener("message", receive);
          if (payload.data.lease) resolve(payload.data.lease);
          else reject(new Error(JSON.stringify(payload.data.diagnostics)));
        };
        socket.addEventListener("message", receive);
        socket.send(
          JSON.stringify({
            type: "custom",
            event: "composition-program:retain",
            data: { request, revision: first.revision },
          }),
        );
      });
    const lease = await retain("active"),
      peer = await retain("peer");
    const post = (endpoint: string, body: unknown) =>
      fetch(base + endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-still-shift-composition": "1",
        },
        body: JSON.stringify(body),
      });
    const prepare = async (owner?: string) => {
      const response = await post("/composition/program-prepare", {
        revision: first.revision,
        lease: owner,
        document: first.document,
      });
      expect(response.status).toBe(200);
      return (await response.json()) as {
        capture: string;
        assets: Record<string, string>;
      };
    };
    const cancelled = randomUUID();
    const delayedBody = JSON.stringify({
      revision: first.revision,
      lease,
      capture: cancelled,
      document: first.document,
    });
    let delayedRequest: ReturnType<typeof httpRequest>;
    const delayedResponse = new Promise<number>((resolve, reject) => {
      delayedRequest = httpRequest(
        base + "/composition/program-prepare",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(delayedBody),
            "x-still-shift-composition": "1",
          },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode!);
        },
      );
      delayedRequest.on("error", reject);
      delayedRequest.flushHeaders();
      delayedRequest.write(delayedBody.slice(0, 12));
    });
    expect(
      (
        await post("/composition/program-capture-release", {
          revision: first.revision,
          lease,
          capture: cancelled,
        })
      ).status,
    ).toBe(204);
    delayedRequest!.end(delayedBody.slice(12));
    expect(await delayedResponse).toBe(409);
    const captures = [
      await prepare(lease),
      await prepare(lease),
      await prepare(lease),
    ];
    const peerCapture = await prepare(peer);
    const frameUrl = (capture: (typeof captures)[number]) =>
      base + capture.assets["__media:frames:1"]!;
    // This frame has not been loaded by the active preview, so retaining its first pixels is insufficient.
    for (const capture of captures)
      expect((await fetch(frameUrl(capture))).status).toBe(200);
    const release = {
      revision: first.revision,
      lease,
      capture: captures[1]!.capture,
    };
    expect(
      (
        await post("/composition/program-capture-release", {
          ...release,
          lease: peer,
        })
      ).status,
    ).toBe(403);
    expect((await fetch(frameUrl(captures[1]!))).status).toBe(200);
    expect(
      (await post("/composition/program-capture-release", release)).status,
    ).toBe(204);
    expect(
      (await post("/composition/program-capture-release", release)).status,
    ).toBe(204);
    expect((await fetch(frameUrl(captures[1]!))).status).toBe(404);
    expect((await fetch(frameUrl(captures[0]!))).status).toBe(200);
    // Unleased API clients receive the same releasable handle.
    const unleased = await prepare();
    expect(
      (
        await post("/composition/program-capture-release", {
          revision: first.revision,
          capture: unleased.capture,
        })
      ).status,
    ).toBe(204);
    expect((await fetch(frameUrl(unleased))).status).toBe(404);
    // Exhausting the bounded pool rejects a new candidate without touching live previews.
    const pool: Awaited<ReturnType<typeof prepare>>[] = [];
    for (let index = 0; index < 61; index++) pool.push(await prepare(lease));
    const prepareBody = {
      revision: first.revision,
      lease,
      document: first.document,
    };
    expect(
      (await post("/composition/program-prepare", prepareBody)).status,
    ).toBe(409);
    expect((await fetch(frameUrl(captures[0]!))).status).toBe(200);
    const freeSlot = async () => {
      expect(
        (
          await post("/composition/program-capture-release", {
            revision: first.revision,
            lease,
            capture: pool.pop()!.capture,
          })
        ).status,
      ).toBe(204);
    };
    await freeSlot();
    pool.push(await prepare(lease));
    await freeSlot();
    const nativePrepare = animation.prepareCompositionMedia;
    const holdUntilCancelled = () => {
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const spy = vi
        .spyOn(animation, "prepareCompositionMedia")
        .mockImplementationOnce(async (document, root, options) => {
          entered();
          await new Promise<void>((resolve) => {
            options!.signal!.addEventListener("abort", () => resolve(), {
              once: true,
            });
          });
          return nativePrepare(document, root, options);
        });
      return { started, spy };
    };
    const cancelledWork = holdUntilCancelled();
    const abort = new AbortController();
    const aborted = fetch(base + "/composition/program-prepare", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-still-shift-composition": "1",
      },
      body: JSON.stringify(prepareBody),
      signal: abort.signal,
    });
    try {
      await cancelledWork.started;
      expect(
        (await post("/composition/program-prepare", prepareBody)).status,
      ).toBe(409);
      abort.abort();
      await expect(aborted).rejects.toThrow();
      await expect
        .poll(
          async () =>
            (await post("/composition/program-prepare", prepareBody)).status,
        )
        .toBe(200);
    } finally {
      abort.abort();
      cancelledWork.spy.mockRestore();
    }
    await freeSlot();
    const releasedWork = holdUntilCancelled();
    const releasedCapture = randomUUID();
    const releasedResponse = post("/composition/program-prepare", {
      ...prepareBody,
      capture: releasedCapture,
    });
    await releasedWork.started;
    socket.send(
      JSON.stringify({
        type: "custom",
        event: "composition-program:release",
        data: { lease },
      }),
    );
    await expect
      .poll(async () => (await fetch(frameUrl(captures[0]!))).status)
      .toBe(404);
    try {
      expect((await releasedResponse).status).not.toBe(200);
      expect(
        (
          await fetch(
            base +
              `/composition/program-asset?revision=${first.revision}&lease=${lease}&capture=${releasedCapture}&id=__media:frames:1`,
          )
        ).status,
      ).toBe(404);
    } finally {
      releasedWork.spy.mockRestore();
    }
    expect((await fetch(frameUrl(peerCapture))).status).toBe(200);
    expect(
      (await post("/composition/program-prepare", prepareBody)).status,
    ).toBe(409);
    const recovered = await prepare(peer);
    expect((await fetch(frameUrl(recovered))).status).toBe(200);
    // A bounded cancellation pool blocks only the saturated owner; live frames survive.
    for (let index = 0; index < 129; index++)
      expect(
        (
          await post("/composition/program-capture-release", {
            revision: first.revision,
            lease: peer,
            capture: randomUUID(),
          })
        ).status,
      ).toBe(204);
    expect(
      (
        await post("/composition/program-prepare", {
          ...prepareBody,
          lease: peer,
        })
      ).status,
    ).toBe(409);
    expect((await fetch(frameUrl(peerCapture))).status).toBe(200);
    const unaffected = await prepare(await retain("unaffected"));
    expect((await fetch(frameUrl(unaffected))).status).toBe(200);
    socket.close();
    await expect
      .poll(async () => (await fetch(frameUrl(peerCapture))).status)
      .toBe(404);
  } finally {
    socket.close();
  }
}, 30000);
