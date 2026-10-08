import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  colorEffectPixel,
  colorEffectKernel,
} from "../../packages/renderer-core/src/composition/render/color-effects.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../packages/renderer-core/src/managed-metadata.ts";
type Params = Parameters<typeof colorEffectPixel>[2];
type Rgba = Parameters<typeof colorEffectPixel>[1];
type Row = {
  id: string;
  params: Params;
  input: Rgba;
  point: [number, number];
  output: Rgba;
  accesses: string[];
};
type NativeRow = {
  id: string;
  gpu: boolean;
  params: Parameters<
    NonNullable<ReturnType<typeof colorEffectKernel>>["renderGpu"]
  >[2];
};
const originals = JSON.parse(
  '[{"id":"color.curves","params":{"curve":[[0,0],[1,1]],"amount":1},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.2,0.4,0.6,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.curve","p.curve.at","p.curve.length","p.curve.1","p.curve.1.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.0.1","p.curve.1.1","p.curve.0.0","p.curve.1.0","p.curve.0.0","p.amount","p.curve.at","p.curve.length","p.curve.1","p.curve.1.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.0.1","p.curve.1.1","p.curve.0.0","p.curve.1.0","p.curve.0.0","p.amount","p.curve.at","p.curve.length","p.curve.1","p.curve.1.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.0.1","p.curve.1.1","p.curve.0.0","p.curve.1.0","p.curve.0.0","p.amount","pixel.3"]},{"id":"color.curves","params":{"curve":[[0,0],[1,1]],"amount":1},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0,0,0,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.curve","p.curve.at","p.curve.length","p.curve.1","p.curve.1.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.0.1","p.curve.1.1","p.curve.0.0","p.curve.1.0","p.curve.0.0","p.amount","p.curve.at","p.curve.length","p.curve.1","p.curve.1.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.0.1","p.curve.1.1","p.curve.0.0","p.curve.1.0","p.curve.0.0","p.amount","p.curve.at","p.curve.length","p.curve.1","p.curve.1.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.0.1","p.curve.1.1","p.curve.0.0","p.curve.1.0","p.curve.0.0","p.amount","pixel.3"]},{"id":"color.curves","params":{"curve":[[0,0],[1,1]],"amount":1},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[1,1,1,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.curve","p.curve.at","p.curve.length","p.curve.1","p.curve.1.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.0.1","p.curve.1.1","p.curve.0.0","p.curve.1.0","p.curve.0.0","p.amount","p.curve.at","p.curve.length","p.curve.1","p.curve.1.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.0.1","p.curve.1.1","p.curve.0.0","p.curve.1.0","p.curve.0.0","p.amount","p.curve.at","p.curve.length","p.curve.1","p.curve.1.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.0.1","p.curve.1.1","p.curve.0.0","p.curve.1.0","p.curve.0.0","p.amount","pixel.3"]},{"id":"color.curves","params":{"curve":[[0,0],[1,1]],"amount":1},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.1,0.75,0.33,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.curve","p.curve.at","p.curve.length","p.curve.1","p.curve.1.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.0.1","p.curve.1.1","p.curve.0.0","p.curve.1.0","p.curve.0.0","p.amount","p.curve.at","p.curve.length","p.curve.1","p.curve.1.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.0.1","p.curve.1.1","p.curve.0.0","p.curve.1.0","p.curve.0.0","p.amount","p.curve.at","p.curve.length","p.curve.1","p.curve.1.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.0.1","p.curve.1.1","p.curve.0.0","p.curve.1.0","p.curve.0.0","p.amount","pixel.3"]},{"id":"color.levels","params":{"inputBlack":0,"inputWhite":1,"gamma":1,"outputBlack":0,"outputWhite":1},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.2,0.4,0.6,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.inputBlack","p.inputWhite","p.outputBlack","p.outputWhite","p.gamma","p.outputBlack","p.outputWhite","p.gamma","p.outputBlack","p.outputWhite","p.gamma","pixel.3"]},{"id":"color.levels","params":{"inputBlack":0,"inputWhite":1,"gamma":1,"outputBlack":0,"outputWhite":1},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0,0,0,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.inputBlack","p.inputWhite","p.outputBlack","p.outputWhite","p.gamma","p.outputBlack","p.outputWhite","p.gamma","p.outputBlack","p.outputWhite","p.gamma","pixel.3"]},{"id":"color.levels","params":{"inputBlack":0,"inputWhite":1,"gamma":1,"outputBlack":0,"outputWhite":1},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[1,1,1,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.inputBlack","p.inputWhite","p.outputBlack","p.outputWhite","p.gamma","p.outputBlack","p.outputWhite","p.gamma","p.outputBlack","p.outputWhite","p.gamma","pixel.3"]},{"id":"color.levels","params":{"inputBlack":0,"inputWhite":1,"gamma":1,"outputBlack":0,"outputWhite":1},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.1,0.75,0.33,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.inputBlack","p.inputWhite","p.outputBlack","p.outputWhite","p.gamma","p.outputBlack","p.outputWhite","p.gamma","p.outputBlack","p.outputWhite","p.gamma","pixel.3"]},{"id":"color.tint","params":{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.37192000000000003,0.37192000000000003,0.37192000000000003,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.black","p.white","p.amount","p.black.3","p.white.3","p.black.0","p.white.0","p.black.1","p.white.1","p.black.2","p.white.2","pixel.3"]},{"id":"color.tint","params":{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0,0,0,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.black","p.white","p.amount","p.black.3","p.white.3","p.black.0","p.white.0","p.black.1","p.white.1","p.black.2","p.white.2","pixel.3"]},{"id":"color.tint","params":{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[1,1,1,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.black","p.white","p.amount","p.black.3","p.white.3","p.black.0","p.white.0","p.black.1","p.white.1","p.black.2","p.white.2","pixel.3"]},{"id":"color.tint","params":{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.5814860000000001,0.5814860000000001,0.5814860000000001,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.black","p.white","p.amount","p.black.3","p.white.3","p.black.0","p.white.0","p.black.1","p.white.1","p.black.2","p.white.2","pixel.3"]},{"id":"color.hue-saturation","params":{"hue":0,"saturation":0,"lightness":0},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.20000000000000004,0.3999999999999997,0.6000000000000001,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.hue","p.saturation","p.lightness","pixel.3"]},{"id":"color.hue-saturation","params":{"hue":0,"saturation":0,"lightness":0},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0,0,0,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.hue","p.saturation","p.lightness","pixel.3"]},{"id":"color.hue-saturation","params":{"hue":0,"saturation":0,"lightness":0},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[1,1,1,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.hue","p.saturation","p.lightness","pixel.3"]},{"id":"color.hue-saturation","params":{"hue":0,"saturation":0,"lightness":0},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.09999999999999998,0.75,0.3299999999999998,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.hue","p.saturation","p.lightness","pixel.3"]},{"id":"color.exposure","params":{"exposure":0,"offset":0,"gamma":1},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.2,0.4,0.6,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.exposure","p.offset","p.gamma","p.exposure","p.offset","p.gamma","p.exposure","p.offset","p.gamma","pixel.3"]},{"id":"color.exposure","params":{"exposure":0,"offset":0,"gamma":1},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0,0,0,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.exposure","p.offset","p.gamma","p.exposure","p.offset","p.gamma","p.exposure","p.offset","p.gamma","pixel.3"]},{"id":"color.exposure","params":{"exposure":0,"offset":0,"gamma":1},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[1,1,1,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.exposure","p.offset","p.gamma","p.exposure","p.offset","p.gamma","p.exposure","p.offset","p.gamma","pixel.3"]},{"id":"color.exposure","params":{"exposure":0,"offset":0,"gamma":1},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.1,0.75,0.33,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.exposure","p.offset","p.gamma","p.exposure","p.offset","p.gamma","p.exposure","p.offset","p.gamma","pixel.3"]},{"id":"color.brightness-contrast","params":{"brightness":0,"contrast":0},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.2,0.4,0.6,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.contrast","p.brightness","p.brightness","p.brightness","pixel.3"]},{"id":"color.brightness-contrast","params":{"brightness":0,"contrast":0},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0,0,0,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.contrast","p.brightness","p.brightness","p.brightness","pixel.3"]},{"id":"color.brightness-contrast","params":{"brightness":0,"contrast":0},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[1,1,1,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.contrast","p.brightness","p.brightness","p.brightness","pixel.3"]},{"id":"color.brightness-contrast","params":{"brightness":0,"contrast":0},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.09999999999999998,0.75,0.33,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.contrast","p.brightness","p.brightness","p.brightness","pixel.3"]},{"id":"color.fill","params":{"color":[1,1,1,1],"amount":1},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[1,1,1,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.color","p.color.0","p.amount","p.color","p.color.3","p.color","p.color.1","p.amount","p.color","p.color.3","p.color","p.color.2","p.amount","p.color","p.color.3","pixel.3"]},{"id":"color.fill","params":{"color":[1,1,1,1],"amount":1},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[1,1,1,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.color","p.color.0","p.amount","p.color","p.color.3","p.color","p.color.1","p.amount","p.color","p.color.3","p.color","p.color.2","p.amount","p.color","p.color.3","pixel.3"]},{"id":"color.fill","params":{"color":[1,1,1,1],"amount":1},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[1,1,1,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.color","p.color.0","p.amount","p.color","p.color.3","p.color","p.color.1","p.amount","p.color","p.color.3","p.color","p.color.2","p.amount","p.color","p.color.3","pixel.3"]},{"id":"color.fill","params":{"color":[1,1,1,1],"amount":1},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[1,1,1,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.color","p.color.0","p.amount","p.color","p.color.3","p.color","p.color.1","p.amount","p.color","p.color.3","p.color","p.color.2","p.amount","p.color","p.color.3","pixel.3"]},{"id":"color.gradient-ramp","params":{"start":[0,0],"end":[100,0],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.05249999999999999,0.05249999999999999,0.05249999999999999,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.start","p.end","p.end.0","p.start.0","p.end.1","p.start.1","p.start.0","p.start.1","p.startColor","p.endColor","p.amount","p.startColor.3","p.endColor.3","p.startColor.0","p.endColor.0","p.startColor.1","p.endColor.1","p.startColor.2","p.endColor.2","pixel.3"]},{"id":"color.gradient-ramp","params":{"start":[0,0],"end":[100,0],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0.0525,0.0525,0.0525,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.start","p.end","p.end.0","p.start.0","p.end.1","p.start.1","p.start.0","p.start.1","p.startColor","p.endColor","p.amount","p.startColor.3","p.endColor.3","p.startColor.0","p.endColor.0","p.startColor.1","p.endColor.1","p.startColor.2","p.endColor.2","pixel.3"]},{"id":"color.gradient-ramp","params":{"start":[0,0],"end":[100,0],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[0.05249999999999999,0.05249999999999999,0.05249999999999999,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.start","p.end","p.end.0","p.start.0","p.end.1","p.start.1","p.start.0","p.start.1","p.startColor","p.endColor","p.amount","p.startColor.3","p.endColor.3","p.startColor.0","p.endColor.0","p.startColor.1","p.endColor.1","p.startColor.2","p.endColor.2","pixel.3"]},{"id":"color.gradient-ramp","params":{"start":[0,0],"end":[100,0],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.0525,0.05249999999999999,0.05249999999999999,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.start","p.end","p.end.0","p.start.0","p.end.1","p.start.1","p.start.0","p.start.1","p.startColor","p.endColor","p.amount","p.startColor.3","p.endColor.3","p.startColor.0","p.endColor.0","p.startColor.1","p.endColor.1","p.startColor.2","p.endColor.2","pixel.3"]},{"id":"color.invert","params":{"amount":1},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.8,0.6,0.4,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.amount","p.amount","p.amount","pixel.3"]},{"id":"color.invert","params":{"amount":1},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[1,1,1,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.amount","p.amount","p.amount","pixel.3"]},{"id":"color.invert","params":{"amount":1},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[0,0,0,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.amount","p.amount","p.amount","pixel.3"]},{"id":"color.invert","params":{"amount":1},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.9,0.25,0.6699999999999999,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.amount","p.amount","p.amount","pixel.3"]},{"id":"color.posterize","params":{"levels":8},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.14285714285714285,0.42857142857142855,0.5714285714285714,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.levels","p.levels","p.levels","p.levels","p.levels","p.levels","pixel.3"]},{"id":"color.posterize","params":{"levels":8},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0,0,0,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.levels","p.levels","p.levels","p.levels","p.levels","p.levels","pixel.3"]},{"id":"color.posterize","params":{"levels":8},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[1,1,1,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.levels","p.levels","p.levels","p.levels","p.levels","p.levels","pixel.3"]},{"id":"color.posterize","params":{"levels":8},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.14285714285714285,0.7142857142857143,0.2857142857142857,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.levels","p.levels","p.levels","p.levels","p.levels","p.levels","pixel.3"]},{"id":"color.curves","params":{"curve":[[0,0.2],[0.37,0.8],[0.5,0.1],[1,0.9]],"amount":1},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.5243243243243244,0.6384615384615384,0.26,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.curve","p.curve.at","p.curve.length","p.curve.3","p.curve.3.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.0.1","p.curve.1.1","p.curve.0.0","p.curve.1.0","p.curve.0.0","p.amount","p.curve.at","p.curve.length","p.curve.3","p.curve.3.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.length","p.curve.1","p.curve.2","p.curve.2.0","p.curve.1.1","p.curve.2.1","p.curve.1.0","p.curve.2.0","p.curve.1.0","p.amount","p.curve.at","p.curve.length","p.curve.3","p.curve.3.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.length","p.curve.1","p.curve.2","p.curve.2.0","p.curve.length","p.curve.2","p.curve.3","p.curve.3.0","p.curve.2.1","p.curve.3.1","p.curve.2.0","p.curve.3.0","p.curve.2.0","p.amount","pixel.3"]},{"id":"color.curves","params":{"curve":[[0,0.2],[0.37,0.8],[0.5,0.1],[1,0.9]],"amount":1},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0.2,0.2,0.2,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.curve","p.curve.at","p.curve.length","p.curve.3","p.curve.3.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.0.1","p.curve.1.1","p.curve.0.0","p.curve.1.0","p.curve.0.0","p.amount","p.curve.at","p.curve.length","p.curve.3","p.curve.3.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.0.1","p.curve.1.1","p.curve.0.0","p.curve.1.0","p.curve.0.0","p.amount","p.curve.at","p.curve.length","p.curve.3","p.curve.3.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.0.1","p.curve.1.1","p.curve.0.0","p.curve.1.0","p.curve.0.0","p.amount","pixel.3"]},{"id":"color.curves","params":{"curve":[[0,0.2],[0.37,0.8],[0.5,0.1],[1,0.9]],"amount":1},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[0.9,0.9,0.9,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.curve","p.curve.at","p.curve.length","p.curve.3","p.curve.3.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.length","p.curve.1","p.curve.2","p.curve.2.0","p.curve.length","p.curve.2","p.curve.3","p.curve.3.0","p.curve.2.1","p.curve.3.1","p.curve.2.0","p.curve.3.0","p.curve.2.0","p.amount","p.curve.at","p.curve.length","p.curve.3","p.curve.3.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.length","p.curve.1","p.curve.2","p.curve.2.0","p.curve.length","p.curve.2","p.curve.3","p.curve.3.0","p.curve.2.1","p.curve.3.1","p.curve.2.0","p.curve.3.0","p.curve.2.0","p.amount","p.curve.at","p.curve.length","p.curve.3","p.curve.3.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.length","p.curve.1","p.curve.2","p.curve.2.0","p.curve.length","p.curve.2","p.curve.3","p.curve.3.0","p.curve.2.1","p.curve.3.1","p.curve.2.0","p.curve.3.0","p.curve.2.0","p.amount","pixel.3"]},{"id":"color.curves","params":{"curve":[[0,0.2],[0.37,0.8],[0.5,0.1],[1,0.9]],"amount":1},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.36216216216216224,0.5,0.7351351351351354,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.curve","p.curve.at","p.curve.length","p.curve.3","p.curve.3.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.0.1","p.curve.1.1","p.curve.0.0","p.curve.1.0","p.curve.0.0","p.amount","p.curve.at","p.curve.length","p.curve.3","p.curve.3.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.length","p.curve.1","p.curve.2","p.curve.2.0","p.curve.length","p.curve.2","p.curve.3","p.curve.3.0","p.curve.2.1","p.curve.3.1","p.curve.2.0","p.curve.3.0","p.curve.2.0","p.amount","p.curve.at","p.curve.length","p.curve.3","p.curve.3.1","p.curve.length","p.curve.0","p.curve.1","p.curve.1.0","p.curve.0.1","p.curve.1.1","p.curve.0.0","p.curve.1.0","p.curve.0.0","p.amount","pixel.3"]},{"id":"color.levels","params":{"inputBlack":0.4,"inputWhite":0.4,"gamma":2.75,"outputBlack":0.15,"outputWhite":0.85},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.15,0.85,0.85,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.inputBlack","p.inputWhite","p.outputBlack","p.outputWhite","p.gamma","p.outputBlack","p.outputWhite","p.gamma","p.outputBlack","p.outputWhite","p.gamma","pixel.3"]},{"id":"color.levels","params":{"inputBlack":0.4,"inputWhite":0.4,"gamma":2.75,"outputBlack":0.15,"outputWhite":0.85},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0.15,0.15,0.15,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.inputBlack","p.inputWhite","p.outputBlack","p.outputWhite","p.gamma","p.outputBlack","p.outputWhite","p.gamma","p.outputBlack","p.outputWhite","p.gamma","pixel.3"]},{"id":"color.levels","params":{"inputBlack":0.4,"inputWhite":0.4,"gamma":2.75,"outputBlack":0.15,"outputWhite":0.85},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[0.85,0.85,0.85,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.inputBlack","p.inputWhite","p.outputBlack","p.outputWhite","p.gamma","p.outputBlack","p.outputWhite","p.gamma","p.outputBlack","p.outputWhite","p.gamma","pixel.3"]},{"id":"color.levels","params":{"inputBlack":0.4,"inputWhite":0.4,"gamma":2.75,"outputBlack":0.15,"outputWhite":0.85},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.15,0.85,0.15,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.inputBlack","p.inputWhite","p.outputBlack","p.outputWhite","p.gamma","p.outputBlack","p.outputWhite","p.gamma","p.outputBlack","p.outputWhite","p.gamma","pixel.3"]},{"id":"color.tint","params":{"black":[0.7,0.2,0.9,0.3],"white":[0.1,0.8,0.2,0.6],"amount":0.7},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.2797607947136,0.40667016528640004,0.6114250204992,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.black","p.white","p.amount","p.black.3","p.white.3","p.black.0","p.white.0","p.black.1","p.white.1","p.black.2","p.white.2","pixel.3"]},{"id":"color.tint","params":{"black":[0.7,0.2,0.9,0.3],"white":[0.1,0.8,0.2,0.6],"amount":0.7},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0.147,0.042,0.189,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.black","p.white","p.amount","p.black.3","p.white.3","p.black.0","p.white.0","p.black.1","p.white.1","p.black.2","p.white.2","pixel.3"]},{"id":"color.tint","params":{"black":[0.7,0.2,0.9,0.3],"white":[0.1,0.8,0.2,0.6],"amount":0.7},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[0.622,0.916,0.664,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.black","p.white","p.amount","p.black.3","p.white.3","p.black.0","p.white.0","p.black.1","p.white.1","p.black.2","p.white.2","pixel.3"]},{"id":"color.tint","params":{"black":[0.7,0.2,0.9,0.3],"white":[0.1,0.8,0.2,0.6],"amount":0.7},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.18339612800730398,0.683209474992696,0.384120914875188,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.black","p.white","p.amount","p.black.3","p.white.3","p.black.0","p.white.0","p.black.1","p.white.1","p.black.2","p.white.2","pixel.3"]},{"id":"color.hue-saturation","params":{"hue":-247.5,"saturation":133.25,"lightness":-42.5},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.45999999999999996,2.7755575615628914e-17,0.2875,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.hue","p.saturation","p.lightness","pixel.3"]},{"id":"color.hue-saturation","params":{"hue":-247.5,"saturation":133.25,"lightness":-42.5},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0,0,0,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.hue","p.saturation","p.lightness","pixel.3"]},{"id":"color.hue-saturation","params":{"hue":-247.5,"saturation":133.25,"lightness":-42.5},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[0.575,0.575,0.575,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.hue","p.saturation","p.lightness","pixel.3"]},{"id":"color.hue-saturation","params":{"hue":-247.5,"saturation":133.25,"lightness":-42.5},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.1118485576923075,0,0.48875,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.hue","p.saturation","p.lightness","pixel.3"]},{"id":"color.exposure","params":{"exposure":-3.5,"offset":0.25,"gamma":2.3},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.5638138163905559,0.5797106854446873,0.5950601158182309,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.exposure","p.offset","p.gamma","p.exposure","p.offset","p.gamma","p.exposure","p.offset","p.gamma","pixel.3"]},{"id":"color.exposure","params":{"exposure":-3.5,"offset":0.25,"gamma":2.3},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0.5473117682173594,0.5473117682173594,0.5473117682173594,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.exposure","p.offset","p.gamma","p.exposure","p.offset","p.gamma","p.exposure","p.offset","p.gamma","pixel.3"]},{"id":"color.exposure","params":{"exposure":-3.5,"offset":0.25,"gamma":2.3},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[0.6243067059400597,0.6243067059400597,0.6243067059400597,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.exposure","p.offset","p.gamma","p.exposure","p.offset","p.gamma","p.exposure","p.offset","p.gamma","pixel.3"]},{"id":"color.exposure","params":{"exposure":-3.5,"offset":0.25,"gamma":2.3},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.555642436433614,0.6062428161805208,0.5742118092604624,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.exposure","p.offset","p.gamma","p.exposure","p.offset","p.gamma","p.exposure","p.offset","p.gamma","pixel.3"]},{"id":"color.brightness-contrast","params":{"brightness":-0.2,"contrast":0.75},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0,0,0.7,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.contrast","p.brightness","p.brightness","p.brightness","pixel.3"]},{"id":"color.brightness-contrast","params":{"brightness":-0.2,"contrast":0.75},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0,0,0,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.contrast","p.brightness","p.brightness","p.brightness","pixel.3"]},{"id":"color.brightness-contrast","params":{"brightness":-0.2,"contrast":0.75},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[1,1,1,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.contrast","p.brightness","p.brightness","p.brightness","pixel.3"]},{"id":"color.brightness-contrast","params":{"brightness":-0.2,"contrast":0.75},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0,1,0,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.contrast","p.brightness","p.brightness","p.brightness","pixel.3"]},{"id":"color.brightness-contrast","params":{"brightness":0.3,"contrast":-0.8},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.74,0.78,0.8200000000000001,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.contrast","p.brightness","p.brightness","p.brightness","pixel.3"]},{"id":"color.brightness-contrast","params":{"brightness":0.3,"contrast":-0.8},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0.7,0.7,0.7,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.contrast","p.brightness","p.brightness","p.brightness","pixel.3"]},{"id":"color.brightness-contrast","params":{"brightness":0.3,"contrast":-0.8},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[0.8999999999999999,0.8999999999999999,0.8999999999999999,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.contrast","p.brightness","p.brightness","p.brightness","pixel.3"]},{"id":"color.brightness-contrast","params":{"brightness":0.3,"contrast":-0.8},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.72,0.8500000000000001,0.766,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.contrast","p.brightness","p.brightness","p.brightness","pixel.3"]},{"id":"color.fill","params":{"color":[0.8,0.2,0.4,0.6],"amount":0.7},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.452,0.316,0.516,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.color","p.color.0","p.amount","p.color","p.color.3","p.color","p.color.1","p.amount","p.color","p.color.3","p.color","p.color.2","p.amount","p.color","p.color.3","pixel.3"]},{"id":"color.fill","params":{"color":[0.8,0.2,0.4,0.6],"amount":0.7},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0.336,0.084,0.168,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.color","p.color.0","p.amount","p.color","p.color.3","p.color","p.color.1","p.amount","p.color","p.color.3","p.color","p.color.2","p.amount","p.color","p.color.3","pixel.3"]},{"id":"color.fill","params":{"color":[0.8,0.2,0.4,0.6],"amount":0.7},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[0.916,0.6639999999999999,0.748,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.color","p.color.0","p.amount","p.color","p.color.3","p.color","p.color.1","p.amount","p.color","p.color.3","p.color","p.color.2","p.amount","p.color","p.color.3","pixel.3"]},{"id":"color.fill","params":{"color":[0.8,0.2,0.4,0.6],"amount":0.7},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.394,0.519,0.3594,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.color","p.color.0","p.amount","p.color","p.color.3","p.color","p.color.1","p.amount","p.color","p.color.3","p.color","p.color.2","p.amount","p.color","p.color.3","pixel.3"]},{"id":"color.gradient-ramp","params":{"start":[10,3],"end":[-7,-2],"startColor":[0.2,0.8,0.1,0.3],"endColor":[0.7,0.1,0.9,0.8],"amount":0.7},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.2606345687198264,0.44960523436549155,0.5288982717351617,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.start","p.end","p.end.0","p.start.0","p.end.1","p.start.1","p.start.0","p.start.1","p.startColor","p.endColor","p.amount","p.startColor.3","p.endColor.3","p.startColor.0","p.endColor.0","p.startColor.1","p.endColor.1","p.startColor.2","p.endColor.2","pixel.3"]},{"id":"color.gradient-ramp","params":{"start":[10,3],"end":[-7,-2],"startColor":[0.2,0.8,0.1,0.3],"endColor":[0.7,0.1,0.9,0.8],"amount":0.7},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0.12788138400645058,0.18409886493873995,0.1306387175950343,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.start","p.end","p.end.0","p.start.0","p.end.1","p.start.1","p.start.0","p.start.1","p.startColor","p.endColor","p.amount","p.startColor.3","p.endColor.3","p.startColor.0","p.endColor.0","p.startColor.1","p.endColor.1","p.startColor.2","p.endColor.2","pixel.3"]},{"id":"color.gradient-ramp","params":{"start":[10,3],"end":[-7,-2],"startColor":[0.2,0.8,0.1,0.3],"endColor":[0.7,0.1,0.9,0.8],"amount":0.7},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[0.7916473075733296,0.847864788505619,0.7944046411619132,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.start","p.end","p.end.0","p.start.0","p.end.1","p.start.1","p.start.0","p.start.1","p.startColor","p.endColor","p.amount","p.startColor.3","p.endColor.3","p.startColor.0","p.endColor.0","p.startColor.1","p.endColor.1","p.startColor.2","p.endColor.2","pixel.3"]},{"id":"color.gradient-ramp","params":{"start":[10,3],"end":[-7,-2],"startColor":[0.2,0.8,0.1,0.3],"endColor":[0.7,0.1,0.9,0.8],"amount":0.7},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.19425797636313846,0.6819233076138992,0.34968147237210434,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.start","p.end","p.end.0","p.start.0","p.end.1","p.start.1","p.start.0","p.start.1","p.startColor","p.endColor","p.amount","p.startColor.3","p.endColor.3","p.startColor.0","p.endColor.0","p.startColor.1","p.endColor.1","p.startColor.2","p.endColor.2","pixel.3"]},{"id":"color.gradient-ramp","params":{"start":[1,2],"end":[1,2],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0,0,0,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.start","p.end","p.end.0","p.start.0","p.end.1","p.start.1","p.startColor","p.endColor","p.amount","p.startColor.3","p.endColor.3","p.startColor.0","p.endColor.0","p.startColor.1","p.endColor.1","p.startColor.2","p.endColor.2","pixel.3"]},{"id":"color.gradient-ramp","params":{"start":[1,2],"end":[1,2],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0,0,0,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.start","p.end","p.end.0","p.start.0","p.end.1","p.start.1","p.startColor","p.endColor","p.amount","p.startColor.3","p.endColor.3","p.startColor.0","p.endColor.0","p.startColor.1","p.endColor.1","p.startColor.2","p.endColor.2","pixel.3"]},{"id":"color.gradient-ramp","params":{"start":[1,2],"end":[1,2],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[0,0,0,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.start","p.end","p.end.0","p.start.0","p.end.1","p.start.1","p.startColor","p.endColor","p.amount","p.startColor.3","p.endColor.3","p.startColor.0","p.endColor.0","p.startColor.1","p.endColor.1","p.startColor.2","p.endColor.2","pixel.3"]},{"id":"color.gradient-ramp","params":{"start":[1,2],"end":[1,2],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0,0,0,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.start","p.end","p.end.0","p.start.0","p.end.1","p.start.1","p.startColor","p.endColor","p.amount","p.startColor.3","p.endColor.3","p.startColor.0","p.endColor.0","p.startColor.1","p.endColor.1","p.startColor.2","p.endColor.2","pixel.3"]},{"id":"color.gradient-ramp","params":{"start":[0,0],"end":[0.001953125,0],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[1,1,1,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.start","p.end","p.end.0","p.start.0","p.end.1","p.start.1","p.start.0","p.start.1","p.startColor","p.endColor","p.amount","p.startColor.3","p.endColor.3","p.startColor.0","p.endColor.0","p.startColor.1","p.endColor.1","p.startColor.2","p.endColor.2","pixel.3"]},{"id":"color.gradient-ramp","params":{"start":[0,0],"end":[0.001953125,0],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[1,1,1,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.start","p.end","p.end.0","p.start.0","p.end.1","p.start.1","p.start.0","p.start.1","p.startColor","p.endColor","p.amount","p.startColor.3","p.endColor.3","p.startColor.0","p.endColor.0","p.startColor.1","p.endColor.1","p.startColor.2","p.endColor.2","pixel.3"]},{"id":"color.gradient-ramp","params":{"start":[0,0],"end":[0.001953125,0],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[1,1,1,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.start","p.end","p.end.0","p.start.0","p.end.1","p.start.1","p.start.0","p.start.1","p.startColor","p.endColor","p.amount","p.startColor.3","p.endColor.3","p.startColor.0","p.endColor.0","p.startColor.1","p.endColor.1","p.startColor.2","p.endColor.2","pixel.3"]},{"id":"color.gradient-ramp","params":{"start":[0,0],"end":[0.001953125,0],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[1,1,1,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.start","p.end","p.end.0","p.start.0","p.end.1","p.start.1","p.start.0","p.start.1","p.startColor","p.endColor","p.amount","p.startColor.3","p.endColor.3","p.startColor.0","p.endColor.0","p.startColor.1","p.endColor.1","p.startColor.2","p.endColor.2","pixel.3"]},{"id":"color.invert","params":{"amount":0.5},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.5,0.5,0.5,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.amount","p.amount","p.amount","pixel.3"]},{"id":"color.invert","params":{"amount":0.5},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0.5,0.5,0.5,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.amount","p.amount","p.amount","pixel.3"]},{"id":"color.invert","params":{"amount":0.5},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[0.5,0.5,0.5,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.amount","p.amount","p.amount","pixel.3"]},{"id":"color.invert","params":{"amount":0.5},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.5,0.5,0.5,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.amount","p.amount","p.amount","pixel.3"]},{"id":"color.posterize","params":{"levels":7.25},"input":[0.2,0.4,0.6,0.5],"point":[5.25,-3.5],"output":[0.16,0.48,0.64,0.5],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.levels","p.levels","p.levels","p.levels","p.levels","p.levels","pixel.3"]},{"id":"color.posterize","params":{"levels":7.25},"input":[0,0,0,0],"point":[5.25,-3.5],"output":[0,0,0,0],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.levels","p.levels","p.levels","p.levels","p.levels","p.levels","pixel.3"]},{"id":"color.posterize","params":{"levels":7.25},"input":[1,1,1,1],"point":[5.25,-3.5],"output":[0.96,0.96,0.96,1],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.levels","p.levels","p.levels","p.levels","p.levels","p.levels","pixel.3"]},{"id":"color.posterize","params":{"levels":7.25},"input":[0.1,0.75,0.33,0.83],"point":[5.25,-3.5],"output":[0.16,0.8,0.32,0.83],"accesses":["pixel.slice","pixel.length","pixel.constructor","pixel.0","pixel.1","pixel.2","p.levels","p.levels","p.levels","p.levels","p.levels","p.levels","pixel.3"]}]',
) as Row[];
const nativeRows = JSON.parse(
  '[{"id":"color.curves","params":{"curve":[[0,0],[1,1]],"amount":1},"gpu":true},{"id":"color.tint","params":{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1},"gpu":false},{"id":"color.curves","params":{"curve":[[0,0.2],[0.37,0.8],[0.5,0.1],[1,0.9]],"amount":1},"gpu":true},{"id":"color.tint","params":{"black":[0.7,0.2,0.9,0.3],"white":[0.1,0.8,0.2,0.6],"amount":0.7},"gpu":false}]',
) as NativeRow[];
const limits = { pixels: 4194304, metadata: 2097152 };
type Phase = {
  managed?: boolean;
  rgb?: number[];
  output?: number[];
  unitOutput?: number[];
  hslKeys?: number[];
  hslOutput?: number[];
  colorOutput?: Rgba;
  sliceMethod?: (start?: number, end?: number) => number[];
  sliceArgs?: number[];
  mapper?: (value: number, index: number) => number;
  points?: readonly (readonly number[])[];
  black?: readonly number[];
  white?: readonly number[];
  start?: readonly number[];
  end?: readonly number[];
  first?: readonly number[];
  last?: readonly number[];
  producer?: () => Rgba;
};
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function observe(memory: ManagedMemory) {
  const adopt = memory.adopt.bind(memory);
  let phase: Phase | undefined;
  vi.spyOn(memory, "adopt").mockImplementation((...v) => {
    if (v[1].bytes === 4096) phase = v[0] as Phase;
    return adopt(...v);
  });
  return () => phase;
}
function traced(row: Row, before?: (key: string, index: number) => void) {
  const accesses: string[] = [],
    raw = structuredClone(row.params),
    input = structuredClone(row.input),
    refs = new Map<string, unknown>();
  const record = (key: string) => {
    const index = accesses.length;
    accesses.push(key);
    before?.(key, index);
  };
  const wrap = (value: unknown, path: string): unknown => {
    if (!Array.isArray(value)) return value;
    const result = new Proxy(value, {
      get(t, k, r) {
        const key = path + "." + String(k);
        record(key);
        return wrap(Reflect.get(t, k, r), key);
      },
    });
    refs.set(path, result);
    return result;
  };
  const params = new Proxy(raw, {
      get(t, k, r) {
        const key = "p." + String(k);
        record(key);
        return wrap(Reflect.get(t, k, r), key);
      },
    }),
    pixel = wrap(input, "pixel") as Rgba;
  return { params, pixel, raw, input, refs, accesses };
}
function run(row: Row, params: Params, pixel: Rgba, work?: Phase) {
  return colorEffectPixel(
    row.id,
    pixel,
    params,
    row.point[0],
    row.point[1],
    work,
  );
}
function ownedArrays(phase: Phase | undefined) {
  return phase
    ? [
        phase.rgb,
        phase.output,
        phase.unitOutput,
        phase.hslKeys,
        phase.hslOutput,
        phase.colorOutput,
        phase.sliceArgs,
      ].filter((x): x is number[] => !!x)
    : [];
}
function clearWork(work: Phase) {
  for (const value of ownedArrays(work)) value.length = 0;
  for (const key in work) delete work[key as keyof Phase];
}
afterEach(() => vi.restoreAllMocks());
it("preserves all 92 independently frozen original pixel results and complete input/root/nested getter sequences active and inactive without mutating borrowed values", async () => {
  for (const active of [false, true])
    for (const row of originals) {
      const memory = new ManagedMemory(limits),
        getPhase = observe(memory),
        t = traced(row);
      let result: Rgba | undefined;
      const produce = async () => {
        result = run(row, t.params, t.pixel);
      };
      if (active) await withManagedMemory(memory, produce);
      else await produce();
      expect(result).toEqual(row.output);
      expect(t.accesses).toEqual(row.accesses);
      expect(t.raw).toEqual(row.params);
      expect(t.input).toEqual(row.input);
      expect(memory.owns(result!)).toBe(active);
      if (active) {
        expect(getPhase()).toEqual({});
        expect(memory.statistics.current.metadata).toBe(512);
        releaseRenderMetadata(result!);
        expect(result).toEqual([]);
      }
      empty(memory);
      memory.dispose();
      vi.restoreAllMocks();
    }
});
it("rejects exact working and independent RGBA capacity cuts before slice/input/params getters, mapper math or result factories", async () => {
  for (const quota of [4095, 4607]) {
    const memory = new ManagedMemory({ ...limits, metadata: quota }),
      getPhase = observe(memory),
      t = traced(originals[0]!);
    await withManagedMemory(memory, async () => {
      const reserve = vi.spyOn(memory, "reserve"),
        min = vi.spyOn(Math, "min"),
        floor = vi.spyOn(Math, "floor");
      expect(() => run(originals[0]!, t.params, t.pixel)).toThrow(/metadata/);
      expect(t.accesses).toEqual([]);
      expect(min).not.toHaveBeenCalled();
      expect(floor).not.toHaveBeenCalled();
      expect(reserve.mock.calls.map((v) => [v[0], v[1]])).toEqual(
        quota === 4095
          ? [["metadata", 4096]]
          : [
              ["metadata", 4096],
              ["metadata", 512],
            ],
      );
      if (getPhase()) expect(getPhase()).toEqual({});
      empty(memory);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("captures actual slice/mappers/intermediate arrays/borrowed curve-tint-gradient refs and partial three-channel result before alpha getter then transfers independent RGBA outside scope with another allocator active", async () => {
  for (const id of [
    "color.curves",
    "color.tint",
    "color.hue-saturation",
    "color.gradient-ramp",
  ]) {
    const row = originals.find((r) => r.id === id)!,
      memory = new ManagedMemory(limits),
      second = new ManagedMemory(limits),
      getPhase = observe(memory);
    let actual: Rgba | undefined,
      arrays: number[][] = [];
    const t = traced(row, (key) => {
      const phase = getPhase()!;
      expect(memory.owns(phase)).toBe(true);
      expect(memory.statistics.current.metadata).toBe(4608);
      expect(typeof phase.producer).toBe("function");
      if (key === "p.curve.at") {
        expect(phase.points === t.refs.get("p.curve")).toBe(true);
        expect(typeof phase.mapper).toBe("function");
        expect(phase.rgb).toEqual(row.input.slice(0, 3));
      }
      if (key === "p.white")
        expect(phase.black === t.refs.get("p.black")).toBe(true);
      if (key === "p.end")
        expect(phase.start === t.refs.get("p.start")).toBe(true);
      if (key === "p.endColor")
        expect(phase.first === t.refs.get("p.startColor")).toBe(true);
      if (key === "pixel.3") {
        actual = phase.colorOutput;
        expect(actual).toEqual(row.output.slice(0, 3));
        expect(phase.unitOutput).toEqual(row.output.slice(0, 3));
        expect(typeof phase.sliceMethod).toBe("function");
        expect(phase.sliceArgs).toEqual([0, 3]);
        arrays = ownedArrays(phase).filter((v) => v !== actual);
      }
    });
    let result: Rgba | undefined;
    await withManagedMemory(memory, async () => {
      result = run(row, t.params, t.pixel);
      expect(result).toBe(actual);
      expect(result).toEqual(row.output);
      expect(getPhase()).toEqual({});
      for (const value of arrays) expect(value).toEqual([]);
      expect(memory.statistics.current.metadata).toBe(512);
    });
    expect(t.accesses).toEqual(row.accesses);
    await withManagedMemory(second, async () => {
      expect(memory.owns(result!)).toBe(true);
      expect(second.owns(result!)).toBe(false);
      releaseRenderMetadata(result!);
      expect(result).toEqual([]);
      empty(memory);
      empty(second);
    });
    expect(t.raw).toEqual(row.params);
    expect(t.input).toEqual(row.input);
    memory.dispose();
    second.dispose();
    vi.restoreAllMocks();
  }
});
it("clears actual partial arrays and result after all 462 getters across 15 distinct original complete paths plus max/min/abs/pow/floor null, preserving null over secondary cleanup and exact retry", async () => {
  const paths = [
    ...new Map(
      originals.map((row) => [JSON.stringify([row.id, row.accesses]), row]),
    ).values(),
  ];
  expect(paths).toHaveLength(15);
  expect(paths.reduce((sum, row) => sum + row.accesses.length, 0)).toBe(462);
  const cases = paths.flatMap((row) =>
    row.accesses.map((_, cut) => ({
      row,
      cut,
      math: undefined as string | undefined,
    })),
  );
  for (const [id, math] of [
    ["color.hue-saturation", "max"],
    ["color.hue-saturation", "min"],
    ["color.hue-saturation", "abs"],
    ["color.exposure", "pow"],
    ["color.posterize", "floor"],
  ])
    cases.push({ row: originals.find((r) => r.id === id)!, cut: -1, math });
  for (const { row, cut, math } of cases) {
    const memory = new ManagedMemory(limits),
      getPhase = observe(memory),
      reserve = memory.reserve.bind(memory);
    let arrays: number[][] = [];
    const capture = () => {
        arrays = ownedArrays(getPhase());
        throw null;
      },
      t = traced(row, (_key, index) => {
        if (index === cut) capture();
      });
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "reserve").mockImplementation((...v) => {
        const lease = reserve(...v),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw Error("secondary cleanup");
        });
        return lease;
      });
      if (math === "max") {
        const max = Math.max;
        vi.spyOn(Math, "max").mockImplementation((...v) =>
          getPhase()?.rgb ? capture() : max(...v),
        );
      }
      if (math === "min") vi.spyOn(Math, "min").mockImplementation(capture);
      if (math === "abs") vi.spyOn(Math, "abs").mockImplementation(capture);
      if (math === "pow") vi.spyOn(Math, "pow").mockImplementation(capture);
      if (math === "floor") vi.spyOn(Math, "floor").mockImplementation(capture);
      let failure: unknown = "unset";
      try {
        run(row, t.params, t.pixel);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      for (const value of arrays) expect(value).toEqual([]);
      expect(getPhase()).toEqual({});
      expect(t.raw).toEqual(row.params);
      expect(t.input).toEqual(row.input);
      empty(memory);
      vi.restoreAllMocks();
      const retry = run(row, row.params, row.input);
      expect(retry).toEqual(row.output);
      releaseRenderMetadata(retry);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual header or completed RGBA and every intermediate array after adoption null preserving first null and exact retry", async () => {
  for (const cut of [4096, 512]) {
    const row = originals.find((r) => r.id === "color.hue-saturation")!,
      memory = new ManagedMemory(limits),
      adopt = memory.adopt.bind(memory),
      reserve = memory.reserve.bind(memory);
    let phase: Phase | undefined,
      actual: object | undefined,
      arrays: number[][] = [];
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "reserve").mockImplementation((...v) => {
        const lease = reserve(...v),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw Error("secondary cleanup");
        });
        return lease;
      });
      vi.spyOn(memory, "adopt").mockImplementation((...v) => {
        if (v[1].bytes === 4096) phase = v[0] as Phase;
        if (v[1].bytes === cut) {
          actual = v[0];
          if (cut === 512) {
            expect(actual).toBe(phase!.colorOutput);
            expect(actual).toEqual(row.output);
            arrays = ownedArrays(phase);
          }
          throw null;
        }
        return adopt(...v);
      });
      let failure: unknown = "unset";
      try {
        run(row, row.params, row.input);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(actual).toEqual(cut === 4096 ? {} : []);
      for (const value of arrays) expect(value).toEqual([]);
      expect(phase).toEqual({});
      empty(memory);
      vi.restoreAllMocks();
      const retry = run(row, row.params, row.input);
      expect(retry).toEqual(row.output);
      releaseRenderMetadata(retry);
      empty(memory);
    });
    memory.dispose();
  }
});
it("retires independently adopted completed RGBA after successful temporary cleanup null and clears all intermediate refs before exact retry", async () => {
  const row = originals.find((r) => r.id === "color.hue-saturation")!,
    memory = new ManagedMemory(limits),
    adopt = memory.adopt.bind(memory),
    reserve = memory.reserve.bind(memory);
  let phase: Phase | undefined,
    result: Rgba | undefined,
    arrays: number[][] = [];
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((...v) => {
      if (v[1].bytes === 4096) phase = v[0] as Phase;
      else {
        result = v[0] as Rgba;
        arrays = ownedArrays(phase).filter((v) => v !== result);
      }
      return adopt(...v);
    });
    vi.spyOn(memory, "reserve").mockImplementation((...v) => {
      const lease = reserve(...v);
      if (v[1] === 4096) {
        const release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          expect(phase!.colorOutput).toBeUndefined();
          expect(memory.owns(result!)).toBe(true);
          release();
          throw null;
        });
      }
      return lease;
    });
    let failure: unknown = "unset";
    try {
      run(row, row.params, row.input);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(result).toEqual([]);
    expect(phase).toEqual({});
    for (const value of arrays) expect(value).toEqual([]);
    empty(memory);
    vi.restoreAllMocks();
    const retry = run(row, row.params, row.input);
    expect(retry).toEqual(row.output);
    releaseRenderMetadata(retry);
    empty(memory);
  });
  memory.dispose();
});
it("clears independent RGBA at consumer/scratch/allocator cleanup outside scope before propagating first result cleanup null", async () => {
  for (const route of ["consumer", "scratch", "allocator"]) {
    const row = originals[0]!,
      memory = new ManagedMemory(limits),
      adopt = memory.adopt.bind(memory);
    let result: Rgba | undefined;
    await withManagedMemory(memory, async () => {
      if (route === "scratch") memory.beginScratch();
      vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) =>
        adopt(
          value,
          lease,
          lease.bytes === 512
            ? (v) => {
                destroy?.(v);
                throw null;
              }
            : destroy,
        ),
      );
      result = run(row, row.params, row.input);
      expect(result).toEqual(row.output);
      expect(memory.owns(result)).toBe(true);
    });
    let failure: unknown = "unset";
    try {
      if (route === "consumer") releaseRenderMetadata(result!);
      else if (route === "scratch") memory.endScratch();
      else memory.dispose();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(result).toEqual([]);
    empty(memory);
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("reuses an actual admitted caller through original factories and RGBA consumer without extra helper leases and keeps borrowed input/curve arrays intact", async () => {
  const row = originals[0]!,
    memory = new ManagedMemory(limits),
    t = traced(row);
  await withManagedMemory(memory, async () => {
    const reserve = vi.spyOn(memory, "reserve"),
      work = allocateRenderMetadata<Phase>(4096, () => ({}), false, clearWork),
      result = run(row, t.params, t.pixel, work),
      arrays = ownedArrays(work);
    expect(work.colorOutput).toBe(result);
    expect(result).toEqual(row.output);
    expect(t.accesses).toEqual(row.accesses);
    expect(memory.owns(result)).toBe(false);
    expect(reserve.mock.calls.map((v) => [v[0], v[1]])).toEqual([
      ["metadata", 4096],
    ]);
    releaseRenderMetadata(work);
    expect(work).toEqual({});
    for (const value of arrays) expect(value).toEqual([]);
    expect(t.raw).toEqual(row.params);
    expect(t.input).toEqual(row.input);
    empty(memory);
  });
  memory.dispose();
});
it("retires actual RGBA at GPU curve-byte and Canvas pixel consumers and preserves original consumer round null over secondary result cleanup", async () => {
  for (const gpu of [true, false]) {
    const memory = new ManagedMemory(limits),
      adopt = memory.adopt.bind(memory),
      row = nativeRows.find(
        (r) => r.gpu === gpu && r.id === (gpu ? "color.curves" : "color.tint"),
      )!,
      h = shadowHarness(),
      round = Math.round;
    let result: Rgba | undefined,
      callbackWork: { pixel: { colorOutput?: Rgba } } | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) => {
        if (lease.bytes === 512 && Array.isArray(value)) result = value as Rgba;
        if (lease.bytes === 16384) callbackWork = value as typeof callbackWork;
        return adopt(
          value,
          lease,
          (lease.bytes === 512 && Array.isArray(value)) || lease.bytes === 16384
            ? (v) => {
                destroy?.(v);
                throw Error("secondary RGBA cleanup");
              }
            : destroy,
        );
      });
      vi.spyOn(Math, "round").mockImplementation((v) => {
        if (callbackWork?.pixel.colorOutput) {
          result = callbackWork.pixel.colorOutput;
          expect(memory.owns(callbackWork)).toBe(true);
          expect(result).toHaveLength(4);
          throw null;
        }
        if (result && memory.owns(result)) {
          expect(result).toHaveLength(4);
          throw null;
        }
        return round(v);
      });
      let failure: unknown = "unset";
      try {
        const plugin = colorEffectKernel(row.id)!;
        if (gpu)
          plugin.renderGpu(h.context as never, h.input as never, row.params);
        else
          plugin.renderCanvas!(
            h.context as never,
            h.input as never,
            row.params,
          );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(result).toEqual([]);
      expect(memory.statistics.current.metadata).toBe(0);
    });
    memory.dispose();
    empty(memory);
    vi.restoreAllMocks();
  }
});

const sha = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
function shadowHarness() {
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
