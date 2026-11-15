// ET1: exact-copy font coverage on the composition route
// (docs/editorial-typography-improvement-plan.md#et1--exact-copy-font-coverage-gate).
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { runCli } from "../../tools/still-shift-cli/src/cli.ts";
import { compositionFontFallbacks } from "../../packages/renderer-core/src/composition/font-coverage.ts";
import type { Composition } from "@still-shift/scene-contract";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function directory() {
  const root = await mkdtemp(join(tmpdir(), "composition-font-coverage-"));
  directories.push(root);
  return root;
}
async function run(args: string[]) {
  let stdout = "",
    stderr = "";
  const code = await runCli(["comp", ...args], {
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });
  return { code, stdout, stderr };
}
async function font(id: string, path: string, extra: object = {}) {
  const absolute = resolve(path);
  const bytes = await readFile(absolute);
  return {
    id,
    type: "font",
    path: absolute,
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    ...extra,
  };
}
const plex = () =>
  font("sans", "assets/story-motion/fonts/plex-sans-semibold.ttf", {
    weight: "600",
  });
const noto = (extra: object = {}) =>
  font("thai", "assets/ecommerce-motion/fonts/noto-sans-thai.ttf", {
    weight: "400",
    variable: {
      wght: { min: 100, default: 400, max: 900 },
      wdth: { min: 62.5, default: 100, max: 100 },
    },
    ...extra,
  });
const transform = {
  anchor: [0, 0],
  position: [40, 280],
  scale: [1, 1],
  rotation: 0,
  opacity: 1,
};
function textLayer(id: string, value: string, fontAsset: string, extra = {}) {
  return {
    id,
    transform,
    type: "text",
    text: value,
    fontSize: 96,
    color: "#1D2410",
    fontAsset,
    locale: "th",
    anchor: "baseline",
    ...extra,
  };
}
async function write(composition: object) {
  const root = await directory(),
    input = join(root, "composition.json");
  await writeFile(
    input,
    JSON.stringify({
      schemaVersion: "composition-1",
      id: "composition",
      width: 720,
      height: 360,
      frameCount: 2,
      fps: 24,
      background: "#F4EFE2",
      ...composition,
    }),
  );
  return { root, input };
}
/** The ET0 O5 fixture: Thai copy in pinned IBM Plex Sans only. */
async function o5(extra: object = {}) {
  return write({
    assets: [await plex()],
    layers: [
      textLayer("mixed", "3 ลุค · OLIVE GREEN", "sans", {
        fontSize: 56,
        transform: { ...transform, position: [40, 110] },
      }),
      textLayer("thai-only", "ลุค", "sans"),
    ],
    ...extra,
  });
}
const thaiMissing = [0x0e04, 0x0e25, 0x0e38];

it("fails the O5 Plex + Thai negative in strict validation before render", async () => {
  const { root, input } = await o5();
  const validated = await run([
    "validate",
    "--input",
    input,
    "--font-coverage",
    "strict",
  ]);
  expect(validated.code).toBe(1);
  const findings = JSON.parse(validated.stderr).diagnostics;
  expect(findings).toEqual([
    expect.objectContaining({
      code: "font-coverage",
      severity: "error",
      node: "mixed",
      path: "layers[0].text",
      fontId: "sans",
      fontSha256: expect.stringMatching(/^sha256:a20caf82/u),
      missingCodepoints: thaiMissing,
      message: expect.stringContaining(
        'Font sans lacks U+0E04, U+0E25, U+0E38 in layer "mixed"',
      ),
    }),
    expect.objectContaining({
      code: "font-coverage",
      node: "thai-only",
      path: "layers[1].text",
      missingCodepoints: thaiMissing,
    }),
  ]);
  const output = join(root, "out.mp4");
  const rendered = await run([
    "render",
    "--input",
    input,
    "--output",
    output,
    "--font-coverage",
    "strict",
  ]);
  expect(rendered.code).toBe(2);
  expect(JSON.parse(rendered.stderr).error.context.diagnosticsJson).toContain(
    '"font-coverage"',
  );
  await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
});

it("lets the composition itself require strict coverage", async () => {
  const { input } = await o5({ fontCoverage: "strict" });
  const validated = await run(["validate", "--input", input]);
  expect(validated.code).toBe(1);
  expect(JSON.parse(validated.stderr).diagnostics).toHaveLength(2);
  // The CLI can raise the profile but never lower a composition's declaration.
  const lowered = await run([
    "validate",
    "--input",
    input,
    "--font-coverage",
    "legacy",
  ]);
  expect(lowered.code).toBe(1);
});

it("keeps legacy compositions valid and reports the gap as a warning", async () => {
  const { input } = await o5();
  const validated = await run(["validate", "--input", input]);
  expect(validated.code).toBe(0);
  const result = JSON.parse(validated.stdout);
  expect(result.status).toBe("valid");
  expect(result.diagnostics).toEqual([
    expect.objectContaining({
      code: "font-coverage",
      severity: "warning",
      path: "layers[0].text",
    }),
    expect.objectContaining({
      code: "font-coverage",
      severity: "warning",
      path: "layers[1].text",
    }),
  ]);
  expect(result.fontCoverage).toMatchObject({
    profile: "legacy",
    covered: false,
    fonts: [
      {
        id: "sans",
        family: "IBM Plex Sans",
        subfamily: expect.any(String),
        weight: 600,
        style: "normal",
        cmapFormats: expect.arrayContaining([4]),
      },
    ],
  });
});

async function strict(composition: object) {
  const { input } = await write({ fontCoverage: "strict", ...composition });
  const result = await run(["validate", "--input", input]);
  return {
    code: result.code,
    output: result.code ? undefined : JSON.parse(result.stdout),
    findings: result.code
      ? (JSON.parse(result.stderr).diagnostics as Record<string, unknown>[])
      : [],
  };
}

it("passes the Noto Sans Thai mixed tag control strictly", async () => {
  const result = await strict({
    assets: [await noto()],
    layers: [textLayer("mixed", "3 ลุค · OLIVE GREEN", "thai")],
  });
  expect(result.findings).toEqual([]);
  expect(result.output.diagnostics).toEqual([]);
  expect(result.output.fontCoverage).toMatchObject({
    profile: "strict",
    covered: true,
    fallbackRuns: [],
    fonts: [
      expect.objectContaining({
        id: "thai",
        family: "Noto Sans Thai",
        axes: expect.objectContaining({
          wght: { min: 100, default: 400, max: 900 },
        }),
      }),
    ],
  });
});

it("checks every state, generated count string and correction", async () => {
  const states = await strict({
    assets: [await plex()],
    layers: [textLayer("tag", "OLIVE", "sans", { states: ["OLIVE", "ลุค"] })],
  });
  expect(states.findings).toEqual([
    expect.objectContaining({
      code: "font-coverage",
      path: "layers[0].states[1]",
      layer: "tag",
      missingCodepoints: thaiMissing,
    }),
  ]);
  // Thai digits exist only in the generated count text, never in a state.
  const count = await strict({
    assets: [await plex()],
    textStyles: { figures: { fontAsset: "sans", figures: "tabular" } },
    layers: [
      textLayer("count", "0", "sans", {
        style: "figures",
        locale: "th-u-nu-thai",
        states: ["0", "9"],
        transitions: [
          { kind: "count", window: { start: 0, end: 1 }, toState: 1 },
        ],
      }),
    ],
  });
  expect(count.findings).toEqual(
    [0x0e50, 0x0e59].map((codePoint) =>
      expect.objectContaining({
        code: "font-coverage",
        path: "layers[0].transitions[0]",
        missingCodepoints: [codePoint],
      }),
    ),
  );
  const correction = await strict({
    assets: [await plex()],
    layers: [
      textLayer("fix", "OLIVE", "sans", {
        corrections: [{ replacement: "ลุค", start: 0, end: 1 }],
      }),
    ],
  });
  expect(correction.findings).toEqual([
    expect.objectContaining({
      path: "layers[0].corrections[0].replacement",
      layer: "fix",
      missingCodepoints: thaiMissing,
    }),
  ]);
});

it("checks spans with their own fonts and precomp layers", async () => {
  const spans = await strict({
    assets: [await noto(), await plex()],
    textStyles: { latin: { fontAsset: "sans" } },
    layers: [
      textLayer("tag", "ลุค OLIVE", "thai", {
        spans: [
          { id: "word", start: 0, end: 2, style: "latin" },
          { id: "rest", start: 3, end: 8, style: "latin" },
        ],
      }),
    ],
  });
  expect(spans.findings).toEqual([
    expect.objectContaining({
      code: "font-coverage",
      fontId: "sans",
      span: "word",
      layer: "tag",
      missingCodepoints: thaiMissing,
      message: expect.stringContaining('span "word"'),
    }),
  ]);
  const precomp = await strict({
    assets: [await plex()],
    precomps: [
      {
        id: "card",
        width: 720,
        height: 360,
        frameCount: 2,
        layers: [textLayer("thai", "ลุค", "sans")],
      },
    ],
    layers: [{ id: "card-layer", type: "precomp", comp: "card", transform }],
  });
  expect(precomp.findings).toEqual([
    expect.objectContaining({
      path: "precomps[0].layers[0].text",
      layer: "card/thai",
      message: expect.stringContaining('in layer "card/thai"'),
    }),
  ]);
});

it("applies the documented control, mark and space rules", async () => {
  // ZWJ, ZWNJ, ZWSP, bidi marks, tab and newline need no glyph of their own.
  const controls = await strict({
    assets: [await noto()],
    layers: [textLayer("tag", "ลุ‍ค‌ ​OLIVE‎\t", "thai")],
  });
  expect(controls.findings).toEqual([]);
  // Combining marks and every other space are ordinary code points.
  const marks = await strict({
    assets: [await plex()],
    layers: [textLayer("tag", "Aุ　B", "sans")],
  });
  expect(marks.findings).toEqual([
    expect.objectContaining({ missingCodepoints: [0x0e38, 0x3000] }),
  ]);
});

it("reports malformed font tables clearly without rejecting legacy inputs", async () => {
  const root = await directory(),
    path = join(root, "truncated.ttf");
  const bytes = (
    await readFile(resolve("assets/story-motion/fonts/plex-sans-semibold.ttf"))
  ).subarray(0, 64);
  await writeFile(path, bytes);
  const broken = {
    id: "sans",
    type: "font",
    path,
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    weight: "600",
  };
  const layers = [textLayer("tag", "OLIVE", "sans")];
  const failed = await strict({ assets: [broken], layers });
  expect(failed.findings).toEqual([
    expect.objectContaining({
      code: expect.stringMatching(/^font-/u),
      path: "assets[0]",
      fontId: "sans",
      message: expect.stringContaining("Font sans cannot be inspected"),
    }),
  ]);
  const { input } = await write({ assets: [broken], layers });
  const legacy = await run(["validate", "--input", input]);
  expect(legacy.code).toBe(0);
  expect(JSON.parse(legacy.stdout)).toMatchObject({
    diagnostics: [expect.objectContaining({ severity: "warning" })],
    fontCoverage: { covered: false, fonts: [] },
  });
});

it("never reports uninspected copy as covered", async () => {
  // Nine counting layers generate more resolved runs than the inspection budget.
  const frames = 10000;
  const { input } = await write({
    frameCount: frames,
    assets: [await plex()],
    textStyles: { figures: { fontAsset: "sans", figures: "tabular" } },
    layers: Array.from({ length: 9 }, (_, i) =>
      textLayer(`count${i}`, "0", "sans", {
        style: "figures",
        locale: "en",
        states: ["0", "99990"],
        transitions: [
          { kind: "count", window: { start: 0, end: frames - 2 }, toState: 1 },
        ],
      }),
    ),
  });
  const legacy = await run(["validate", "--input", input]);
  expect(legacy.code).toBe(0);
  const output = JSON.parse(legacy.stdout);
  expect(output.diagnostics).toEqual([
    expect.objectContaining({ code: "font-copy-budget", severity: "warning" }),
  ]);
  expect(output.fontCoverage).toMatchObject({ covered: false, runs: 0 });
});

it("resolves missing code points through declared pinned fallbacks only", async () => {
  const withFallback = await strict({
    assets: [
      await plex().then((f) => ({ ...f, fallbacks: ["thai"] })),
      await noto(),
    ],
    layers: [
      textLayer("mixed", "3 ลุค · OLIVE GREEN", "sans"),
      textLayer("latin", "OLIVE", "sans"),
    ],
  });
  expect(withFallback.findings).toEqual([]);
  expect(withFallback.output.fontCoverage).toMatchObject({
    covered: true,
    fallbackResolution: "declared-unicode-range",
    fallbackRuns: [
      {
        layer: "mixed",
        path: "layers[0].text",
        font: "sans",
        fallback: "thai",
        fallbackSha256: expect.stringMatching(/^sha256:/u),
        codePoints: ["U+0E04", "U+0E25", "U+0E38"],
      },
    ],
  });
  // A cluster may not be split between its font and a fallback.
  const split = await strict({
    assets: [
      await plex().then((f) => ({ ...f, fallbacks: ["thai"] })),
      await noto(),
    ],
    layers: [textLayer("tag", "Aุ", "sans")],
  });
  expect(split.findings).toEqual([
    expect.objectContaining({ code: "font-fallback-cluster", layer: "tag" }),
  ]);
  for (const [fallbacks, code] of [
    [["sans"], "comp-font-fallback"],
    [["thai", "thai"], "comp-font-fallback"],
    [["missing"], "comp-asset-missing"],
  ] as const) {
    const invalid = await strict({
      assets: [await plex().then((f) => ({ ...f, fallbacks })), await noto()],
      layers: [textLayer("tag", "OLIVE", "sans")],
    });
    expect(invalid.findings).toEqual([
      expect.objectContaining({
        code,
        path: expect.stringContaining("fallbacks"),
      }),
    ]);
  }
});

it("plans fallbacks in the browser around fonts legacy only warns about", async () => {
  // Plex with every cmap encoding record rewritten to Mac Roman: the browser
  // can load it, but it has no Unicode format 4 or 12 subtable.
  const plexBytes = await readFile(
    resolve("assets/story-motion/fonts/plex-sans-semibold.ttf"),
  );
  const macOnly = Buffer.from(plexBytes);
  for (let i = 0; i < macOnly.readUInt16BE(4); i++) {
    const record = 12 + i * 16;
    if (macOnly.toString("latin1", record, record + 4) !== "cmap") continue;
    const table = macOnly.readUInt32BE(record + 8);
    for (let j = 0; j < macOnly.readUInt16BE(table + 2); j++) {
      macOnly.writeUInt16BE(1, table + 4 + j * 8);
      macOnly.writeUInt16BE(0, table + 6 + j * 8);
    }
  }
  const root = await directory(),
    path = join(root, "mac-only.ttf");
  await writeFile(path, macOnly);
  const assets = [
    await plex().then((f) => ({ ...f, fallbacks: ["thai"] })),
    await noto(),
    await font("mac", path, { weight: "600" }),
  ];
  const layers = [
    textLayer("mixed", "3 ลุค · OLIVE GREEN", "sans"),
    textLayer("other", "OLIVE", "mac"),
  ];
  const { input } = await write({ assets, layers });
  const legacy = await run(["validate", "--input", input]);
  expect(legacy.code).toBe(0);
  expect(JSON.parse(legacy.stdout).diagnostics).toEqual([
    expect.objectContaining({
      code: "font-cmap-unsupported",
      severity: "warning",
      fontId: "mac",
    }),
  ]);
  const bytes = new Map<string, ArrayBuffer>();
  for (const asset of assets)
    bytes.set(asset.id, Uint8Array.from(await readFile(asset.path)).buffer);
  const composition = JSON.parse(await readFile(input, "utf8")) as Composition;
  expect([...compositionFontFallbacks(composition, bytes)]).toEqual([
    ["sans", [{ fallback: "thai", codePoints: [0x0e04, 0x0e25, 0x0e38] }]],
  ]);
});

it("records fallback runs in render results and leaves covered results unchanged", async () => {
  const fallback = await write({
    fontCoverage: "strict",
    assets: [
      await plex().then((f) => ({ ...f, fallbacks: ["thai"] })),
      await noto(),
    ],
    layers: [textLayer("thai-only", "ลุค", "sans")],
  });
  const rendered = await run([
    "render",
    "--input",
    fallback.input,
    "--output",
    join(fallback.root, "fallback.mp4"),
  ]);
  expect(rendered.code, rendered.stderr).toBe(0);
  expect(JSON.parse(rendered.stdout).fontCoverage).toMatchObject({
    profile: "strict",
    covered: true,
    fallbackRuns: [
      {
        layer: "thai-only",
        fallback: "thai",
        codePoints: ["U+0E04", "U+0E25", "U+0E38"],
      },
    ],
  });
  const covered = await write({
    assets: [await plex()],
    layers: [textLayer("latin", "OLIVE", "sans")],
  });
  const plain = await run([
    "render",
    "--input",
    covered.input,
    "--output",
    join(covered.root, "plain.mp4"),
  ]);
  expect(plain.code, plain.stderr).toBe(0);
  const result = JSON.parse(plain.stdout);
  expect(result).not.toHaveProperty("fontCoverage");
  expect(result.warnings).toEqual([]);
}, 120_000);

/** Pinned bytes whose header is a web-font container rather than SFNT. */
async function webFont(root: string, signature: "wOFF" | "wOF2") {
  const path = join(root, `title.${signature === "wOFF" ? "woff" : "woff2"}`);
  const bytes = Buffer.alloc(64);
  bytes.write(signature, 0, "latin1");
  await writeFile(path, bytes);
  return {
    id: "title",
    type: "font",
    path,
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    weight: "600",
  };
}

it.each([
  ["wOFF", "WOFF", "woff"],
  ["wOF2", "WOFF2", "woff2"],
] as const)(
  "rejects a pinned %s font in every command before any browser work",
  async (signature, label, extension) => {
    const root = await directory();
    const { input } = await write({
      assets: [await plex(), await webFont(root, signature)],
      layers: [textLayer("title", "OLIVE", "title")],
    });
    const finding = expect.objectContaining({
      code: "font-format",
      severity: "error",
      path: "assets[1].path",
      fontId: "title",
      message:
        `Font title is a ${label} font; composition fonts must be SFNT TTF ` +
        `or OTF files. Decompress it, for example \`fonttools ttLib ` +
        `font.${extension} -o font.ttf\`, then pin the converted file's ` +
        "path and sha256.",
    });
    // Legacy coverage still rejects it: the renderer cannot read the container.
    const validated = await run(["validate", "--input", input]);
    expect(validated.code).toBe(1);
    expect(JSON.parse(validated.stderr).diagnostics).toEqual([finding]);

    const output = join(root, "out.mp4");
    const rendered = await run([
      "render",
      "--input",
      input,
      "--output",
      output,
    ]);
    expect(rendered.code).toBe(2);
    const failure = JSON.parse(rendered.stderr).error;
    expect(failure.code).toBe("SCENE_INVALID");
    expect(JSON.parse(failure.context.diagnosticsJson)).toEqual([finding]);
    await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });

    const linted = await run(["lint", "--input", input, "--pixels", "true"]);
    expect(linted.code).not.toBe(0);
    expect(JSON.parse(linted.stdout || linted.stderr).diagnostics).toEqual([
      finding,
    ]);
  },
  60_000,
);

it("does not label captured web fonts as composition font types", async () => {
  const { compositionAssetTypes } = await import(
    "../../tools/still-shift-cli/src/composition/captured-assets.ts"
  );
  expect(compositionAssetTypes[".ttf"]).toBe("font/ttf");
  expect(compositionAssetTypes[".otf"]).toBe("font/otf");
  expect(compositionAssetTypes).not.toHaveProperty(".woff");
  expect(compositionAssetTypes).not.toHaveProperty(".woff2");
});
