import { afterEach, expect, it, vi } from "vitest";
import {
  radialDistortionKernel,
  radialDistortionControls,
  radialControlBytes,
  radialSourcePoint,
} from "../../packages/renderer-core/src/composition/render/radial-distortion.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { createHash } from "node:crypto";
export const sha = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function shadowHarness() {
  let id = 1;
  const records: unknown[] = [];
  const call = (name: string, ...v: unknown[]) => {
    records.push([name, ...v]);
  };
  const pixels = [
    23, 41, 199, 213, 201, 7, 143, 81, 33, 192, 9, 151, 241, 59, 73, 0,
  ];
  const surface = (value: number, w = 2, h = 2) => ({
    id: value,
    width: w,
    height: h,
    canvas: { id: value },
    ctx: {
      getImageData: () => {
        call("read", value);
        return { data: new Uint8ClampedArray(pixels) };
      },
      putImageData: (image: { data: Uint8ClampedArray }, ...v: unknown[]) =>
        call("put", value, [...image.data], ...v),
    },
  });
  const input = surface(1),
    context = {
      createSurface: (w: number, h: number) => {
        const v = surface(++id, w, h);
        call("create", v.id, w, h);
        return v;
      },
      uploadBytes: (v: { id: number }, data: Uint8Array) =>
        call("upload", v.id, [...data]),
      pass: (
        body: string,
        out: { id: number },
        inputs: readonly { id: number }[],
        uniforms: unknown,
      ) =>
        call(
          "pass",
          body.length,
          sha(body),
          out.id,
          inputs.map((v) => v.id),
          JSON.parse(JSON.stringify(uniforms)),
        ),
    };
  return { records, input, context };
}
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
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.5, 0.5],
      radius: [32, 16],
      amount: 0,
    },
    kind: "native",
    gpu: true,
    calls: 0,
    sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.5, 0.5],
      radius: [32, 16],
      amount: 0,
    },
    kind: "native",
    gpu: false,
    calls: 0,
    sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
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
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.3, 0.7],
      radius: [2.5, 1.25],
      amount: 1,
    },
    kind: "native",
    gpu: true,
    calls: 4,
    sha256: "6e7ebb9d375947d1bd6c9157bb87467ecf4cdcffecd0e6c5813111327c0a8a04",
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.3, 0.7],
      radius: [2.5, 1.25],
      amount: 1,
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "b4603e2029ca7a914bcdc553d134072fefd9ce89b8447ee855fc15df877d914c",
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
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.5, 0.5],
      radius: [0.0625, 8192],
      amount: -1,
    },
    kind: "native",
    gpu: true,
    calls: 4,
    sha256: "c93b2bde327dc8cd60e2268d8206fbff1adec5cce812d580682c52105bd2eb5b",
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.5, 0.5],
      radius: [0.0625, 8192],
      amount: -1,
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "ac145ba3de203f2c1040eeff15d756ebbdbc43423173065403c1997cbec24ba7",
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
    kind: "native",
    gpu: true,
    calls: 0,
    sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
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
    kind: "native",
    gpu: false,
    calls: 0,
    sha256: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
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
    kind: "native",
    gpu: true,
    calls: 4,
    sha256: "dfe6efa2dc152832818f6e2cf51e76f3ef0f18c9b3191f89afe2b9933bbf3271",
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
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "f0668b10cc72af9137e84153788d9c76b13f9dddd464cfb4a355d90c4814d38f",
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
    kind: "native",
    gpu: true,
    calls: 4,
    sha256: "dd57b017dd3836b5e58d5ce7d41ed4cc72da8cc388b606cfe8780bb0f368eaeb",
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
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "c5f14139f4a5da7b0e4a735c05dbbb3053377f778d833a39130073924b4130e7",
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
    kind: "native",
    gpu: true,
    calls: 4,
    sha256: "6dd859cd28cdc6cf9f9ef080c32564ee2a27776d9e1cbc70644d56765e018c28",
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
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "b353b69b40ce71c5e4f20c0a5f383aefaece651c0349e9fb638a622a6c88824f",
  },
] as const;
const numericKinds = [
  {
    id: "distort.bulge",
    params: {
      center: [0.5, 0.5],
      radius: [32, 16],
      amount: 0,
    },
    kind: "numeric-kinds",
    dimensions: [2, 2],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.5, 0.5],
      radius: [32, 16],
      amount: 0,
    },
    kind: "numeric-kinds",
    dimensions: [128, 64],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.5, 0.5],
      radius: [32, 16],
      amount: 0,
    },
    kind: "numeric-kinds",
    dimensions: [8192, 8192],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.3, 0.7],
      radius: [2.5, 1.25],
      amount: 1,
    },
    kind: "numeric-kinds",
    dimensions: [2, 2],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.3, 0.7],
      radius: [2.5, 1.25],
      amount: 1,
    },
    kind: "numeric-kinds",
    dimensions: [128, 64],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.3, 0.7],
      radius: [2.5, 1.25],
      amount: 1,
    },
    kind: "numeric-kinds",
    dimensions: [8192, 8192],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.5, 0.5],
      radius: [0.0625, 8192],
      amount: -1,
    },
    kind: "numeric-kinds",
    dimensions: [2, 2],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.5, 0.5],
      radius: [0.0625, 8192],
      amount: -1,
    },
    kind: "numeric-kinds",
    dimensions: [128, 64],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
  },
  {
    id: "distort.bulge",
    params: {
      center: [0.5, 0.5],
      radius: [0.0625, 8192],
      amount: -1,
    },
    kind: "numeric-kinds",
    dimensions: [8192, 8192],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
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
    kind: "numeric-kinds",
    dimensions: [2, 2],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
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
    kind: "numeric-kinds",
    dimensions: [128, 64],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
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
    kind: "numeric-kinds",
    dimensions: [8192, 8192],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
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
    kind: "numeric-kinds",
    dimensions: [2, 2],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
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
    kind: "numeric-kinds",
    dimensions: [128, 64],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
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
    kind: "numeric-kinds",
    dimensions: [8192, 8192],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
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
    kind: "numeric-kinds",
    dimensions: [2, 2],
    sourceKinds: [
      ["NaN", "NaN"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
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
    kind: "numeric-kinds",
    dimensions: [128, 64],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
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
    kind: "numeric-kinds",
    dimensions: [8192, 8192],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
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
    kind: "numeric-kinds",
    dimensions: [2, 2],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
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
    kind: "numeric-kinds",
    dimensions: [128, 64],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
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
    kind: "numeric-kinds",
    dimensions: [8192, 8192],
    sourceKinds: [
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
      ["number", "number"],
    ],
  },
] as const;
const limits = { pixels: 1048576, metadata: 2097152 };
const bulge = { center: [0.3, 0.7], radius: [2.5, 1.25], amount: 1 },
  ripple = {
    center: [0.3, 0.7],
    amplitude: 4,
    wavelength: 32,
    phase: 90,
    decay: 0.3,
  };
type Work = {
  factors?: Int32Array<ArrayBuffer>;
  center?: number[];
  radius?: number[];
  controls?: object;
  data?: Uint8Array<ArrayBuffer>;
  input?: object;
  table?: object;
  output?: object;
  inputs?: object[];
  uniforms?: Record<string, number | readonly number[]>;
  shader?: string;
};
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function owner(memory: ManagedMemory): Work | undefined {
  const resources = (
    memory as unknown as { resources: Map<object, { value: object }> }
  ).resources;
  for (const r of resources.values())
    if (Object.hasOwn(r.value, "memory")) return r.value as Work;
}
const hash = (view: ArrayBufferView) =>
  createHash("sha256")
    .update(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
    .digest("hex");
function run(
  h: ReturnType<typeof shadowHarness>,
  params: object = bulge,
  id = "distort.bulge",
) {
  return radialDistortionKernel(id)!.renderGpu(
    h.context as never,
    h.input as never,
    params as never,
  );
}
afterEach(() => vi.restoreAllMocks());
it("preserves all 21 whole original factor/encoded tables and source points plus 14 complete GPU/Canvas native transactions", async () => {
  for (const [i, x] of originals
    .filter((x) => x.kind === "controls")
    .entries()) {
    const c = radialDistortionControls(
        x.id,
        x.params as never,
        x.dimensions[0]!,
        x.dimensions[1]!,
      ),
      data = radialControlBytes(c);
    expect(c.bulge).toBe(x.bulge);
    expect(c.center).toEqual(x.center);
    expect(c.radius).toEqual(x.radius);
    expect(c.factors.length).toBe(x.factorCount);
    expect(c.factors.byteLength).toBe(x.factorBytes);
    expect(hash(c.factors)).toBe(x.factorHash);
    expect(data.byteLength).toBe(x.encodedBytes);
    expect(hash(data)).toBe(x.encodedHash);
    for (const [j, p] of x.points.entries()) {
      const expected = p.source.map((value, k) =>
        numericKinds[i]!.sourceKinds[j]![k] === "NaN" ? NaN : value,
      );
      expect(radialSourcePoint(c, p.point[0]!, p.point[1]!)).toEqual(expected);
    }
  }
  for (const active of [false, true]) {
    const memory = new ManagedMemory(limits),
      check = async () => {
        for (const x of originals.filter((x) => x.kind === "native" && x.gpu)) {
          const h = shadowHarness();
          run(h, x.params, x.id);
          expect(h.records).toHaveLength(x.calls);
          expect(sha(h.records)).toBe(x.sha256);
          empty(memory);
        }
      };
    if (active) await withManagedMemory(memory, check);
    else await check();
    memory.dispose();
  }
  for (const x of originals.filter((x) => x.kind === "native" && !x.gpu)) {
    const h = shadowHarness();
    radialDistortionKernel(x.id)!.renderCanvas!(
      h.context as never,
      h.input as never,
      x.params as never,
    );
    expect(h.records).toHaveLength(x.calls);
    expect(sha(h.records)).toBe(x.sha256);
  }
});
it("rejects the work header before original factor math/native factories while original neutral exits need no admission", async () => {
  for (const [id, params] of [
    ["distort.bulge", bulge],
    ["distort.ripple", ripple],
  ] as const) {
    const memory = new ManagedMemory({ ...limits, metadata: 16383 }),
      h = shadowHarness(),
      plugin = radialDistortionKernel(id)!;
    await withManagedMemory(memory, async () => {
      const hypot = vi.spyOn(Math, "hypot"),
        round = vi.spyOn(Math, "round");
      expect(() => run(h, params, id)).toThrow(/metadata/);
      expect(hypot).not.toHaveBeenCalled();
      expect(round).not.toHaveBeenCalled();
      expect(h.records).toHaveLength(0);
      empty(memory);
      const reserve = vi.spyOn(memory, "reserve");
      expect(
        plugin.renderGpu(
          h.context as never,
          h.input as never,
          { ...params, amount: 0, amplitude: 0 } as never,
        ),
      ).toBe(h.input);
      expect(reserve).not.toHaveBeenCalled();
      empty(memory);
    });
    vi.restoreAllMocks();
    memory.dispose();
  }
});
it("grows actual working ownership by exact factor bytes before constructing the actual Int32 backing", async () => {
  for (const [id, params, count] of [
    ["distort.bulge", bulge, 65537],
    ["distort.ripple", ripple, 47],
  ] as const) {
    const memory = new ManagedMemory({
        ...limits,
        metadata: 16384 + count * 4 - 1,
      }),
      h = shadowHarness(),
      adopt = memory.adopt.bind(memory);
    let actual: Work | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((...args) => {
        actual = args[0] as Work;
        return adopt(...args);
      });
      const round = vi.spyOn(Math, "round");
      expect(() => run(h, params, id)).toThrow(/metadata/);
      expect(round).not.toHaveBeenCalled();
      expect(h.records).toHaveLength(0);
      expect(actual).toEqual({});
      empty(memory);
    });
    vi.restoreAllMocks();
    memory.dispose();
  }
});
it("holds actual factor backing/vector/controller/table/input/shader/native refs through pass, including maximum dimensions, then detaches actual stores and clears refs", async () => {
  for (const [id, params] of [
    ["distort.bulge", bulge],
    ["distort.ripple", ripple],
  ] as const)
    for (const dimensions of [
      [2, 2],
      [8192, 8192],
    ]) {
      const memory = new ManagedMemory(limits),
        h = shadowHarness();
      h.input.width = dimensions[0]!;
      h.input.height = dimensions[1]!;
      const oracle = originals.find(
        (x) =>
          x.kind === "controls" &&
          x.id === id &&
          x.dimensions[0] === dimensions[0] &&
          JSON.stringify(x.params) === JSON.stringify(params),
      )!;
      let actual: Work | undefined,
        factors: Int32Array | undefined,
        data: Uint8Array | undefined,
        center: number[] | undefined,
        radius: number[] | undefined,
        controls: object | undefined,
        inputs: object[] | undefined,
        uniforms: object | undefined;
      const before = JSON.stringify(params);
      await withManagedMemory(memory, async () => {
        const pass = h.context.pass;
        vi.spyOn(h.context, "pass").mockImplementation((...args) => {
          actual = owner(memory)!;
          expect(memory.owns(actual)).toBe(true);
          factors = actual.factors;
          data = actual.data;
          expect(memory.statistics.current).toEqual({
            metadata: 16384 + factors!.byteLength,
            pixels: data!.byteLength,
          });
          expect(factors!.byteLength).toBe(
            (oracle as { factorBytes: number }).factorBytes,
          );
          expect(hash(factors!)).toBe(
            (oracle as { factorHash: string }).factorHash,
          );
          expect(hash(data!)).toBe(
            (oracle as { encodedHash: string }).encodedHash,
          );
          expect(memory.owns(data!.buffer)).toBe(true);
          expect(actual.input).toBe(h.input);
          expect(actual.output).toBe(args[1]);
          expect(actual.inputs).toBe(args[2]);
          expect(actual.uniforms).toBe(args[3]);
          expect(actual.shader).toBe(args[0]);
          expect(actual.table).toBe(args[2][1]);
          center = actual.center;
          radius = actual.radius;
          controls = actual.controls;
          inputs = actual.inputs;
          uniforms = actual.uniforms;
          return pass(...args);
        });
        run(h, params, id);
        empty(memory);
      });
      expect(factors!.byteLength).toBe(0);
      expect(data!.byteLength).toBe(0);
      expect(center).toHaveLength(0);
      expect(radius).toHaveLength(0);
      expect(controls).toEqual({});
      expect(inputs).toHaveLength(0);
      expect(uniforms).toEqual({});
      expect(actual).toEqual({});
      expect(JSON.stringify(params)).toBe(before);
      memory.dispose();
    }
});
it("keeps the original encoded-table pixel admission and retires actual factor backing on pixel quota failure before upload", async () => {
  for (const [id, params, pixels] of [
    ["distort.bulge", bulge, 263167],
    ["distort.ripple", ripple, 1023],
  ] as const) {
    const memory = new ManagedMemory({ ...limits, pixels }),
      h = shadowHarness(),
      reserve = memory.reserve.bind(memory);
    let actual: Work | undefined, factors: Int32Array | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "reserve").mockImplementation((...args) => {
        if (args[0] === "pixels") {
          actual = owner(memory);
          factors = actual!.factors;
        }
        return reserve(...args);
      });
      expect(() => run(h, params, id)).toThrow(/pixel/);
      expect(factors!.byteLength).toBe(0);
      expect(actual).toEqual({});
      expect(h.records).toHaveLength(0);
      empty(memory);
    });
    memory.dispose();
  }
});
it("captures actual unreturned factor backing before original loops and detaches it after mid-round/sin null while preserving null over secondary metadata cleanup", async () => {
  for (const stage of ["round", "sin"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      reserve = memory.reserve.bind(memory);
    let actual: Work | undefined, factors: Int32Array | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "reserve").mockImplementation((...args) => {
        const lease = reserve(...args),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw Error("secondary retirement");
        });
        return lease;
      });
      const round = Math.round,
        sin = Math.sin;
      let calls = 0;
      const fail = () => {
        actual = owner(memory);
        factors = actual!.factors;
        throw null;
      };
      if (stage === "round")
        vi.spyOn(Math, "round").mockImplementation((v) =>
          ++calls === 3 ? fail() : round(v),
        );
      else
        vi.spyOn(Math, "sin").mockImplementation((v) =>
          ++calls === 3 ? fail() : sin(v),
        );
      let failure: unknown = "unset";
      try {
        run(
          h,
          stage === "round" ? bulge : ripple,
          stage === "round" ? "distort.bulge" : "distort.ripple",
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(factors!.byteLength).toBe(0);
      expect(actual).toEqual({});
      empty(memory);
      vi.restoreAllMocks();
      run(h);
      empty(memory);
    });
    memory.dispose();
  }
});
it("retires actual factor/data/native refs on table/output create, upload or pass null and continues cleanup after first table-backing retirement error", async () => {
  for (const stage of ["table", "output", "upload", "pass"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      release = memory.release.bind(memory);
    let actual: Work | undefined,
      factors: Int32Array | undefined,
      data: Uint8Array | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "release").mockImplementation((value) => {
        release(value);
        throw Error("secondary table backing");
      });
      const fail = () => {
        actual = owner(memory);
        factors = actual!.factors;
        data = actual!.data;
        throw null;
      };
      if (stage === "table")
        vi.spyOn(h.context, "createSurface").mockImplementationOnce(fail);
      if (stage === "output") {
        const create = h.context.createSurface;
        let n = 0;
        vi.spyOn(h.context, "createSurface").mockImplementation((...args) =>
          ++n === 2 ? fail() : create(...args),
        );
      }
      if (stage === "upload")
        vi.spyOn(h.context, "uploadBytes").mockImplementationOnce(fail);
      if (stage === "pass")
        vi.spyOn(h.context, "pass").mockImplementationOnce(fail);
      let failure: unknown = "unset";
      try {
        run(h);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(factors!.byteLength).toBe(0);
      expect(data!.byteLength).toBe(0);
      expect(actual).toEqual({});
      empty(memory);
      vi.restoreAllMocks();
      run(h);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual work on adoption or growth null before factor math/native factories and permits retry", async () => {
  for (const stage of ["adopt", "resize"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      reserve = memory.reserve.bind(memory),
      adopt = memory.adopt.bind(memory);
    let actual: Work | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((...args) => {
        actual = args[0] as Work;
        if (stage === "adopt") throw null;
        return adopt(...args);
      });
      if (stage === "resize")
        vi.spyOn(memory, "reserve").mockImplementation((...args) => {
          const lease = reserve(...args);
          vi.spyOn(lease, "resize").mockImplementation(() => {
            throw null;
          });
          return lease;
        });
      const round = vi.spyOn(Math, "round");
      let failure: unknown = "unset";
      try {
        run(h);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(round).not.toHaveBeenCalled();
      expect(h.records).toHaveLength(0);
      expect(actual).toEqual({});
      empty(memory);
      vi.restoreAllMocks();
      run(h);
      empty(memory);
    });
    memory.dispose();
  }
});
it("propagates successful-pass cleanup null after actual factor and table backings and control/native refs retire", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    release = memory.release.bind(memory);
  let actual: Work | undefined,
    factors: Int32Array | undefined,
    data: Uint8Array | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "release").mockImplementation((value) => {
      release(value);
      throw null;
    });
    const pass = h.context.pass;
    vi.spyOn(h.context, "pass").mockImplementation((...args) => {
      actual = owner(memory);
      factors = actual!.factors;
      data = actual!.data;
      return pass(...args);
    });
    let failure: unknown = "unset";
    try {
      run(h);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(h.records).toHaveLength(4);
    expect(factors!.byteLength).toBe(0);
    expect(data!.byteLength).toBe(0);
    expect(actual).toEqual({});
    empty(memory);
  });
  memory.dispose();
});
