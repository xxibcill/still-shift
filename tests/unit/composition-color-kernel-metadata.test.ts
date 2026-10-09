// Independent constructor and ownership regressions for fixed built-in color kernels.
// Frozen expectations were produced ONLY by the untouched original constructor:
// /private/tmp/ce15-color-effects-original.ts
// SHA256 24f638eede622b1fd46366db0cb70d91f03bde488dac4ad3fef15532dbd879d7
// /private/tmp/ce15_color_kernel_original_constructor_oracle.ts
// /private/tmp/ce15-color-kernel-original-constructor-oracles.json
// Full shader JSON hashes also independently match the already-frozen native
// oracle file. No native pixel/parameter Get oracle was regenerated.
//
// Capacity contract: ten immutable built-in ids/properties under native original
// entries/filter/map/join/freeze. Arbitrary external registry/schema changes,
// foreign allocator ownership, hidden partial products of replaced intrinsics,
// proxy-ownKeys capacity, global bootstrap/immutable escaped wrapper metadata,
// and callback-work/child/backend lifetimes are NOT proven by these tests.
// State holds below test only actual state/shader lifetime. Broader reentrant
// success through GPU/Canvas child disposal remains pending.
// The common helper now holds ownership through adoption and registry handoff.
// Kernel guards still protect publication; common factory/registry failure cuts
// and known cross-allocator aliases are covered in managed-metadata-lifetime.
import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { compositionEffectDefinition } from "../../packages/scene-contract/src/index.ts";
import { colorEffectKernel } from "../../packages/renderer-core/src/composition/render/color-effects.ts";
import {
  ManagedMemory,
  type MemoryLease,
} from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { releaseRenderMetadata } from "../../packages/renderer-core/src/managed-metadata.ts";

const originalConstruction = [
  {
    id: "color.curves",
    shaderLength: 596,
    shaderSha256:
      "83da9805cfafd8519b1b79d6aebf3d2378273e1d3923f6509540013f96539055",
    shaderRawSha256:
      "8512d594e8c1e15cbc51915bc2224548c17f4495f2077d6c827860467f17b840",
    fields: ["id", "definition", "renderGpu", "renderCanvas"],
    descriptors: {
      id: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "string",
      },
      definition: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "object",
      },
      renderGpu: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
      renderCanvas: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
    },
    frozen: true,
    frozenDefinition: true,
    frozenProperties: true,
    sameDefinition: true,
    properties: [
      ["curve", "curve"],
      ["amount", "scalar"],
    ],
    trace: [
      "entries.properties",
      "filter.entries",
      "tuple.curve.Symbol(Symbol.iterator)",
      "tuple.curve.length",
      "tuple.curve.0",
      "tuple.curve.length",
      "tuple.curve.1",
      "property.curve.type",
      "tuple.amount.Symbol(Symbol.iterator)",
      "tuple.amount.length",
      "tuple.amount.0",
      "tuple.amount.length",
      "tuple.amount.1",
      "property.amount.type",
      "map.filtered",
      "tuple.amount.Symbol(Symbol.iterator)",
      "tuple.amount.length",
      "tuple.amount.0",
      "tuple.amount.length",
      "tuple.amount.1",
      "property.amount.type",
      "join.mapped:\n",
      "freeze.kernel",
    ],
    typeReads: [
      "property.curve.type",
      "property.amount.type",
      "property.amount.type",
    ],
    params: {
      curve: [
        [0, 0],
        [1, 1],
      ],
      amount: 1,
    },
  },
  {
    id: "color.levels",
    shaderLength: 738,
    shaderSha256:
      "c7fb85e31b8e955279ab3ee0375225dc74411432cbe28a1e1f6da2d0e3c1f69a",
    shaderRawSha256:
      "f7f215b0e463ce5693a2a3509a360d08d6a79d42435a88b9c8ed86794e3d7ad6",
    fields: ["id", "definition", "renderGpu", "renderCanvas"],
    descriptors: {
      id: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "string",
      },
      definition: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "object",
      },
      renderGpu: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
      renderCanvas: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
    },
    frozen: true,
    frozenDefinition: true,
    frozenProperties: true,
    sameDefinition: true,
    properties: [
      ["inputBlack", "scalar"],
      ["inputWhite", "scalar"],
      ["gamma", "scalar"],
      ["outputBlack", "scalar"],
      ["outputWhite", "scalar"],
    ],
    trace: [
      "entries.properties",
      "filter.entries",
      "tuple.inputBlack.Symbol(Symbol.iterator)",
      "tuple.inputBlack.length",
      "tuple.inputBlack.0",
      "tuple.inputBlack.length",
      "tuple.inputBlack.1",
      "property.inputBlack.type",
      "tuple.inputWhite.Symbol(Symbol.iterator)",
      "tuple.inputWhite.length",
      "tuple.inputWhite.0",
      "tuple.inputWhite.length",
      "tuple.inputWhite.1",
      "property.inputWhite.type",
      "tuple.gamma.Symbol(Symbol.iterator)",
      "tuple.gamma.length",
      "tuple.gamma.0",
      "tuple.gamma.length",
      "tuple.gamma.1",
      "property.gamma.type",
      "tuple.outputBlack.Symbol(Symbol.iterator)",
      "tuple.outputBlack.length",
      "tuple.outputBlack.0",
      "tuple.outputBlack.length",
      "tuple.outputBlack.1",
      "property.outputBlack.type",
      "tuple.outputWhite.Symbol(Symbol.iterator)",
      "tuple.outputWhite.length",
      "tuple.outputWhite.0",
      "tuple.outputWhite.length",
      "tuple.outputWhite.1",
      "property.outputWhite.type",
      "map.filtered",
      "tuple.inputBlack.Symbol(Symbol.iterator)",
      "tuple.inputBlack.length",
      "tuple.inputBlack.0",
      "tuple.inputBlack.length",
      "tuple.inputBlack.1",
      "property.inputBlack.type",
      "tuple.inputWhite.Symbol(Symbol.iterator)",
      "tuple.inputWhite.length",
      "tuple.inputWhite.0",
      "tuple.inputWhite.length",
      "tuple.inputWhite.1",
      "property.inputWhite.type",
      "tuple.gamma.Symbol(Symbol.iterator)",
      "tuple.gamma.length",
      "tuple.gamma.0",
      "tuple.gamma.length",
      "tuple.gamma.1",
      "property.gamma.type",
      "tuple.outputBlack.Symbol(Symbol.iterator)",
      "tuple.outputBlack.length",
      "tuple.outputBlack.0",
      "tuple.outputBlack.length",
      "tuple.outputBlack.1",
      "property.outputBlack.type",
      "tuple.outputWhite.Symbol(Symbol.iterator)",
      "tuple.outputWhite.length",
      "tuple.outputWhite.0",
      "tuple.outputWhite.length",
      "tuple.outputWhite.1",
      "property.outputWhite.type",
      "join.mapped:\n",
      "freeze.kernel",
    ],
    typeReads: [
      "property.inputBlack.type",
      "property.inputWhite.type",
      "property.gamma.type",
      "property.outputBlack.type",
      "property.outputWhite.type",
      "property.inputBlack.type",
      "property.inputWhite.type",
      "property.gamma.type",
      "property.outputBlack.type",
      "property.outputWhite.type",
    ],
    params: {
      inputBlack: 0,
      inputWhite: 1,
      gamma: 1,
      outputBlack: 0,
      outputWhite: 1,
    },
  },
  {
    id: "color.tint",
    shaderLength: 539,
    shaderSha256:
      "9078ff78ffa02795faaad7f005fa5008f766ef4fcb6ca9b78a566c6094681412",
    shaderRawSha256:
      "34f3a3773d6b698d06e599e7a162811a72bea652bb73fe33f276a27a1aca6dfa",
    fields: ["id", "definition", "renderGpu", "renderCanvas"],
    descriptors: {
      id: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "string",
      },
      definition: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "object",
      },
      renderGpu: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
      renderCanvas: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
    },
    frozen: true,
    frozenDefinition: true,
    frozenProperties: true,
    sameDefinition: true,
    properties: [
      ["black", "color"],
      ["white", "color"],
      ["amount", "scalar"],
    ],
    trace: [
      "entries.properties",
      "filter.entries",
      "tuple.black.Symbol(Symbol.iterator)",
      "tuple.black.length",
      "tuple.black.0",
      "tuple.black.length",
      "tuple.black.1",
      "property.black.type",
      "tuple.white.Symbol(Symbol.iterator)",
      "tuple.white.length",
      "tuple.white.0",
      "tuple.white.length",
      "tuple.white.1",
      "property.white.type",
      "tuple.amount.Symbol(Symbol.iterator)",
      "tuple.amount.length",
      "tuple.amount.0",
      "tuple.amount.length",
      "tuple.amount.1",
      "property.amount.type",
      "map.filtered",
      "tuple.black.Symbol(Symbol.iterator)",
      "tuple.black.length",
      "tuple.black.0",
      "tuple.black.length",
      "tuple.black.1",
      "property.black.type",
      "property.black.type",
      "tuple.white.Symbol(Symbol.iterator)",
      "tuple.white.length",
      "tuple.white.0",
      "tuple.white.length",
      "tuple.white.1",
      "property.white.type",
      "property.white.type",
      "tuple.amount.Symbol(Symbol.iterator)",
      "tuple.amount.length",
      "tuple.amount.0",
      "tuple.amount.length",
      "tuple.amount.1",
      "property.amount.type",
      "join.mapped:\n",
      "freeze.kernel",
    ],
    typeReads: [
      "property.black.type",
      "property.white.type",
      "property.amount.type",
      "property.black.type",
      "property.black.type",
      "property.white.type",
      "property.white.type",
      "property.amount.type",
    ],
    params: {
      black: [0, 0, 0, 1],
      white: [1, 1, 1, 1],
      amount: 1,
    },
  },
  {
    id: "color.hue-saturation",
    shaderLength: 1114,
    shaderSha256:
      "af09d7a74464aea7a41456a12307546b6665b84c416a159939768d6bc2b14cc6",
    shaderRawSha256:
      "a0de37f0060ff48d1a16e335b3730f1b5e59ee1ddea5565f5da176ec5c47bc67",
    fields: ["id", "definition", "renderGpu", "renderCanvas"],
    descriptors: {
      id: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "string",
      },
      definition: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "object",
      },
      renderGpu: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
      renderCanvas: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
    },
    frozen: true,
    frozenDefinition: true,
    frozenProperties: true,
    sameDefinition: true,
    properties: [
      ["hue", "scalar"],
      ["saturation", "scalar"],
      ["lightness", "scalar"],
    ],
    trace: [
      "entries.properties",
      "filter.entries",
      "tuple.hue.Symbol(Symbol.iterator)",
      "tuple.hue.length",
      "tuple.hue.0",
      "tuple.hue.length",
      "tuple.hue.1",
      "property.hue.type",
      "tuple.saturation.Symbol(Symbol.iterator)",
      "tuple.saturation.length",
      "tuple.saturation.0",
      "tuple.saturation.length",
      "tuple.saturation.1",
      "property.saturation.type",
      "tuple.lightness.Symbol(Symbol.iterator)",
      "tuple.lightness.length",
      "tuple.lightness.0",
      "tuple.lightness.length",
      "tuple.lightness.1",
      "property.lightness.type",
      "map.filtered",
      "tuple.hue.Symbol(Symbol.iterator)",
      "tuple.hue.length",
      "tuple.hue.0",
      "tuple.hue.length",
      "tuple.hue.1",
      "property.hue.type",
      "tuple.saturation.Symbol(Symbol.iterator)",
      "tuple.saturation.length",
      "tuple.saturation.0",
      "tuple.saturation.length",
      "tuple.saturation.1",
      "property.saturation.type",
      "tuple.lightness.Symbol(Symbol.iterator)",
      "tuple.lightness.length",
      "tuple.lightness.0",
      "tuple.lightness.length",
      "tuple.lightness.1",
      "property.lightness.type",
      "join.mapped:\n",
      "freeze.kernel",
    ],
    typeReads: [
      "property.hue.type",
      "property.saturation.type",
      "property.lightness.type",
      "property.hue.type",
      "property.saturation.type",
      "property.lightness.type",
    ],
    params: {
      hue: 0,
      saturation: 0,
      lightness: 0,
    },
  },
  {
    id: "color.exposure",
    shaderLength: 496,
    shaderSha256:
      "bdb0493771d60a46da2bfc66f509e64abaf15eea0a4bd5e0077bb9f78119d52c",
    shaderRawSha256:
      "b15e7d8f04dff46feb410d308a4e4b8b202d6278f2ea581a8d5dd687845d20d0",
    fields: ["id", "definition", "renderGpu", "renderCanvas"],
    descriptors: {
      id: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "string",
      },
      definition: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "object",
      },
      renderGpu: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
      renderCanvas: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
    },
    frozen: true,
    frozenDefinition: true,
    frozenProperties: true,
    sameDefinition: true,
    properties: [
      ["exposure", "scalar"],
      ["offset", "scalar"],
      ["gamma", "scalar"],
    ],
    trace: [
      "entries.properties",
      "filter.entries",
      "tuple.exposure.Symbol(Symbol.iterator)",
      "tuple.exposure.length",
      "tuple.exposure.0",
      "tuple.exposure.length",
      "tuple.exposure.1",
      "property.exposure.type",
      "tuple.offset.Symbol(Symbol.iterator)",
      "tuple.offset.length",
      "tuple.offset.0",
      "tuple.offset.length",
      "tuple.offset.1",
      "property.offset.type",
      "tuple.gamma.Symbol(Symbol.iterator)",
      "tuple.gamma.length",
      "tuple.gamma.0",
      "tuple.gamma.length",
      "tuple.gamma.1",
      "property.gamma.type",
      "map.filtered",
      "tuple.exposure.Symbol(Symbol.iterator)",
      "tuple.exposure.length",
      "tuple.exposure.0",
      "tuple.exposure.length",
      "tuple.exposure.1",
      "property.exposure.type",
      "tuple.offset.Symbol(Symbol.iterator)",
      "tuple.offset.length",
      "tuple.offset.0",
      "tuple.offset.length",
      "tuple.offset.1",
      "property.offset.type",
      "tuple.gamma.Symbol(Symbol.iterator)",
      "tuple.gamma.length",
      "tuple.gamma.0",
      "tuple.gamma.length",
      "tuple.gamma.1",
      "property.gamma.type",
      "join.mapped:\n",
      "freeze.kernel",
    ],
    typeReads: [
      "property.exposure.type",
      "property.offset.type",
      "property.gamma.type",
      "property.exposure.type",
      "property.offset.type",
      "property.gamma.type",
    ],
    params: {
      exposure: 0,
      offset: 0,
      gamma: 1,
    },
  },
  {
    id: "color.brightness-contrast",
    shaderLength: 517,
    shaderSha256:
      "d61b02099224b02b665ed0481c6562127c9bfb78d728540a1046d8e3e6c66e1b",
    shaderRawSha256:
      "6eeb440f5bdb8582dd7311e4983bab4477c838fd2cc22c67a9061e8fdee35e64",
    fields: ["id", "definition", "renderGpu", "renderCanvas"],
    descriptors: {
      id: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "string",
      },
      definition: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "object",
      },
      renderGpu: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
      renderCanvas: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
    },
    frozen: true,
    frozenDefinition: true,
    frozenProperties: true,
    sameDefinition: true,
    properties: [
      ["brightness", "scalar"],
      ["contrast", "scalar"],
    ],
    trace: [
      "entries.properties",
      "filter.entries",
      "tuple.brightness.Symbol(Symbol.iterator)",
      "tuple.brightness.length",
      "tuple.brightness.0",
      "tuple.brightness.length",
      "tuple.brightness.1",
      "property.brightness.type",
      "tuple.contrast.Symbol(Symbol.iterator)",
      "tuple.contrast.length",
      "tuple.contrast.0",
      "tuple.contrast.length",
      "tuple.contrast.1",
      "property.contrast.type",
      "map.filtered",
      "tuple.brightness.Symbol(Symbol.iterator)",
      "tuple.brightness.length",
      "tuple.brightness.0",
      "tuple.brightness.length",
      "tuple.brightness.1",
      "property.brightness.type",
      "tuple.contrast.Symbol(Symbol.iterator)",
      "tuple.contrast.length",
      "tuple.contrast.0",
      "tuple.contrast.length",
      "tuple.contrast.1",
      "property.contrast.type",
      "join.mapped:\n",
      "freeze.kernel",
    ],
    typeReads: [
      "property.brightness.type",
      "property.contrast.type",
      "property.brightness.type",
      "property.contrast.type",
    ],
    params: {
      brightness: 0,
      contrast: 0,
    },
  },
  {
    id: "color.fill",
    shaderLength: 443,
    shaderSha256:
      "9c8136f49b51a84d049a9cbc0a8d2f113f7973e870269f12236fa306dd11b1ac",
    shaderRawSha256:
      "2bb48f9f8a33083e06737f5b8b46ee2e79173577b5f32cee64196749061697ab",
    fields: ["id", "definition", "renderGpu", "renderCanvas"],
    descriptors: {
      id: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "string",
      },
      definition: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "object",
      },
      renderGpu: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
      renderCanvas: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
    },
    frozen: true,
    frozenDefinition: true,
    frozenProperties: true,
    sameDefinition: true,
    properties: [
      ["color", "color"],
      ["amount", "scalar"],
    ],
    trace: [
      "entries.properties",
      "filter.entries",
      "tuple.color.Symbol(Symbol.iterator)",
      "tuple.color.length",
      "tuple.color.0",
      "tuple.color.length",
      "tuple.color.1",
      "property.color.type",
      "tuple.amount.Symbol(Symbol.iterator)",
      "tuple.amount.length",
      "tuple.amount.0",
      "tuple.amount.length",
      "tuple.amount.1",
      "property.amount.type",
      "map.filtered",
      "tuple.color.Symbol(Symbol.iterator)",
      "tuple.color.length",
      "tuple.color.0",
      "tuple.color.length",
      "tuple.color.1",
      "property.color.type",
      "property.color.type",
      "tuple.amount.Symbol(Symbol.iterator)",
      "tuple.amount.length",
      "tuple.amount.0",
      "tuple.amount.length",
      "tuple.amount.1",
      "property.amount.type",
      "join.mapped:\n",
      "freeze.kernel",
    ],
    typeReads: [
      "property.color.type",
      "property.amount.type",
      "property.color.type",
      "property.color.type",
      "property.amount.type",
    ],
    params: {
      color: [1, 1, 1, 1],
      amount: 1,
    },
  },
  {
    id: "color.gradient-ramp",
    shaderLength: 1896,
    shaderSha256:
      "3621b0e4c28212bda3f1da5d4c7434e261c64be1c722845623e9767d664224f3",
    shaderRawSha256:
      "50ddc1b7f366a60b4d53649558d6753589e4f12b5d833be8302eb5498b49015b",
    fields: ["id", "definition", "renderGpu", "renderCanvas"],
    descriptors: {
      id: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "string",
      },
      definition: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "object",
      },
      renderGpu: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
      renderCanvas: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
    },
    frozen: true,
    frozenDefinition: true,
    frozenProperties: true,
    sameDefinition: true,
    properties: [
      ["start", "vec2"],
      ["end", "vec2"],
      ["startColor", "color"],
      ["endColor", "color"],
      ["amount", "scalar"],
    ],
    trace: [
      "entries.properties",
      "filter.entries",
      "tuple.start.Symbol(Symbol.iterator)",
      "tuple.start.length",
      "tuple.start.0",
      "tuple.start.length",
      "tuple.start.1",
      "property.start.type",
      "tuple.end.Symbol(Symbol.iterator)",
      "tuple.end.length",
      "tuple.end.0",
      "tuple.end.length",
      "tuple.end.1",
      "property.end.type",
      "tuple.startColor.Symbol(Symbol.iterator)",
      "tuple.startColor.length",
      "tuple.startColor.0",
      "tuple.startColor.length",
      "tuple.startColor.1",
      "property.startColor.type",
      "tuple.endColor.Symbol(Symbol.iterator)",
      "tuple.endColor.length",
      "tuple.endColor.0",
      "tuple.endColor.length",
      "tuple.endColor.1",
      "property.endColor.type",
      "tuple.amount.Symbol(Symbol.iterator)",
      "tuple.amount.length",
      "tuple.amount.0",
      "tuple.amount.length",
      "tuple.amount.1",
      "property.amount.type",
      "map.filtered",
      "tuple.start.Symbol(Symbol.iterator)",
      "tuple.start.length",
      "tuple.start.0",
      "tuple.start.length",
      "tuple.start.1",
      "property.start.type",
      "property.start.type",
      "tuple.end.Symbol(Symbol.iterator)",
      "tuple.end.length",
      "tuple.end.0",
      "tuple.end.length",
      "tuple.end.1",
      "property.end.type",
      "property.end.type",
      "tuple.startColor.Symbol(Symbol.iterator)",
      "tuple.startColor.length",
      "tuple.startColor.0",
      "tuple.startColor.length",
      "tuple.startColor.1",
      "property.startColor.type",
      "property.startColor.type",
      "tuple.endColor.Symbol(Symbol.iterator)",
      "tuple.endColor.length",
      "tuple.endColor.0",
      "tuple.endColor.length",
      "tuple.endColor.1",
      "property.endColor.type",
      "property.endColor.type",
      "tuple.amount.Symbol(Symbol.iterator)",
      "tuple.amount.length",
      "tuple.amount.0",
      "tuple.amount.length",
      "tuple.amount.1",
      "property.amount.type",
      "join.mapped:\n",
      "freeze.kernel",
    ],
    typeReads: [
      "property.start.type",
      "property.end.type",
      "property.startColor.type",
      "property.endColor.type",
      "property.amount.type",
      "property.start.type",
      "property.start.type",
      "property.end.type",
      "property.end.type",
      "property.startColor.type",
      "property.startColor.type",
      "property.endColor.type",
      "property.endColor.type",
      "property.amount.type",
    ],
    params: {
      start: [0, 0],
      end: [100, 0],
      startColor: [0, 0, 0, 1],
      endColor: [1, 1, 1, 1],
      amount: 1,
    },
  },
  {
    id: "color.invert",
    shaderLength: 413,
    shaderSha256:
      "f345c910da3619534d803d1f143a863a9484c25566edd3d60d02fa5ecb6f6a4d",
    shaderRawSha256:
      "89e22dbbe3be3bacebaff2c2774f83a1582405666f61a7a404daf5b8737b4ab3",
    fields: ["id", "definition", "renderGpu", "renderCanvas"],
    descriptors: {
      id: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "string",
      },
      definition: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "object",
      },
      renderGpu: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
      renderCanvas: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
    },
    frozen: true,
    frozenDefinition: true,
    frozenProperties: true,
    sameDefinition: true,
    properties: [["amount", "scalar"]],
    trace: [
      "entries.properties",
      "filter.entries",
      "tuple.amount.Symbol(Symbol.iterator)",
      "tuple.amount.length",
      "tuple.amount.0",
      "tuple.amount.length",
      "tuple.amount.1",
      "property.amount.type",
      "map.filtered",
      "tuple.amount.Symbol(Symbol.iterator)",
      "tuple.amount.length",
      "tuple.amount.0",
      "tuple.amount.length",
      "tuple.amount.1",
      "property.amount.type",
      "join.mapped:\n",
      "freeze.kernel",
    ],
    typeReads: ["property.amount.type", "property.amount.type"],
    params: {
      amount: 1,
    },
  },
  {
    id: "color.posterize",
    shaderLength: 430,
    shaderSha256:
      "e04153ea0e1f92363c551d21f703cb3e2f97bcd123bd134a85b06b16f8ba71b3",
    shaderRawSha256:
      "d0aff8651bfb61f16e6238411b7a043b63d08fca3dacd2287eeee05df4ee382d",
    fields: ["id", "definition", "renderGpu", "renderCanvas"],
    descriptors: {
      id: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "string",
      },
      definition: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "object",
      },
      renderGpu: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
      renderCanvas: {
        enumerable: true,
        configurable: false,
        writable: false,
        valueKind: "function",
      },
    },
    frozen: true,
    frozenDefinition: true,
    frozenProperties: true,
    sameDefinition: true,
    properties: [["levels", "scalar"]],
    trace: [
      "entries.properties",
      "filter.entries",
      "tuple.levels.Symbol(Symbol.iterator)",
      "tuple.levels.length",
      "tuple.levels.0",
      "tuple.levels.length",
      "tuple.levels.1",
      "property.levels.type",
      "map.filtered",
      "tuple.levels.Symbol(Symbol.iterator)",
      "tuple.levels.length",
      "tuple.levels.0",
      "tuple.levels.length",
      "tuple.levels.1",
      "property.levels.type",
      "join.mapped:\n",
      "freeze.kernel",
    ],
    typeReads: ["property.levels.type", "property.levels.type"],
    params: {
      levels: 8,
    },
  },
] as const;
const limits = { pixels: 4 * 1024 * 1024, metadata: 2 * 1024 * 1024 };
const PHASE = 32768,
  CACHE = 4096,
  STATE = 8192,
  BASE = CACHE + STATE;
type Kernel = NonNullable<ReturnType<typeof colorEffectKernel>>;
type Definition = NonNullable<ReturnType<typeof compositionEffectDefinition>>;
type Entry = [string, Definition["properties"][string]];
type State = {
  id?: string;
  cache?: Cache;
  definition?: Definition;
  shader?: string;
  kernel?: Kernel;
  lease?: MemoryLease;
};
type Cache = {
  memory?: ManagedMemory;
  lease?: MemoryLease;
  entries?: Map<string, State>;
  retire?: (state: State) => void;
  failed?: boolean;
  failure?: unknown;
};
type Phase = {
  memory?: ManagedMemory;
  cache?: Cache;
  cacheEntries?: Map<string, State>;
  newCache?: boolean;
  state?: State;
  definition?: Definition;
  entries?: Entry[];
  filtered?: Entry[];
  mapped?: string[];
  declarations?: string;
  shader?: string;
  candidate?: Kernel;
  filter?: unknown;
  mapper?: unknown;
  producer?: unknown;
  gpu?: unknown;
  canvas?: unknown;
  inserted?: string;
  committed?: boolean;
};
type Role = "phase" | "cache" | "state";
type Resource = { value?: object; destroy?: unknown };
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const rawHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function firstFailure(run: () => unknown): unknown {
  let failure: unknown = Symbol("not thrown");
  try {
    run();
  } catch (error) {
    failure = error;
  }
  return failure;
}
function zero(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function resources(memory: ManagedMemory) {
  return (memory as unknown as { resources: Map<MemoryLease, Resource> })
    .resources;
}
function role(value: object, lease: MemoryLease): Role | undefined {
  if (lease.bytes === PHASE && "memory" in value) return "phase";
  if (lease.bytes === CACHE && "entries" in value && "memory" in value)
    return "cache";
  if (lease.bytes === STATE && "shader" in value && "id" in value)
    return "state";
  return undefined;
}
function capture(
  memory: ManagedMemory,
  hook?: (
    stage: "before" | "after",
    which: Role,
    value: object,
    lease: MemoryLease,
  ) => void,
  late?: (which: Role, value: object) => void,
) {
  const found = {
    phases: [] as Phase[],
    caches: [] as Cache[],
    states: [] as State[],
    leases: new Map<object, MemoryLease>(),
    records: [] as Resource[],
  };
  const adopt = memory.adopt.bind(memory);
  vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) => {
    const which = role(value, lease);
    if (which) {
      found.leases.set(value, lease);
      if (which === "phase") found.phases.push(value as Phase);
      else if (which === "cache") found.caches.push(value as Cache);
      else found.states.push(value as State);
      hook?.("before", which, value, lease);
    }
    adopt(
      value,
      lease,
      which && late
        ? (owner) => {
            destroy?.(owner);
            late(which, owner);
          }
        : destroy,
    );
    if (which) {
      const record = resources(memory).get(lease);
      if (record) found.records.push(record);
      hook?.("after", which, value, lease);
    }
  });
  return found;
}
function cleared(
  found: ReturnType<typeof capture>,
  except: readonly object[] = [],
) {
  for (const owner of [...found.phases, ...found.caches, ...found.states])
    if (!except.includes(owner)) expect(Reflect.ownKeys(owner)).toEqual([]);
  for (const record of found.records)
    if (!record.value || !except.includes(record.value))
      expect(record).toEqual({});
}
function publicFields(
  kernel: Kernel,
  original: (typeof originalConstruction)[number],
) {
  expect(kernel.id).toBe(original.id);
  expect(Reflect.ownKeys(kernel)).toEqual(original.fields);
  expect(Object.isFrozen(kernel)).toBe(original.frozen);
  const definition = compositionEffectDefinition(original.id)!;
  expect(kernel.definition).toBe(definition);
  expect(Object.isFrozen(definition)).toBe(original.frozenDefinition);
  expect(Object.isFrozen(definition.properties)).toBe(
    original.frozenProperties,
  );
  for (const key of original.fields) {
    const descriptor = Object.getOwnPropertyDescriptor(kernel, key)!;
    expect({
      enumerable: descriptor.enumerable,
      configurable: descriptor.configurable,
      writable: descriptor.writable,
      valueKind: typeof descriptor.value,
    }).toEqual(original.descriptors[key as keyof typeof original.descriptors]);
  }
}
function fullShader(
  state: State,
  original: (typeof originalConstruction)[number],
) {
  expect(state.shader!.length).toBe(original.shaderLength);
  expect(hash(state.shader)).toBe(original.shaderSha256);
  expect(rawHash(state.shader!)).toBe(original.shaderRawSha256);
}
function poison(label: string, trace: string[]): never {
  return new Proxy(
    {},
    {
      get(_target, key) {
        trace.push(`${label}.get:${String(key)}`);
        throw null;
      },
      ownKeys() {
        trace.push(`${label}.ownKeys`);
        throw null;
      },
      getOwnPropertyDescriptor(_target, key) {
        trace.push(`${label}.descriptor:${String(key)}`);
        throw null;
      },
    },
  ) as never;
}
function noStaleReads(kernel: Kernel) {
  const trace: string[] = [];
  const context = poison("context", trace),
    input = poison("input", trace),
    params = poison("params", trace);
  expect(() => kernel.renderGpu(context, input, params)).toThrow(
    /managed color kernel is disposed/,
  );
  expect(() => kernel.renderCanvas!(context, input, params)).toThrow(
    /managed color kernel is disposed/,
  );
  expect(trace).toEqual([]);
}
function nativeHarness() {
  let id = 1;
  const input = {
    id,
    width: 1,
    height: 1,
    ctx: {
      getImageData: () => ({ data: new Uint8ClampedArray([32, 64, 96, 255]) }),
    },
  };
  const passes: string[] = [];
  const outputs: object[] = [];
  const context = {
    createSurface(width: number, height: number) {
      const output = { id: ++id, width, height, ctx: { putImageData() {} } };
      outputs.push(output);
      return output;
    },
    uploadBytes() {},
    pass(shader: string) {
      passes.push(shader);
    },
  };
  return { input, context, passes, outputs };
}
// Same observer used only for original-constructor evidence. It wraps actual
// result tuples and property objects, delegates each original Get once, and
// never replaces/mutates the frozen public definition.
function constructorTrace(
  id: string,
  before?: (
    stage: "entries" | "filter" | "map" | "join" | "freeze" | "type",
    name?: string,
  ) => void,
) {
  const definition = compositionEffectDefinition(id)!;
  const trace: string[] = [];
  const nativeEntries = Object.entries,
    filter = Array.prototype.filter,
    map = Array.prototype.map,
    join = Array.prototype.join,
    freeze = Object.freeze;
  let entries: Entry[] | undefined,
    filtered: Entry[] | undefined,
    mapped: string[] | undefined;
  let candidate: Kernel | undefined;
  vi.spyOn(Object, "entries").mockImplementation((value: object) => {
    if (value !== definition.properties) return nativeEntries(value);
    trace.push("entries.properties");
    before?.("entries");
    entries = nativeEntries(value) as Entry[];
    for (let index = 0; index < entries.length; index++) {
      const tuple = entries[index]!,
        name = tuple[0];
      tuple[1] = new Proxy(tuple[1], {
        get(target, key, receiver) {
          trace.push(`property.${name}.${String(key)}`);
          before?.("type", name);
          return Reflect.get(target, key, receiver);
        },
      });
      entries[index] = new Proxy(tuple, {
        get(target, key, receiver) {
          trace.push(`tuple.${name}.${String(key)}`);
          return Reflect.get(target, key, receiver);
        },
      });
    }
    return entries;
  });
  vi.spyOn(Array.prototype, "filter").mockImplementation(function (
    this: unknown[],
    ...args: unknown[]
  ) {
    if (this === entries) {
      trace.push("filter.entries");
      before?.("filter");
      return (filtered = Reflect.apply(filter, this, args));
    }
    return Reflect.apply(filter, this, args);
  } as typeof filter);
  vi.spyOn(Array.prototype, "map").mockImplementation(function (
    this: unknown[],
    ...args: unknown[]
  ) {
    if (this === filtered) {
      trace.push("map.filtered");
      before?.("map");
      return (mapped = Reflect.apply(map, this, args));
    }
    return Reflect.apply(map, this, args);
  } as typeof map);
  vi.spyOn(Array.prototype, "join").mockImplementation(function (
    this: unknown[],
    ...args: unknown[]
  ) {
    if (this === mapped) {
      trace.push(`join.mapped:${String(args[0])}`);
      before?.("join");
    }
    return Reflect.apply(join, this, args);
  } as typeof join);
  vi.spyOn(Object, "freeze").mockImplementation((value: unknown) => {
    if (
      value &&
      typeof value === "object" &&
      Object.getOwnPropertyDescriptor(value, "id")?.value === id &&
      Object.getOwnPropertyDescriptor(value, "renderGpu")
    ) {
      candidate = value as Kernel;
      trace.push("freeze.kernel");
      before?.("freeze");
    }
    return freeze(value);
  });
  return {
    trace,
    products: () => ({ entries, filtered, mapped, candidate }),
    restore() {
      Object.entries = nativeEntries;
      Array.prototype.filter = filter;
      Array.prototype.map = map;
      Array.prototype.join = join;
      Object.freeze = freeze;
    },
  };
}
function temporaryCleared(
  products: ReturnType<ReturnType<typeof constructorTrace>["products"]>,
  tuples: readonly Entry[],
) {
  if (products.entries) expect(products.entries).toHaveLength(0);
  if (products.filtered) expect(products.filtered).toHaveLength(0);
  if (products.mapped) expect(products.mapped).toHaveLength(0);
  for (const tuple of tuples) expect(tuple).toHaveLength(0);
}
afterEach(() => vi.restoreAllMocks());

it("preserves all ten complete original shaders, four descriptors and borrowed frozen definitions in active and inactive constructors", async () => {
  const memory = new ManagedMemory(limits),
    found = capture(memory);
  await withManagedMemory(memory, async () => {
    for (const original of originalConstruction) {
      const kernel = colorEffectKernel(original.id)!;
      publicFields(kernel, original);
      const state = found.states.at(-1)!;
      expect(state.kernel).toBe(kernel);
      expect(memory.owns(state)).toBe(true);
      expect(memory.owns(kernel)).toBe(false);
      fullShader(state, original);
    }
  });
  for (const original of originalConstruction) {
    const kernel = colorEffectKernel(original.id)!;
    publicFields(kernel, original);
    const h = nativeHarness();
    kernel.renderGpu(
      h.context as never,
      h.input as never,
      original.params as never,
    );
    expect(h.passes).toHaveLength(1);
    expect(h.passes[0]!.length).toBe(original.shaderLength);
    expect(hash(h.passes[0])).toBe(original.shaderSha256);
    expect(rawHash(h.passes[0]!)).toBe(original.shaderRawSha256);
  }
  memory.dispose();
  cleared(found);
  zero(memory);
});

it("keeps all original constructor tuple/type Get ordering under phase ownership and clears the actual products", async () => {
  for (const original of originalConstruction) {
    const memory = new ManagedMemory(limits),
      found = capture(memory);
    await withManagedMemory(memory, async () => {
      let tuples: Entry[] = [],
        declarations: string | undefined,
        shader: string | undefined;
      const observer = constructorTrace(original.id, (stage) => {
        const phase = found.phases.at(-1)!;
        expect(memory.owns(phase)).toBe(true);
        expect(found.leases.get(phase)!.active).toBe(true);
        expect(memory.statistics.current.metadata).toBe(
          stage === "freeze" ? PHASE + CACHE + STATE : PHASE + CACHE,
        );
        if (stage === "filter") {
          expect(phase.entries).toBe(observer.products().entries);
          tuples = [...phase.entries!];
        }
        if (stage === "map") {
          expect(phase.filtered).toBe(observer.products().filtered);
          for (const tuple of phase.filtered!)
            expect(phase.entries!.includes(tuple)).toBe(true);
        }
        if (stage === "join")
          expect(phase.mapped).toBe(observer.products().mapped);
        if (stage === "freeze") {
          declarations = phase.declarations;
          shader = phase.shader;
          expect(phase.candidate).toBe(observer.products().candidate);
          expect(phase.gpu).toBe(phase.candidate!.renderGpu);
          expect(phase.canvas).toBe(phase.candidate!.renderCanvas);
          expect(phase.state!.definition).toBe(phase.definition);
          expect(phase.state!.shader).toBe(shader);
          expect(memory.owns(phase.state!)).toBe(true);
        }
      });
      try {
        const kernel = colorEffectKernel(original.id)!;
        expect(observer.trace).toEqual(original.trace);
        expect(
          observer.trace.filter((event) => event.startsWith("property.")),
        ).toEqual(original.typeReads);
        expect(declarations).toBeDefined();
        expect(hash(shader)).toBe(original.shaderSha256);
        const products = observer.products();
        observer.restore();
        temporaryCleared(products, tuples);
        expect(found.phases[0]).toEqual({});
        expect(memory.owns(found.phases[0]!)).toBe(false);
        const cache = found.caches[0]!,
          state = found.states[0]!;
        expect(memory.owns(cache)).toBe(true);
        expect(cache.entries!.get(original.id)).toBe(state);
        expect(state.kernel).toBe(kernel);
        expect(memory.statistics.current.metadata).toBe(BASE);
        expect(memory.statistics.reservations).toBe(2);
      } finally {
        observer.restore();
      }
    });
    memory.dispose();
    cleared(found);
    zero(memory);
    vi.restoreAllMocks();
  }
});

it("owns one actual cache/Map and ten independent states at 86016 retained and 118784 peak; hits and unknown ids produce nothing", async () => {
  const memory = new ManagedMemory(limits),
    found = capture(memory);
  await withManagedMemory(memory, async () => {
    memory.beginScratch();
    const kernels = originalConstruction.map(
      (row) => colorEffectKernel(row.id)!,
    );
    expect(found.caches).toHaveLength(1);
    expect(found.states).toHaveLength(10);
    expect(found.phases).toHaveLength(10);
    const cache = found.caches[0]!,
      entries = cache.entries!;
    expect(memory.owns(cache)).toBe(true);
    expect(memory.owns(entries)).toBe(false);
    expect(entries.size).toBe(10);
    for (let i = 0; i < 10; i++) {
      const state = found.states[i]!;
      expect(state.cache).toBe(cache);
      expect(entries.get(originalConstruction[i]!.id)).toBe(state);
      expect(memory.owns(state)).toBe(true);
      expect(state.kernel).toBe(kernels[i]);
    }
    expect(memory.statistics.current.metadata).toBe(86016);
    expect(memory.statistics.peak.metadata).toBe(118784);
    expect(memory.statistics.reservations).toBe(11);
    const reserve = vi.spyOn(memory, "reserve"),
      entriesProducer = vi.spyOn(Object, "entries"),
      freeze = vi.spyOn(Object, "freeze");
    for (let i = 0; i < 10; i++)
      expect(colorEffectKernel(originalConstruction[i]!.id)).toBe(kernels[i]);
    expect(colorEffectKernel("color.unregistered")).toBeUndefined();
    expect(reserve).not.toHaveBeenCalled();
    expect(entriesProducer).not.toHaveBeenCalled();
    expect(freeze).not.toHaveBeenCalled();
    memory.endScratch();
    expect(entries.size).toBe(10);
    expect(memory.statistics.current.metadata).toBe(86016);
  });
  const entries = found.caches[0]!.entries!;
  memory.dispose();
  expect(entries.size).toBe(0);
  cleared(found);
  zero(memory);
});

it("keeps inactive identity stable and scopes active caches by captured allocator", async () => {
  const inactive = colorEffectKernel("color.invert")!,
    a = new ManagedMemory(limits),
    b = new ManagedMemory(limits);
  const foundA = capture(a),
    foundB = capture(b);
  let ka: Kernel | undefined, kb: Kernel | undefined;
  await withManagedMemory(a, async () => {
    ka = colorEffectKernel("color.invert")!;
    expect(colorEffectKernel("color.invert")).toBe(ka);
  });
  expect(colorEffectKernel("color.invert")).toBe(inactive);
  expect(ka).not.toBe(inactive);
  await withManagedMemory(b, async () => {
    kb = colorEffectKernel("color.invert")!;
    expect(kb).not.toBe(ka);
    expect(kb).not.toBe(inactive);
    expect(foundA.caches[0]).not.toBe(foundB.caches[0]);
    releaseRenderMetadata(foundA.states[0]!);
    expect(foundA.states[0]).toEqual({});
    expect(a.statistics.current.metadata).toBe(CACHE);
    expect(b.statistics.current.metadata).toBe(BASE);
    expect(colorEffectKernel("color.invert")).toBe(kb);
    noStaleReads(ka!);
  });
  a.dispose();
  expect(b.statistics.current.metadata).toBe(BASE);
  b.dispose();
  noStaleReads(kb!);
  expect(colorEffectKernel("color.invert")).toBe(inactive);
  cleared(foundA);
  cleared(foundB);
  zero(a);
  zero(b);
});

it("pre-admits phase, actual cache Map and actual state before their respective original producers, and permits retry", async () => {
  for (const cut of [PHASE - 1, PHASE + CACHE - 1, PHASE + CACHE + STATE - 1]) {
    const memory = new ManagedMemory({ ...limits, metadata: cut }),
      found = capture(memory);
    const entries = vi.spyOn(Object, "entries"),
      freeze = vi.spyOn(Object, "freeze");
    const originalMap = globalThis.Map;
    const producedMaps: Map<unknown, unknown>[] = [];
    // Bound the constructor replacement to the actual color call; no assertions
    // or framework operations run while this test observer is installed.
    globalThis.Map = class<K, V> extends originalMap<K, V> {
      constructor(values?: readonly (readonly [K, V])[] | null) {
        super(values);
        producedMaps.push(this);
      }
    } as MapConstructor;
    let failure: unknown;
    try {
      await withManagedMemory(memory, async () => {
        failure = firstFailure(() => colorEffectKernel("color.tint"));
      });
    } finally {
      globalThis.Map = originalMap;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toMatch(/metadata/);
    if (cut < PHASE) expect(found.phases).toHaveLength(0);
    if (cut < PHASE + CACHE) {
      expect(producedMaps).toHaveLength(0);
      expect(entries).not.toHaveBeenCalled();
    } else {
      expect(producedMaps).toHaveLength(1);
      expect(producedMaps[0]!.size).toBe(0);
      expect(entries).toHaveBeenCalled();
    }
    expect(found.states).toHaveLength(0);
    expect(freeze).not.toHaveBeenCalled();
    cleared(found);
    zero(memory);
    memory.dispose();
    vi.restoreAllMocks();
  }
  // A reservation blocker gives the same cut in a sufficient, retryable owner.
  const memory = new ManagedMemory(limits),
    found = capture(memory);
  await withManagedMemory(memory, async () => {
    colorEffectKernel("color.invert");
    const cache = found.caches[0]!,
      first = found.states[0]!;
    const blocker = memory.reserve(
      "metadata",
      memory.limits.metadata - BASE - PHASE - STATE + 1,
    );
    const freeze = vi.spyOn(Object, "freeze");
    expect(() => colorEffectKernel("color.fill")).toThrow(/metadata/);
    expect(freeze).not.toHaveBeenCalled();
    expect(cache.entries!.get("color.invert")).toBe(first);
    expect(cache.entries!.has("color.fill")).toBe(false);
    blocker.release();
    vi.restoreAllMocks();
    const retry = colorEffectKernel("color.fill")!;
    expect(cache.entries!.get("color.fill")!.kernel).toBe(retry);
    fullShader(cache.entries!.get("color.fill")!, originalConstruction[6]);
  });
  memory.dispose();
  zero(memory);
});

it("clears actual completed constructor arrays, tuples and state on entries/filter/type/map/join/freeze null, preserving a prior cache entry and retry", async () => {
  for (const cut of [
    "entries",
    "filter",
    "filter-type",
    "map",
    "map-type",
    "join",
    "freeze",
  ] as const) {
    const memory = new ManagedMemory(limits),
      found = capture(memory);
    await withManagedMemory(memory, async () => {
      const firstKernel = colorEffectKernel("color.invert")!,
        cache = found.caches[0]!,
        first = found.states[0]!;
      let tuples: Entry[] = [];
      const observer = constructorTrace("color.tint", (stage) => {
        const products = observer.products();
        if (stage === "filter") tuples = [...products.entries!];
        if (
          stage === cut ||
          (stage === "type" &&
            ((cut === "filter-type" && !products.filtered) ||
              (cut === "map-type" && !!products.filtered)))
        )
          throw null;
      });
      // Capture actual tuples after the producer has returned, before the first
      // filter read. Hidden arrays inside an intrinsic that throws before return
      // are outside this bounded original-producer contract.
      expect(firstFailure(() => colorEffectKernel("color.tint"))).toBeNull();
      const products = observer.products();
      observer.restore();
      temporaryCleared(products, tuples);
      for (const phase of found.phases) expect(phase).toEqual({});
      for (const state of found.states.slice(1)) expect(state).toEqual({});
      expect(cache.entries!.size).toBe(1);
      expect(cache.entries!.get("color.invert")).toBe(first);
      expect(first.kernel).toBe(firstKernel);
      expect(memory.statistics.current.metadata).toBe(BASE);
      vi.restoreAllMocks();
      const retry = colorEffectKernel("color.tint")!;
      expect(cache.entries!.get("color.tint")!.kernel).toBe(retry);
      fullShader(cache.entries!.get("color.tint")!, originalConstruction[2]);
    });
    memory.dispose();
    zero(memory);
    vi.restoreAllMocks();
  }
});

it("rolls back an actually frozen candidate after freeze null and leaves the escaped immutable wrapper pointing only to emptied state", async () => {
  const memory = new ManagedMemory(limits),
    found = capture(memory);
  await withManagedMemory(memory, async () => {
    const freeze = Object.freeze;
    let escaped: Kernel | undefined;
    vi.spyOn(Object, "freeze").mockImplementation((value: unknown) => {
      const result = freeze(value);
      if (
        value &&
        typeof value === "object" &&
        Object.getOwnPropertyDescriptor(value, "id")?.value === "color.tint"
      ) {
        escaped = result as Kernel;
        throw null;
      }
      return result;
    });
    expect(firstFailure(() => colorEffectKernel("color.tint"))).toBeNull();
    expect(Object.isFrozen(escaped)).toBe(true);
    publicFields(escaped!, originalConstruction[2]);
    noStaleReads(escaped!);
    cleared(found);
    zero(memory);
    vi.restoreAllMocks();
    expect(colorEffectKernel("color.tint")).not.toBe(escaped);
  });
  memory.dispose();
  zero(memory);
});

it("rolls back phase/cache/state adoption null before and after actual ownership registration, then retries", async () => {
  for (const which of ["phase", "cache", "state"] as const)
    for (const after of [false, true]) {
      const memory = new ManagedMemory(limits);
      let armed = false,
        failedOwner: object | undefined;
      const found = capture(memory, (stage, candidateRole, value) => {
        if (
          armed &&
          candidateRole === which &&
          stage === (after ? "after" : "before")
        ) {
          armed = false;
          failedOwner = value;
          throw null;
        }
      });
      await withManagedMemory(memory, async () => {
        let cache: Cache | undefined, first: State | undefined;
        if (which === "state") {
          colorEffectKernel("color.invert");
          cache = found.caches[0];
          first = found.states[0];
        }
        armed = true;
        expect(firstFailure(() => colorEffectKernel("color.tint"))).toBeNull();
        expect(failedOwner).toEqual({});
        expect(memory.owns(failedOwner!)).toBe(false);
        for (const phase of found.phases) expect(phase).toEqual({});
        if (first) {
          expect(cache!.entries!.get("color.invert")).toBe(first);
          expect(cache!.entries!.has("color.tint")).toBe(false);
          expect(memory.statistics.current.metadata).toBe(BASE);
        } else {
          cleared(found);
          zero(memory);
        }
        const retry = colorEffectKernel("color.tint")!;
        const state = found.states.at(-1)!;
        expect(state.kernel).toBe(retry);
        fullShader(state, originalConstruction[2]);
      });
      memory.dispose();
      cleared(found);
      zero(memory);
      vi.restoreAllMocks();
    }
});

it("rolls back pre/post actual cache Map publication without removing a valid prior state", async () => {
  for (const after of [false, true]) {
    const memory = new ManagedMemory(limits),
      found = capture(memory);
    await withManagedMemory(memory, async () => {
      const firstKernel = colorEffectKernel("color.invert")!,
        cache = found.caches[0]!,
        entries = cache.entries!,
        first = found.states[0]!;
      const nativeSet = entries.set;
      let failed: State | undefined,
        armed = true;
      vi.spyOn(entries, "set").mockImplementation(function (
        this: Map<string, State>,
        key,
        value,
      ) {
        if (armed && key === "color.tint") {
          armed = false;
          failed = value;
          expect(memory.owns(value)).toBe(true);
          expect(memory.statistics.current.metadata).toBe(BASE + PHASE + STATE);
          if (after) Reflect.apply(nativeSet, this, [key, value]);
          throw null;
        }
        return Reflect.apply(nativeSet, this, [key, value]);
      });
      expect(firstFailure(() => colorEffectKernel("color.tint"))).toBeNull();
      expect(failed).toEqual({});
      expect(memory.owns(failed!)).toBe(false);
      expect(entries.size).toBe(1);
      expect(entries.get("color.invert")).toBe(first);
      expect(first.kernel).toBe(firstKernel);
      expect(memory.statistics.current.metadata).toBe(BASE);
      expect(found.phases.at(-1)).toEqual({});
      const retry = colorEffectKernel("color.tint")!;
      expect(entries.get("color.tint")!.kernel).toBe(retry);
      fullShader(entries.get("color.tint")!, originalConstruction[2]);
    });
    memory.dispose();
    zero(memory);
    vi.restoreAllMocks();
  }
});

it("clears first-cache WeakMap publication before/after actual mutation and associates a fresh retry cache", async () => {
  for (const after of [false, true]) {
    const memory = new ManagedMemory(limits),
      found = capture(memory);
    const nativeSet = WeakMap.prototype.set;
    const publications: WeakMap<object, object>[] = [];
    let failedCache: Cache | undefined,
      failedEntries: Map<string, State> | undefined,
      armed = true;
    vi.spyOn(WeakMap.prototype, "set").mockImplementation(function (
      this: WeakMap<object, object>,
      key: WeakKey,
      value: object,
    ) {
      if (armed && key === memory && "entries" in value && "memory" in value) {
        armed = false;
        publications.push(this);
        failedCache = value as Cache;
        failedEntries = failedCache.entries;
        expect(memory.owns(value)).toBe(true);
        expect(memory.statistics.current.metadata).toBe(PHASE + CACHE);
        if (after) Reflect.apply(nativeSet, this, [key, value]);
        throw null;
      }
      return Reflect.apply(nativeSet, this, [key, value]);
    });
    await withManagedMemory(memory, async () => {
      expect(firstFailure(() => colorEffectKernel("color.tint"))).toBeNull();
      expect(publications[0]!.get(memory)).toBeUndefined();
      expect(failedCache).toEqual({});
      expect(failedEntries!.size).toBe(0);
      cleared(found);
      zero(memory);
      const retry = colorEffectKernel("color.tint")!;
      expect(publications[0]!.get(memory)).toBe(found.caches.at(-1));
      expect(found.states.at(-1)!.kernel).toBe(retry);
      fullShader(found.states.at(-1)!, originalConstruction[2]);
    });
    memory.dispose();
    zero(memory);
    vi.restoreAllMocks();
  }
});

it("clears actual partial resource Map registration records for phase/cache/state with owns ordering preserved", async () => {
  for (const which of ["phase", "cache", "state"] as const)
    for (const after of [false, true]) {
      const memory = new ManagedMemory(limits),
        found = capture(memory),
        table = resources(memory);
      const nativeSet = table.set;
      let partial: Resource | undefined,
        failedOwner: object | undefined,
        armed = false;
      vi.spyOn(table, "set").mockImplementation(function (
        this: Map<MemoryLease, Resource>,
        lease,
        record,
      ) {
        if (armed && record.value && role(record.value, lease) === which) {
          armed = false;
          partial = record;
          failedOwner = record.value;
          expect(memory.owns(failedOwner)).toBe(true); // existing adopt order: ownership.set then resources.set
          if (after) Reflect.apply(nativeSet, this, [lease, record]);
          throw null;
        }
        return Reflect.apply(nativeSet, this, [lease, record]);
      });
      await withManagedMemory(memory, async () => {
        let cache: Cache | undefined, first: State | undefined;
        if (which === "state") {
          colorEffectKernel("color.invert");
          cache = found.caches[0];
          first = found.states[0];
        }
        armed = true;
        expect(firstFailure(() => colorEffectKernel("color.tint"))).toBeNull();
        expect(partial).toEqual({});
        expect(failedOwner).toEqual({});
        expect(memory.owns(failedOwner!)).toBe(false);
        expect([...table.values()]).not.toContain(partial);
        if (first) {
          expect(cache!.entries!.get("color.invert")).toBe(first);
          expect(memory.statistics.current.metadata).toBe(BASE);
        } else {
          cleared(found);
          zero(memory);
        }
        const retry = colorEffectKernel("color.tint")!;
        expect(found.states.at(-1)!.kernel).toBe(retry);
        fullShader(found.states.at(-1)!, originalConstruction[2]);
      });
      memory.dispose();
      zero(memory);
      vi.restoreAllMocks();
    }
});

it("clears pre/post actual metadata WeakMap registration cuts for phase/cache/state without leaving a released lease association", async () => {
  for (const which of ["phase", "cache", "state"] as const)
    for (const after of [false, true]) {
      const memory = new ManagedMemory(limits),
        found = capture(memory);
      const ownerTable = (
        memory as unknown as { ownership: WeakMap<object, MemoryLease> }
      ).ownership;
      const nativeSet = WeakMap.prototype.set;
      const metadataTables: WeakMap<object, MemoryLease>[] = [];
      let failedOwner: object | undefined,
        armed = false;
      vi.spyOn(WeakMap.prototype, "set").mockImplementation(function (
        this: WeakMap<object, MemoryLease>,
        key: WeakKey,
        value: MemoryLease,
      ) {
        if (
          armed &&
          typeof key !== "symbol" &&
          this !== ownerTable &&
          found.leases.has(key) &&
          found.leases.get(key) === value &&
          role(key, value) === which
        ) {
          armed = false;
          metadataTables.push(this);
          failedOwner = key;
          expect(memory.owns(key)).toBe(true);
          if (after) Reflect.apply(nativeSet, this, [key, value]);
          throw null;
        }
        return Reflect.apply(nativeSet, this, [key, value]);
      });
      await withManagedMemory(memory, async () => {
        let cache: Cache | undefined, first: State | undefined;
        if (which === "state") {
          colorEffectKernel("color.invert");
          cache = found.caches[0];
          first = found.states[0];
        }
        armed = true;
        expect(firstFailure(() => colorEffectKernel("color.tint"))).toBeNull();
        expect(metadataTables[0]!.get(failedOwner!)).toBeUndefined();
        expect(failedOwner).toEqual({});
        expect(memory.owns(failedOwner!)).toBe(false);
        if (first) {
          expect(cache!.entries!.get("color.invert")).toBe(first);
          expect(memory.statistics.current.metadata).toBe(BASE);
        } else {
          cleared(found);
          zero(memory);
        }
        const retry = colorEffectKernel("color.tint")!;
        expect(found.states.at(-1)!.kernel).toBe(retry);
        fullShader(found.states.at(-1)!, originalConstruction[2]);
      });
      memory.dispose();
      zero(memory);
      vi.restoreAllMocks();
    }
});

it("rolls back a published candidate on late phase cleanup null, preserves that null over state cleanup failure and retries a fresh cache", async () => {
  const memory = new ManagedMemory(limits);
  let armed = true;
  const found = capture(memory, undefined, (which) => {
    if (armed && which === "phase") throw null;
    if (armed && which === "state") throw Error("secondary state cleanup");
  });
  await withManagedMemory(memory, async () => {
    expect(firstFailure(() => colorEffectKernel("color.tint"))).toBeNull();
    const oldCache = found.caches[0]!,
      oldState = found.states[0]!;
    expect(oldCache).toEqual({});
    expect(oldState).toEqual({});
    cleared(found);
    zero(memory);
    armed = false;
    const retry = colorEffectKernel("color.tint")!;
    expect(found.caches.at(-1)).not.toBe(oldCache);
    expect(found.states.at(-1)!.kernel).toBe(retry);
    fullShader(found.states.at(-1)!, originalConstruction[2]);
  });
  memory.dispose();
  zero(memory);
});

it("retirement attempts independent A+B state cleanup, clears actual Map/cache/state records and preserves first null", async () => {
  const memory = new ManagedMemory(limits),
    attempts: object[] = [];
  const found = capture(memory, undefined, (which, value) => {
    if (which === "state") {
      attempts.push(value);
      if (attempts.length === 1) throw null;
      throw Error("later independent state cleanup");
    }
  });
  let a: Kernel | undefined, b: Kernel | undefined;
  await withManagedMemory(memory, async () => {
    a = colorEffectKernel("color.invert")!;
    b = colorEffectKernel("color.fill")!;
  });
  const cache = found.caches[0]!,
    entries = cache.entries!,
    states = [...found.states];
  expect(firstFailure(() => memory.dispose())).toBeNull();
  expect(attempts).toEqual(states);
  expect(entries.size).toBe(0);
  cleared(found);
  zero(memory);
  noStaleReads(a!);
  noStaleReads(b!);
  expect(() => memory.dispose()).not.toThrow();
  zero(memory);
});

it("explicit state release removes only its matching entry and stale callbacks read no native/input/parameter factories", async () => {
  const memory = new ManagedMemory(limits),
    found = capture(memory);
  let stale: Kernel | undefined;
  await withManagedMemory(memory, async () => {
    stale = colorEffectKernel("color.invert")!;
    const second = colorEffectKernel("color.fill")!;
    const cache = found.caches[0]!,
      first = found.states[0]!,
      stateB = found.states[1]!;
    releaseRenderMetadata(first);
    expect(first).toEqual({});
    expect(memory.owns(first)).toBe(false);
    expect(cache.entries!.has("color.invert")).toBe(false);
    expect(cache.entries!.get("color.fill")).toBe(stateB);
    expect(colorEffectKernel("color.fill")).toBe(second);
    expect(memory.statistics.current.metadata).toBe(BASE);
    noStaleReads(stale!);
  });
  noStaleReads(stale!);
  memory.dispose();
  zero(memory);
});

it("holds captured actual state/shader during consumer release and prevents old state retirement from deleting a replacement", async () => {
  const memory = new ManagedMemory(limits),
    found = capture(memory),
    original = originalConstruction[8];
  await withManagedMemory(memory, async () => {
    const oldKernel = colorEffectKernel(original.id)!,
      oldState = found.states[0]!,
      cache = found.caches[0]!;
    const h = nativeHarness();
    let replacement: Kernel | undefined;
    vi.spyOn(h.context, "pass").mockImplementation((shader) => {
      const before = memory.statistics.current.metadata;
      releaseRenderMetadata(oldState);
      expect(oldState.lease!.active).toBe(false);
      expect(memory.owns(oldState)).toBe(true);
      expect(memory.statistics.current.metadata).toBe(before);
      expect(shader).toBe(oldState.shader);
      fullShader(oldState, original);
      replacement = colorEffectKernel(original.id)!;
      expect(replacement).not.toBe(oldKernel);
      expect(cache.entries!.get(original.id)).toBe(found.states[1]);
      expect(oldState.shader).toBe(shader);
      expect(memory.owns(oldState)).toBe(true);
    });
    const output = oldKernel.renderGpu(
      h.context as never,
      h.input as never,
      original.params as never,
    );
    expect(output).toBe(h.outputs[0]);
    expect(oldState).toEqual({});
    expect(memory.owns(oldState)).toBe(false);
    expect(cache.entries!.get(original.id)).toBe(found.states[1]);
    expect(colorEffectKernel(original.id)).toBe(replacement);
    expect(memory.statistics.current.metadata).toBe(BASE);
    noStaleReads(oldKernel);
  });
  memory.dispose();
  zero(memory);
});

it("holds captured shader/state through reentrant allocator disposal from native pass, preserving original native null over late state error", async () => {
  const memory = new ManagedMemory(limits),
    found = capture(memory, undefined, (which) => {
      if (which === "state") throw Error("secondary held state cleanup");
    });
  await withManagedMemory(memory, async () => {
    const original = originalConstruction[8],
      kernel = colorEffectKernel(original.id)!,
      state = found.states[0]!;
    const h = nativeHarness();
    vi.spyOn(h.context, "pass").mockImplementation((shader) => {
      memory.dispose();
      expect(state.lease!.active).toBe(false);
      expect(memory.owns(state)).toBe(true);
      // The GPU callback now independently holds its actual parent16384,
      // entries780, filtered528 and uniforms768 alongside kernel state8192.
      expect(memory.statistics.current.metadata).toBe(
        STATE + 16384 + 780 + 528 + 768,
      );
      expect(shader).toBe(state.shader);
      fullShader(state, original);
      // Preserve the original native null over the late state destructor error.
      // Selected GPU dependency success is covered in color-gpu-lifetime;
      // gradient/Canvas/backend dependency lifetimes remain pending.
      throw null;
    });
    expect(
      firstFailure(() =>
        kernel.renderGpu(
          h.context as never,
          h.input as never,
          original.params as never,
        ),
      ),
    ).toBeNull();
    cleared(found);
    zero(memory);
    noStaleReads(kernel);
  });
  expect(() => memory.dispose()).not.toThrow();
  zero(memory);
});

it("settles the state hold when callback work quota rejects before native/input/param reads", async () => {
  const memory = new ManagedMemory(limits),
    found = capture(memory);
  await withManagedMemory(memory, async () => {
    const kernel = colorEffectKernel("color.invert")!,
      state = found.states[0]!,
      cache = found.caches[0]!;
    const blocker = memory.reserve(
      "metadata",
      memory.limits.metadata - BASE - 16384 + 1,
    );
    const trace: string[] = [];
    expect(() =>
      kernel.renderGpu(
        poison("context", trace),
        poison("input", trace),
        poison("params", trace),
      ),
    ).toThrow(/metadata/);
    expect(trace).toEqual([]);
    expect(state.lease!.active).toBe(true);
    releaseRenderMetadata(state);
    expect(state).toEqual({});
    expect(memory.owns(state)).toBe(false);
    blocker.release();
    expect(memory.statistics.current.metadata).toBe(CACHE);
    expect(cache.entries!.size).toBe(0);
  });
  memory.dispose();
  zero(memory);
});

it("keeps retiring phase/cache/state charged after actual adopt until metadata handoff rejects, without running later producers", async () => {
  for (const which of ["phase", "cache", "state"] as const)
    for (const primaryNull of [false, true]) {
      const memory = new ManagedMemory(limits);
      let armed = true,
        retired: object | undefined,
        retiredRecord: Resource | undefined;
      const found = capture(memory, (stage, candidateRole, owner, lease) => {
        if (!armed || stage !== "after" || candidateRole !== which) return;
        armed = false;
        retired = owner;
        retiredRecord = resources(memory).get(lease);
        expect(retiredRecord!.value).toBe(owner);
        memory.dispose();
        expect(lease.active).toBe(false);
        // The common helper's own factory/adoption hold keeps this actual
        // record live until its synchronous handoff settles. The independent
        // phase hold survives that settlement until constructor cleanup.
        expect(memory.owns(owner)).toBe(true);
        expect(retiredRecord!.value).toBe(owner);
        expect(memory.statistics.current.metadata).toBe(
          which === "phase"
            ? PHASE
            : PHASE + (which === "cache" ? CACHE : STATE),
        );
        if (primaryNull) throw null;
      });
      await withManagedMemory(memory, async () => {
        const entries = vi.spyOn(Object, "entries"),
          freeze = vi.spyOn(Object, "freeze");
        const failure = firstFailure(() => colorEffectKernel("color.tint"));
        if (primaryNull) expect(failure).toBeNull();
        else
          expect(String(failure)).toMatch(
            /Managed metadata allocation owner was disposed/,
          );
        if (which !== "state") expect(entries).not.toHaveBeenCalled();
        expect(freeze).not.toHaveBeenCalled();
        expect(retired).toEqual({});
        expect(retiredRecord).toEqual({});
        cleared(found);
        zero(memory);
      });
      expect(() => memory.dispose()).not.toThrow();
      zero(memory);
      vi.restoreAllMocks();
    }
});

it("removes cache WeakMap association published before/after reentrant disposal and preserves publication null", async () => {
  for (const disposeBeforeSet of [false, true])
    for (const primaryNull of [false, true]) {
      const memory = new ManagedMemory(limits),
        found = capture(memory),
        nativeSet = WeakMap.prototype.set;
      const tables: WeakMap<object, object>[] = [];
      let armed = true,
        actualMap: Map<string, State> | undefined;
      vi.spyOn(WeakMap.prototype, "set").mockImplementation(function (
        this: WeakMap<object, object>,
        key: WeakKey,
        value: object,
      ) {
        if (!armed || key !== memory || !("entries" in value))
          return Reflect.apply(nativeSet, this, [key, value]);
        armed = false;
        tables.push(this);
        actualMap = (value as Cache).entries;
        if (disposeBeforeSet) memory.dispose();
        Reflect.apply(nativeSet, this, [key, value]);
        if (!disposeBeforeSet) memory.dispose();
        if (primaryNull) throw null;
        return this;
      });
      await withManagedMemory(memory, async () => {
        const entries = vi.spyOn(Object, "entries"),
          freeze = vi.spyOn(Object, "freeze");
        const failure = firstFailure(() => colorEffectKernel("color.tint"));
        if (primaryNull) expect(failure).toBeNull();
        else expect(String(failure)).toMatch(/cache is disposed/);
        expect(tables[0]!.get(memory)).toBeUndefined();
        expect(actualMap!.size).toBe(0);
        expect(entries).not.toHaveBeenCalled();
        expect(freeze).not.toHaveBeenCalled();
        cleared(found);
        zero(memory);
      });
      expect(() => memory.dispose()).not.toThrow();
      vi.restoreAllMocks();
    }
});

it("clears matching actual Map entry published before/after reentrant disposal even after cache owner refs have cleared", async () => {
  for (const disposeBeforeSet of [false, true])
    for (const primaryNull of [false, true]) {
      const memory = new ManagedMemory(limits),
        found = capture(memory);
      await withManagedMemory(memory, async () => {
        const old = colorEffectKernel("color.invert")!,
          cache = found.caches[0]!,
          actualMap = cache.entries!,
          nativeSet = actualMap.set;
        let armed = true,
          escaped: Kernel | undefined,
          candidate: State | undefined;
        vi.spyOn(actualMap, "set").mockImplementation(function (
          this: Map<string, State>,
          key,
          value,
        ) {
          if (!armed || key !== "color.tint")
            return Reflect.apply(nativeSet, this, [key, value]);
          armed = false;
          candidate = value;
          escaped = value.kernel;
          if (disposeBeforeSet) memory.dispose();
          Reflect.apply(nativeSet, this, [key, value]);
          if (!disposeBeforeSet) memory.dispose();
          if (primaryNull) throw null;
          return this;
        });
        const failure = firstFailure(() => colorEffectKernel("color.tint"));
        if (primaryNull) expect(failure).toBeNull();
        else
          expect(String(failure)).toMatch(/managed color kernel is disposed/);
        expect(candidate).toEqual({});
        expect(actualMap.size).toBe(0);
        expect(cache).toEqual({});
        cleared(found);
        zero(memory);
        noStaleReads(old);
        noStaleReads(escaped!);
      });
      expect(() => memory.dispose()).not.toThrow();
      vi.restoreAllMocks();
    }
});

it("builds an active replacement cache when old cache consumer retirement reenters another old id before it is visited", async () => {
  for (const lateNull of [false, true]) {
    const memory = new ManagedMemory(limits);
    let oldA: State | undefined,
      oldB: State | undefined,
      oldCache: Cache | undefined;
    let oldKernelB: Kernel | undefined,
      replacementB: Kernel | undefined,
      replacementNew: Kernel | undefined;
    let replacementCache: Cache | undefined,
      replacementMap: Map<string, State> | undefined,
      reentered = false;
    const attempts: object[] = [];
    const found = capture(memory, undefined, (which, owner) => {
      if (which !== "state") return;
      attempts.push(owner);
      if (owner !== oldA || reentered) return;
      reentered = true;
      expect(oldCache!.lease!.active).toBe(false);
      expect(oldB!.lease!.active).toBe(true);
      expect(oldCache!.entries!.get("color.fill")).toBe(oldB);
      replacementB = colorEffectKernel("color.fill")!;
      replacementCache = found.caches.at(-1)!;
      replacementMap = replacementCache.entries!;
      expect(replacementB).not.toBe(oldKernelB);
      expect(replacementCache).not.toBe(oldCache);
      expect(replacementMap).not.toBe(oldCache!.entries);
      expect(replacementCache.lease!.active).toBe(true);
      replacementNew = colorEffectKernel("color.tint")!;
      expect(replacementMap.get("color.fill")!.kernel).toBe(replacementB);
      expect(replacementMap.get("color.tint")!.kernel).toBe(replacementNew);
      if (lateNull) throw null;
    });
    await withManagedMemory(memory, async () => {
      const oldKernelA = colorEffectKernel("color.invert")!;
      oldKernelB = colorEffectKernel("color.fill")!;
      oldA = found.states[0];
      oldB = found.states[1];
      oldCache = found.caches[0];
      const oldMap = oldCache!.entries!;
      if (lateNull)
        expect(firstFailure(() => releaseRenderMetadata(oldCache!))).toBeNull();
      else expect(() => releaseRenderMetadata(oldCache!)).not.toThrow();
      expect(reentered).toBe(true);
      expect(attempts).toEqual([oldA, oldB]);
      expect(oldMap.size).toBe(0);
      expect(oldCache).toEqual({});
      expect(oldA).toEqual({});
      expect(oldB).toEqual({});
      expect(memory.owns(replacementCache!)).toBe(true);
      expect(replacementMap!.size).toBe(2);
      expect(colorEffectKernel("color.fill")).toBe(replacementB);
      expect(colorEffectKernel("color.tint")).toBe(replacementNew);
      expect(memory.statistics.current.metadata).toBe(CACHE + 2 * STATE);
      noStaleReads(oldKernelA);
      noStaleReads(oldKernelB!);
      const h = nativeHarness();
      replacementB!.renderGpu(
        h.context as never,
        h.input as never,
        originalConstruction[6].params as never,
      );
      expect(hash(h.passes[0])).toBe(originalConstruction[6].shaderSha256);
      expect(memory.statistics.current.metadata).toBe(CACHE + 2 * STATE);
    });
    memory.dispose();
    cleared(found);
    zero(memory);
    vi.restoreAllMocks();
  }
});

it("holds actual Canvas state through putImageData consumer release and preserves native null over late state cleanup", async () => {
  for (const nativeNull of [false, true]) {
    const memory = new ManagedMemory(limits),
      found = capture(memory, undefined, (which) => {
        if (nativeNull && which === "state")
          throw Error("secondary Canvas state cleanup");
      });
    await withManagedMemory(memory, async () => {
      const original = originalConstruction[8],
        kernel = colorEffectKernel(original.id)!,
        state = found.states[0]!;
      const h = nativeHarness(),
        create = h.context.createSurface;
      vi.spyOn(h.context, "createSurface").mockImplementation(
        (width, height) => {
          const output = create(width, height);
          output.ctx.putImageData = () => {
            const before = memory.statistics.current.metadata;
            releaseRenderMetadata(state);
            expect(state.lease!.active).toBe(false);
            expect(memory.owns(state)).toBe(true);
            expect(memory.statistics.current.metadata).toBe(before);
            fullShader(state, original);
            if (nativeNull) throw null;
          };
          return output;
        },
      );
      if (nativeNull)
        expect(
          firstFailure(() =>
            kernel.renderCanvas!(
              h.context as never,
              h.input as never,
              original.params as never,
            ),
          ),
        ).toBeNull();
      else
        expect(
          kernel.renderCanvas!(
            h.context as never,
            h.input as never,
            original.params as never,
          ),
        ).toBe(h.outputs[0]);
      expect(state).toEqual({});
      expect(memory.owns(state)).toBe(false);
      expect(memory.statistics.current).toEqual({ pixels: 0, metadata: CACHE });
      noStaleReads(kernel);
      // The fake native ImageData fixture proves the separate Canvas state hold;
      // it is not a browser-native image/child disposal lifetime oracle.
    });
    memory.dispose();
    zero(memory);
    vi.restoreAllMocks();
  }
});
