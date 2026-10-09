import {
  CompositionSchema,
  type Composition,
  type CompositionLayer,
} from "@still-shift/scene-contract";
import type {
  CompositionQualityPolicy,
  CompositionReadingDeclaration,
  CompositionSemanticAssociation,
} from "../../packages/renderer-core/src/composition/quality-policy.ts";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
type FontAsset = Extract<Composition["assets"][number], { type: "font" }>;
type TextLayer = Extract<CompositionLayer, { type: "text" }>;
type SemanticAssociation = CompositionSemanticAssociation;

export type MechanismSemanticTypographyPolicy = CompositionQualityPolicy & {
  semanticProfile: "legacy" | "require-declared-context";
  semanticAssociations?: SemanticAssociation[];
};

export type MechanismSemanticTypographyFixture = {
  id: string;
  composition: Composition;
  policy: MechanismSemanticTypographyPolicy;
  snapshotFrames: number[];
  expectedSemantic: "unassessed" | "passed" | "failed";
  expectedCodes: string[];
  sourceMetadata: Record<string, JsonValue>;
};

export type MechanismSemanticTypographyInput = {
  basis?: "historical-hashed-source" | "hermetic-authored-contract";
  /** Caller hashes the exact historical JSON and compiles through the supported adapter. */
  historical: { ss02: Composition; ss03: Composition; ss04: Composition };
  /** Caller reads and hashes these font bytes; the helper validates the supplied identities. */
  fonts: { semibold: FontAsset; medium: FontAsset; thai: FontAsset };
};

const historicalRoot =
  "/Users/jjae/Documents/obsidian/ai-business/Knowledge Base/Motion Graphics/typography/assessments/2026-10-08-still-shift/packets/v003/inputs";

export const MECHANISM_SEMANTIC_HISTORICAL_INPUTS = {
  ss02: {
    path: `${historicalRoot}/SS02-thai-phrase.json`,
    sha256: "b0927bb54cba3989601979e215cd564fac877ea16ce70f29091514f4ad1815d8",
  },
  ss03: {
    path: `${historicalRoot}/SS03-qualified-value.json`,
    sha256: "965392bbf57e57782998163264fbd6dd9e3bb27a31f7b0ea63026c33be1e9d2e",
  },
  ss04: {
    path: `${historicalRoot}/SS04-deliberate-missing-context.json`,
    sha256: "fe7eba9d75558baa346a853a605193e356979104e7c299aada6818c9c1f8a0c7",
  },
} as const;

export const MECHANISM_SEMANTIC_FONTS = {
  semibold: {
    path: "assets/story-motion/fonts/plex-sans-semibold.ttf",
    sha256:
      "sha256:a20caf8286023a6a7a85e40b1d2a4ae9fc3e3b1f9eda8f4c542dd4986af67bb1",
    weight: "600",
    cut: "IBM Plex Sans SmBld Regular; OS/2 weight 600",
  },
  medium: {
    path: "assets/story-motion/fonts/plex-sans-medium.ttf",
    sha256:
      "sha256:331c8639d7598b2cde62a911a71db195e30cb655cd6bdf2e324a7e984955f907",
    weight: "500",
    cut: "IBM Plex Sans Medm Regular; OS/2 weight 500",
  },
  thai: {
    path: "assets/ecommerce-motion/fonts/noto-sans-thai.ttf",
    sha256:
      "sha256:5a1c559bb539583c8a1fd99d1c5b9491e5e14478c9cd2bd0970d5c3096cc9ef8",
    weight: "600",
    cut: "Noto Sans Thai variable; authored wght 600, wdth 100",
    axes: {
      wght: { min: 100, default: 400, max: 900 },
      wdth: { min: 62.5, default: 100, max: 100 },
    },
  },
} as const;

const historicalFrames = [0, 17, 18, 19, 30, 41, 42, 69, 70, 119];
const publicThaiTestCopy = "น้ำ ผู้รู้ จุฬา";

function json(input: unknown): JsonValue {
  return JSON.parse(JSON.stringify(input)) as JsonValue;
}

function textLayer(composition: Composition, id: string): TextLayer {
  const layer = composition.layers.find((entry) => entry.id === id);
  if (!layer || layer.type !== "text")
    throw new Error(`Semantic proof needs text layer ${id}`);
  return layer;
}

function checkFonts(fonts: MechanismSemanticTypographyInput["fonts"]) {
  for (const key of ["semibold", "medium", "thai"] as const) {
    const expected = MECHANISM_SEMANTIC_FONTS[key];
    if (
      fonts[key].sha256 !== expected.sha256 ||
      fonts[key].weight !== expected.weight
    )
      throw new Error(`Semantic proof requires the exact ${key} font cut`);
  }
  for (const axis of ["wght", "wdth"] as const) {
    const actual = fonts.thai.variable?.[axis];
    const expected = MECHANISM_SEMANTIC_FONTS.thai.axes[axis];
    if (
      !actual ||
      actual.min !== expected.min ||
      actual.default !== expected.default ||
      actual.max !== expected.max
    )
      throw new Error("Semantic proof requires the declared Noto Thai axes");
  }
}

function quantityAssociation(
  composition: Composition,
  start = 0,
  end = composition.frameCount,
): SemanticAssociation {
  const locale =
    textLayer(composition, "qualifier").locale === "th" ? "th" : "en";
  return {
    id: "complete-example-quantity",
    purpose:
      "Read the authored example endpoint with its unit and qualification",
    kind: "quantity",
    start,
    end,
    requiredKinds: ["unit", "qualification"],
    members: [
      {
        layer: "value",
        text: textLayer(composition, "value").text,
        kind: "value",
        locale,
      },
      {
        layer: "unit",
        text: textLayer(composition, "unit").text,
        kind: "unit",
        locale,
      },
      {
        layer: "qualifier",
        text: textLayer(composition, "qualifier").text,
        kind: "qualification",
        locale,
      },
    ],
  };
}

function quantityPolicy(
  composition: Composition,
): MechanismSemanticTypographyPolicy {
  const association = quantityAssociation(composition);
  return {
    semanticProfile: "require-declared-context",
    semanticAssociations: [association],
    readingDeclarations: [readingDeclaration(association)],
  };
}

function readingDeclaration(
  association: SemanticAssociation,
): CompositionReadingDeclaration {
  return {
    id: association.id,
    purpose: association.purpose,
    start: association.start,
    end: association.end,
    members: structuredClone(association.members),
  };
}

function endpointControl(
  fonts: MechanismSemanticTypographyInput["fonts"],
  locale: "en" | "th",
  fps: 24 | 30,
): Composition {
  const primary = locale === "th" ? fonts.thai : fonts.semibold;
  const secondary = locale === "th" ? fonts.thai : fonts.medium;
  return CompositionSchema.parse({
    schemaVersion: "composition-1",
    id: `complete-example-${locale}-${fps}`,
    width: 1280,
    height: 720,
    fps,
    frameCount: fps * 4,
    background: "#f6f1e7",
    assets: Object.values(fonts),
    textStyles: {
      thai: {
        fontAsset: fonts.thai.id,
        size: 96,
        axes: { wght: 600, wdth: 100 },
      },
    },
    layers: [
      {
        id: "quantity",
        type: "group",
        size: [1280, 720],
        transform: { position: [0, 0], anchor: [0, 0] },
      },
      {
        id: "value",
        type: "text",
        text: "12",
        fontAsset: primary.id,
        fontSize: 96,
        color: "#14252b",
        textRole: "label",
        anchor: "baseline",
        locale,
        parent: "quantity",
        transform: { position: [144, 360] },
        ...(locale === "th" ? { style: "thai" } : {}),
      },
      {
        id: "unit",
        type: "text",
        text: locale === "th" ? "หน่วย" : "units",
        fontAsset: secondary.id,
        fontSize: 48,
        color: "#14252b",
        textRole: "label",
        anchor: "baseline",
        locale,
        parent: "quantity",
        transform: { position: [300, 360] },
      },
      {
        id: "qualifier",
        type: "text",
        text: locale === "th" ? "ตัวอย่างค่า" : "Example value",
        fontAsset: secondary.id,
        fontSize: 36,
        color: "#14252b",
        textRole: "qualification",
        anchor: "baseline",
        locale,
        parent: "quantity",
        // Noto's declared value bounds extend below the baseline. Keep the
        // complete qualification outside those bounds without extending time.
        transform: { position: [144, locale === "th" ? 470 : 430] },
      },
    ],
  });
}

function makeFixture(
  id: string,
  input: Composition,
  policy: MechanismSemanticTypographyPolicy,
  expectedSemantic: MechanismSemanticTypographyFixture["expectedSemantic"],
  expectedCodes: string[],
  sourceMetadata: Record<string, JsonValue>,
  snapshotFrames = [0, Math.floor(input.frameCount / 2), input.frameCount - 1],
): MechanismSemanticTypographyFixture {
  const composition = structuredClone(input);
  composition.id = id;
  const metadata: Record<string, JsonValue> = {
    schemaVersion: "mechanism-semantic-typography-proof-1",
    sourceBasis: "hermetic-authored-contract",
    ...sourceMetadata,
    scope:
      "Authored review context, not numerical truth or human comprehension",
    nativeDimensions: [composition.width, composition.height],
    reducedPreviewWidth: 360,
    snapshotFrames,
    fontIdentities: json(
      composition.assets.filter((asset) => asset.type === "font"),
    ),
  };
  composition.metadata = {
    ...composition.metadata,
    readingPolicy: json(policy),
    semanticProof: metadata,
  };
  return {
    id,
    composition: CompositionSchema.parse(composition),
    policy: structuredClone(policy),
    snapshotFrames: [...snapshotFrames],
    expectedSemantic,
    expectedCodes: [...expectedCodes],
    sourceMetadata: metadata,
  };
}

function phrasePolicy(
  composition: Composition,
  start: number,
): MechanismSemanticTypographyPolicy {
  const phrase = textLayer(composition, "phrase");
  const association: SemanticAssociation = {
    id: "intact-phrase",
    purpose:
      "Read the complete authored phrase without splitting its identifier or negation",
    kind: "phrase",
    start,
    end: composition.frameCount,
    members: [
      {
        layer: "phrase",
        text: phrase.text,
        kind: "value",
        locale: phrase.locale === "th" ? "th" : "en",
      },
    ],
  };
  return {
    semanticProfile: "require-declared-context",
    semanticAssociations: [association],
    readingDeclarations: [readingDeclaration(association)],
  };
}

function intactPhrase(
  fonts: MechanismSemanticTypographyInput["fonts"],
  id: string,
  text: string,
): Composition {
  return CompositionSchema.parse({
    schemaVersion: "composition-1",
    id,
    width: 1280,
    height: 720,
    fps: 30,
    frameCount: 120,
    background: "#f6f1e7",
    assets: Object.values(fonts),
    layers: [
      {
        id: "phrase",
        type: "text",
        text,
        fontAsset: fonts.semibold.id,
        fontSize: 72,
        color: "#14252b",
        textRole: "label",
        anchor: "baseline",
        locale: "en",
        transform: { position: [144, 360] },
      },
    ],
    textAnimators: [
      {
        node: "phrase",
        unit: "line",
        start: 18,
        end: 42,
        stagger: 0,
        anchor: "all",
        mask: "none",
        selector: { start: 0, end: 1 },
        excludeSpaces: false,
        from: { offset: [0, 27], opacity: 0 },
      },
    ],
  });
}

/** Native contract inputs depend only on the public repository's exact pinned fonts. */
export function createMechanismSemanticTypographyContractSources(
  fonts: MechanismSemanticTypographyInput["fonts"],
): MechanismSemanticTypographyInput["historical"] {
  checkFonts(fonts);
  const ss02 = intactPhrase(fonts, "contract-thai-intact", publicThaiTestCopy);
  const phrase = textLayer(ss02, "phrase");
  phrase.fontAsset = fonts.thai.id;
  phrase.fontSize = 96;
  phrase.locale = "th";
  phrase.style = "thai";
  ss02.textStyles = {
    thai: {
      fontAsset: fonts.thai.id,
      size: 96,
      axes: { wght: 600, wdth: 100 },
    },
  };
  const ss03 = endpointControl(fonts, "en", 30);
  ss03.id = "contract-coherent-example";
  const group = ss03.layers.find((layer) => layer.id === "quantity")!;
  group.transform = {
    ...group.transform,
    position: {
      keys: [
        { frame: 0, value: [0, 27] },
        { frame: 18, value: [0, 27] },
        { frame: 42, value: [0, 0] },
        { frame: 119, value: [0, 0] },
      ],
    },
    opacity: {
      keys: [
        { frame: 0, value: 0 },
        { frame: 18, value: 0 },
        { frame: 42, value: 1 },
        { frame: 119, value: 1 },
      ],
    },
  };
  const ss04 = structuredClone(ss03);
  ss04.id = "contract-late-example-context";
  for (const id of ["unit", "qualifier"]) {
    const layer = textLayer(ss04, id);
    layer.transform = {
      ...layer.transform,
      opacity: {
        keys: [
          { frame: 0, value: 0 },
          { frame: 69, value: 0 },
          { frame: 70, value: 1 },
          { frame: 119, value: 1 },
        ],
      },
    };
  }
  return {
    ss02: CompositionSchema.parse({
      ...ss02,
      metadata: { semanticSourceBasis: "hermetic-authored-contract" },
    }),
    ss03: CompositionSchema.parse({
      ...ss03,
      metadata: { semanticSourceBasis: "hermetic-authored-contract" },
    }),
    ss04: CompositionSchema.parse({
      ...ss04,
      metadata: { semanticSourceBasis: "hermetic-authored-contract" },
    }),
  };
}

/** Pure fixture construction: no filesystem, rendering, synthesis or project mutation. */
export function createMechanismSemanticTypographyFixtures(
  input: MechanismSemanticTypographyInput,
): MechanismSemanticTypographyFixture[] {
  checkFonts(input.fonts);
  const generatedBasis =
    input.historical.ss02.metadata?.semanticSourceBasis ===
    "hermetic-authored-contract";
  const basis =
    input.basis ??
    (generatedBasis
      ? "hermetic-authored-contract"
      : "historical-hashed-source");
  if (generatedBasis && basis !== "hermetic-authored-contract")
    throw new Error(
      "Generated semantic contract sources cannot claim historical provenance",
    );
  const thaiPhrase = textLayer(input.historical.ss02, "phrase").text;
  const sourceReference = (
    key: keyof MechanismSemanticTypographyInput["historical"],
  ): Record<string, JsonValue> =>
    basis === "historical-hashed-source"
      ? {
          sourceBasis: basis,
          originalSource: json(MECHANISM_SEMANTIC_HISTORICAL_INPUTS[key]),
        }
      : {
          sourceBasis: basis,
          authoredSource: {
            slot: key,
            factory: "createMechanismSemanticTypographyContractSources",
            publicCopyReference:
              key === "ss02"
                ? "tests/browser/mechanism-typography-proof.ts: Thai stress copy"
                : "Authored generic quantity review contract",
          },
        };
  for (const key of ["ss02", "ss03", "ss04"] as const) {
    const composition = CompositionSchema.parse(input.historical[key]);
    if (composition.frameCount !== 120 || composition.fps !== 30)
      throw new Error(
        `Semantic source ${key} must retain 120 frames at 30 fps`,
      );
  }
  for (const key of ["ss03", "ss04"] as const) {
    const composition = input.historical[key];
    if (
      textLayer(composition, "value").text !== "12" ||
      textLayer(composition, "unit").text !== "units" ||
      textLayer(composition, "qualifier").text !== "Example value"
    )
      throw new Error(`Historical ${key} must retain its exact example copy`);
  }

  const fixtures: MechanismSemanticTypographyFixture[] = [];
  for (const key of ["ss02", "ss03", "ss04"] as const) {
    fixtures.push(
      makeFixture(
        `${key}-legacy-original`,
        input.historical[key],
        { semanticProfile: "legacy" },
        "unassessed",
        [],
        {
          ...sourceReference(key),
          originalAnimation:
            basis === "historical-hashed-source"
              ? "Caller compiles exact hashed historical source; helper changes only id and metadata"
              : "Generated native contract input; helper changes only id and metadata",
          copy: key === "ss02" ? thaiPhrase : "12 | units | Example value",
          factualIntermediates:
            "unassessed; no historical or E01 quantity assertion",
        },
        historicalFrames,
      ),
    );
  }
  const resolved = quantityAssociation(input.historical.ss03);
  fixtures.push(
    makeFixture(
      "ss03-coherent-whole-interval",
      input.historical.ss03,
      {
        semanticProfile: "require-declared-context",
        semanticAssociations: [resolved],
      },
      "passed",
      [],
      {
        ...sourceReference("ss03"),
        associationScope:
          "Complete example endpoint shares the original entrance; numerical truth is unassessed",
        retainedRawMotion:
          "Supplied source clamp motion remains available to default lint",
      },
      historicalFrames,
    ),
  );
  fixtures.push(
    makeFixture(
      "ss04-strict-whole-interval",
      input.historical.ss04,
      {
        semanticProfile: "require-declared-context",
        semanticAssociations: [quantityAssociation(input.historical.ss04)],
      },
      "failed",
      ["semantic-context-incomplete"],
      {
        ...sourceReference("ss04"),
        fault:
          "Value enters before its unit and qualification; association spans source frames 0..120",
        retainedRawMotion:
          "Source frame-70 opacity jump remains available to default lint",
      },
      historicalFrames,
    ),
  );
  fixtures.push(
    makeFixture(
      "strict-undeclared-context",
      input.historical.ss03,
      { semanticProfile: "require-declared-context" },
      "failed",
      ["semantic-context-required"],
      {
        ...sourceReference("ss03"),
        fault: "Strict review profile without authored context",
      },
      historicalFrames,
    ),
  );

  const controls: {
    composition: Composition;
    locale: "en" | "th";
    fps: 24 | 30;
  }[] = [];
  for (const locale of ["en", "th"] as const) {
    for (const fps of [24, 30] as const) {
      const composition = endpointControl(input.fonts, locale, fps);
      controls.push({ composition, locale, fps });
      fixtures.push(
        makeFixture(
          `complete-endpoint-${locale}-${fps}`,
          composition,
          quantityPolicy(composition),
          "passed",
          [],
          {
            authoredExample: true,
            locale,
            interval: [0, fps * 4],
            endpointOnly: true,
          },
          [0, fps - 1, fps, fps * 2 - 1, fps * 2, fps * 4 - 1],
        ),
      );
    }
  }
  const base = controls.find(
    (entry) => entry.locale === "en" && entry.fps === 30,
  )!.composition;
  const negative = (
    id: string,
    mutate: (
      composition: Composition,
      policy: MechanismSemanticTypographyPolicy,
    ) => void,
    expectedCodes: string[],
    fault: string,
    snapshotFrames?: number[],
  ) => {
    const composition = structuredClone(base);
    const policy = quantityPolicy(composition);
    mutate(composition, policy);
    fixtures.push(
      makeFixture(
        id,
        composition,
        policy,
        "failed",
        expectedCodes,
        { authoredExample: true, fault },
        snapshotFrames,
      ),
    );
  };
  negative(
    "missing-member-reference",
    (composition) => {
      composition.layers = composition.layers.filter(
        (layer) => layer.id !== "unit",
      );
    },
    ["semantic-member-reference"],
    "Declared unit layer is absent",
  );
  negative(
    "wrong-member-reference",
    (_composition, policy) => {
      policy.semanticAssociations![0]!.members[1]!.layer = "unknown-unit";
    },
    ["semantic-member-reference"],
    "Declared unit ID is wrong",
  );
  negative(
    "replaced-member-copy",
    (composition) => {
      textLayer(composition, "value").text = "120";
    },
    ["semantic-copy-changed"],
    "Actual value copy was replaced without updating the saved declaration",
  );
  negative(
    "missing-required-unit",
    (_composition, policy) => {
      policy.semanticAssociations![0]!.members =
        policy.semanticAssociations![0]!.members.filter(
          (member) => member.kind !== "unit",
        );
    },
    ["comp-lint-semantic-member"],
    "Quantity declaration omits its required unit member",
  );
  negative(
    "unit-changes-mid-count",
    (composition) => {
      const value = textLayer(composition, "value");
      value.states = ["12", "24"];
      value.style = "count";
      value.transition = {
        kind: "count",
        window: { start: 30, end: 90 },
        fromState: 0,
        toState: 1,
        decimals: 0,
      };
      composition.textStyles = {
        ...composition.textStyles,
        count: {
          fontAsset: input.fonts.semibold.id,
          size: 96,
          figures: "tabular",
        },
      };
      const unit = textLayer(composition, "unit");
      unit.states = ["units", "mm"];
      unit.state = {
        keys: [
          { frame: 0, value: 0 },
          { frame: 60, value: 1 },
        ],
      };
    },
    ["semantic-copy-changed"],
    "Deliberate example count changes units at frame 60; no factual intermediate value is asserted",
    [0, 29, 30, 59, 60, 89, 90, 119],
  );
  negative(
    "partial-retype-copy",
    (composition) => {
      const value = textLayer(composition, "value");
      value.states = ["12", "24"];
      value.transition = {
        kind: "retype",
        window: { start: 30, end: 90 },
        fromState: 0,
        toState: 1,
      };
    },
    ["semantic-copy-changed"],
    "Active retype cannot certify the declared intact value; settled replacement24 remains distinct from declared12",
    [0, 29, 30, 59, 60, 89, 90, 119],
  );
  negative(
    "faint-qualification",
    (composition) => {
      const qualifier = textLayer(composition, "qualifier");
      qualifier.transform = { ...qualifier.transform, opacity: 0.2 };
    },
    ["semantic-context-incomplete", "reading-time"],
    "Qualification opacity is 0.2 while value and unit are fully opaque",
  );
  negative(
    "equal-faint-context",
    (composition) => {
      const group = composition.layers.find(
        (layer) => layer.id === "quantity",
      )!;
      group.transform = { ...group.transform, opacity: 0.2 };
    },
    ["semantic-context-incomplete", "reading-time"],
    "Value, unit and qualification share group opacity 0.2; equal context opacity does not supply any readable value frames",
  );
  const faintGlyph = structuredClone(base);
  faintGlyph.textAnimators = [
    {
      node: "qualifier",
      unit: "line",
      start: 0,
      end: 119,
      stagger: 0,
      selector: { start: 0, end: 1 },
      anchor: "all",
      mask: "none",
      from: { opacity: 0.2 },
      to: { opacity: 0.2 },
    },
  ];
  fixtures.push(
    makeFixture(
      "faint-glyph-qualification",
      faintGlyph,
      quantityPolicy(faintGlyph),
      "passed",
      [],
      {
        authoredExample: true,
        treatment:
          "Opaque layer and layer color; full-selection qualification glyph opacity is 0.2 through the supported text animator",
        semanticScope:
          "Layer context remains coherent; the semantic analyzer does not measure actual glyph readability",
        glyphReadability:
          "Unassessed by semantic lint; retained encoded negative must be compared with the complete control",
      },
    ),
  );

  const colorOnly = structuredClone(base);
  colorOnly.textAnimators = [
    {
      node: "value",
      unit: "glyph",
      start: 0,
      end: 119,
      stagger: 0,
      selector: { start: 0, end: 1 },
      mask: "none",
      anchor: "all",
      from: { color: "#14252b" },
      to: { color: "#244e62" },
    },
  ];
  fixtures.push(
    makeFixture(
      "opaque-color-only-reading",
      colorOnly,
      quantityPolicy(colorOnly),
      "passed",
      [],
      {
        authoredExample: true,
        treatment:
          "Opaque color-only emphasis; stable copy and complete context",
        contrastStatus:
          "Requires retained encoded review; semantic analyzer does not measure contrast",
      },
      [0, 30, 60, 90, 119],
    ),
  );

  const phraseRoute = {
    unit: "line",
    fullSelection: [0, 1],
    stagger: 0,
    anchor: "all",
    mask: "none",
    start: 18,
    end: 42,
    excludeSpaces: false,
  };
  for (const [id, copy] of [
    ["intact-wifi-6e", "Wi-Fi 6E"],
    ["intact-usbc-30w", "USB-C 30W"],
    ["intact-quantity-negation", "12 units,\nnot 120"],
  ] as const) {
    const composition = intactPhrase(input.fonts, id, copy);
    fixtures.push(
      makeFixture(
        id,
        composition,
        phrasePolicy(composition, 42),
        "passed",
        [],
        {
          authoredExample: true,
          copy,
          intactRoute: phraseRoute,
          associationScope:
            "Resolved full phrase; entry is inspected separately",
        },
        [0, 17, 18, 19, 30, 41, 42, 119],
      ),
    );
  }
  fixtures.push(
    makeFixture(
      "ss02-intact-thai-resolved",
      input.historical.ss02,
      phrasePolicy(input.historical.ss02, 42),
      "passed",
      [],
      {
        ...sourceReference("ss02"),
        copy: thaiPhrase,
        intactRoute: phraseRoute,
        associationScope:
          "Resolved full Thai phrase; marks and entry are inspected separately",
      },
      [0, 17, 18, 19, 30, 41, 42, 119],
    ),
  );
  return fixtures;
}
