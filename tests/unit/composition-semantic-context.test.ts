import { compositionQualityFrame } from "../../packages/renderer-core/src/composition/quality-samples.ts";
import { analyzeRenderedCompositionQuality } from "../../packages/renderer-core/src/composition/quality-render.ts";
import type { CompositionPreview } from "../../packages/renderer-core/src/composition/render/index.ts";
import { describe, expect, it } from "vitest";
import { composition } from "../../benchmarks/fixtures/composition/ce12/fixtures.ts";
import { analyzeCompositionQuality } from "../../packages/renderer-core/src/story-quality.ts";
import {
  resolveCompositionQualityPolicy,
  type CompositionQualityPolicy,
  type CompositionSemanticAssociation,
} from "../../packages/renderer-core/src/composition/quality-policy.ts";
import { PassageError } from "../../packages/renderer-core/src/passage-diagnostics.ts";

function fixture() {
  const comp = composition([
    {
      id: "value",
      type: "text",
      text: "12",
      fontSize: 48,
      color: "#ffffff",
      textRole: "label",
      transform: { position: [140, 60] },
    },
    {
      id: "unit",
      type: "text",
      text: "months",
      fontSize: 32,
      color: "#ffffff",
      textRole: "label",
      transform: { position: [270, 60] },
    },
    {
      id: "qual",
      type: "text",
      text: "Illustrative",
      fontSize: 24,
      color: "#ffffff",
      textRole: "qualification",
      transform: { position: [140, 125] },
    },
  ]);
  const association: CompositionSemanticAssociation = {
    id: "duration",
    purpose: "Read duration with context",
    kind: "quantity",
    start: 0,
    end: 90,
    requiredKinds: ["qualification"],
    members: [
      { layer: "value", text: "12", kind: "value" },
      { layer: "unit", text: "months", kind: "unit" },
      { layer: "qual", text: "Illustrative", kind: "qualification" },
    ],
  };
  const policy = {
    semanticProfile: "require-declared-context",
    semanticAssociations: [association],
    readingDeclarations: [
      { ...association, kind: undefined, requiredKinds: undefined },
    ].map(({ kind: _kind, requiredKinds: _required, ...reading }) => reading),
    evaluation: {
      textBounds: {
        value: [{ left: 0, right: 100, top: 0, bottom: 48 }],
        unit: [{ left: 0, right: 100, top: 0, bottom: 32 }],
        qual: [{ left: 0, right: 180, top: 0, bottom: 24 }],
      },
    },
  } satisfies CompositionQualityPolicy;
  return { comp, policy, association };
}
const semanticFindings = (
  report: ReturnType<typeof analyzeCompositionQuality>,
) =>
  report.diagnostics.filter((finding) => finding.code.startsWith("semantic-"));

describe("explicit complete semantic context", () => {
  it("keeps legacy diagnostics and pixels policy while reporting semantic context unassessed", () => {
    const { comp, policy } = fixture();
    const report = analyzeCompositionQuality(comp, {
      evaluation: policy.evaluation,
    });
    expect(report.semantic).toMatchObject({
      status: "unassessed",
      profile: "legacy",
      associations: [],
    });
    expect(semanticFindings(report)).toEqual([]);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "frozen-run", severity: "error" }),
    );
  });
  it("fails a strict profile without declared context without inferring numeric semantics", () => {
    const { comp } = fixture();
    const report = analyzeCompositionQuality(comp, {
      semanticProfile: "require-declared-context",
    });
    expect(report.semantic.status).toBe("failed");
    expect(semanticFindings(report)).toContainEqual(
      expect.objectContaining({
        code: "semantic-context-required",
        severity: "error",
        frames: [0, 89],
      }),
    );
  });
  it("passes exact complete quantity context and retains distinct rendered/factual review limits", () => {
    const { comp, policy } = fixture();
    const report = analyzeCompositionQuality(comp, policy);
    expect(report.semantic).toMatchObject({
      status: "passed",
      factualTruth: "unassessed",
      renderedGlyphReadability: "requires-encoded-review",
    });
    expect(report.semantic.associations[0]).toMatchObject({
      id: "duration",
      status: "passed",
      violationIntervals: [],
    });
    expect(semanticFindings(report)).toEqual([]);
  });
  it("reports early value-only frames even after a later complete readable hold passes", () => {
    const { comp, policy } = fixture();
    comp.layers[1]!.inPoint = 20;
    const report = analyzeCompositionQuality(comp, policy);
    expect(report.readingDeclarations?.[0]).toMatchObject({
      eligible: true,
      longestReadableFrames: 70,
    });
    expect(report.semantic.status).toBe("failed");
    expect(semanticFindings(report)).toContainEqual(
      expect.objectContaining({
        code: "semantic-context-incomplete",
        path: "semanticAssociations.0.members.1.layer",
        frames: [0, 19],
        measured: 20,
      }),
    );
  });
  it("locates a transient changed unit even when other spans provide sufficient reading time", () => {
    const { comp, policy } = fixture();
    const unit = comp.layers[1]!;
    if (unit.type !== "text") throw new Error("fixture must contain text");
    unit.states = ["months", "years"];
    unit.state = {
      keys: [
        { frame: 0, value: 0 },
        { frame: 10, value: 1 },
        { frame: 20, value: 0 },
      ],
    };
    policy.evaluation!.textBounds = {
      ...policy.evaluation!.textBounds,
      unit: [
        { left: 0, right: 100, top: 0, bottom: 32 },
        { left: 0, right: 100, top: 0, bottom: 32 },
      ],
    };
    const report = analyzeCompositionQuality(comp, policy);
    expect(report.readingDeclarations?.[0]?.eligible).toBe(true);
    expect(semanticFindings(report)).toContainEqual(
      expect.objectContaining({
        code: "semantic-copy-changed",
        path: "semanticAssociations.0.members.1.text",
        frames: [10, 19],
      }),
    );
  });
  it("rejects faint or missing measured context without treating equal alpha as readable", () => {
    const { comp, policy } = fixture();
    comp.layers[2]!.transform!.opacity = 0.2;
    expect(
      semanticFindings(analyzeCompositionQuality(comp, policy)),
    ).toContainEqual(
      expect.objectContaining({
        code: "semantic-context-incomplete",
        path: "semanticAssociations.0.members.2.layer",
        frames: [0, 89],
      }),
    );
    comp.layers[2]!.transform!.opacity = 1;
    policy.evaluation!.textBounds = {
      ...policy.evaluation!.textBounds,
      qual: [],
    };
    expect(analyzeCompositionQuality(comp, policy).semantic.status).toBe(
      "failed",
    );
  });
  it("requires measured readable value evidence instead of passing a vacuous association", () => {
    const { comp, policy } = fixture();
    policy.evaluation.textBounds.value = [];
    const report = analyzeCompositionQuality(comp, policy);
    expect(report.semantic.status).toBe("failed");
    expect(report.semantic.associations[0]).toMatchObject({
      readableValueFrames: 0,
    });
    expect(semanticFindings(report)).toContainEqual(
      expect.objectContaining({
        code: "semantic-context-incomplete",
        path: "semanticAssociations.0.members.0.layer",
        frames: [0, 89],
      }),
    );
  });
  it.each(["missing", "not-text"])(
    "reports an invalid %s member reference",
    (reference) => {
      const { comp, policy, association } = fixture();
      association.members[1]!.layer = reference;
      if (reference === "not-text")
        comp.layers.push({
          id: reference,
          type: "solid",
          size: [20, 20],
          color: "#ffffff",
        });
      expect(
        semanticFindings(analyzeCompositionQuality(comp, policy)),
      ).toContainEqual(
        expect.objectContaining({
          code: "semantic-member-reference",
          path: "semanticAssociations.0.members.1.layer",
          frames: [0, 89],
        }),
      );
    },
  );
  it("preserves exact units/context through saved JSON and resolves policy at the shared entrypoint", () => {
    const { comp, policy } = fixture();
    const { evaluation, ...saved } = policy;
    const reloaded = JSON.parse(
      JSON.stringify({ ...comp, metadata: { readingPolicy: saved } }),
    );
    expect(
      analyzeCompositionQuality(reloaded, { evaluation }).semantic.status,
    ).toBe("passed");
    const explicit = analyzeCompositionQuality(reloaded, {
      evaluation,
      semanticProfile: "legacy",
      semanticAssociations: [],
    });
    expect(explicit.semantic).toMatchObject({
      profile: "legacy",
      status: "unassessed",
    });
    reloaded.layers[1].text = "years";
    expect(
      semanticFindings(analyzeCompositionQuality(reloaded, { evaluation })),
    ).toContainEqual(
      expect.objectContaining({
        code: "semantic-copy-changed",
        frames: [0, 89],
      }),
    );
  });
  it("requires explicitly declared quantity units/qualifications and rejects repeated members/ranges", () => {
    const { comp, policy, association } = fixture();
    for (const members of [
      association.members.filter((member) => member.kind !== "unit"),
      association.members.filter((member) => member.kind !== "qualification"),
      [
        association.members[0]!,
        association.members[0]!,
        ...association.members.slice(1),
      ],
    ]) {
      expect(() =>
        resolveCompositionQualityPolicy(comp, {
          ...policy,
          semanticAssociations: [{ ...association, members }],
        }),
      ).toThrow(PassageError);
    }
    expect(() =>
      resolveCompositionQualityPolicy(comp, {
        ...policy,
        semanticAssociations: [{ ...association, end: 91 }],
      }),
    ).toThrow(PassageError);
    expect(() =>
      resolveCompositionQualityPolicy(
        { ...comp, metadata: { readingPolicy: "wrong" } },
        {},
      ),
    ).toThrow(PassageError);
  });
  it("assesses an authored intact technical phrase without splitting or inferring its tokens", () => {
    const { comp, policy } = fixture();
    const value = comp.layers[0]!;
    if (value.type !== "text") throw new Error("fixture must contain text");
    value.text = "USB-C 30W";
    policy.semanticAssociations = [
      {
        id: "identifier",
        purpose: "Keep the complete identifier",
        kind: "phrase",
        start: 0,
        end: 90,
        members: [{ layer: "value", text: "USB-C 30W", kind: "value" }],
      },
    ];
    expect(analyzeCompositionQuality(comp, policy).semantic.status).toBe(
      "passed",
    );
    value.text = "USB-C";
    expect(
      semanticFindings(analyzeCompositionQuality(comp, policy)),
    ).toContainEqual(
      expect.objectContaining({
        code: "semantic-copy-changed",
        frames: [0, 89],
      }),
    );
  });
});

it("measures pixels with the saved policy threshold and honors an explicit override", async () => {
  const comp = composition([], {
    width: 16,
    height: 16,
    frameCount: 4,
    metadata: {
      readingPolicy: {
        pixelChannelThreshold: 20,
        pixelMinimumChanges: 1,
        maxFrozenFrames: 1,
      },
    },
  });
  let frame = 0;
  const preview = {
    backend: "canvas2d",
    rendererVersion: "test-preview",
    textBounds: {},
    renderFrame(at: number) {
      frame = at;
      return { diagnostics: [] };
    },
    readPixels() {
      const bytes = new Uint8Array(16 * 16 * 4);
      for (let i = 0; i < bytes.length; i += 4) {
        bytes[i] = bytes[i + 1] = bytes[i + 2] = frame * 10;
        bytes[i + 3] = 255;
      }
      return bytes;
    },
  } as unknown as CompositionPreview;
  const saved = await analyzeRenderedCompositionQuality(comp, preview);
  expect(saved.diagnostics).toContainEqual(
    expect.objectContaining({ code: "frozen-pixels", measured: 3 }),
  );
  const override = await analyzeRenderedCompositionQuality(comp, preview, {
    pixelChannelThreshold: 5,
  });
  expect(
    override.diagnostics.some((finding) => finding.code === "frozen-pixels"),
  ).toBe(false);
});

describe("semantic copy follows displayed typography", () => {
  function countingFixture() {
    const data = fixture();
    const value = data.comp.layers[0]!;
    if (value.type !== "text") throw new Error("Expected text value");
    value.fontAsset = "plex";
    value.style = "numeric";
    data.comp.textStyles = {
      numeric: { fontAsset: "plex", figures: "tabular" },
    };
    data.comp.assets = [
      {
        id: "plex",
        type: "font",
        path: "font.ttf",
        sha256: "sha256:" + "a".repeat(64),
        weight: "600",
      },
    ];
    value.states = ["12", "24"];
    value.transition = {
      kind: "count",
      window: { start: 0, end: 60 },
      easing: "linear",
    };
    data.policy.evaluation.textBounds.value = Array(2).fill({
      left: 0,
      right: 100,
      top: 0,
      bottom: 48,
    });
    return { ...data, value };
  }
  it("rejects an original endpoint declaration when the displayed count changes and stays changed", () => {
    const { comp, policy } = countingFixture();
    const report = analyzeCompositionQuality(comp, policy);
    expect(report.semantic.status).toBe("failed");
    expect(semanticFindings(report)).toContainEqual(
      expect.objectContaining({
        code: "semantic-copy-changed",
        path: "semanticAssociations.0.members.0.text",
        frames: [3, 89],
        measured: 87,
      }),
    );
    for (const [frame, text] of [
      [0, "12"],
      [30, "18"],
      [60, "24"],
      [89, "24"],
    ] as const)
      expect(
        compositionQualityFrame(comp, frame, policy.evaluation).layers.get(
          "value",
        )?.text,
      ).toBe(text);
  });
  it("uses fractional local time through stretch and keeps seek order deterministic", () => {
    const { comp, policy, value } = countingFixture();
    value.stretch = 2;
    const frames = [61.2, 30.4, 0, 120, 60];
    const copies = frames.map(
      (frame) =>
        compositionQualityFrame(comp, frame, policy.evaluation).layers.get(
          "value",
        )?.text,
    );
    expect(copies).toEqual(["18", "15", "12", "24", "18"]);
    expect(
      [...frames]
        .reverse()
        .map(
          (frame) =>
            compositionQualityFrame(comp, frame, policy.evaluation).layers.get(
              "value",
            )?.text,
        )
        .reverse(),
    ).toEqual(copies);
  });
  it("retains full from copy at transition start but cannot certify a partial retype", () => {
    const { comp, policy, value } = countingFixture();
    value.transition!.kind = "retype";
    expect(
      compositionQualityFrame(comp, 0, policy.evaluation).layers.get("value")
        ?.text,
    ).toBe("12");
    expect(
      compositionQualityFrame(comp, 30, policy.evaluation).layers.get("value"),
    ).toMatchObject({ textCopies: ["12", "24"] });
    expect(
      compositionQualityFrame(comp, 30, policy.evaluation).layers.get("value")
        ?.text,
    ).toBeUndefined();
    expect(
      compositionQualityFrame(comp, 60, policy.evaluation).layers.get("value")
        ?.text,
    ).toBe("24");
    const report = analyzeCompositionQuality(comp, policy);
    expect(semanticFindings(report)).toContainEqual(
      expect.objectContaining({
        code: "semantic-copy-changed",
        frames: [1, 89],
      }),
    );
  });
  it("does not call a staggered roll intact when its global easing briefly reaches the endpoint", () => {
    const { comp, policy, value } = countingFixture();
    value.transition = {
      kind: "roll",
      window: { start: 0, end: 10 },
      stagger: 1,
      easing: { overshoot: 1 },
    };
    const sample = compositionQualityFrame(
      comp,
      5,
      policy.evaluation,
    ).layers.get("value");
    expect(sample?.text).toBeUndefined();
    expect(sample?.textCopies).toEqual(["12", "24"]);
    expect(
      compositionQualityFrame(comp, 10, policy.evaluation).layers.get("value")
        ?.text,
    ).toBe("24");
  });
  it("selects actual source at held blend endpoints and requires intact copy between them", () => {
    const { comp, policy, value } = countingFixture();
    delete value.transition;
    value.state = 1;
    value.stateFrom = 0;
    value.stateMix = 0;
    expect(analyzeCompositionQuality(comp, policy).semantic.status).toBe(
      "passed",
    );
    expect(
      compositionQualityFrame(comp, 30, policy.evaluation).layers.get("value")
        ?.text,
    ).toBe("12");
    value.stateMix = 1;
    expect(
      compositionQualityFrame(comp, 30, policy.evaluation).layers.get("value")
        ?.text,
    ).toBe("24");
    value.stateMix = 0.5;
    expect(
      compositionQualityFrame(comp, 30, policy.evaluation).layers.get("value"),
    ).toMatchObject({ textCopies: ["12", "24"] });
    value.states![1] = "12";
    expect(
      compositionQualityFrame(comp, 30, policy.evaluation).layers.get("value")
        ?.text,
    ).toBe("12");
  });
  it("uses the actual pinned style font and preserves the system text path", () => {
    const { comp, policy, value } = countingFixture();
    value.fontAsset = undefined;
    value.style = "typed";
    comp.textStyles = { typed: { fontAsset: "plex", figures: "tabular" } };
    expect(
      compositionQualityFrame(comp, 30, policy.evaluation).layers.get("value")
        ?.text,
    ).toBe("18");
    comp.textStyles.typed!.fontAsset = "unresolved";
    expect(
      compositionQualityFrame(comp, 30, policy.evaluation).layers.get("value")
        ?.text,
    ).toBe("12");
  });
  it("resolves rich provider transitions using baked source time instead of sample ordinal", () => {
    const { comp, policy, value } = countingFixture();
    comp.layers[0] = {
      id: "value",
      type: "provider",
      provider: "component.typography@1.1.0",
      assets: ["plex"],
      bounds: [0, 0, 100, 48],
      transform: { position: [140, 60] },
      sampleTimes: [0, 30, 60],
      params: {
        node: JSON.parse(JSON.stringify({ ...value, type: "text" })),
        frameCount: 90,
        samples: [
          { state: 0, reveal: 1 },
          { state: 0, reveal: 1 },
          { state: 0, reveal: 1 },
        ],
      },
    };
    expect(
      compositionQualityFrame(comp, 30, policy.evaluation).layers.get("value")
        ?.text,
    ).toBe("18");
    expect(
      compositionQualityFrame(comp, 60, policy.evaluation).layers.get("value")
        ?.text,
    ).toBe("24");
    expect(analyzeCompositionQuality(comp, policy).semantic.status).toBe(
      "failed",
    );
  });
  it("honors component state overrides while story text draws its baked sample copy", () => {
    const { comp, policy, value } = countingFixture();
    delete value.transition;
    const provider = {
      id: "value",
      type: "provider" as const,
      provider: "component.typography@1.1.0",
      assets: ["plex"],
      bounds: [0, 0, 100, 48] as [number, number, number, number],
      transform: { position: [140, 60] as [number, number] },
      state: 1,
      stateFrom: 0,
      stateMix: 1,
      params: {
        node: JSON.parse(JSON.stringify({ ...value, type: "text" })),
        frameCount: 90,
        samples: [{ state: 0, reveal: 1 }],
      },
    };
    comp.layers[0] = provider;
    expect(
      compositionQualityFrame(comp, 30, policy.evaluation).layers.get("value")
        ?.text,
    ).toBe("24");
    provider.stateMix = 0.5;
    expect(
      compositionQualityFrame(comp, 30, policy.evaluation).layers.get("value"),
    ).toMatchObject({ textCopies: ["12", "24"] });
    provider.provider = "story.text@1.0.0";
    expect(
      compositionQualityFrame(comp, 30, policy.evaluation).layers.get("value")
        ?.text,
    ).toBe("12");
  });
});

describe("semantic correction artwork", () => {
  it("retains correction artwork after its animation and never calls a span replacement the whole phrase", () => {
    const { comp, policy } = fixture();
    const value = comp.layers[0]!;
    if (value.type !== "text") throw new Error("Expected text");
    value.fontAsset = "plex";
    comp.assets = [
      {
        id: "plex",
        type: "font",
        path: "font.ttf",
        sha256: "sha256:" + "a".repeat(64),
        weight: "600",
      },
    ];
    value.corrections = [{ start: 10, end: 30, replacement: "24" }];
    expect(
      compositionQualityFrame(comp, 20, policy.evaluation).layers.get("value")
        ?.text,
    ).toBe("12");
    for (const frame of [21, 30, 89]) {
      const sample = compositionQualityFrame(
        comp,
        frame,
        policy.evaluation,
      ).layers.get("value");
      expect(sample?.text).toBeUndefined();
      expect(sample?.textCopies).toEqual(["12", "24"]);
    }
    expect(
      semanticFindings(analyzeCompositionQuality(comp, policy)),
    ).toContainEqual(
      expect.objectContaining({
        code: "semantic-copy-changed",
        frames: [21, 89],
        measured: 69,
      }),
    );
  });
});
