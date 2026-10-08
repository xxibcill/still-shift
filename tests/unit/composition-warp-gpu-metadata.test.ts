import { afterEach, expect, it, vi } from "vitest";
import {
  warpEffectKernel,
  warpMapping,
} from "../../packages/renderer-core/src/composition/render/warp-effects.ts";
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
    id: "distort.transform",
    params: {
      anchor: [0.5, 0.5],
      offset: [0, 0],
      scale: [1, 1],
      rotation: 0,
    },
    kind: "mapping",
    dimensions: [2, 2],
    uniforms: {
      rowX: [65536, 0],
      rowY: [0, 65536],
      translationX: [0, 0, 0, 0],
      translationY: [0, 0, 0, 0],
    },
    shader:
      "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\n float low=dot(pointLow,coefficientLow)+translation.x;\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\n}\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}",
    points: [
      {
        destination: [-1, -1],
        source: [-1, -1],
      },
      {
        destination: [0.5, 0.5],
        source: [0.5, 0.5],
      },
      {
        destination: [1.5, 1.5],
        source: [1.5, 1.5],
      },
      {
        destination: [1, 1],
        source: [1, 1],
      },
      {
        destination: [1.5, 1.5],
        source: [1.5, 1.5],
      },
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.5, 0.5],
      offset: [0, 0],
      scale: [1, 1],
      rotation: 0,
    },
    kind: "mapping",
    dimensions: [64, 48],
    uniforms: {
      rowX: [65536, 0],
      rowY: [0, 65536],
      translationX: [0, 0, 0, 0],
      translationY: [0, 0, 0, 0],
    },
    shader:
      "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\n float low=dot(pointLow,coefficientLow)+translation.x;\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\n}\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}",
    points: [
      {
        destination: [-1, -1],
        source: [-1, -1],
      },
      {
        destination: [0.5, 0.5],
        source: [0.5, 0.5],
      },
      {
        destination: [1.5, 1.5],
        source: [1.5, 1.5],
      },
      {
        destination: [32, 24],
        source: [32, 24],
      },
      {
        destination: [63.5, 47.5],
        source: [63.5, 47.5],
      },
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.5, 0.5],
      offset: [0, 0],
      scale: [1, 1],
      rotation: 0,
    },
    kind: "mapping",
    dimensions: [8192, 8192],
    uniforms: {
      rowX: [65536, 0],
      rowY: [0, 65536],
      translationX: [0, 0, 0, 0],
      translationY: [0, 0, 0, 0],
    },
    shader:
      "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\n float low=dot(pointLow,coefficientLow)+translation.x;\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\n}\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}",
    points: [
      {
        destination: [-1, -1],
        source: [-1, -1],
      },
      {
        destination: [0.5, 0.5],
        source: [0.5, 0.5],
      },
      {
        destination: [1.5, 1.5],
        source: [1.5, 1.5],
      },
      {
        destination: [4096, 4096],
        source: [4096, 4096],
      },
      {
        destination: [8191.5, 8191.5],
        source: [8191.5, 8191.5],
      },
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.5, 0.5],
      offset: [0, 0],
      scale: [1, 1],
      rotation: 0,
    },
    kind: "native",
    gpu: true,
    calls: 2,
    sha256: "f15e5944a8b4738c4a8507fd3e00b324339e0ad5f328a6e06a9192c6fec63d6c",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        1777,
        "4490fe7442b18d5ceef7fe7045f97b37d29574c309c854565b0d0f32ef22c3e9",
        2,
        [1],
        {
          rowX: [65536, 0],
          rowY: [0, 65536],
          translationX: [0, 0, 0, 0],
          translationY: [0, 0, 0, 0],
        },
      ],
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.5, 0.5],
      offset: [0, 0],
      scale: [1, 1],
      rotation: 0,
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "ac145ba3de203f2c1040eeff15d756ebbdbc43423173065403c1997cbec24ba7",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [23, 41, 199, 213, 201, 6, 142, 81, 34, 193, 8, 151, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.3, 0.7],
      offset: [0.5, -0.25],
      scale: [2, 1],
      rotation: 37,
    },
    kind: "mapping",
    dimensions: [2, 2],
    uniforms: {
      rowX: [26170, 19720],
      rowY: [-39441, 52339],
      translationX: [289, 1000, 1023, -1],
      translationY: [387, 146, 0, 0],
    },
    shader:
      "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\n float low=dot(pointLow,coefficientLow)+translation.x;\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\n}\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}",
    points: [
      {
        destination: [-1, -1],
        source: [-0.8855209350585938, 0.9467697143554688],
      },
      {
        destination: [0.5, 0.5],
        source: [0.16481781005859375, Number("1.2419815063476562")],
      },
      {
        destination: [1.5, 1.5],
        source: [0.8650436401367188, Number("1.4387893676757812")],
      },
      {
        destination: [1, 1],
        source: [Number("0.5149307250976562"), Number("1.3403854370117188")],
      },
      {
        destination: [1.5, 1.5],
        source: [0.8650436401367188, Number("1.4387893676757812")],
      },
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.3, 0.7],
      offset: [0.5, -0.25],
      scale: [2, 1],
      rotation: 37,
    },
    kind: "mapping",
    dimensions: [64, 48],
    uniforms: {
      rowX: [26170, 19720],
      rowY: [-39441, 52339],
      translationX: [176, 166, 0, 0],
      translationY: [167, 361, 2, 0],
    },
    shader:
      "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\n float low=dot(pointLow,coefficientLow)+translation.x;\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\n}\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}",
    points: [
      {
        destination: [-1, -1],
        source: [0.597991943359375, 18.624778747558594],
      },
      {
        destination: [0.5, 0.5],
        source: [1.6483306884765625, 18.91999053955078],
      },
      {
        destination: [1.5, 1.5],
        source: [2.3485565185546875, 19.116798400878906],
      },
      {
        destination: [32, 24],
        source: [21.2982177734375, 18.73040008544922],
      },
      {
        destination: [63.5, 47.5],
        source: [40.94810485839844, 18.540809631347656],
      },
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.3, 0.7],
      offset: [0.5, -0.25],
      scale: [2, 1],
      rotation: 37,
    },
    kind: "mapping",
    dimensions: [8192, 8192],
    uniforms: {
      rowX: [26170, 19720],
      rowY: [-39441, 52339],
      translationX: [893, 844, 992, -1],
      translationY: [279, 291, 329, 0],
    },
    shader:
      "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\n float low=dot(pointLow,coefficientLow)+translation.x;\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\n}\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}",
    points: [
      {
        destination: [-1, -1],
        source: [-250.09966278076172, 2634.078758239746],
      },
      {
        destination: [0.5, 0.5],
        source: [-249.04932403564453, 2634.3739700317383],
      },
      {
        destination: [1.5, 1.5],
        source: [-248.3490982055664, 2634.5707778930664],
      },
      {
        destination: [4096, 4096],
        source: [2618.7255630493164, 3440.400566101074],
      },
      {
        destination: [8191.5, 8191.5],
        source: [5486.500450134277, 4246.42716217041],
      },
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.3, 0.7],
      offset: [0.5, -0.25],
      scale: [2, 1],
      rotation: 37,
    },
    kind: "native",
    gpu: true,
    calls: 2,
    sha256: "1eadab8b1641c332772e0a776dbe8edec15455f726c1459b0c2a4ccd5406a9bc",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        1777,
        "4490fe7442b18d5ceef7fe7045f97b37d29574c309c854565b0d0f32ef22c3e9",
        2,
        [1],
        {
          rowX: [26170, 19720],
          rowY: [-39441, 52339],
          translationX: [289, 1000, 1023, -1],
          translationY: [387, 146, 0, 0],
        },
      ],
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.3, 0.7],
      offset: [0.5, -0.25],
      scale: [2, 1],
      rotation: 37,
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "f5d5e6f45319307596fb1e467e4d222db6ae8a2212c0466ba323ee917231412d",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [29, 135, 84, 106, 27, 53, 180, 197, 32, 190, 7, 71, 35, 177, 26, 108],
        0,
        0,
      ],
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.5, 0.5],
      offset: [14.5, -7.5],
      scale: [0.00390625, 1],
      rotation: 0,
    },
    kind: "mapping",
    dimensions: [2, 2],
    uniforms: {
      rowX: [16777216, 0],
      rowY: [0, 65536],
      translationX: [0, 128, 528, -1],
      translationY: [0, 960, 0, 0],
    },
    shader:
      "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\n float low=dot(pointLow,coefficientLow)+translation.x;\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\n}\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}",
    points: [
      {
        destination: [-1, -1],
        source: [-4223, 6.5],
      },
      {
        destination: [0.5, 0.5],
        source: [-3839, 8],
      },
      {
        destination: [1.5, 1.5],
        source: [-3583, 9],
      },
      {
        destination: [1, 1],
        source: [-3711, 8.5],
      },
      {
        destination: [1.5, 1.5],
        source: [-3583, 9],
      },
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.5, 0.5],
      offset: [14.5, -7.5],
      scale: [0.00390625, 1],
      rotation: 0,
    },
    kind: "mapping",
    dimensions: [64, 48],
    uniforms: {
      rowX: [16777216, 0],
      rowY: [0, 65536],
      translationX: [0, 0, 564, -2],
      translationY: [0, 960, 0, 0],
    },
    shader:
      "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\n float low=dot(pointLow,coefficientLow)+translation.x;\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\n}\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}",
    points: [
      {
        destination: [-1, -1],
        source: [-12128, 6.5],
      },
      {
        destination: [0.5, 0.5],
        source: [-11744, 8],
      },
      {
        destination: [1.5, 1.5],
        source: [-11488, 9],
      },
      {
        destination: [32, 24],
        source: [-3680, 31.5],
      },
      {
        destination: [63.5, 47.5],
        source: [4384, 55],
      },
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.5, 0.5],
      offset: [14.5, -7.5],
      scale: [0.00390625, 1],
      rotation: 0,
    },
    kind: "mapping",
    dimensions: [8192, 8192],
    uniforms: {
      rowX: [16777216, 0],
      rowY: [0, 65536],
      translationX: [0, 0, 48, -128],
      translationY: [0, 960, 0, 0],
    },
    shader:
      "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\n float low=dot(pointLow,coefficientLow)+translation.x;\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\n}\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}",
    points: [
      {
        destination: [-1, -1],
        source: [-1048448, 6.5],
      },
      {
        destination: [0.5, 0.5],
        source: [-1048064, 8],
      },
      {
        destination: [1.5, 1.5],
        source: [-1047808, 9],
      },
      {
        destination: [4096, 4096],
        source: [384, 4103.5],
      },
      {
        destination: [8191.5, 8191.5],
        source: [1048832, 8199],
      },
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.5, 0.5],
      offset: [14.5, -7.5],
      scale: [0.00390625, 1],
      rotation: 0,
    },
    kind: "native",
    gpu: true,
    calls: 2,
    sha256: "f6a2b15e760480587182ee3477143dea8be162a800aba6dc74d80bf2978bcdbb",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        1777,
        "4490fe7442b18d5ceef7fe7045f97b37d29574c309c854565b0d0f32ef22c3e9",
        2,
        [1],
        {
          rowX: [16777216, 0],
          rowY: [0, 65536],
          translationX: [0, 128, 528, -1],
          translationY: [0, 960, 0, 0],
        },
      ],
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.5, 0.5],
      offset: [14.5, -7.5],
      scale: [0.00390625, 1],
      rotation: 0,
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "f0668b10cc72af9137e84153788d9c76b13f9dddd464cfb4a355d90c4814d38f",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      ["put", 2, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0, 0],
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0, 1],
      offset: [-1000, 1000],
      scale: [-1, 4],
      rotation: -723,
    },
    kind: "mapping",
    dimensions: [2, 2],
    uniforms: {
      rowX: [-65446, 3430],
      rowY: [857, 16362],
      translationX: [168, 631, 892, -1],
      translationY: [904, 628, 994, -1],
    },
    shader:
      "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\n float low=dot(pointLow,coefficientLow)+translation.x;\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\n}\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}",
    points: [
      {
        destination: [-1, -1],
        source: [-1050.1227416992188, -235.34959411621094],
      },
      {
        destination: [0.5, 0.5],
        source: [-1051.5421752929688, -234.95548248291016],
      },
      {
        destination: [1.5, 1.5],
        source: [-1052.4884643554688, -234.69274139404297],
      },
      {
        destination: [1, 1],
        source: [-1052.0153198242188, -234.82411193847656],
      },
      {
        destination: [1.5, 1.5],
        source: [-1052.4884643554688, -234.69274139404297],
      },
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0, 1],
      offset: [-1000, 1000],
      scale: [-1, 4],
      rotation: -723,
    },
    kind: "mapping",
    dimensions: [64, 48],
    uniforms: {
      rowX: [-65446, 3430],
      rowY: [857, 16362],
      translationX: [0, 323, 892, -1],
      translationY: [880, 950, 998, -1],
    },
    shader:
      "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\n float low=dot(pointLow,coefficientLow)+translation.x;\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\n}\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}",
    points: [
      {
        destination: [-1, -1],
        source: [-1052.5302734375, -200.8341522216797],
      },
      {
        destination: [0.5, 0.5],
        source: [-1053.94970703125, -200.4400405883789],
      },
      {
        destination: [1.5, 1.5],
        source: [-1054.89599609375, -200.17729949951172],
      },
      {
        destination: [32, 24],
        source: [-1084.176513671875, -194.1610107421875],
      },
      {
        destination: [63.5, 47.5],
        source: [-1114.4033203125, -187.8819808959961],
      },
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0, 1],
      offset: [-1000, 1000],
      scale: [-1, 4],
      rotation: -723,
    },
    kind: "mapping",
    dimensions: [8192, 8192],
    uniforms: {
      rowX: [-65446, 3430],
      rowY: [857, 16362],
      translationX: [576, 36, 839, -1],
      translationY: [816, 788, 738, 0],
    },
    shader:
      "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\n float low=dot(pointLow,coefficientLow)+translation.x;\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\n}\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}",
    points: [
      {
        destination: [-1, -1],
        source: [-1478.76806640625, 5909.89973449707],
      },
      {
        destination: [0.5, 0.5],
        source: [-1480.1875, 5910.293846130371],
      },
      {
        destination: [1.5, 1.5],
        source: [-1481.1337890625, 5910.556587219238],
      },
      {
        destination: [4096, 4096],
        source: [-5355.71435546875, 6986.3499755859375],
      },
      {
        destination: [8191.5, 8191.5],
        source: [-9231.2412109375, 8062.406105041504],
      },
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0, 1],
      offset: [-1000, 1000],
      scale: [-1, 4],
      rotation: -723,
    },
    kind: "native",
    gpu: true,
    calls: 2,
    sha256: "b6ab19e485f1543917b24e72e914c578dc167d1b23ed9f96100e6d89bdac07cb",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        1777,
        "4490fe7442b18d5ceef7fe7045f97b37d29574c309c854565b0d0f32ef22c3e9",
        2,
        [1],
        {
          rowX: [-65446, 3430],
          rowY: [857, 16362],
          translationX: [168, 631, 892, -1],
          translationY: [904, 628, 994, -1],
        },
      ],
    ],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0, 1],
      offset: [-1000, 1000],
      scale: [-1, 4],
      rotation: -723,
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "f0668b10cc72af9137e84153788d9c76b13f9dddd464cfb4a355d90c4814d38f",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      ["put", 2, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0, 0],
    ],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [0, 0],
      topRight: [1, 0],
      bottomRight: [1, 1],
      bottomLeft: [0, 1],
    },
    kind: "mapping",
    dimensions: [2, 2],
    uniforms: {
      rowX: [1, 0, 0],
      rowY: [0, 1, 0],
      rowW: [0, 0, 1],
      dimensions: [2, 2],
    },
    shader:
      "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}",
    points: [
      {
        destination: [-1, -1],
        source: [-1, -1],
      },
      {
        destination: [0.5, 0.5],
        source: [0.5, 0.5],
      },
      {
        destination: [1.5, 1.5],
        source: [1.5, 1.5],
      },
      {
        destination: [1, 1],
        source: [1, 1],
      },
      {
        destination: [1.5, 1.5],
        source: [1.5, 1.5],
      },
    ],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [0, 0],
      topRight: [1, 0],
      bottomRight: [1, 1],
      bottomLeft: [0, 1],
    },
    kind: "mapping",
    dimensions: [64, 48],
    uniforms: {
      rowX: [1, 0, 0],
      rowY: [0, 1, 0],
      rowW: [0, 0, 1],
      dimensions: [64, 48],
    },
    shader:
      "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}",
    points: [
      {
        destination: [-1, -1],
        source: [-1, -1],
      },
      {
        destination: [0.5, 0.5],
        source: [0.5, 0.5],
      },
      {
        destination: [1.5, 1.5],
        source: [1.5, 1.5],
      },
      {
        destination: [32, 24],
        source: [32, 24],
      },
      {
        destination: [63.5, 47.5],
        source: [63.5, 47.5],
      },
    ],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [0, 0],
      topRight: [1, 0],
      bottomRight: [1, 1],
      bottomLeft: [0, 1],
    },
    kind: "mapping",
    dimensions: [8192, 8192],
    uniforms: {
      rowX: [1, 0, 0],
      rowY: [0, 1, 0],
      rowW: [0, 0, 1],
      dimensions: [8192, 8192],
    },
    shader:
      "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}",
    points: [
      {
        destination: [-1, -1],
        source: [-1, -1],
      },
      {
        destination: [0.5, 0.5],
        source: [0.5, 0.5],
      },
      {
        destination: [1.5, 1.5],
        source: [1.5, 1.5],
      },
      {
        destination: [4096, 4096],
        source: [4096, 4096],
      },
      {
        destination: [8191.5, 8191.5],
        source: [8191.5, 8191.5],
      },
    ],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [0, 0],
      topRight: [1, 0],
      bottomRight: [1, 1],
      bottomLeft: [0, 1],
    },
    kind: "native",
    gpu: true,
    calls: 2,
    sha256: "df45b796c9dc9ec0978a3d03e5fb3e0b37a066719c0129877d768f46440a75be",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        966,
        "e4cef9489cf83ebc62f85fc1a424b8178171821c4c3e4cf1d5b01ffc577a4729",
        2,
        [1],
        {
          rowX: [1, 0, 0],
          rowY: [0, 1, 0],
          rowW: [0, 0, 1],
          dimensions: [2, 2],
        },
      ],
    ],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [0, 0],
      topRight: [1, 0],
      bottomRight: [1, 1],
      bottomLeft: [0, 1],
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "ac145ba3de203f2c1040eeff15d756ebbdbc43423173065403c1997cbec24ba7",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [23, 41, 199, 213, 201, 6, 142, 81, 34, 193, 8, 151, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [0.25, 0.25],
      topRight: [0.75, 0.25],
      bottomRight: [0.75, 0.75],
      bottomLeft: [0.25, 0.75],
    },
    kind: "mapping",
    dimensions: [2, 2],
    uniforms: {
      rowX: [2, 0, -0.5],
      rowY: [0, 2, -0.5],
      rowW: [0, 0, 1],
      dimensions: [2, 2],
    },
    shader:
      "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}",
    points: [
      {
        destination: [-1, -1],
        source: [-3, -3],
      },
      {
        destination: [0.5, 0.5],
        source: [0, 0],
      },
      {
        destination: [1.5, 1.5],
        source: [2, 2],
      },
      {
        destination: [1, 1],
        source: [1, 1],
      },
      {
        destination: [1.5, 1.5],
        source: [2, 2],
      },
    ],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [0.25, 0.25],
      topRight: [0.75, 0.25],
      bottomRight: [0.75, 0.75],
      bottomLeft: [0.25, 0.75],
    },
    kind: "mapping",
    dimensions: [64, 48],
    uniforms: {
      rowX: [2, 0, -0.5],
      rowY: [0, 2, -0.5],
      rowW: [0, 0, 1],
      dimensions: [64, 48],
    },
    shader:
      "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}",
    points: [
      {
        destination: [-1, -1],
        source: [-34, -26],
      },
      {
        destination: [0.5, 0.5],
        source: [-31, -23],
      },
      {
        destination: [1.5, 1.5],
        source: [-29, -21],
      },
      {
        destination: [32, 24],
        source: [32, 24],
      },
      {
        destination: [63.5, 47.5],
        source: [95, 71],
      },
    ],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [0.25, 0.25],
      topRight: [0.75, 0.25],
      bottomRight: [0.75, 0.75],
      bottomLeft: [0.25, 0.75],
    },
    kind: "mapping",
    dimensions: [8192, 8192],
    uniforms: {
      rowX: [2, 0, -0.5],
      rowY: [0, 2, -0.5],
      rowW: [0, 0, 1],
      dimensions: [8192, 8192],
    },
    shader:
      "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}",
    points: [
      {
        destination: [-1, -1],
        source: [-4098, -4098],
      },
      {
        destination: [0.5, 0.5],
        source: [-4095, -4095],
      },
      {
        destination: [1.5, 1.5],
        source: [-4093, -4093],
      },
      {
        destination: [4096, 4096],
        source: [4096, 4096],
      },
      {
        destination: [8191.5, 8191.5],
        source: [12287, 12287],
      },
    ],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [0.25, 0.25],
      topRight: [0.75, 0.25],
      bottomRight: [0.75, 0.75],
      bottomLeft: [0.25, 0.75],
    },
    kind: "native",
    gpu: true,
    calls: 2,
    sha256: "c6d30d3b70c4f61c276c61ba94b37480ecc6703861651c36424066658314a2bb",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        966,
        "e4cef9489cf83ebc62f85fc1a424b8178171821c4c3e4cf1d5b01ffc577a4729",
        2,
        [1],
        {
          rowX: [2, 0, -0.5],
          rowY: [0, 2, -0.5],
          rowW: [0, 0, 1],
          dimensions: [2, 2],
        },
      ],
    ],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [0.25, 0.25],
      topRight: [0.75, 0.25],
      bottomRight: [0.75, 0.75],
      bottomLeft: [0.25, 0.75],
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "bc28269734f13983ce5225089c93607557812754625cea218891f51b07921685",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [24, 43, 202, 53, 204, 13, 140, 20, 34, 195, 7, 38, 0, 0, 0, 0],
        0,
        0,
      ],
    ],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [-0.3, 0.1],
      topRight: [1.1, -0.2],
      bottomRight: [0.8, 1.3],
      bottomLeft: [0.2, 0.9],
    },
    kind: "mapping",
    dimensions: [2, 2],
    uniforms: {
      rowX: [2.294713258743286, -1.4341957569122314, 0.83183354139328],
      rowY: [0.11987307667732239, 0.5594077110290527, -0.019978845492005348],
      rowW: [1.5484445095062256, -1.5834494829177856, 1.6228783130645752],
      dimensions: [2, 2],
    },
    shader:
      "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}",
    points: [
      {
        destination: [-1, -1],
        source: [0.4896116554737091, -0.4384582042694092],
      },
      {
        destination: [0.5, 0.5],
        source: [1.2972497940063477, 0.1856623888015747],
      },
      {
        destination: [1.5, 1.5],
        source: [1.850430965423584, 0.6131457090377808],
      },
      {
        destination: [1, 1],
        source: [1.5723326206207275, 0.3982388973236084],
      },
      {
        destination: [1.5, 1.5],
        source: [1.850430965423584, 0.6131457090377808],
      },
    ],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [-0.3, 0.1],
      topRight: [1.1, -0.2],
      bottomRight: [0.8, 1.3],
      bottomLeft: [0.2, 0.9],
    },
    kind: "mapping",
    dimensions: [64, 48],
    uniforms: {
      rowX: [2.294713258743286, -1.4341957569122314, 0.83183354139328],
      rowY: [0.11987307667732239, 0.5594077110290527, -0.019978845492005348],
      rowW: [1.5484445095062256, -1.5834494829177856, 1.6228783130645752],
      dimensions: [64, 48],
    },
    shader:
      "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}",
    points: [
      {
        destination: [-1, -1],
        source: [32.3930778503418, -0.9856740832328796],
      },
      {
        destination: [0.5, 0.5],
        source: [33.01154708862305, -0.3919280767440796],
      },
      {
        destination: [1.5, 1.5],
        source: [33.42948913574219, 0.009308740496635437],
      },
      {
        destination: [32, 24],
        source: [50.31464385986328, 9.557733535766602],
      },
      {
        destination: [63.5, 47.5],
        source: [67.9025650024414, 19.671178817749023],
      },
    ],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [-0.3, 0.1],
      topRight: [1.1, -0.2],
      bottomRight: [0.8, 1.3],
      bottomLeft: [0.2, 0.9],
    },
    kind: "mapping",
    dimensions: [8192, 8192],
    uniforms: {
      rowX: [2.294713258743286, -1.4341957569122314, 0.83183354139328],
      rowY: [0.11987307667732239, 0.5594077110290527, -0.019978845492005348],
      rowW: [1.5484445095062256, -1.5834494829177856, 1.6228783130645752],
      dimensions: [8192, 8192],
    },
    shader:
      "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}",
    points: [
      {
        destination: [-1, -1],
        source: [4198.40576171875, -101.26793670654297],
      },
      {
        destination: [0.5, 0.5],
        source: [4199.2177734375, -100.64049530029297],
      },
      {
        destination: [1.5, 1.5],
        source: [4199.75927734375, Number("-100.22219848632812")],
      },
      {
        destination: [4096, 4096],
        source: [6440.2744140625, 1631.1865234375],
      },
      {
        destination: [8191.5, 8191.5],
        source: [8730.728515625, 3401.1875],
      },
    ],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [-0.3, 0.1],
      topRight: [1.1, -0.2],
      bottomRight: [0.8, 1.3],
      bottomLeft: [0.2, 0.9],
    },
    kind: "native",
    gpu: true,
    calls: 2,
    sha256: "f607d55b61c6f34db17182f2294f06c34dd9ed3a7fd34b0b9d72215eafb5ad82",
    records: [
      ["create", 2, 2, 2],
      [
        "pass",
        966,
        "e4cef9489cf83ebc62f85fc1a424b8178171821c4c3e4cf1d5b01ffc577a4729",
        2,
        [1],
        {
          rowX: [2.294713258743286, -1.4341957569122314, 0.83183354139328],
          rowY: [
            0.11987307667732239, 0.5594077110290527, -0.019978845492005348,
          ],
          rowW: [1.5484445095062256, -1.5834494829177856, 1.6228783130645752],
          dimensions: [2, 2],
        },
      ],
    ],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [-0.3, 0.1],
      topRight: [1.1, -0.2],
      bottomRight: [0.8, 1.3],
      bottomLeft: [0.2, 0.9],
    },
    kind: "native",
    gpu: false,
    calls: 3,
    sha256: "45884a149395dcc5bf1a2338ba4aa9c890481c12a3bff5ccd6eeaf6f590565e9",
    records: [
      ["read", 1],
      ["create", 2, 2, 2],
      [
        "put",
        2,
        [119, 22, 169, 71, 204, 7, 138, 35, 40, 97, 121, 147, 201, 5, 142, 52],
        0,
        0,
      ],
    ],
  },
] as const;
const signedZero = [
  {
    id: "distort.transform",
    params: {
      anchor: [0.5, 0.5],
      offset: [0, 0],
      scale: [1, 1],
      rotation: 0,
    },
    kind: "signed-zero",
    dimensions: [2, 2],
    negativeZeroPaths: [".uniforms.rowY.0"],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.5, 0.5],
      offset: [0, 0],
      scale: [1, 1],
      rotation: 0,
    },
    kind: "signed-zero",
    dimensions: [64, 48],
    negativeZeroPaths: [".uniforms.rowY.0"],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.5, 0.5],
      offset: [0, 0],
      scale: [1, 1],
      rotation: 0,
    },
    kind: "signed-zero",
    dimensions: [8192, 8192],
    negativeZeroPaths: [".uniforms.rowY.0"],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.3, 0.7],
      offset: [0.5, -0.25],
      scale: [2, 1],
      rotation: 37,
    },
    kind: "signed-zero",
    dimensions: [2, 2],
    negativeZeroPaths: [],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.3, 0.7],
      offset: [0.5, -0.25],
      scale: [2, 1],
      rotation: 37,
    },
    kind: "signed-zero",
    dimensions: [64, 48],
    negativeZeroPaths: [],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.3, 0.7],
      offset: [0.5, -0.25],
      scale: [2, 1],
      rotation: 37,
    },
    kind: "signed-zero",
    dimensions: [8192, 8192],
    negativeZeroPaths: [],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.5, 0.5],
      offset: [14.5, -7.5],
      scale: [0.00390625, 1],
      rotation: 0,
    },
    kind: "signed-zero",
    dimensions: [2, 2],
    negativeZeroPaths: [".uniforms.rowY.0"],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.5, 0.5],
      offset: [14.5, -7.5],
      scale: [0.00390625, 1],
      rotation: 0,
    },
    kind: "signed-zero",
    dimensions: [64, 48],
    negativeZeroPaths: [".uniforms.rowY.0"],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0.5, 0.5],
      offset: [14.5, -7.5],
      scale: [0.00390625, 1],
      rotation: 0,
    },
    kind: "signed-zero",
    dimensions: [8192, 8192],
    negativeZeroPaths: [".uniforms.rowY.0"],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0, 1],
      offset: [-1000, 1000],
      scale: [-1, 4],
      rotation: -723,
    },
    kind: "signed-zero",
    dimensions: [2, 2],
    negativeZeroPaths: [],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0, 1],
      offset: [-1000, 1000],
      scale: [-1, 4],
      rotation: -723,
    },
    kind: "signed-zero",
    dimensions: [64, 48],
    negativeZeroPaths: [],
  },
  {
    id: "distort.transform",
    params: {
      anchor: [0, 1],
      offset: [-1000, 1000],
      scale: [-1, 4],
      rotation: -723,
    },
    kind: "signed-zero",
    dimensions: [8192, 8192],
    negativeZeroPaths: [],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [0, 0],
      topRight: [1, 0],
      bottomRight: [1, 1],
      bottomLeft: [0, 1],
    },
    kind: "signed-zero",
    dimensions: [2, 2],
    negativeZeroPaths: [".uniforms.rowX.1", ".uniforms.rowY.0"],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [0, 0],
      topRight: [1, 0],
      bottomRight: [1, 1],
      bottomLeft: [0, 1],
    },
    kind: "signed-zero",
    dimensions: [64, 48],
    negativeZeroPaths: [".uniforms.rowX.1", ".uniforms.rowY.0"],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [0, 0],
      topRight: [1, 0],
      bottomRight: [1, 1],
      bottomLeft: [0, 1],
    },
    kind: "signed-zero",
    dimensions: [8192, 8192],
    negativeZeroPaths: [".uniforms.rowX.1", ".uniforms.rowY.0"],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [0.25, 0.25],
      topRight: [0.75, 0.25],
      bottomRight: [0.75, 0.75],
      bottomLeft: [0.25, 0.75],
    },
    kind: "signed-zero",
    dimensions: [2, 2],
    negativeZeroPaths: [".uniforms.rowX.1", ".uniforms.rowY.0"],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [0.25, 0.25],
      topRight: [0.75, 0.25],
      bottomRight: [0.75, 0.75],
      bottomLeft: [0.25, 0.75],
    },
    kind: "signed-zero",
    dimensions: [64, 48],
    negativeZeroPaths: [".uniforms.rowX.1", ".uniforms.rowY.0"],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [0.25, 0.25],
      topRight: [0.75, 0.25],
      bottomRight: [0.75, 0.75],
      bottomLeft: [0.25, 0.75],
    },
    kind: "signed-zero",
    dimensions: [8192, 8192],
    negativeZeroPaths: [".uniforms.rowX.1", ".uniforms.rowY.0"],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [-0.3, 0.1],
      topRight: [1.1, -0.2],
      bottomRight: [0.8, 1.3],
      bottomLeft: [0.2, 0.9],
    },
    kind: "signed-zero",
    dimensions: [2, 2],
    negativeZeroPaths: [],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [-0.3, 0.1],
      topRight: [1.1, -0.2],
      bottomRight: [0.8, 1.3],
      bottomLeft: [0.2, 0.9],
    },
    kind: "signed-zero",
    dimensions: [64, 48],
    negativeZeroPaths: [],
  },
  {
    id: "distort.corner-pin",
    params: {
      topLeft: [-0.3, 0.1],
      topRight: [1.1, -0.2],
      bottomRight: [0.8, 1.3],
      bottomLeft: [0.2, 0.9],
    },
    kind: "signed-zero",
    dimensions: [8192, 8192],
    negativeZeroPaths: [],
  },
] as const;
const limits = { pixels: 1048576, metadata: 1048576 };
const affine = {
  anchor: [0.3, 0.7],
  offset: [0.5, -0.25],
  scale: [2, 1],
  rotation: 37,
};
const corner = {
  topLeft: [-0.3, 0.1],
  topRight: [1.1, -0.2],
  bottomRight: [0.8, 1.3],
  bottomLeft: [0.2, 0.9],
};
type Work = {
  arrays: number[][];
  keys?: string[];
  points?: (readonly number[])[];
  pointProducer?: unknown;
  inverseProducer?: unknown;
  split?: unknown;
  sourcePoint?: unknown;
  uniforms?: Record<string, readonly number[]>;
  mapping?: object;
  input?: object;
  output?: object;
  inputs?: object[];
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
  for (const resource of resources.values())
    if (Object.hasOwn(resource.value, "arrays")) return resource.value as Work;
}
afterEach(() => vi.restoreAllMocks());
it("preserves all 21 original mappings including signed zeros and all 14 whole native GPU/Canvas transactions", async () => {
  for (const [i, x] of originals
    .filter((x) => x.kind === "mapping")
    .entries()) {
    const expected = JSON.parse(
      JSON.stringify({ uniforms: x.uniforms, points: x.points }),
    );
    for (const path of signedZero[i]!.negativeZeroPaths) {
      const keys = path.slice(1).split(".");
      let parent = expected;
      for (const key of keys.slice(0, -1)) parent = parent[key];
      parent[keys.at(-1)!] = -0;
    }
    const mapping = warpMapping(
      x.id,
      x.params as never,
      x.dimensions[0]!,
      x.dimensions[1]!,
    );
    const points = x.points.map((p) => ({
      destination: p.destination,
      source: mapping.sourcePoint(p.destination[0]!, p.destination[1]!) ?? null,
    }));
    expect({ uniforms: mapping.uniforms, points }).toEqual(expected);
    expect(mapping.shader).toBe(x.shader);
  }
  for (const active of [false, true]) {
    const memory = new ManagedMemory(limits),
      run = async () => {
        for (const x of originals.filter((x) => x.kind === "native" && x.gpu)) {
          const h = shadowHarness(),
            plugin = warpEffectKernel(x.id)!;
          plugin.renderGpu(
            h.context as never,
            h.input as never,
            x.params as never,
          );
          expect(h.records).toHaveLength(x.calls);
          expect(sha(h.records)).toBe(x.sha256);
          empty(memory);
        }
      };
    if (active) await withManagedMemory(memory, run);
    else await run();
    memory.dispose();
  }
  for (const x of originals.filter((x) => x.kind === "native" && !x.gpu)) {
    const h = shadowHarness();
    warpEffectKernel(x.id)!.renderCanvas!(
      h.context as never,
      h.input as never,
      x.params as never,
    );
    expect(h.records).toHaveLength(x.calls);
    expect(sha(h.records)).toBe(x.sha256);
  }
});
it("rejects 16383-byte GPU work before original validation/math/matrix/vector/native factories", async () => {
  for (const [id, params] of [
    ["distort.transform", affine],
    ["distort.corner-pin", corner],
  ] as const) {
    const memory = new ManagedMemory({ ...limits, metadata: 16383 }),
      h = shadowHarness(),
      plugin = warpEffectKernel(id)!;
    await withManagedMemory(memory, async () => {
      const cos = vi.spyOn(Math, "cos"),
        round = vi.spyOn(Math, "round"),
        map = vi.spyOn(Array.prototype, "map"),
        slice = vi.spyOn(Array.prototype, "slice");
      expect(() =>
        plugin.renderGpu(h.context as never, h.input as never, params as never),
      ).toThrow(/metadata/);
      expect(cos).not.toHaveBeenCalled();
      expect(round).not.toHaveBeenCalled();
      expect(map).not.toHaveBeenCalled();
      expect(slice).not.toHaveBeenCalled();
      expect(h.records).toHaveLength(0);
      empty(memory);
    });
    vi.restoreAllMocks();
    memory.dispose();
  }
});
it("holds actual matrix/vector/mapping/uniform/input/shader/native/producer refs through pass then clears actual containers without mutating borrowed points", async () => {
  for (const [id, params] of [
    ["distort.transform", affine],
    ["distort.corner-pin", corner],
  ] as const) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      plugin = warpEffectKernel(id)!;
    let actual: Work | undefined,
      arrays: number[][] = [],
      keys: string[] | undefined,
      points: (readonly number[])[] | undefined,
      inputs: object[] | undefined,
      uniforms: object | undefined,
      mapping: object | undefined;
    const before = JSON.stringify(params);
    await withManagedMemory(memory, async () => {
      const pass = h.context.pass;
      vi.spyOn(h.context, "pass").mockImplementation((...args) => {
        actual = owner(memory)!;
        expect(memory.owns(actual)).toBe(true);
        expect(memory.statistics.current.metadata).toBe(16384);
        expect(actual.input).toBe(h.input);
        expect(actual.output).toBe(args[1]);
        expect(actual.shader).toBe(args[0]);
        expect(actual.inputs).toBe(args[2]);
        expect(actual.uniforms).toBe(args[3]);
        expect(actual.sourcePoint).toBeTypeOf("function");
        expect((actual.mapping as { sourcePoint: unknown }).sourcePoint).toBe(
          actual.sourcePoint,
        );
        arrays = actual.arrays.slice();
        expect(arrays).toHaveLength(id === "distort.transform" ? 4 : 7);
        for (const values of Object.values(actual.uniforms!))
          expect(arrays).toContain(values);
        if (id === "distort.transform")
          expect(actual.split).toBeTypeOf("function");
        else {
          expect(actual.pointProducer).toBeTypeOf("function");
          expect(actual.inverseProducer).toBeTypeOf("function");
          expect(actual.points).toEqual([
            corner.topLeft,
            corner.topRight,
            corner.bottomRight,
            corner.bottomLeft,
          ]);
        }
        keys = actual.keys;
        points = actual.points;
        inputs = actual.inputs;
        uniforms = actual.uniforms;
        mapping = actual.mapping;
        return pass(...args);
      });
      plugin.renderGpu(h.context as never, h.input as never, params as never);
      empty(memory);
    });
    for (const a of arrays) expect(a).toHaveLength(0);
    if (keys) expect(keys).toHaveLength(0);
    if (points) expect(points).toHaveLength(0);
    expect(inputs).toHaveLength(0);
    expect(uniforms).toEqual({});
    expect(mapping).toEqual({});
    expect(actual).toEqual({});
    expect(JSON.stringify(params)).toBe(before);
    expect(h.input.width).toBe(2);
    memory.dispose();
  }
});
it("captures original corner point/inverse and affine split producers before their actual consumers under one work owner", async () => {
  for (const [id, params] of [
    ["distort.transform", affine],
    ["distort.corner-pin", corner],
  ] as const) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      plugin = warpEffectKernel(id)!;
    let points = 0,
      inverses = 0,
      splits = 0;
    await withManagedMemory(memory, async () => {
      const map = Array.prototype.map,
        floor = Math.floor;
      vi.spyOn(Array.prototype, "map").mockImplementation(function (
        this: unknown[],
        callback,
        ...args
      ) {
        const work = owner(memory);
        if (work?.pointProducer === callback) {
          points++;
          expect(memory.owns(work)).toBe(true);
          expect(work.keys).toBe(this);
        }
        if (work?.inverseProducer === callback) {
          inverses++;
          expect(memory.owns(work)).toBe(true);
          expect(work.arrays).toContain(this);
        }
        return map.call(this, callback, ...args);
      });
      vi.spyOn(Math, "floor").mockImplementation((value) => {
        const work = owner(memory);
        if (work?.split) {
          splits++;
          expect(memory.owns(work)).toBe(true);
          expect(memory.statistics.current.metadata).toBe(16384);
        }
        return floor(value);
      });
      plugin.renderGpu(h.context as never, h.input as never, params as never);
      empty(memory);
    });
    if (id === "distort.transform") expect(splits).toBe(12);
    else {
      expect(points).toBe(1);
      expect(inverses).toBe(1);
    }
    vi.restoreAllMocks();
    memory.dispose();
  }
});
it("clears actual partial mapping containers after cos/round/point-map/inverse-map/later-slice nulls and permits retry", async () => {
  for (const stage of [
    "cos",
    "round",
    "split",
    "point-map",
    "inverse-map",
    "slice",
  ]) {
    const isCorner = stage.includes("map") || stage === "slice",
      params = isCorner ? corner : affine,
      id = isCorner ? "distort.corner-pin" : "distort.transform";
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      plugin = warpEffectKernel(id)!;
    let actual: Work | undefined,
      arrays: number[][] = [],
      uniforms: object | undefined;
    await withManagedMemory(memory, async () => {
      const fail = () => {
        actual = owner(memory)!;
        arrays = actual.arrays.slice();
        uniforms = actual.uniforms;
        throw null;
      };
      if (stage === "cos") vi.spyOn(Math, "cos").mockImplementationOnce(fail);
      if (stage === "round") {
        const round = Math.round;
        let n = 0;
        vi.spyOn(Math, "round").mockImplementation((v) =>
          ++n === 3 ? fail() : round(v),
        );
      }
      if (stage === "split") {
        vi.spyOn(Math, "floor").mockImplementationOnce(fail);
      }
      if (stage.includes("map")) {
        const map = Array.prototype.map;
        vi.spyOn(Array.prototype, "map").mockImplementation(function (
          this: unknown[],
          callback,
          ...args
        ) {
          const work = owner(memory);
          if (
            work &&
            callback ===
              (stage === "point-map"
                ? work.pointProducer
                : work.inverseProducer)
          )
            return fail();
          return map.call(this, callback, ...args);
        });
      }
      if (stage === "slice") {
        const slice = Array.prototype.slice;
        let n = 0;
        vi.spyOn(Array.prototype, "slice").mockImplementation(function (
          this: number[],
          ...args
        ) {
          if (this.length === 9 && ++n === 2) return fail();
          return slice.apply(this, args);
        });
      }
      let failure: unknown = "unset";
      try {
        plugin.renderGpu(h.context as never, h.input as never, params as never);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(actual).toEqual({});
      if (uniforms) expect(uniforms).toEqual({});
      for (const a of arrays) expect(a).toHaveLength(0);
      empty(memory);
      vi.restoreAllMocks();
      plugin.renderGpu(h.context as never, h.input as never, params as never);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual work on native create/pass null while preserving null over secondary metadata retirement and retries", async () => {
  for (const stage of ["create", "pass"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      plugin = warpEffectKernel("distort.corner-pin")!;
    let actual: Work | undefined,
      arrays: number[][] = [];
    await withManagedMemory(memory, async () => {
      const reserve = memory.reserve.bind(memory);
      vi.spyOn(memory, "reserve").mockImplementation((...args) => {
        const lease = reserve(...args),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw Error("secondary retirement");
        });
        return lease;
      });
      const fail = () => {
        actual = owner(memory)!;
        arrays = actual.arrays.slice();
        throw null;
      };
      if (stage === "create")
        vi.spyOn(h.context, "createSurface").mockImplementationOnce(fail);
      else vi.spyOn(h.context, "pass").mockImplementationOnce(fail);
      let failure: unknown = "unset";
      try {
        plugin.renderGpu(h.context as never, h.input as never, corner as never);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(actual).toEqual({});
      for (const a of arrays) expect(a).toHaveLength(0);
      empty(memory);
      vi.restoreAllMocks();
      plugin.renderGpu(h.context as never, h.input as never, corner as never);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual tracking controller on adoption null before mapping/validation/native factories and handles original invalid geometry without native commands", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    plugin = warpEffectKernel("distort.transform")!;
  let actual: object | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((value) => {
      actual = value;
      throw null;
    });
    const cos = vi.spyOn(Math, "cos");
    let failure: unknown = "unset";
    try {
      plugin.renderGpu(h.context as never, h.input as never, affine as never);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(actual).toEqual({});
    expect(cos).not.toHaveBeenCalled();
    expect(h.records).toHaveLength(0);
    empty(memory);
    vi.restoreAllMocks();
    expect(() =>
      plugin.renderGpu(
        h.context as never,
        h.input as never,
        { ...affine, scale: [0, 1] } as never,
      ),
    ).toThrow();
    expect(h.records).toHaveLength(0);
    empty(memory);
    plugin.renderGpu(h.context as never, h.input as never, affine as never);
    empty(memory);
  });
  memory.dispose();
});
it("propagates successful-pass cleanup null after actual mapping arrays/record/closure/native refs retire", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    plugin = warpEffectKernel("distort.corner-pin")!;
  let actual: Work | undefined,
    arrays: number[][] = [];
  await withManagedMemory(memory, async () => {
    const reserve = memory.reserve.bind(memory);
    vi.spyOn(memory, "reserve").mockImplementation((...args) => {
      const lease = reserve(...args),
        release = lease.release.bind(lease);
      vi.spyOn(lease, "release").mockImplementation(() => {
        release();
        throw null;
      });
      return lease;
    });
    const pass = h.context.pass;
    vi.spyOn(h.context, "pass").mockImplementation((...args) => {
      actual = owner(memory)!;
      arrays = actual.arrays.slice();
      return pass(...args);
    });
    let failure: unknown = "unset";
    try {
      plugin.renderGpu(h.context as never, h.input as never, corner as never);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(h.records).toHaveLength(2);
    expect(actual).toEqual({});
    for (const a of arrays) expect(a).toHaveLength(0);
    empty(memory);
  });
  memory.dispose();
});
