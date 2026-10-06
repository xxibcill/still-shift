import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertPinnedRenderEnvironment,
  launchRenderBrowser,
  probeRenderEnvironment,
  type RenderBrowserProfile,
} from "@still-shift/execution-runtime/render-browser";
import { SIDE, referenceCases, referencePixels } from "./reference.ts";
import { SHADOW_MODEL } from "./model.ts";
import { drawVisibility, shaderInput } from "./shader.ts";
import { maximumInputFixture, nearCollinearFixture } from "./fixtures.ts";

const hash = (pixels: number[] | Buffer) =>
  createHash("sha256").update(Buffer.from(pixels)).digest("hex");
assert.equal(process.versions.node, "22.23.1", "use the pinned Node toolchain");
const output = resolve("benchmarks/results/ce8lf-prototype");
const originalCases = referenceCases();
const cases = [...originalCases, ...referenceCases(true)];
const references = cases.map(({ id, scene }) => ({
  id,
  pixels: referencePixels(scene),
}));
for (const [name, selected] of [
  ["reference", references.slice(0, originalCases.length)],
  ["solid-reference", references.slice(originalCases.length)],
] as const) {
  const reference = {
    model: SHADOW_MODEL,
    side: SIDE,
    cases: selected.map(({ id, pixels }) => ({ id, hash: hash(pixels) })),
  };
  const baselinePath = resolve(
    `tests/visual/cast-shadow-prototype/${name}.json`,
  );
  if (process.argv.includes(`--initialize-${name}`)) {
    // First creation only. A check never writes or repairs a frozen reference.
    await mkdir(resolve("tests/visual/cast-shadow-prototype"), {
      recursive: true,
    });
    await writeFile(baselinePath, JSON.stringify(reference, null, 2) + "\n", {
      flag: "wx",
    });
  } else {
    assert.deepEqual(
      JSON.parse(await readFile(baselinePath, "utf8")),
      reference,
      `frozen ${name} changed`,
    );
  }
}
await mkdir(output, { recursive: true });
const rows: string[] = [];
const orders = {
  forward: cases.map((_, i) => i),
  reverse: cases.map((_, i) => cases.length - 1 - i),
  // 37 is coprime with 96; covers every case once in a non-sequential order.
  random: cases.map((_, i) => (i * 37 + 13) % cases.length),
};
assert.equal(new Set(orders.random).size, cases.length);
const pinnedHashes = new Map<string, { rgba: string; png: string }>();
const maximumScene = maximumInputFixture();
const maximumReference = referencePixels(maximumScene);
const nearCollinearScene = nearCollinearFixture();
assert.throws(
  () => shaderInput(nearCollinearScene, SIDE),
  /shadow-prototype-input: ill-conditioned plane/,
  "near-collinear input must fail before any GPU draw",
);

async function probe(profile: RenderBrowserProfile, repeat: boolean) {
  const browser = await launchRenderBrowser({ profile });
  try {
    const page = await browser.newPage();
    // tsx names nested callbacks with a helper; match the existing browser harness.
    await page.addInitScript("window.__name = (fn) => fn;");
    await page.goto("about:blank");
    const environment = await probeRenderEnvironment(page, profile);
    assert.equal(environment.browserVersion, "151.0.7922.34");
    if (profile === "pinned") assertPinnedRenderEnvironment(environment);
    else
      assert.ok(
        !environment.webglRenderer.includes("SwiftShader"),
        "hardware must be actual GPU",
      );
    let maxDelta = 0,
      draws = 0;
    const sequence =
      profile === "hardware"
        ? { forward: orders.forward.filter((i) => i % 8 === 0) }
        : repeat
          ? { forward: orders.forward }
          : orders;
    for (const [order, indices] of Object.entries(sequence))
      for (const index of indices) {
        const item = cases[index]!;
        const result = await page.evaluate(
          drawVisibility,
          shaderInput(item.scene, SIDE),
        );
        assert.equal(result.renderer, environment.webglRenderer);
        const delta = Math.max(
          ...result.pixels.map((byte, channel) =>
            Math.abs(byte - references[index]!.pixels[channel]!),
          ),
        );
        assert.ok(
          delta <= 1,
          `${profile} ${item.id}: CPU delta ${delta} exceeds 1`,
        );
        maxDelta = Math.max(delta, maxDelta);
        draws++;
        const digest = {
          rgba: hash(result.pixels),
          png: hash(Buffer.from(result.png.split(",")[1]!, "base64")),
        };
        if (profile === "pinned") {
          if (repeat || order !== "forward")
            assert.deepEqual(
              digest,
              pinnedHashes.get(item.id),
              `${order}/independent repeat differs: ${item.id}`,
            );
          else pinnedHashes.set(item.id, digest);
        }
        if (
          item.id.startsWith("disabled/") ||
          item.id.startsWith("precomp-isolation/")
        )
          assert.deepEqual(
            result.pixels,
            references[index]!.pixels,
            "bypass visibility must be exactly white",
          );
        if (
          profile === "pinned" &&
          !repeat &&
          index % 8 === 0 &&
          order === "forward"
        ) {
          const filename = item.id.replace("/", "-") + ".png";
          await writeFile(
            resolve(output, filename),
            Buffer.from(result.png.split(",")[1]!, "base64"),
          );
          rows.push(
            `<figure><img src="${filename}" width="192" height="192"/><figcaption>${item.id.split("/")[0]}</figcaption></figure>`,
          );
        }
      }
    const maximum = await page.evaluate(
      drawVisibility,
      shaderInput(maximumScene, SIDE),
    );
    const maximumDelta = Math.max(
      ...maximum.pixels.map((value, index) =>
        Math.abs(value - maximumReference[index]!),
      ),
    );
    assert.ok(
      maximumDelta <= 1,
      `maximum-input CPU delta ${maximumDelta} exceeds 1`,
    );
    const maximumDigest = {
      rgba: hash(maximum.pixels),
      png: hash(Buffer.from(maximum.png.split(",")[1]!, "base64")),
    };
    if (profile === "pinned") {
      if (repeat)
        assert.deepEqual(maximumDigest, pinnedHashes.get("maximum-input"));
      else pinnedHashes.set("maximum-input", maximumDigest);
    }
    return {
      environment,
      draws,
      maxDelta,
      maximumInput: {
        casters: 8,
        samples: 16,
        textureSide: 64,
        maxDelta: maximumDelta,
      },
      result: "pass",
      repeat,
    };
  } finally {
    await browser.close();
  }
}

// Small correctness probes, serial. No timing/throughput benchmark is hidden here.
const pinned = await probe("pinned", false);
const repeated = await probe("pinned", true);
const hardware = await probe("hardware", false);
assert.equal(
  repeated.environment.rasterFingerprint,
  pinned.environment.rasterFingerprint,
);
const sourceFiles = [
  "model.ts",
  "fixtures.ts",
  "reference.ts",
  "shader.ts",
  "verify.ts",
];
const sources = await Promise.all(
  sourceFiles.map(async (name) => ({
    name,
    hash: hash(await readFile(new URL(name, import.meta.url))),
  })),
);
const report = {
  model: SHADOW_MODEL,
  scope:
    "isolated direct-visibility shader; not production assets, CE7 integration or MP4 export",
  dimensions: [SIDE, SIDE],
  node: process.versions.node,
  sourceHashes: sources,
  inputHash: hash(Buffer.from(JSON.stringify(cases))),
  maximumInputHash: hash(Buffer.from(JSON.stringify(maximumScene))),
  rejectedNearCollinearInput: {
    hash: hash(Buffer.from(JSON.stringify(nearCollinearScene))),
    diagnostic: "shadow-prototype-input: ill-conditioned plane",
    result: "pass",
  },
  referenceCount: references.length,
  toleranceBytes: 1,
  pinned,
  repeated,
  hardware,
  pinnedHashes: Object.fromEntries(pinnedHashes),
  performanceMeasured: false,
};
await writeFile(
  resolve(output, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
await writeFile(
  resolve(output, "gallery.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>Cast-shadow candidate 1</title><style>body{font:16px system-ui;background:#eee9df;color:#292c30;margin:48px;max-width:960px}h1{font-size:32px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}figure{margin:0;background:white;padding:16px}img{width:100%;height:auto;image-rendering:pixelated}figcaption{margin-top:12px}p{line-height:1.6}</style><h1>Bounded cast-shadow candidate 1</h1><p>White = direct light visible; black = blocked. These are 64×64 alpha-plane experiments, not production artwork or native asset acceptance. ${references.length} reference poses; pinned/repeated/hardware comparisons pass within one byte.</p><main>${rows.join("\n")}</main></html>`,
);
const galleryBrowser = await launchRenderBrowser();
try {
  const page = await galleryBrowser.newPage({
    viewport: { width: 1040, height: 1500 },
  });
  await page.goto(pathToFileURL(resolve(output, "gallery.html")).href);
  await page.screenshot({
    path: resolve(output, "gallery.png"),
    fullPage: true,
  });
} finally {
  await galleryBrowser.close();
}

console.log(
  JSON.stringify(
    {
      referenceCount: references.length,
      pinned: pinned.draws,
      repeated: repeated.draws,
      hardware: hardware.draws,
      maxDelta: [pinned.maxDelta, repeated.maxDelta, hardware.maxDelta],
      output,
    },
    null,
    2,
  ),
);
