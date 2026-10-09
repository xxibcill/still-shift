import { describe, expect, it } from "vitest";
import { composition } from "../../benchmarks/fixtures/composition/ce12/fixtures.ts";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
import { sampleCompositionQuality } from "../../packages/renderer-core/src/composition/quality-samples.ts";
import {
  resolveCompositionQualityPolicy,
  type CompositionQualityPolicy,
} from "../../packages/renderer-core/src/composition/quality-policy.ts";
import { analyzeDeclaredCompositionReading } from "../../packages/renderer-core/src/typography-quality.ts";

function fixture() {
  const comp = composition(
    [
      {
        id: "value",
        type: "text",
        text: "0.18",
        fontAsset: "plex",
        fontSize: 48,
        color: "#fff5df",
        textRole: "label",
        transform: { position: [140, 60] },
      },
      {
        id: "unit",
        type: "text",
        text: "mm",
        fontSize: 32,
        color: "#fff5df",
        textRole: "label",
        transform: { position: [270, 60] },
      },
      {
        id: "qual",
        type: "text",
        text: "Illustrative",
        fontSize: 24,
        color: "#fff5df",
        textRole: "qualification",
        transform: { position: [140, 125] },
      },
    ],
    {
      frameCount: 90,
      assets: [
        {
          id: "plex",
          type: "font",
          path: "font.ttf",
          sha256: "sha256:" + "a".repeat(64),
          weight: "600",
        },
      ],
    },
  );
  const policy = {
    readingDeclarations: [
      {
        id: "measurement",
        purpose: "Read the thickness with its unit and qualification",
        start: 0,
        end: 90,
        members: [
          { layer: "value", text: "0.18", kind: "value" as const },
          { layer: "unit", text: "mm", kind: "unit" as const },
          {
            layer: "qual",
            text: "Illustrative",
            kind: "qualification" as const,
          },
        ],
      },
    ],
    evaluation: {
      textBounds: {
        value: [{ left: 0, right: 100, top: 0, bottom: 48 }],
        unit: [{ left: 0, right: 50, top: 0, bottom: 32 }],
        qual: [{ left: 0, right: 180, top: 0, bottom: 24 }],
      },
    },
  };
  return { comp, policy };
}
function reading(
  comp: ReturnType<typeof fixture>["comp"],
  policy: CompositionQualityPolicy,
) {
  const resolved = resolveCompositionQualityPolicy(comp, policy);
  return analyzeDeclaredCompositionReading(
    sampleCompositionQuality(comp, resolved.evaluation),
    comp.fps,
    resolved,
  );
}

describe("explicit CE12 semantic reading declarations", () => {
  it("measures value/unit/qualification as a simultaneous intact phrase and retains raw frozen evidence", () => {
    const { comp, policy } = fixture();
    expect(reading(comp, policy).windows).toEqual([
      expect.objectContaining({
        id: "measurement",
        purpose: policy.readingDeclarations[0]!.purpose,
        longestReadableFrames: 90,
        requiredFrames: 60,
        eligible: true,
      }),
    ]);
    const report = analyzeCompositionQuality(comp, {
      ...policy,
      pixelHashes: Array(90).fill("same"),
    });
    expect(report.diagnostics.map((finding) => finding.code)).toContain(
      "frozen-run",
    );
    expect(report.diagnostics.map((finding) => finding.code)).toContain(
      "frozen-pixels",
    );
    expect(report.diagnostics.map((finding) => finding.code)).not.toContain(
      "reading-time",
    );
    expect(report.status).toBe("passed");
    expect(
      report.diagnostics.filter((finding) =>
        finding.code.startsWith("frozen-"),
      ),
    ).toEqual([
      expect.objectContaining({
        code: "frozen-pixels",
        classification: "declared-reading-hold",
        severity: "warning",
        rawSeverity: "error",
        measured: 89,
      }),
      expect.objectContaining({
        code: "frozen-run",
        classification: "declared-reading-hold",
        severity: "warning",
        rawSeverity: "error",
        measured: 89,
      }),
    ]);
  });
  it("rejects a faint qualification despite fully visible value/unit", () => {
    const { comp, policy } = fixture();
    comp.layers[2]!.transform!.opacity = 0.2;
    const result = reading(comp, policy);
    expect(result.windows[0]).toMatchObject({
      eligible: false,
      longestReadableFrames: 0,
    });
    expect(result.diagnostics[0]).toMatchObject({
      code: "reading-time",
      path: "readingDeclarations.0",
      nodes: ["value", "unit", "qual"],
    });
  });
  it("permits an opaque color-only glyph animator only for explicitly declared copy", () => {
    const { comp, policy } = fixture();
    comp.textAnimators = [
      {
        node: "value",
        unit: "glyph",
        start: 0,
        end: 89,
        stagger: 0,
        selector: { start: 0, end: 100 },
        from: { color: "#ffffff" },
        to: { color: "#ffeecc" },
        mask: "none",
      },
    ];
    expect(reading(comp, policy).windows[0]).toMatchObject({
      eligible: true,
      longestReadableFrames: 90,
    });
    expect(
      analyzeCompositionQuality(comp, { evaluation: policy.evaluation })
        .diagnostics,
    ).toContainEqual(
      expect.objectContaining({ code: "reading-time", node: "value" }),
    );
    expect(
      analyzeCompositionQuality(comp, policy).diagnostics.filter(
        (finding) => finding.code === "reading-time",
      ),
    ).toEqual([]);
  });
  it("does not count moving glyphs, partial reveals, content changes or opacity pops as declared reading time", () => {
    const { comp, policy } = fixture();
    comp.textAnimators = [
      {
        node: "value",
        unit: "glyph",
        start: 0,
        end: 89,
        stagger: 0,
        selector: { start: 0, end: 100 },
        from: { offset: [0, 0] },
        to: { offset: [80, 0] },
        mask: "none",
      },
    ];
    expect(reading(comp, policy).windows[0]!.eligible).toBe(false);
    delete comp.textAnimators;
    if (comp.layers[0]!.type !== "text") throw new Error("fixture");
    comp.layers[0]!.reveal = 0.5;
    expect(reading(comp, policy).windows[0]!.eligible).toBe(false);
    comp.layers[0]!.reveal = 1;
    comp.layers[0]!.states = ["0.18", "0.20"];
    comp.layers[0]!.state = {
      keys: [
        { frame: 0, value: 0 },
        { frame: 20, value: 1 },
      ],
    };
    expect(reading(comp, policy).windows[0]!.eligible).toBe(false);
    comp.layers[0]!.state = 0;
    comp.layers[0]!.transform!.opacity = {
      keys: [
        { frame: 0, value: 1 },
        { frame: 40, value: 0.1, interpolation: "hold" },
        { frame: 41, value: 1, interpolation: "hold" },
      ],
    };
    const report = analyzeCompositionQuality(comp, policy);
    expect(report.diagnostics.map((finding) => finding.code)).toContain(
      "opacity-pop",
    );
    expect(report.diagnostics.map((finding) => finding.code)).toContain(
      "reading-time",
    );
  });
  it("does not accept missing measured bounds, mismatched phrases, overlapping members or invalid declarations", () => {
    const { comp, policy } = fixture();
    expect(
      reading(comp, { ...policy, evaluation: { textBounds: {} } }).windows[0]!
        .eligible,
    ).toBe(false);
    policy.readingDeclarations[0]!.members[0]!.text = "0.19";
    expect(reading(comp, policy).windows[0]!.eligible).toBe(false);
    policy.readingDeclarations[0]!.members[0]!.text = "0.18";
    comp.layers[1]!.transform!.position = [140, 60];
    expect(reading(comp, policy).windows[0]!.eligible).toBe(false);
    expect(() =>
      resolveCompositionQualityPolicy(comp, {
        ...policy,
        readingDeclarations: [{ ...policy.readingDeclarations[0]!, end: 91 }],
      }),
    ).toThrow();
  });
});

it("native sequence content selection prevents false state freezes while preserving pixel freezes", () => {
  const media = composition(
    [
      {
        id: "plate",
        type: "sequence",
        asset: "frames",
        size: [640, 360],
        transform: { anchor: [0, 0], position: [0, 0] },
      },
    ],
    {
      frameCount: 90,
      assets: [
        {
          id: "frames",
          type: "sequence",
          path: "/tmp/%06d.png",
          sha256: "sha256:" + "a".repeat(64),
          manifestPath: "/tmp/manifest.json",
          firstFrame: 0,
          width: 640,
          height: 360,
          frameCount: 90,
          frameRate: { numerator: 30, denominator: 1 },
          color: {
            primaries: "bt709",
            transfer: "iec61966-2-1",
            matrix: "gbr",
            range: "pc",
          },
        },
      ],
    },
  );
  const report = analyzeCompositionQuality(media, {
    pixelHashes: Array(90).fill("unchanged"),
  });
  expect(
    report.diagnostics.filter((finding) => finding.code === "frozen-run"),
  ).toEqual([]);
  expect(report.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "frozen-pixels",
      severity: "error",
      measured: 89,
    }),
  );
  media.layers[0]!.holdFrame = 0;
  expect(analyzeCompositionQuality(media).diagnostics).toContainEqual(
    expect.objectContaining({
      code: "frozen-run",
      severity: "error",
      measured: 89,
    }),
  );
});

it("declared stable copy cannot excuse frozen pixels over moving paint state or unreadable endpoints", () => {
  const { comp, policy } = fixture();
  comp.layers.push({
    id: "moving",
    type: "solid",
    size: [20, 20],
    color: "#ffffff",
    transform: {
      position: {
        keys: [
          { frame: 0, value: [40, 250] },
          { frame: 89, value: [500, 250] },
        ],
      },
    },
  });
  const report = analyzeCompositionQuality(comp, {
    ...policy,
    pixelHashes: Array(90).fill("unchanged"),
  });
  expect(report.diagnostics).toContainEqual(
    expect.objectContaining({ code: "frozen-pixels", severity: "error" }),
  );
  comp.layers.pop();
  comp.layers[2]!.transform!.opacity = {
    keys: [
      { frame: 0, value: 1 },
      { frame: 80, value: 0.2, interpolation: "hold" },
    ],
  };
  const partial = analyzeCompositionQuality(comp, {
    ...policy,
    pixelHashes: Array(90).fill("unchanged"),
  });
  expect(partial.readingDeclarations?.[0]).toMatchObject({
    eligible: true,
    readableIntervals: [{ start: 0, end: 80 }],
  });
  expect(partial.diagnostics).toContainEqual(
    expect.objectContaining({ code: "frozen-pixels", severity: "error" }),
  );
});

it("does not join declared reading intervals across an authored cut", () => {
  const { comp, policy } = fixture();
  comp.markers = [{ id: "cut", frame: 45, label: "cut" }];
  const window = reading(comp, policy).windows[0]!;
  expect(window).toMatchObject({
    eligible: false,
    longestReadableFrames: 45,
    requiredFrames: 60,
    readableIntervals: [],
  });
  const report = analyzeCompositionQuality(comp, policy);
  expect(report.diagnostics).toContainEqual(
    expect.objectContaining({ code: "reading-time", severity: "error" }),
  );
  expect(
    report.diagnostics.filter((finding) => finding.classification),
  ).toEqual([]);
});
