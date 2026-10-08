import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  radialDistortionControls,
  radialControlBytes,
  type RadialControls,
} from "../../packages/renderer-core/src/composition/render/radial-distortion.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../packages/renderer-core/src/managed-metadata.ts";
const originals = [
  {
    id: "distort.bulge",
    params: {
      center: [0.5, 0.5],
      radius: [32, 16],
      amount: 0,
    },
    kind: "controls",
    dimensions: [2, 2],
    bulge: true,
    center: [16, 16],
    radius: [512, 256],
    factorCount: 65537,
    factorBytes: 262148,
    factorHash:
      "58d726c93edf5ba65a133f35f713ae0bd88a6a7540d690f877b6a393be3f2177",
    encodedBytes: 263168,
    encodedHash:
      "83ca77b77436d219d1f774248e7ba6e50f7ef890a74026096219a6c0e8bfcec9",
    points: [
      {
        point: [-1, -1],
        source: [-1, -1],
      },
      {
        point: [0.5, 0.5],
        source: [0.5, 0.5],
      },
      {
        point: [1.5, 1.5],
        source: [1.5, 1.5],
      },
      {
        point: [1, 1],
        source: [1, 1],
      },
      {
        point: [1.5, 1.5],
        source: [1.5, 1.5],
      },
    ],
    getterCount: 262154,
    getterHash:
      "54233c1214394d1623dc75b2f30cb8370c153d4ab41e6aed69d5a92228e80b30",
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.5, 0.5],
      radius: [32, 16],
      amount: 0,
    },
    kind: "controls",
    dimensions: [128, 64],
    bulge: true,
    center: [1024, 512],
    radius: [512, 256],
    factorCount: 65537,
    factorBytes: 262148,
    factorHash:
      "58d726c93edf5ba65a133f35f713ae0bd88a6a7540d690f877b6a393be3f2177",
    encodedBytes: 263168,
    encodedHash:
      "83ca77b77436d219d1f774248e7ba6e50f7ef890a74026096219a6c0e8bfcec9",
    points: [
      {
        point: [-1, -1],
        source: [-1, -1],
      },
      {
        point: [0.5, 0.5],
        source: [0.5, 0.5],
      },
      {
        point: [1.5, 1.5],
        source: [1.5, 1.5],
      },
      {
        point: [64, 32],
        source: [64, 32],
      },
      {
        point: [127.5, 63.5],
        source: [127.5, 63.5],
      },
    ],
    getterCount: 262154,
    getterHash:
      "54233c1214394d1623dc75b2f30cb8370c153d4ab41e6aed69d5a92228e80b30",
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.5, 0.5],
      radius: [32, 16],
      amount: 0,
    },
    kind: "controls",
    dimensions: [8192, 8192],
    bulge: true,
    center: [65536, 65536],
    radius: [512, 256],
    factorCount: 65537,
    factorBytes: 262148,
    factorHash:
      "58d726c93edf5ba65a133f35f713ae0bd88a6a7540d690f877b6a393be3f2177",
    encodedBytes: 263168,
    encodedHash:
      "83ca77b77436d219d1f774248e7ba6e50f7ef890a74026096219a6c0e8bfcec9",
    points: [
      {
        point: [-1, -1],
        source: [-1, -1],
      },
      {
        point: [0.5, 0.5],
        source: [0.5, 0.5],
      },
      {
        point: [1.5, 1.5],
        source: [1.5, 1.5],
      },
      {
        point: [4096, 4096],
        source: [4096, 4096],
      },
      {
        point: [8191.5, 8191.5],
        source: [8191.5, 8191.5],
      },
    ],
    getterCount: 262154,
    getterHash:
      "54233c1214394d1623dc75b2f30cb8370c153d4ab41e6aed69d5a92228e80b30",
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.3, 0.7],
      radius: [2.5, 1.25],
      amount: 1,
    },
    kind: "controls",
    dimensions: [2, 2],
    bulge: true,
    center: [10, 22],
    radius: [40, 20],
    factorCount: 65537,
    factorBytes: 262148,
    factorHash:
      "2d58bcf59b410513e2e4398eaa77bfaa9bb2321697a6d82abceac6e81045e7f0",
    encodedBytes: 263168,
    encodedHash:
      "6cc5517648d0f771f55109942e49dcbffaeed32d51b3e8d33c7d6b8c162879bf",
    points: [
      {
        point: [-1, -1],
        source: [-1, -1],
      },
      {
        point: [0.5, 0.5],
        source: [0.5, 0.6875],
      },
      {
        point: [1.5, 1.5],
        source: [0.8125, 1.375],
      },
      {
        point: [1, 1],
        source: [0.6875, 1.25],
      },
      {
        point: [1.5, 1.5],
        source: [0.8125, 1.375],
      },
    ],
    getterCount: 262154,
    getterHash:
      "54233c1214394d1623dc75b2f30cb8370c153d4ab41e6aed69d5a92228e80b30",
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.3, 0.7],
      radius: [2.5, 1.25],
      amount: 1,
    },
    kind: "controls",
    dimensions: [128, 64],
    bulge: true,
    center: [614, 717],
    radius: [40, 20],
    factorCount: 65537,
    factorBytes: 262148,
    factorHash:
      "2d58bcf59b410513e2e4398eaa77bfaa9bb2321697a6d82abceac6e81045e7f0",
    encodedBytes: 263168,
    encodedHash:
      "6cc5517648d0f771f55109942e49dcbffaeed32d51b3e8d33c7d6b8c162879bf",
    points: [
      {
        point: [-1, -1],
        source: [-1, -1],
      },
      {
        point: [0.5, 0.5],
        source: [0.5, 0.5],
      },
      {
        point: [1.5, 1.5],
        source: [1.5, 1.5],
      },
      {
        point: [64, 32],
        source: [64, 32],
      },
      {
        point: [127.5, 63.5],
        source: [127.5, 63.5],
      },
    ],
    getterCount: 262154,
    getterHash:
      "54233c1214394d1623dc75b2f30cb8370c153d4ab41e6aed69d5a92228e80b30",
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.3, 0.7],
      radius: [2.5, 1.25],
      amount: 1,
    },
    kind: "controls",
    dimensions: [8192, 8192],
    bulge: true,
    center: [39322, 91750],
    radius: [40, 20],
    factorCount: 65537,
    factorBytes: 262148,
    factorHash:
      "2d58bcf59b410513e2e4398eaa77bfaa9bb2321697a6d82abceac6e81045e7f0",
    encodedBytes: 263168,
    encodedHash:
      "6cc5517648d0f771f55109942e49dcbffaeed32d51b3e8d33c7d6b8c162879bf",
    points: [
      {
        point: [-1, -1],
        source: [-1, -1],
      },
      {
        point: [0.5, 0.5],
        source: [0.5, 0.5],
      },
      {
        point: [1.5, 1.5],
        source: [1.5, 1.5],
      },
      {
        point: [4096, 4096],
        source: [4096, 4096],
      },
      {
        point: [8191.5, 8191.5],
        source: [8191.5, 8191.5],
      },
    ],
    getterCount: 262154,
    getterHash:
      "54233c1214394d1623dc75b2f30cb8370c153d4ab41e6aed69d5a92228e80b30",
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.5, 0.5],
      radius: [0.0625, 8192],
      amount: -1,
    },
    kind: "controls",
    dimensions: [2, 2],
    bulge: true,
    center: [16, 16],
    radius: [1, 131072],
    factorCount: 65537,
    factorBytes: 262148,
    factorHash:
      "49057a06ecb498e3761f505ea9abf06cdc6462b3d2bbadb38042a9cebe7f45d6",
    encodedBytes: 263168,
    encodedHash:
      "c414d2eeef42784bf17eef6f7711662ab36f7ffd30270a496927a81a1578f31d",
    points: [
      {
        point: [-1, -1],
        source: [-1, -1],
      },
      {
        point: [0.5, 0.5],
        source: [0.5, 0.5],
      },
      {
        point: [1.5, 1.5],
        source: [1.5, 1.5],
      },
      {
        point: [1, 1],
        source: [1, 1],
      },
      {
        point: [1.5, 1.5],
        source: [1.5, 1.5],
      },
    ],
    getterCount: 262154,
    getterHash:
      "54233c1214394d1623dc75b2f30cb8370c153d4ab41e6aed69d5a92228e80b30",
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.5, 0.5],
      radius: [0.0625, 8192],
      amount: -1,
    },
    kind: "controls",
    dimensions: [128, 64],
    bulge: true,
    center: [1024, 512],
    radius: [1, 131072],
    factorCount: 65537,
    factorBytes: 262148,
    factorHash:
      "49057a06ecb498e3761f505ea9abf06cdc6462b3d2bbadb38042a9cebe7f45d6",
    encodedBytes: 263168,
    encodedHash:
      "c414d2eeef42784bf17eef6f7711662ab36f7ffd30270a496927a81a1578f31d",
    points: [
      {
        point: [-1, -1],
        source: [-1, -1],
      },
      {
        point: [0.5, 0.5],
        source: [0.5, 0.5],
      },
      {
        point: [1.5, 1.5],
        source: [1.5, 1.5],
      },
      {
        point: [64, 32],
        source: [64, 32],
      },
      {
        point: [127.5, 63.5],
        source: [127.5, 63.5],
      },
    ],
    getterCount: 262154,
    getterHash:
      "54233c1214394d1623dc75b2f30cb8370c153d4ab41e6aed69d5a92228e80b30",
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.5, 0.5],
      radius: [0.0625, 8192],
      amount: -1,
    },
    kind: "controls",
    dimensions: [8192, 8192],
    bulge: true,
    center: [65536, 65536],
    radius: [1, 131072],
    factorCount: 65537,
    factorBytes: 262148,
    factorHash:
      "49057a06ecb498e3761f505ea9abf06cdc6462b3d2bbadb38042a9cebe7f45d6",
    encodedBytes: 263168,
    encodedHash:
      "c414d2eeef42784bf17eef6f7711662ab36f7ffd30270a496927a81a1578f31d",
    points: [
      {
        point: [-1, -1],
        source: [-1, -1],
      },
      {
        point: [0.5, 0.5],
        source: [0.5, 0.5],
      },
      {
        point: [1.5, 1.5],
        source: [1.5, 1.5],
      },
      {
        point: [4096, 4096],
        source: [4096, 4096],
      },
      {
        point: [8191.5, 8191.5],
        source: [8191.5, 8191.5],
      },
    ],
    getterCount: 262154,
    getterHash:
      "54233c1214394d1623dc75b2f30cb8370c153d4ab41e6aed69d5a92228e80b30",
  },
  {
    id: "distort.ripple",
    params: {
      center: [0.5, 0.5],
      amplitude: 0,
      wavelength: 32,
      phase: 0,
      decay: 0,
    },
    kind: "controls",
    dimensions: [2, 2],
    bulge: false,
    center: [16, 16],
    radius: [1, 1],
    factorCount: 47,
    factorBytes: 188,
    factorHash:
      "06f6f01258e06b6a71e52fe7598a023d469ed2c6891754825ec7249e3c9e0074",
    encodedBytes: 1024,
    encodedHash:
      "488cdbe0d0aa15c1fccd854edfadc3cee0837c3d75d5f2f0bcc062cacd957554",
    points: [
      {
        point: [-1, -1],
        source: [-1, -1],
      },
      {
        point: [0.5, 0.5],
        source: [0.5, 0.5],
      },
      {
        point: [1.5, 1.5],
        source: [1.5, 1.5],
      },
      {
        point: [1, 1],
        source: [1, 1],
      },
      {
        point: [1.5, 1.5],
        source: [1.5, 1.5],
      },
    ],
    getterCount: 194,
    getterHash:
      "14fd5e0746d2f62c72821e72e11233b5bc7b51e4e4e6c27335bb9a5fb5fb7e0c",
  },
  {
    id: "distort.ripple",
    params: {
      center: [0.5, 0.5],
      amplitude: 0,
      wavelength: 32,
      phase: 0,
      decay: 0,
    },
    kind: "controls",
    dimensions: [128, 64],
    bulge: false,
    center: [1024, 512],
    radius: [1, 1],
    factorCount: 2291,
    factorBytes: 9164,
    factorHash:
      "5b8f86d6181da7bbd26076f1c4e898f612ad694336a9e2862bd0176f08711340",
    encodedBytes: 9216,
    encodedHash:
      "97d6ec2e8919860472cb452f10661b1b8a1b324b9ba5c3bdfd31909a47d09a1b",
    points: [
      {
        point: [-1, -1],
        source: [-1, -1],
      },
      {
        point: [0.5, 0.5],
        source: [0.5, 0.5],
      },
      {
        point: [1.5, 1.5],
        source: [1.5, 1.5],
      },
      {
        point: [64, 32],
        source: [64, 32],
      },
      {
        point: [127.5, 63.5],
        source: [127.5, 63.5],
      },
    ],
    getterCount: 9170,
    getterHash:
      "a0ecdf0ab0f670892b490b287544c4635ded464fa199b86526bfffd98fc79894",
  },
  {
    id: "distort.ripple",
    params: {
      center: [0.5, 0.5],
      amplitude: 0,
      wavelength: 32,
      phase: 0,
      decay: 0,
    },
    kind: "controls",
    dimensions: [8192, 8192],
    bulge: false,
    center: [65536, 65536],
    radius: [1, 1],
    factorCount: 185365,
    factorBytes: 741460,
    factorHash:
      "aee312b55a725c1c54722c9eb060c29721ce352fd7f6517578ff54324ecd93e5",
    encodedBytes: 742400,
    encodedHash:
      "3d65a4ca92471b02e7ad3f0ad9bb75b44ba21e096e4530bd5a84ae66b8684c05",
    points: [
      {
        point: [-1, -1],
        source: [-1, -1],
      },
      {
        point: [0.5, 0.5],
        source: [0.5, 0.5],
      },
      {
        point: [1.5, 1.5],
        source: [1.5, 1.5],
      },
      {
        point: [4096, 4096],
        source: [4096, 4096],
      },
      {
        point: [8191.5, 8191.5],
        source: [8191.5, 8191.5],
      },
    ],
    getterCount: 741466,
    getterHash:
      "146ca0ae6e93055b5754cfa44c83006b954436903b905b71098c16b52b430f58",
  },
  {
    id: "distort.ripple",
    params: {
      center: [0.3, 0.7],
      amplitude: 4,
      wavelength: 32,
      phase: 90,
      decay: 0.3,
    },
    kind: "controls",
    dimensions: [2, 2],
    bulge: false,
    center: [10, 22],
    radius: [1, 1],
    factorCount: 47,
    factorBytes: 188,
    factorHash:
      "b294a02dad10e5eee686ed6cb9f72df929de4e5a10808bf6c37bb4b8203b4181",
    encodedBytes: 1024,
    encodedHash:
      "b33fd6d89b245128b13d136ab93e020e475474ddaeb836f22397f0c08108fc71",
    points: [
      {
        point: [-1, -1],
        source: [-2.25, -2.875],
      },
      {
        point: [0.5, 0.5],
        source: [0, -3],
      },
      {
        point: [1.5, 1.5],
        source: [4.9375, 1.9375],
      },
      {
        point: [1, 1],
        source: [3.75, -1.8125],
      },
      {
        point: [1.5, 1.5],
        source: [4.9375, 1.9375],
      },
    ],
    getterCount: 194,
    getterHash:
      "14fd5e0746d2f62c72821e72e11233b5bc7b51e4e4e6c27335bb9a5fb5fb7e0c",
  },
  {
    id: "distort.ripple",
    params: {
      center: [0.3, 0.7],
      amplitude: 4,
      wavelength: 32,
      phase: 90,
      decay: 0.3,
    },
    kind: "controls",
    dimensions: [128, 64],
    bulge: false,
    center: [614, 717],
    radius: [1, 1],
    factorCount: 2291,
    factorBytes: 9164,
    factorHash:
      "ce004aec563185c285057620e5f1ea1cfd1dfc089d081de4227bb9f39f498ea9",
    encodedBytes: 9216,
    encodedHash:
      "f4d7d246e09599489f63cb9343f0a138729b01bad4b26e85424e37d1e4ec8a7a",
    points: [
      {
        point: [-1, -1],
        source: [-2.75, -3],
      },
      {
        point: [0.5, 0.5],
        source: [-0.5, -0.6875],
      },
      {
        point: [1.5, 1.5],
        source: [1.0625, 1],
      },
      {
        point: [64, 32],
        source: [66.625, 30.625],
      },
      {
        point: [127.5, 63.5],
        source: [129.25, 63.8125],
      },
    ],
    getterCount: 9170,
    getterHash:
      "a0ecdf0ab0f670892b490b287544c4635ded464fa199b86526bfffd98fc79894",
  },
  {
    id: "distort.ripple",
    params: {
      center: [0.3, 0.7],
      amplitude: 4,
      wavelength: 32,
      phase: 90,
      decay: 0.3,
    },
    kind: "controls",
    dimensions: [8192, 8192],
    bulge: false,
    center: [39322, 91750],
    radius: [1, 1],
    factorCount: 185365,
    factorBytes: 741460,
    factorHash:
      "2c092fe7a68cf880d52423229f721630b7828e3c8766b4f2c5c5318489415bcc",
    encodedBytes: 742400,
    encodedHash:
      "c6b8e762d06756f6561578070b7225fb10929afd396d73cd0331de28a5ce1a57",
    points: [
      {
        point: [-1, -1],
        source: [-2.25, -3.8125],
      },
      {
        point: [0.5, 0.5],
        source: [-0.75, -2.3125],
      },
      {
        point: [1.5, 1.5],
        source: [0.25, -1.3125],
      },
      {
        point: [4096, 4096],
        source: [4094, 4097.9375],
      },
      {
        point: [8191.5, 8191.5],
        source: [8194.25, 8192.6875],
      },
    ],
    getterCount: 741466,
    getterHash:
      "146ca0ae6e93055b5754cfa44c83006b954436903b905b71098c16b52b430f58",
  },
  {
    id: "distort.ripple",
    params: {
      center: [0, 1],
      amplitude: -1000,
      wavelength: 0.0625,
      phase: -270,
      decay: 8,
    },
    kind: "controls",
    dimensions: [2, 2],
    bulge: false,
    center: [0, 32],
    radius: [1, 1],
    factorCount: 47,
    factorBytes: 188,
    factorHash:
      "dac8c740465e734d2dbdbbaaaffc3212c324e7e06aecd1a3f94e02d1e418bfe6",
    encodedBytes: 1024,
    encodedHash:
      "66623027fbe365f184b7214f50ff1530ec35ffaa32afa281b05e8b9fe3885701",
    points: [
      {
        point: [-1, -1],
        source: [null, null],
      },
      {
        point: [0.5, 0.5],
        source: [-0.125, 2.3125],
      },
      {
        point: [1.5, 1.5],
        source: [-0.375, 2.0625],
      },
      {
        point: [1, 1],
        source: [-2, 3.9375],
      },
      {
        point: [1.5, 1.5],
        source: [-0.375, 2.0625],
      },
    ],
    getterCount: 194,
    getterHash:
      "14fd5e0746d2f62c72821e72e11233b5bc7b51e4e4e6c27335bb9a5fb5fb7e0c",
  },
  {
    id: "distort.ripple",
    params: {
      center: [0, 1],
      amplitude: -1000,
      wavelength: 0.0625,
      phase: -270,
      decay: 8,
    },
    kind: "controls",
    dimensions: [128, 64],
    bulge: false,
    center: [0, 1024],
    radius: [1, 1],
    factorCount: 2291,
    factorBytes: 9164,
    factorHash:
      "bd3959115f6f11768e0f0ba629da22f88e5e5ed79d4935112331c44473dd6fb8",
    encodedBytes: 9216,
    encodedHash:
      "b98b42de26e46c07125693e429282b789e599e0610ae1362e6cb53b2d8e367f6",
    points: [
      {
        point: [-1, -1],
        source: [-0.75, 16.1875],
      },
      {
        point: [0.5, 0.5],
        source: [0.3125, 19.375],
      },
      {
        point: [1.5, 1.5],
        source: [1, 21.5625],
      },
      {
        point: [64, 32],
        source: [53.6875, 37.125],
      },
      {
        point: [127.5, 63.5],
        source: [127.125, 63.5],
      },
    ],
    getterCount: 9170,
    getterHash:
      "a0ecdf0ab0f670892b490b287544c4635ded464fa199b86526bfffd98fc79894",
  },
  {
    id: "distort.ripple",
    params: {
      center: [0, 1],
      amplitude: -1000,
      wavelength: 0.0625,
      phase: -270,
      decay: 8,
    },
    kind: "controls",
    dimensions: [8192, 8192],
    bulge: false,
    center: [0, 131072],
    radius: [1, 1],
    factorCount: 185365,
    factorBytes: 741460,
    factorHash:
      "dbb691cc465c7e73c498cdf21e8e840dd68251fd3aaa3f4f59d014adc0c55303",
    encodedBytes: 742400,
    encodedHash:
      "b1c28f55bd177f68c5d241cbeea29364277d9fd23ca5a2134ee80ee8b4f9111f",
    points: [
      {
        point: [-1, -1],
        source: [-1, -1],
      },
      {
        point: [0.5, 0.5],
        source: [0.5, 0.5],
      },
      {
        point: [1.5, 1.5],
        source: [1.5, 1.5],
      },
      {
        point: [4096, 4096],
        source: [4094, 4098],
      },
      {
        point: [8191.5, 8191.5],
        source: [8191.5, 8191.5],
      },
    ],
    getterCount: 741466,
    getterHash:
      "146ca0ae6e93055b5754cfa44c83006b954436903b905b71098c16b52b430f58",
  },
  {
    id: "distort.ripple",
    params: {
      center: [0.5, 0.5],
      amplitude: 1000,
      wavelength: 8192,
      phase: 180,
      decay: 0,
    },
    kind: "controls",
    dimensions: [2, 2],
    bulge: false,
    center: [16, 16],
    radius: [1, 1],
    factorCount: 47,
    factorBytes: 188,
    factorHash:
      "82007eefd0fae37f7e9f400c81f2b52d10ef6768360828e46c49662690f5d6b3",
    encodedBytes: 1024,
    encodedHash:
      "400d9c143bc105bcaae809c6213ae97af844180345e3b47d87509a72f5dfd4b9",
    points: [
      {
        point: [-1, -1],
        source: [0.5, 0.5],
      },
      {
        point: [0.5, 0.5],
        source: [0.875, 0.875],
      },
      {
        point: [1.5, 1.5],
        source: [1.0625, 1.0625],
      },
      {
        point: [1, 1],
        source: [1, 1],
      },
      {
        point: [1.5, 1.5],
        source: [1.0625, 1.0625],
      },
    ],
    getterCount: 194,
    getterHash:
      "14fd5e0746d2f62c72821e72e11233b5bc7b51e4e4e6c27335bb9a5fb5fb7e0c",
  },
  {
    id: "distort.ripple",
    params: {
      center: [0.5, 0.5],
      amplitude: 1000,
      wavelength: 8192,
      phase: 180,
      decay: 0,
    },
    kind: "controls",
    dimensions: [128, 64],
    bulge: false,
    center: [1024, 512],
    radius: [1, 1],
    factorCount: 2291,
    factorBytes: 9164,
    factorHash:
      "7c000fbad6f9c1c73ded804d9c8f188d4e838c5dca33c9cc8affd7acdad15e7a",
    encodedBytes: 9216,
    encodedHash:
      "031da4f5b1317f30322e44a5dfb4194dc219ae25fdd4f226572aeb1a0bf1e0dc",
    points: [
      {
        point: [-1, -1],
        source: [48.8125, 24.25],
      },
      {
        point: [0.5, 0.5],
        source: [49.125, 24.625],
      },
      {
        point: [1.5, 1.5],
        source: [49.375, 24.875],
      },
      {
        point: [64, 32],
        source: [64, 32],
      },
      {
        point: [127.5, 63.5],
        source: [78.8125, 39.3125],
      },
    ],
    getterCount: 9170,
    getterHash:
      "a0ecdf0ab0f670892b490b287544c4635ded464fa199b86526bfffd98fc79894",
  },
  {
    id: "distort.ripple",
    params: {
      center: [0.5, 0.5],
      amplitude: 1000,
      wavelength: 8192,
      phase: 180,
      decay: 0,
    },
    kind: "controls",
    dimensions: [8192, 8192],
    bulge: false,
    center: [65536, 65536],
    radius: [1, 1],
    factorCount: 185365,
    factorBytes: 741460,
    factorHash:
      "78c7c562760e345e5956139fb91a3fdc4c24818c68b592d3a79ac806db94a3a6",
    encodedBytes: 742400,
    encodedHash:
      "5f5657583abe49dc63340f86f641e5d0a414ed9cae90ca73ca1882118d945dd0",
    points: [
      {
        point: [-1, -1],
        source: [-683.1875, -683.1875],
      },
      {
        point: [0.5, 0.5],
        source: [-681.4375, -681.4375],
      },
      {
        point: [1.5, 1.5],
        source: [-680.3125, -680.3125],
      },
      {
        point: [4096, 4096],
        source: [4096, 4096],
      },
      {
        point: [8191.5, 8191.5],
        source: [8873.375, 8873.375],
      },
    ],
    getterCount: 741466,
    getterHash:
      "146ca0ae6e93055b5754cfa44c83006b954436903b905b71098c16b52b430f58",
  },
] as const;
const limits = { pixels: 2097152, metadata: 2097152 };
type Work = {
  managed: boolean;
  memory: ManagedMemory;
  data?: Uint8Array<ArrayBuffer> | undefined;
};
const hash = (v: ArrayBufferView) =>
  createHash("sha256")
    .update(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))
    .digest("hex");
function controls() {
  return radialDistortionControls(
    "distort.ripple",
    { center: [0.5, 0.5], amplitude: 4, wavelength: 32, phase: 0, decay: 0 },
    2,
    2,
  );
}
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
afterEach(() => vi.restoreAllMocks());
it("preserves 21 whole original encoded stores and complete borrowed control/view getter sequences with actual standalone view/backing ownership", async () => {
  for (const active of [false, true])
    for (const row of originals) {
      const raw = radialDistortionControls(
          row.id,
          row.params as never,
          row.dimensions[0]!,
          row.dimensions[1]!,
        ),
        before = hash(raw.factors),
        memory = new ManagedMemory(limits),
        sequence = createHash("sha256");
      let gets = 0,
        bytes: Uint8Array<ArrayBuffer> | undefined;
      const factors = new Proxy(raw.factors, {
          get(t, k) {
            sequence.update("factors." + String(k) + "\n");
            gets++;
            return Reflect.get(t, k, t);
          },
        }),
        c = new Proxy(
          { ...raw, factors },
          {
            get(t, k, r) {
              sequence.update("controls." + String(k) + "\n");
              gets++;
              return Reflect.get(t, k, r);
            },
          },
        );
      const run = async () => {
        bytes = radialControlBytes(c as never);
      };
      if (active) await withManagedMemory(memory, run);
      else await run();
      expect(bytes!.byteLength).toBe(row.encodedBytes);
      expect(hash(bytes!)).toBe(row.encodedHash);
      expect(gets).toBe(row.getterCount);
      expect(sequence.digest("hex")).toBe(row.getterHash);
      expect(memory.owns(bytes!)).toBe(active);
      expect(memory.owns(bytes!.buffer)).toBe(active);
      expect(memory.statistics.current).toEqual({
        pixels: active ? row.encodedBytes : 0,
        metadata: active ? 512 : 0,
      });
      releaseRenderMetadata(bytes!);
      if (active) expect(bytes!.byteLength).toBe(0);
      else expect(hash(bytes!)).toBe(row.encodedHash);
      empty(memory);
      expect(hash(raw.factors)).toBe(before);
      expect(raw.center).toEqual(row.center);
      memory.dispose();
    }
});
it("rejects header/view metadata before borrowed getters/ceil and exact original pixel quota before backing/view constructor", async () => {
  for (const stage of ["header", "view", "pixels"]) {
    const raw = controls(),
      memory = new ManagedMemory({
        ...limits,
        metadata:
          stage === "header"
            ? 16383
            : stage === "view"
              ? 16384 + 511
              : limits.metadata,
        pixels: stage === "pixels" ? 1023 : limits.pixels,
      }),
      get = vi.fn((t: RadialControls, k: PropertyKey, r: unknown) =>
        Reflect.get(t, k, r),
      );
    let work: Work | undefined;
    const adopt = memory.adopt.bind(memory);
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((...args) => {
        work = args[0] as Work;
        return adopt(...args);
      });
      const ceil = vi.spyOn(Math, "ceil");
      expect(() => radialControlBytes(new Proxy(raw, { get }))).toThrow(
        stage === "pixels" ? /pixels/ : /metadata/,
      );
      expect(get).toHaveBeenCalledTimes(stage === "pixels" ? 1 : 0);
      expect(ceil).toHaveBeenCalledTimes(stage === "pixels" ? 1 : 0);
      if (stage !== "header") expect(work).toEqual({});
      empty(memory);
    });
    expect(raw.factors.byteLength).toBe(188);
    memory.dispose();
  }
});
it("holds actual encoded view/backing through original factor getters and transfers view ownership outside scope through consumer release", async () => {
  const raw = controls(),
    memory = new ManagedMemory(limits),
    adopt = memory.adopt.bind(memory);
  let work: Work | undefined,
    actual: Uint8Array<ArrayBuffer> | undefined,
    bytes: Uint8Array<ArrayBuffer> | undefined;
  const factors = new Proxy(raw.factors, {
    get(t, k) {
      if (k === "0") {
        actual = work!.data;
        expect(actual).toBeInstanceOf(Uint8Array);
        expect(memory.owns(work!)).toBe(true);
        expect(memory.owns(actual!.buffer)).toBe(true);
        expect(memory.statistics.current).toEqual({
          pixels: 1024,
          metadata: 16384 + 512,
        });
      }
      return Reflect.get(t, k, t);
    },
  });
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      if (!work) work = args[0] as Work;
      return adopt(...args);
    });
    bytes = radialControlBytes({ ...raw, factors } as never);
    expect(bytes).toBe(actual);
    expect(work).toEqual({});
  });
  expect(memory.owns(bytes!)).toBe(true);
  expect(memory.statistics.current).toEqual({ pixels: 1024, metadata: 512 });
  releaseRenderMetadata(bytes!);
  expect(actual!.byteLength).toBe(0);
  empty(memory);
  expect(raw.factors.byteLength).toBe(188);
  memory.dispose();
});
it("detaches actual partially encoded store after early/mid borrowed factor getter null and preserves it over secondary pixel cleanup with retry", async () => {
  for (const failIndex of [0, 11]) {
    const raw = controls(),
      before = hash(raw.factors),
      memory = new ManagedMemory(limits),
      adopt = memory.adopt.bind(memory),
      release = memory.release.bind(memory);
    let work: Work | undefined, actual: Uint8Array<ArrayBuffer> | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((...args) => {
        if (!work) work = args[0] as Work;
        return adopt(...args);
      });
      vi.spyOn(memory, "release").mockImplementation((value) => {
        release(value);
        throw Error("secondary backing cleanup");
      });
      const factors = new Proxy(raw.factors, {
        get(t, k) {
          if (k === String(failIndex)) {
            actual = work!.data;
            throw null;
          }
          return Reflect.get(t, k, t);
        },
      });
      let failure: unknown = "unset";
      try {
        radialControlBytes({ ...raw, factors } as never);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(actual!.byteLength).toBe(0);
      expect(work).toEqual({});
      empty(memory);
      expect(hash(raw.factors)).toBe(before);
      vi.restoreAllMocks();
      const bytes = radialControlBytes(raw);
      expect(bytes.byteLength).toBe(1024);
      releaseRenderMetadata(bytes);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual header or completed view metadata adoption null and permits retry with borrowed factors intact", async () => {
  for (const stage of ["header", "view"]) {
    const raw = controls(),
      before = hash(raw.factors),
      memory = new ManagedMemory(limits),
      adopt = memory.adopt.bind(memory);
    let calls = 0,
      work: Work | undefined,
      actual: Uint8Array<ArrayBuffer> | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((...args) => {
        calls++;
        if (calls === 1) work = args[0] as Work;
        if (args[0] instanceof Uint8Array)
          actual = args[0] as Uint8Array<ArrayBuffer>;
        if (
          (stage === "header" && calls === 1) ||
          (stage === "view" && args[0] instanceof Uint8Array)
        )
          throw null;
        return adopt(...args);
      });
      let failure: unknown = "unset";
      try {
        radialControlBytes(raw);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(work).toEqual({});
      if (stage === "view") expect(actual!.byteLength).toBe(0);
      empty(memory);
      expect(hash(raw.factors)).toBe(before);
      vi.restoreAllMocks();
      const bytes = radialControlBytes(raw);
      releaseRenderMetadata(bytes);
      empty(memory);
    });
    memory.dispose();
  }
});
it("detaches actual constructed backing/view when original pixel adoption throws null before any encoding getters and permits retry", async () => {
  const raw = controls(),
    memory = new ManagedMemory(limits),
    adopt = memory.adopt.bind(memory);
  let work: Work | undefined, actual: Uint8Array<ArrayBuffer> | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      if (!work) work = args[0] as Work;
      if (args[0] instanceof ArrayBuffer) {
        actual = work.data;
        throw null;
      }
      return adopt(...args);
    });
    const get = vi.fn((t: Int32Array, k: PropertyKey) => Reflect.get(t, k, t)),
      factors = new Proxy(raw.factors, { get });
    let failure: unknown = "unset";
    try {
      radialControlBytes({ ...raw, factors } as never);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(actual!.byteLength).toBe(0);
    expect(get.mock.calls.map((x) => x[1])).toEqual(["length", "length"]);
    expect(work).toEqual({});
    empty(memory);
    vi.restoreAllMocks();
    const bytes = radialControlBytes(raw);
    releaseRenderMetadata(bytes);
    empty(memory);
  });
  memory.dispose();
});
it("retires actual completed encoded result/backing when successful producer phase cleanup throws null", async () => {
  const raw = controls(),
    memory = new ManagedMemory(limits),
    reserve = memory.reserve.bind(memory),
    adopt = memory.adopt.bind(memory);
  let calls = 0,
    work: Work | undefined,
    actual: Uint8Array<ArrayBuffer> | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "reserve").mockImplementation((...args) => {
      const lease = reserve(...args);
      if (++calls === 1) {
        const release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw null;
        });
      }
      return lease;
    });
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      if (!work) work = args[0] as Work;
      if (args[0] instanceof Uint8Array)
        actual = args[0] as Uint8Array<ArrayBuffer>;
      return adopt(...args);
    });
    let failure: unknown = "unset";
    try {
      radialControlBytes(raw);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(actual!.byteLength).toBe(0);
    expect(work).toEqual({});
    empty(memory);
  });
  expect(raw.factors.byteLength).toBe(188);
  memory.dispose();
});
it("keeps actual returned encoded view/backing to scratch or allocator cleanup while borrowed controls remain original", async () => {
  for (const scratch of [false, true]) {
    const raw = controls(),
      before = hash(raw.factors),
      memory = new ManagedMemory(limits);
    let bytes: Uint8Array<ArrayBuffer> | undefined;
    if (scratch) memory.beginScratch();
    await withManagedMemory(memory, async () => {
      bytes = radialControlBytes(raw);
    });
    expect(memory.owns(bytes!)).toBe(true);
    expect(memory.owns(bytes!.buffer)).toBe(true);
    if (scratch) memory.endScratch();
    else memory.dispose();
    expect(bytes!.byteLength).toBe(0);
    empty(memory);
    expect(hash(raw.factors)).toBe(before);
    releaseRenderMetadata(bytes!);
    memory.dispose();
  }
});
it("retires view metadata and actual backing before propagating consumer cleanup null", async () => {
  const raw = controls(),
    memory = new ManagedMemory(limits);
  let bytes: Uint8Array<ArrayBuffer> | undefined;
  await withManagedMemory(memory, async () => {
    bytes = radialControlBytes(raw);
  });
  const release = memory.release.bind(memory);
  vi.spyOn(memory, "release").mockImplementation((value) => {
    release(value);
    throw null;
  });
  let failure: unknown = "unset";
  try {
    releaseRenderMetadata(bytes!);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeNull();
  expect(bytes!.byteLength).toBe(0);
  empty(memory);
  vi.restoreAllMocks();
  memory.dispose();
});
it("keeps an actual caller-admitted encoding view under its original parent and adds only the original pixel reservation", async () => {
  const raw = controls(),
    memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const work = allocateRenderMetadata<Work>(
      16384,
      () => ({ managed: true, memory }),
      false,
      (v) => {
        if (v.data) memory.release(v.data.buffer);
        for (const k in v) delete (v as Partial<Work>)[k as keyof Work];
      },
    );
    const reserve = vi.spyOn(memory, "reserve"),
      bytes = radialControlBytes(raw, work as never);
    expect(work.data).toBe(bytes);
    expect(memory.owns(work)).toBe(true);
    expect(memory.owns(bytes)).toBe(false);
    expect(memory.owns(bytes.buffer)).toBe(true);
    expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual([
      ["pixels", 1024],
    ]);
    expect(memory.statistics.current).toEqual({
      pixels: 1024,
      metadata: 16384,
    });
    releaseRenderMetadata(work);
    expect(bytes.byteLength).toBe(0);
    expect(work).toEqual({});
    empty(memory);
  });
  memory.dispose();
});
