import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  radialDistortionControls,
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
    getterCount: 65543,
    getterHash:
      "452de4c6683649eb7063e0de693e7ecceb726df1205529ea7de63ca1f47a8bcc",
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
    getterCount: 65543,
    getterHash:
      "452de4c6683649eb7063e0de693e7ecceb726df1205529ea7de63ca1f47a8bcc",
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
    getterCount: 65543,
    getterHash:
      "452de4c6683649eb7063e0de693e7ecceb726df1205529ea7de63ca1f47a8bcc",
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
    getterCount: 65543,
    getterHash:
      "452de4c6683649eb7063e0de693e7ecceb726df1205529ea7de63ca1f47a8bcc",
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
    getterCount: 65543,
    getterHash:
      "452de4c6683649eb7063e0de693e7ecceb726df1205529ea7de63ca1f47a8bcc",
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
    getterCount: 65543,
    getterHash:
      "452de4c6683649eb7063e0de693e7ecceb726df1205529ea7de63ca1f47a8bcc",
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
    getterCount: 65543,
    getterHash:
      "452de4c6683649eb7063e0de693e7ecceb726df1205529ea7de63ca1f47a8bcc",
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
    getterCount: 65543,
    getterHash:
      "452de4c6683649eb7063e0de693e7ecceb726df1205529ea7de63ca1f47a8bcc",
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
    getterCount: 65543,
    getterHash:
      "452de4c6683649eb7063e0de693e7ecceb726df1205529ea7de63ca1f47a8bcc",
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
    getterCount: 188,
    getterHash:
      "21be08e00684809ee33e517256df2901ef673bd6a6ec1e7c71e96d159822405c",
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
    getterCount: 9164,
    getterHash:
      "225122c6c732e98051b6e57b8424c93418a17217e3392b6aa20be1470d738c54",
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
    getterCount: 741460,
    getterHash:
      "a4ba14d485de4757eac0a595dae349fd2d4d2246b38a82be2125f64de96f9e13",
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
    getterCount: 188,
    getterHash:
      "21be08e00684809ee33e517256df2901ef673bd6a6ec1e7c71e96d159822405c",
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
    getterCount: 9164,
    getterHash:
      "225122c6c732e98051b6e57b8424c93418a17217e3392b6aa20be1470d738c54",
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
    getterCount: 741460,
    getterHash:
      "a4ba14d485de4757eac0a595dae349fd2d4d2246b38a82be2125f64de96f9e13",
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
    getterCount: 188,
    getterHash:
      "21be08e00684809ee33e517256df2901ef673bd6a6ec1e7c71e96d159822405c",
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
    getterCount: 9164,
    getterHash:
      "225122c6c732e98051b6e57b8424c93418a17217e3392b6aa20be1470d738c54",
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
    getterCount: 741460,
    getterHash:
      "a4ba14d485de4757eac0a595dae349fd2d4d2246b38a82be2125f64de96f9e13",
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
    getterCount: 188,
    getterHash:
      "21be08e00684809ee33e517256df2901ef673bd6a6ec1e7c71e96d159822405c",
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
    getterCount: 9164,
    getterHash:
      "225122c6c732e98051b6e57b8424c93418a17217e3392b6aa20be1470d738c54",
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
    getterCount: 741460,
    getterHash:
      "a4ba14d485de4757eac0a595dae349fd2d4d2246b38a82be2125f64de96f9e13",
  },
] as const;
const limits = { pixels: 1024, metadata: 2097152 };
const params = {
  center: [0.5, 0.5],
  amplitude: 4,
  wavelength: 32,
  phase: 0,
  decay: 0,
};
type Work = {
  managed: boolean;
  memory: ManagedMemory;
  factors?: Int32Array | undefined;
  center?: number[] | undefined;
  radius?: number[] | undefined;
  controls?: RadialControls | undefined;
};
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
const hash = (v: ArrayBufferView) =>
  createHash("sha256")
    .update(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))
    .digest("hex");
function make() {
  return radialDistortionControls("distort.ripple", params, 2, 2);
}
afterEach(() => vi.restoreAllMocks());
it("preserves all 21 original full factor stores, returned vectors and complete borrowed getter sequences with independent active result ownership", async () => {
  for (const active of [false, true])
    for (const row of originals) {
      const memory = new ManagedMemory(limits),
        sequence = createHash("sha256");
      let gets = 0,
        c: RadialControls | undefined;
      const observe = (name: string, value: object) =>
        new Proxy(value, {
          get(t, k, r) {
            sequence.update(name + "." + String(k) + "\n");
            gets++;
            return Reflect.get(t, k, r);
          },
        });
      const raw = structuredClone(row.params),
        p = observe("params", {
          ...raw,
          center: observe("center", raw.center),
          ...("radius" in raw ? { radius: observe("radius", raw.radius) } : {}),
        });
      const produce = async () => {
        c = radialDistortionControls(
          row.id,
          p as never,
          row.dimensions[0]!,
          row.dimensions[1]!,
        );
      };
      if (active) await withManagedMemory(memory, produce);
      else await produce();
      expect(c!.bulge).toBe(row.bulge);
      expect(c!.center).toEqual(row.center);
      expect(c!.radius).toEqual(row.radius);
      expect(c!.factors.length).toBe(row.factorCount);
      expect(hash(c!.factors)).toBe(row.factorHash);
      expect(gets).toBe(row.getterCount);
      expect(sequence.digest("hex")).toBe(row.getterHash);
      expect(memory.owns(c!)).toBe(active);
      expect(memory.owns(c!.factors.buffer)).toBe(false);
      expect(memory.statistics.current.metadata).toBe(
        active ? 1024 + row.factorBytes : 0,
      );
      const factors = c!.factors,
        center = c!.center,
        radius = c!.radius;
      releaseRenderMetadata(c!);
      if (active) {
        expect(factors.byteLength).toBe(0);
        expect(center).toHaveLength(0);
        expect(radius).toHaveLength(0);
        expect(c).toEqual({});
      } else expect(hash(factors)).toBe(row.factorHash);
      empty(memory);
      expect(raw).toEqual(row.params);
      memory.dispose();
    }
});
it("rejects temporary header quota before borrowed getters/math and exact result quota before the factor constructor or original loops", async () => {
  for (const resultCut of [false, true]) {
    const memory = new ManagedMemory({
      ...limits,
      metadata: resultCut ? 16384 + 1024 + 47 * 4 - 1 : 16383,
    });
    let work: Work | undefined;
    const adopt = memory.adopt.bind(memory),
      get = vi.fn((t: typeof params, k: PropertyKey, r: unknown) =>
        Reflect.get(t, k, r),
      );
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((...args) => {
        work = args[0] as Work;
        return adopt(...args);
      });
      const hypot = vi.spyOn(Math, "hypot"),
        round = vi.spyOn(Math, "round");
      expect(() =>
        radialDistortionControls(
          "distort.ripple",
          new Proxy(params, { get }),
          2,
          2,
        ),
      ).toThrow(/metadata/);
      expect(round).not.toHaveBeenCalled();
      expect(hypot).toHaveBeenCalledTimes(resultCut ? 1 : 0);
      if (resultCut) {
        expect(get.mock.calls.map((x) => x[1])).toEqual(["center", "radius"]);
        expect(work).toEqual({});
      } else expect(get).not.toHaveBeenCalled();
      empty(memory);
    });
    memory.dispose();
  }
});
it("holds actual factor and vector refs under temporary plus result capacity through original math then transfers them to the actual returned owner outside scope", async () => {
  const memory = new ManagedMemory(limits),
    adopt = memory.adopt.bind(memory);
  let work: Work | undefined,
    c: RadialControls | undefined,
    factors: Int32Array | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      if (!work) work = args[0] as Work;
      return adopt(...args);
    });
    const sin = Math.sin;
    vi.spyOn(Math, "sin").mockImplementation((v) => {
      expect(memory.statistics.current.metadata).toBe(16384 + 1024 + 47 * 4);
      expect(work!.factors).toBeInstanceOf(Int32Array);
      factors = work!.factors;
      expect(memory.owns(work!)).toBe(true);
      return sin(v);
    });
    c = make();
    expect(c.factors).toBe(factors);
    expect(memory.owns(c)).toBe(true);
    expect(work).toEqual({});
  });
  expect(c!.center).toEqual([16, 16]);
  expect(c!.radius).toEqual([1, 1]);
  expect(memory.statistics.current.metadata).toBe(1024 + 47 * 4);
  const center = c!.center,
    radius = c!.radius;
  releaseRenderMetadata(c!);
  expect(factors!.byteLength).toBe(0);
  expect(center).toHaveLength(0);
  expect(radius).toHaveLength(0);
  expect(c).toEqual({});
  empty(memory);
  memory.dispose();
});
it("preserves early/mid factor math null over secondary lease cleanup, detaches the actual partial backing and permits exact retry", async () => {
  for (const failAt of [1, 11]) {
    const memory = new ManagedMemory(limits),
      adopt = memory.adopt.bind(memory),
      reserve = memory.reserve.bind(memory);
    let work: Work | undefined, factors: Int32Array | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((...args) => {
        work = args[0] as Work;
        return adopt(...args);
      });
      vi.spyOn(memory, "reserve").mockImplementation((...args) => {
        const lease = reserve(...args),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw Error("secondary cleanup");
        });
        return lease;
      });
      const sin = Math.sin;
      let calls = 0;
      vi.spyOn(Math, "sin").mockImplementation((v) => {
        factors = work!.factors;
        if (++calls === failAt) throw null;
        return sin(v);
      });
      let failure: unknown = "unset";
      try {
        make();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(factors!.byteLength).toBe(0);
      expect(work).toEqual({});
      empty(memory);
      vi.restoreAllMocks();
      const c = make();
      expect(c.center).toEqual([16, 16]);
      releaseRenderMetadata(c);
      empty(memory);
    });
    memory.dispose();
  }
});
it("retires actual temporary/header or complete result adoption null and permits retry without mutating borrowed params", async () => {
  for (const failAt of [1, 2]) {
    const memory = new ManagedMemory(limits),
      adopt = memory.adopt.bind(memory),
      before = structuredClone(params);
    let calls = 0,
      work: Work | undefined,
      result: RadialControls | undefined,
      factors: Int32Array | undefined,
      center: readonly number[] | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((...args) => {
        calls++;
        if (calls === 1) work = args[0] as Work;
        else {
          result = args[0] as RadialControls;
          factors = result.factors;
          center = result.center;
        }
        if (calls === failAt) throw null;
        return adopt(...args);
      });
      let failure: unknown = "unset";
      try {
        make();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(work).toEqual({});
      if (failAt === 2) {
        expect(result).toEqual({});
        expect(factors!.byteLength).toBe(0);
        expect(center).toHaveLength(0);
      }
      empty(memory);
      expect(params).toEqual(before);
      vi.restoreAllMocks();
      const c = make();
      releaseRenderMetadata(c);
      empty(memory);
    });
    memory.dispose();
  }
});
it("retires an already adopted result and all actual stores when successful producer phase cleanup throws null", async () => {
  const memory = new ManagedMemory(limits),
    reserve = memory.reserve.bind(memory),
    adopt = memory.adopt.bind(memory);
  let leases = 0,
    c: RadialControls | undefined,
    factors: Int32Array | undefined,
    center: readonly number[] | undefined,
    work: Work | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "reserve").mockImplementation((...args) => {
      const lease = reserve(...args);
      if (++leases === 1) {
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
      else {
        c = args[0] as RadialControls;
        factors = c.factors;
        center = c.center;
      }
      return adopt(...args);
    });
    let failure: unknown = "unset";
    try {
      make();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(work).toEqual({});
    expect(c).toEqual({});
    expect(factors!.byteLength).toBe(0);
    expect(center).toHaveLength(0);
    empty(memory);
  });
  memory.dispose();
});
it("retains actual standalone control backing/vectors to scratch or allocator cleanup with borrowed params unchanged", async () => {
  for (const scratch of [false, true]) {
    const memory = new ManagedMemory(limits),
      before = structuredClone(params);
    let c: RadialControls | undefined;
    if (scratch) memory.beginScratch();
    await withManagedMemory(memory, async () => {
      c = make();
    });
    const factors = c!.factors,
      center = c!.center,
      radius = c!.radius;
    expect(memory.owns(c!)).toBe(true);
    if (scratch) memory.endScratch();
    else memory.dispose();
    expect(factors.byteLength).toBe(0);
    expect(center).toHaveLength(0);
    expect(radius).toHaveLength(0);
    expect(c).toEqual({});
    empty(memory);
    expect(params).toEqual(before);
    releaseRenderMetadata(c!);
    memory.dispose();
  }
});
it("preserves actual caller-admitted factor/result route under one grown owner without extra standalone reservations", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const work = allocateRenderMetadata<Work>(
      16384,
      () => ({ managed: true, memory }),
      false,
      (v) => {
        if (v.factors?.byteLength)
          (
            v.factors.buffer as ArrayBuffer & {
              transfer(n: number): ArrayBuffer;
            }
          ).transfer(0);
        if (v.center) v.center.length = 0;
        if (v.radius) v.radius.length = 0;
        if (v.controls)
          for (const k in v.controls)
            delete (v.controls as Partial<RadialControls>)[
              k as keyof RadialControls
            ];
        for (const k in v) delete (v as Partial<Work>)[k as keyof Work];
      },
    );
    const reserve = vi.spyOn(memory, "reserve"),
      c = radialDistortionControls(
        "distort.ripple",
        params,
        2,
        2,
        work as never,
      );
    expect(work.controls).toBe(c);
    expect(memory.owns(work)).toBe(true);
    expect(memory.owns(c)).toBe(false);
    expect(reserve).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(16384 + 47 * 4);
    const factors = c.factors,
      center = c.center;
    releaseRenderMetadata(work);
    expect(factors.byteLength).toBe(0);
    expect(center).toHaveLength(0);
    expect(c).toEqual({});
    expect(work).toEqual({});
    empty(memory);
  });
  memory.dispose();
});
