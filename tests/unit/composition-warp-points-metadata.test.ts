import { afterEach, expect, it, vi } from "vitest";
import { warpMapping } from "../../packages/renderer-core/src/composition/render/warp-effects.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../packages/renderer-core/src/managed-metadata.ts";
type Original = {
  id: string;
  params: Record<string, number | number[]>;
  dimensions: [number, number];
  uniforms: Record<string, number[]>;
  points: { destination: [number, number]; source: number[] | null }[];
  negativeZeroPaths: string[];
};
type EmptyOriginal = Original & {
  destination: [number, number];
  originalUndefined: true;
};
const originals = JSON.parse(
  '[{"id": "distort.transform", "params": {"anchor": [0.5, 0.5], "offset": [0, 0], "scale": [1, 1], "rotation": 0}, "kind": "mapping", "dimensions": [2, 2], "uniforms": {"rowX": [65536, 0], "rowY": [0, 65536], "translationX": [0, 0, 0, 0], "translationY": [0, 0, 0, 0]}, "shader": "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\\n float low=dot(pointLow,coefficientLow)+translation.x;\\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\\n}\\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}", "points": [{"destination": [-1, -1], "source": [-1, -1]}, {"destination": [0.5, 0.5], "source": [0.5, 0.5]}, {"destination": [1.5, 1.5], "source": [1.5, 1.5]}, {"destination": [1, 1], "source": [1, 1]}, {"destination": [1.5, 1.5], "source": [1.5, 1.5]}], "negativeZeroPaths": [".uniforms.rowY.0"], "getterCount": 19, "getterHash": "ade071425b40cfcac8280ad34dd007840f2f498d1b15617a36819783e8207225"}, {"id": "distort.transform", "params": {"anchor": [0.5, 0.5], "offset": [0, 0], "scale": [1, 1], "rotation": 0}, "kind": "mapping", "dimensions": [64, 48], "uniforms": {"rowX": [65536, 0], "rowY": [0, 65536], "translationX": [0, 0, 0, 0], "translationY": [0, 0, 0, 0]}, "shader": "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\\n float low=dot(pointLow,coefficientLow)+translation.x;\\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\\n}\\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}", "points": [{"destination": [-1, -1], "source": [-1, -1]}, {"destination": [0.5, 0.5], "source": [0.5, 0.5]}, {"destination": [1.5, 1.5], "source": [1.5, 1.5]}, {"destination": [32, 24], "source": [32, 24]}, {"destination": [63.5, 47.5], "source": [63.5, 47.5]}], "negativeZeroPaths": [".uniforms.rowY.0"], "getterCount": 19, "getterHash": "ade071425b40cfcac8280ad34dd007840f2f498d1b15617a36819783e8207225"}, {"id": "distort.transform", "params": {"anchor": [0.5, 0.5], "offset": [0, 0], "scale": [1, 1], "rotation": 0}, "kind": "mapping", "dimensions": [8192, 8192], "uniforms": {"rowX": [65536, 0], "rowY": [0, 65536], "translationX": [0, 0, 0, 0], "translationY": [0, 0, 0, 0]}, "shader": "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\\n float low=dot(pointLow,coefficientLow)+translation.x;\\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\\n}\\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}", "points": [{"destination": [-1, -1], "source": [-1, -1]}, {"destination": [0.5, 0.5], "source": [0.5, 0.5]}, {"destination": [1.5, 1.5], "source": [1.5, 1.5]}, {"destination": [4096, 4096], "source": [4096, 4096]}, {"destination": [8191.5, 8191.5], "source": [8191.5, 8191.5]}], "negativeZeroPaths": [".uniforms.rowY.0"], "getterCount": 19, "getterHash": "ade071425b40cfcac8280ad34dd007840f2f498d1b15617a36819783e8207225"}, {"id": "distort.transform", "params": {"anchor": [0.3, 0.7], "offset": [0.5, -0.25], "scale": [2, 1], "rotation": 37}, "kind": "mapping", "dimensions": [2, 2], "uniforms": {"rowX": [26170, 19720], "rowY": [-39441, 52339], "translationX": [289, 1000, 1023, -1], "translationY": [387, 146, 0, 0]}, "shader": "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\\n float low=dot(pointLow,coefficientLow)+translation.x;\\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\\n}\\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}", "points": [{"destination": [-1, -1], "source": [-0.8855209350585938, 0.9467697143554688]}, {"destination": [0.5, 0.5], "source": [0.16481781005859375, 1.2419815063476562]}, {"destination": [1.5, 1.5], "source": [0.8650436401367188, 1.4387893676757812]}, {"destination": [1, 1], "source": [0.5149307250976562, 1.3403854370117188]}, {"destination": [1.5, 1.5], "source": [0.8650436401367188, 1.4387893676757812]}], "negativeZeroPaths": [], "getterCount": 19, "getterHash": "ade071425b40cfcac8280ad34dd007840f2f498d1b15617a36819783e8207225"}, {"id": "distort.transform", "params": {"anchor": [0.3, 0.7], "offset": [0.5, -0.25], "scale": [2, 1], "rotation": 37}, "kind": "mapping", "dimensions": [64, 48], "uniforms": {"rowX": [26170, 19720], "rowY": [-39441, 52339], "translationX": [176, 166, 0, 0], "translationY": [167, 361, 2, 0]}, "shader": "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\\n float low=dot(pointLow,coefficientLow)+translation.x;\\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\\n}\\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}", "points": [{"destination": [-1, -1], "source": [0.597991943359375, 18.624778747558594]}, {"destination": [0.5, 0.5], "source": [1.6483306884765625, 18.91999053955078]}, {"destination": [1.5, 1.5], "source": [2.3485565185546875, 19.116798400878906]}, {"destination": [32, 24], "source": [21.2982177734375, 18.73040008544922]}, {"destination": [63.5, 47.5], "source": [40.94810485839844, 18.540809631347656]}], "negativeZeroPaths": [], "getterCount": 19, "getterHash": "ade071425b40cfcac8280ad34dd007840f2f498d1b15617a36819783e8207225"}, {"id": "distort.transform", "params": {"anchor": [0.3, 0.7], "offset": [0.5, -0.25], "scale": [2, 1], "rotation": 37}, "kind": "mapping", "dimensions": [8192, 8192], "uniforms": {"rowX": [26170, 19720], "rowY": [-39441, 52339], "translationX": [893, 844, 992, -1], "translationY": [279, 291, 329, 0]}, "shader": "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\\n float low=dot(pointLow,coefficientLow)+translation.x;\\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\\n}\\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}", "points": [{"destination": [-1, -1], "source": [-250.09966278076172, 2634.078758239746]}, {"destination": [0.5, 0.5], "source": [-249.04932403564453, 2634.3739700317383]}, {"destination": [1.5, 1.5], "source": [-248.3490982055664, 2634.5707778930664]}, {"destination": [4096, 4096], "source": [2618.7255630493164, 3440.400566101074]}, {"destination": [8191.5, 8191.5], "source": [5486.500450134277, 4246.42716217041]}], "negativeZeroPaths": [], "getterCount": 19, "getterHash": "ade071425b40cfcac8280ad34dd007840f2f498d1b15617a36819783e8207225"}, {"id": "distort.transform", "params": {"anchor": [0.5, 0.5], "offset": [14.5, -7.5], "scale": [0.00390625, 1], "rotation": 0}, "kind": "mapping", "dimensions": [2, 2], "uniforms": {"rowX": [16777216, 0], "rowY": [0, 65536], "translationX": [0, 128, 528, -1], "translationY": [0, 960, 0, 0]}, "shader": "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\\n float low=dot(pointLow,coefficientLow)+translation.x;\\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\\n}\\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}", "points": [{"destination": [-1, -1], "source": [-4223, 6.5]}, {"destination": [0.5, 0.5], "source": [-3839, 8]}, {"destination": [1.5, 1.5], "source": [-3583, 9]}, {"destination": [1, 1], "source": [-3711, 8.5]}, {"destination": [1.5, 1.5], "source": [-3583, 9]}], "negativeZeroPaths": [".uniforms.rowY.0"], "getterCount": 19, "getterHash": "ade071425b40cfcac8280ad34dd007840f2f498d1b15617a36819783e8207225"}, {"id": "distort.transform", "params": {"anchor": [0.5, 0.5], "offset": [14.5, -7.5], "scale": [0.00390625, 1], "rotation": 0}, "kind": "mapping", "dimensions": [64, 48], "uniforms": {"rowX": [16777216, 0], "rowY": [0, 65536], "translationX": [0, 0, 564, -2], "translationY": [0, 960, 0, 0]}, "shader": "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\\n float low=dot(pointLow,coefficientLow)+translation.x;\\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\\n}\\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}", "points": [{"destination": [-1, -1], "source": [-12128, 6.5]}, {"destination": [0.5, 0.5], "source": [-11744, 8]}, {"destination": [1.5, 1.5], "source": [-11488, 9]}, {"destination": [32, 24], "source": [-3680, 31.5]}, {"destination": [63.5, 47.5], "source": [4384, 55]}], "negativeZeroPaths": [".uniforms.rowY.0"], "getterCount": 19, "getterHash": "ade071425b40cfcac8280ad34dd007840f2f498d1b15617a36819783e8207225"}, {"id": "distort.transform", "params": {"anchor": [0.5, 0.5], "offset": [14.5, -7.5], "scale": [0.00390625, 1], "rotation": 0}, "kind": "mapping", "dimensions": [8192, 8192], "uniforms": {"rowX": [16777216, 0], "rowY": [0, 65536], "translationX": [0, 0, 48, -128], "translationY": [0, 960, 0, 0]}, "shader": "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\\n float low=dot(pointLow,coefficientLow)+translation.x;\\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\\n}\\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}", "points": [{"destination": [-1, -1], "source": [-1048448, 6.5]}, {"destination": [0.5, 0.5], "source": [-1048064, 8]}, {"destination": [1.5, 1.5], "source": [-1047808, 9]}, {"destination": [4096, 4096], "source": [384, 4103.5]}, {"destination": [8191.5, 8191.5], "source": [1048832, 8199]}], "negativeZeroPaths": [".uniforms.rowY.0"], "getterCount": 19, "getterHash": "ade071425b40cfcac8280ad34dd007840f2f498d1b15617a36819783e8207225"}, {"id": "distort.transform", "params": {"anchor": [0, 1], "offset": [-1000, 1000], "scale": [-1, 4], "rotation": -723}, "kind": "mapping", "dimensions": [2, 2], "uniforms": {"rowX": [-65446, 3430], "rowY": [857, 16362], "translationX": [168, 631, 892, -1], "translationY": [904, 628, 994, -1]}, "shader": "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\\n float low=dot(pointLow,coefficientLow)+translation.x;\\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\\n}\\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}", "points": [{"destination": [-1, -1], "source": [-1050.1227416992188, -235.34959411621094]}, {"destination": [0.5, 0.5], "source": [-1051.5421752929688, -234.95548248291016]}, {"destination": [1.5, 1.5], "source": [-1052.4884643554688, -234.69274139404297]}, {"destination": [1, 1], "source": [-1052.0153198242188, -234.82411193847656]}, {"destination": [1.5, 1.5], "source": [-1052.4884643554688, -234.69274139404297]}], "negativeZeroPaths": [], "getterCount": 19, "getterHash": "ade071425b40cfcac8280ad34dd007840f2f498d1b15617a36819783e8207225"}, {"id": "distort.transform", "params": {"anchor": [0, 1], "offset": [-1000, 1000], "scale": [-1, 4], "rotation": -723}, "kind": "mapping", "dimensions": [64, 48], "uniforms": {"rowX": [-65446, 3430], "rowY": [857, 16362], "translationX": [0, 323, 892, -1], "translationY": [880, 950, 998, -1]}, "shader": "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\\n float low=dot(pointLow,coefficientLow)+translation.x;\\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\\n}\\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}", "points": [{"destination": [-1, -1], "source": [-1052.5302734375, -200.8341522216797]}, {"destination": [0.5, 0.5], "source": [-1053.94970703125, -200.4400405883789]}, {"destination": [1.5, 1.5], "source": [-1054.89599609375, -200.17729949951172]}, {"destination": [32, 24], "source": [-1084.176513671875, -194.1610107421875]}, {"destination": [63.5, 47.5], "source": [-1114.4033203125, -187.8819808959961]}], "negativeZeroPaths": [], "getterCount": 19, "getterHash": "ade071425b40cfcac8280ad34dd007840f2f498d1b15617a36819783e8207225"}, {"id": "distort.transform", "params": {"anchor": [0, 1], "offset": [-1000, 1000], "scale": [-1, 4], "rotation": -723}, "kind": "mapping", "dimensions": [8192, 8192], "uniforms": {"rowX": [-65446, 3430], "rowY": [857, 16362], "translationX": [576, 36, 839, -1], "translationY": [816, 788, 738, 0]}, "shader": "uniform vec2 rowX;uniform vec2 rowY;uniform vec4 translationX;uniform vec4 translationY;\\n// Base-1024 digits keep every product/sum exact before quantizing the sampling grid.\\nfloat affineRow(vec2 point,vec2 coefficients,vec4 translation){\\n vec2 pointHigh=floor(point/1024.0),pointLow=point-pointHigh*1024.0;\\n vec2 coefficientHigh=floor(coefficients/1048576.0),coefficientMiddle=floor(coefficients/1024.0)-coefficientHigh*1024.0,coefficientLow=coefficients-floor(coefficients/1024.0)*1024.0;\\n float low=dot(pointLow,coefficientLow)+translation.x;\\n float middle=dot(pointHigh,coefficientLow)+dot(pointLow,coefficientMiddle)+translation.y+floor(low/1024.0);\\n float high=dot(pointHigh,coefficientMiddle)+dot(pointLow,coefficientHigh)+translation.z+floor(middle/1024.0);\\n float highest=dot(pointHigh,coefficientHigh)+translation.w+floor(high/1024.0);\\n // Floor to 1/16 pixel directly, avoiding a large floating numerator.\\n return highest*131072.0+(high-floor(high/1024.0)*1024.0)*128.0+floor((middle-floor(middle/1024.0)*1024.0)/8.0);\\n}\\nvec2 sourcePoint(vec2 point){return vec2(affineRow(point*2.0,rowX,translationX),affineRow(point*2.0,rowY,translationY))/16.0;}", "points": [{"destination": [-1, -1], "source": [-1478.76806640625, 5909.89973449707]}, {"destination": [0.5, 0.5], "source": [-1480.1875, 5910.293846130371]}, {"destination": [1.5, 1.5], "source": [-1481.1337890625, 5910.556587219238]}, {"destination": [4096, 4096], "source": [-5355.71435546875, 6986.3499755859375]}, {"destination": [8191.5, 8191.5], "source": [-9231.2412109375, 8062.406105041504]}], "negativeZeroPaths": [], "getterCount": 19, "getterHash": "ade071425b40cfcac8280ad34dd007840f2f498d1b15617a36819783e8207225"}, {"id": "distort.corner-pin", "params": {"topLeft": [0, 0], "topRight": [1, 0], "bottomRight": [1, 1], "bottomLeft": [0, 1]}, "kind": "mapping", "dimensions": [2, 2], "uniforms": {"rowX": [1, 0, 0], "rowY": [0, 1, 0], "rowW": [0, 0, 1], "dimensions": [2, 2]}, "shader": "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}", "points": [{"destination": [-1, -1], "source": [-1, -1]}, {"destination": [0.5, 0.5], "source": [0.5, 0.5]}, {"destination": [1.5, 1.5], "source": [1.5, 1.5]}, {"destination": [1, 1], "source": [1, 1]}, {"destination": [1.5, 1.5], "source": [1.5, 1.5]}], "negativeZeroPaths": [".uniforms.rowX.1", ".uniforms.rowY.0"], "getterCount": 70, "getterHash": "ca7d446fca48d466b781630c1cdf175a05cf5d5fa87f0474b0fb3d0afe7be046"}, {"id": "distort.corner-pin", "params": {"topLeft": [0, 0], "topRight": [1, 0], "bottomRight": [1, 1], "bottomLeft": [0, 1]}, "kind": "mapping", "dimensions": [64, 48], "uniforms": {"rowX": [1, 0, 0], "rowY": [0, 1, 0], "rowW": [0, 0, 1], "dimensions": [64, 48]}, "shader": "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}", "points": [{"destination": [-1, -1], "source": [-1, -1]}, {"destination": [0.5, 0.5], "source": [0.5, 0.5]}, {"destination": [1.5, 1.5], "source": [1.5, 1.5]}, {"destination": [32, 24], "source": [32, 24]}, {"destination": [63.5, 47.5], "source": [63.5, 47.5]}], "negativeZeroPaths": [".uniforms.rowX.1", ".uniforms.rowY.0"], "getterCount": 70, "getterHash": "ca7d446fca48d466b781630c1cdf175a05cf5d5fa87f0474b0fb3d0afe7be046"}, {"id": "distort.corner-pin", "params": {"topLeft": [0, 0], "topRight": [1, 0], "bottomRight": [1, 1], "bottomLeft": [0, 1]}, "kind": "mapping", "dimensions": [8192, 8192], "uniforms": {"rowX": [1, 0, 0], "rowY": [0, 1, 0], "rowW": [0, 0, 1], "dimensions": [8192, 8192]}, "shader": "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}", "points": [{"destination": [-1, -1], "source": [-1, -1]}, {"destination": [0.5, 0.5], "source": [0.5, 0.5]}, {"destination": [1.5, 1.5], "source": [1.5, 1.5]}, {"destination": [4096, 4096], "source": [4096, 4096]}, {"destination": [8191.5, 8191.5], "source": [8191.5, 8191.5]}], "negativeZeroPaths": [".uniforms.rowX.1", ".uniforms.rowY.0"], "getterCount": 70, "getterHash": "ca7d446fca48d466b781630c1cdf175a05cf5d5fa87f0474b0fb3d0afe7be046"}, {"id": "distort.corner-pin", "params": {"topLeft": [0.25, 0.25], "topRight": [0.75, 0.25], "bottomRight": [0.75, 0.75], "bottomLeft": [0.25, 0.75]}, "kind": "mapping", "dimensions": [2, 2], "uniforms": {"rowX": [2, 0, -0.5], "rowY": [0, 2, -0.5], "rowW": [0, 0, 1], "dimensions": [2, 2]}, "shader": "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}", "points": [{"destination": [-1, -1], "source": [-3, -3]}, {"destination": [0.5, 0.5], "source": [0, 0]}, {"destination": [1.5, 1.5], "source": [2, 2]}, {"destination": [1, 1], "source": [1, 1]}, {"destination": [1.5, 1.5], "source": [2, 2]}], "negativeZeroPaths": [".uniforms.rowX.1", ".uniforms.rowY.0"], "getterCount": 70, "getterHash": "ca7d446fca48d466b781630c1cdf175a05cf5d5fa87f0474b0fb3d0afe7be046"}, {"id": "distort.corner-pin", "params": {"topLeft": [0.25, 0.25], "topRight": [0.75, 0.25], "bottomRight": [0.75, 0.75], "bottomLeft": [0.25, 0.75]}, "kind": "mapping", "dimensions": [64, 48], "uniforms": {"rowX": [2, 0, -0.5], "rowY": [0, 2, -0.5], "rowW": [0, 0, 1], "dimensions": [64, 48]}, "shader": "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}", "points": [{"destination": [-1, -1], "source": [-34, -26]}, {"destination": [0.5, 0.5], "source": [-31, -23]}, {"destination": [1.5, 1.5], "source": [-29, -21]}, {"destination": [32, 24], "source": [32, 24]}, {"destination": [63.5, 47.5], "source": [95, 71]}], "negativeZeroPaths": [".uniforms.rowX.1", ".uniforms.rowY.0"], "getterCount": 70, "getterHash": "ca7d446fca48d466b781630c1cdf175a05cf5d5fa87f0474b0fb3d0afe7be046"}, {"id": "distort.corner-pin", "params": {"topLeft": [0.25, 0.25], "topRight": [0.75, 0.25], "bottomRight": [0.75, 0.75], "bottomLeft": [0.25, 0.75]}, "kind": "mapping", "dimensions": [8192, 8192], "uniforms": {"rowX": [2, 0, -0.5], "rowY": [0, 2, -0.5], "rowW": [0, 0, 1], "dimensions": [8192, 8192]}, "shader": "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}", "points": [{"destination": [-1, -1], "source": [-4098, -4098]}, {"destination": [0.5, 0.5], "source": [-4095, -4095]}, {"destination": [1.5, 1.5], "source": [-4093, -4093]}, {"destination": [4096, 4096], "source": [4096, 4096]}, {"destination": [8191.5, 8191.5], "source": [12287, 12287]}], "negativeZeroPaths": [".uniforms.rowX.1", ".uniforms.rowY.0"], "getterCount": 70, "getterHash": "ca7d446fca48d466b781630c1cdf175a05cf5d5fa87f0474b0fb3d0afe7be046"}, {"id": "distort.corner-pin", "params": {"topLeft": [-0.3, 0.1], "topRight": [1.1, -0.2], "bottomRight": [0.8, 1.3], "bottomLeft": [0.2, 0.9]}, "kind": "mapping", "dimensions": [2, 2], "uniforms": {"rowX": [2.294713258743286, -1.4341957569122314, 0.83183354139328], "rowY": [0.11987307667732239, 0.5594077110290527, -0.019978845492005348], "rowW": [1.5484445095062256, -1.5834494829177856, 1.6228783130645752], "dimensions": [2, 2]}, "shader": "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}", "points": [{"destination": [-1, -1], "source": [0.4896116554737091, -0.4384582042694092]}, {"destination": [0.5, 0.5], "source": [1.2972497940063477, 0.1856623888015747]}, {"destination": [1.5, 1.5], "source": [1.850430965423584, 0.6131457090377808]}, {"destination": [1, 1], "source": [1.5723326206207275, 0.3982388973236084]}, {"destination": [1.5, 1.5], "source": [1.850430965423584, 0.6131457090377808]}], "negativeZeroPaths": [], "getterCount": 70, "getterHash": "ca7d446fca48d466b781630c1cdf175a05cf5d5fa87f0474b0fb3d0afe7be046"}, {"id": "distort.corner-pin", "params": {"topLeft": [-0.3, 0.1], "topRight": [1.1, -0.2], "bottomRight": [0.8, 1.3], "bottomLeft": [0.2, 0.9]}, "kind": "mapping", "dimensions": [64, 48], "uniforms": {"rowX": [2.294713258743286, -1.4341957569122314, 0.83183354139328], "rowY": [0.11987307667732239, 0.5594077110290527, -0.019978845492005348], "rowW": [1.5484445095062256, -1.5834494829177856, 1.6228783130645752], "dimensions": [64, 48]}, "shader": "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}", "points": [{"destination": [-1, -1], "source": [32.3930778503418, -0.9856740832328796]}, {"destination": [0.5, 0.5], "source": [33.01154708862305, -0.3919280767440796]}, {"destination": [1.5, 1.5], "source": [33.42948913574219, 0.009308740496635437]}, {"destination": [32, 24], "source": [50.31464385986328, 9.557733535766602]}, {"destination": [63.5, 47.5], "source": [67.9025650024414, 19.671178817749023]}], "negativeZeroPaths": [], "getterCount": 70, "getterHash": "ca7d446fca48d466b781630c1cdf175a05cf5d5fa87f0474b0fb3d0afe7be046"}, {"id": "distort.corner-pin", "params": {"topLeft": [-0.3, 0.1], "topRight": [1.1, -0.2], "bottomRight": [0.8, 1.3], "bottomLeft": [0.2, 0.9]}, "kind": "mapping", "dimensions": [8192, 8192], "uniforms": {"rowX": [2.294713258743286, -1.4341957569122314, 0.83183354139328], "rowY": [0.11987307667732239, 0.5594077110290527, -0.019978845492005348], "rowW": [1.5484445095062256, -1.5834494829177856, 1.6228783130645752], "dimensions": [8192, 8192]}, "shader": "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}", "points": [{"destination": [-1, -1], "source": [4198.40576171875, -101.26793670654297]}, {"destination": [0.5, 0.5], "source": [4199.2177734375, -100.64049530029297]}, {"destination": [1.5, 1.5], "source": [4199.75927734375, -100.22219848632812]}, {"destination": [4096, 4096], "source": [6440.2744140625, 1631.1865234375]}, {"destination": [8191.5, 8191.5], "source": [8730.728515625, 3401.1875]}], "negativeZeroPaths": [], "getterCount": 70, "getterHash": "ca7d446fca48d466b781630c1cdf175a05cf5d5fa87f0474b0fb3d0afe7be046"}]',
) as Original[];
const emptyOriginals = JSON.parse(
  '[{"id": "distort.corner-pin", "params": {"topLeft": [-0.3, 0.1], "topRight": [1.1, -0.2], "bottomRight": [0.8, 1.3], "bottomLeft": [0.2, 0.9]}, "kind": "mapping", "dimensions": [2, 2], "uniforms": {"rowX": [2.294713258743286, -1.4341957569122314, 0.83183354139328], "rowY": [0.11987307667732239, 0.5594077110290527, -0.019978845492005348], "rowW": [1.5484445095062256, -1.5834494829177856, 1.6228783130645752], "dimensions": [2, 2]}, "shader": "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}", "points": [{"destination": [-1, -1], "source": [0.4896116554737091, -0.4384582042694092]}, {"destination": [0.5, 0.5], "source": [1.2972497940063477, 0.1856623888015747]}, {"destination": [1.5, 1.5], "source": [1.850430965423584, 0.6131457090377808]}, {"destination": [1, 1], "source": [1.5723326206207275, 0.3982388973236084]}, {"destination": [1.5, 1.5], "source": [1.850430965423584, 0.6131457090377808]}], "negativeZeroPaths": [], "getterCount": 70, "getterHash": "ca7d446fca48d466b781630c1cdf175a05cf5d5fa87f0474b0fb3d0afe7be046", "destination": [-2.096140098145442, 0], "originalUndefined": true}, {"id": "distort.corner-pin", "params": {"topLeft": [-0.3, 0.1], "topRight": [1.1, -0.2], "bottomRight": [0.8, 1.3], "bottomLeft": [0.2, 0.9]}, "kind": "mapping", "dimensions": [64, 48], "uniforms": {"rowX": [2.294713258743286, -1.4341957569122314, 0.83183354139328], "rowY": [0.11987307667732239, 0.5594077110290527, -0.019978845492005348], "rowW": [1.5484445095062256, -1.5834494829177856, 1.6228783130645752], "dimensions": [64, 48]}, "shader": "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}", "points": [{"destination": [-1, -1], "source": [32.3930778503418, -0.9856740832328796]}, {"destination": [0.5, 0.5], "source": [33.01154708862305, -0.3919280767440796]}, {"destination": [1.5, 1.5], "source": [33.42948913574219, 0.009308740496635437]}, {"destination": [32, 24], "source": [50.31464385986328, 9.557733535766602]}, {"destination": [63.5, 47.5], "source": [67.9025650024414, 19.671178817749023]}], "negativeZeroPaths": [], "getterCount": 70, "getterHash": "ca7d446fca48d466b781630c1cdf175a05cf5d5fa87f0474b0fb3d0afe7be046", "destination": [-67.07648314065415, 0], "originalUndefined": true}, {"id": "distort.corner-pin", "params": {"topLeft": [-0.3, 0.1], "topRight": [1.1, -0.2], "bottomRight": [0.8, 1.3], "bottomLeft": [0.2, 0.9]}, "kind": "mapping", "dimensions": [8192, 8192], "uniforms": {"rowX": [2.294713258743286, -1.4341957569122314, 0.83183354139328], "rowY": [0.11987307667732239, 0.5594077110290527, -0.019978845492005348], "rowW": [1.5484445095062256, -1.5834494829177856, 1.6228783130645752], "dimensions": [8192, 8192]}, "shader": "uniform vec3 rowX;uniform vec3 rowY;uniform vec3 rowW;uniform vec2 dimensions;float mapRow(vec3 r,vec2 p){float a=p.x*r.x;float b=p.y*r.y;return (a+b)+r.z;}vec2 sourcePoint(vec2 point){vec2 p=point/dimensions;float weight=mapRow(rowW,p);if(abs(weight)<0.000001)return vec2(-1000000.0);return vec2(mapRow(rowX,p),mapRow(rowY,p))/weight*dimensions;}", "points": [{"destination": [-1, -1], "source": [4198.40576171875, -101.26793670654297]}, {"destination": [0.5, 0.5], "source": [4199.2177734375, -100.64049530029297]}, {"destination": [1.5, 1.5], "source": [4199.75927734375, -100.22219848632812]}, {"destination": [4096, 4096], "source": [6440.2744140625, 1631.1865234375]}, {"destination": [8191.5, 8191.5], "source": [8730.728515625, 3401.1875]}], "negativeZeroPaths": [], "getterCount": 70, "getterHash": "ca7d446fca48d466b781630c1cdf175a05cf5d5fa87f0474b0fb3d0afe7be046", "destination": [-8585.78984200373, 0], "originalUndefined": true}]',
) as EmptyOriginal[];
const limits = { pixels: 1024, metadata: 65536 };
const transform = {
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
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
async function mapping(memory: ManagedMemory, id = "distort.corner-pin") {
  let m: ReturnType<typeof warpMapping> | undefined;
  await withManagedMemory(memory, async () => {
    m = warpMapping(
      id,
      id === "distort.transform" ? transform : corner,
      64,
      48,
    );
  });
  return m!;
}
function expected(row: Original) {
  const result = structuredClone({
    uniforms: row.uniforms,
    points: row.points,
  });
  for (const path of row.negativeZeroPaths) {
    const parts = path.split(".").filter(Boolean);
    let cursor = result as unknown as Record<string, unknown>;
    for (const part of parts.slice(0, -1))
      cursor = cursor[part] as Record<string, unknown>;
    cursor[parts.at(-1)!] = -0;
  }
  return result.points;
}
afterEach(() => vi.restoreAllMocks());
it("preserves all 105 original point results and signed zeros with actual captured-allocator output owners outside scope and unchanged inactive results", async () => {
  for (const active of [false, true])
    for (const row of originals) {
      const memory = new ManagedMemory(limits),
        raw = structuredClone(row.params);
      let m: ReturnType<typeof warpMapping> | undefined;
      if (active)
        await withManagedMemory(memory, async () => {
          m = warpMapping(row.id, raw, row.dimensions[0], row.dimensions[1]);
        });
      else m = warpMapping(row.id, raw, row.dimensions[0], row.dimensions[1]);
      const points = expected(row);
      for (const pt of points) {
        const result = m!.sourcePoint(...pt.destination);
        expect(result ?? null).toEqual(pt.source);
        if (result) {
          expect(memory.owns(result)).toBe(active);
          expect(memory.statistics.current.metadata).toBe(
            active ? 16384 + 272 : 0,
          );
          releaseRenderMetadata(result);
          if (active) expect(result).toHaveLength(0);
        }
        expect(memory.statistics.current.metadata).toBe(active ? 16384 : 0);
      }
      releaseRenderMetadata(m!);
      empty(memory);
      expect(raw).toEqual(row.params);
      memory.dispose();
    }
});
it("rejects 271-byte remaining point capacity before original source math while keeping the existing mapping owner intact", async () => {
  const memory = new ManagedMemory({ ...limits, metadata: 16384 + 271 }),
    m = await mapping(memory);
  const abs = vi.spyOn(Math, "abs");
  expect(() => m.sourcePoint(32, 24)).toThrow(/metadata/);
  expect(abs).not.toHaveBeenCalled();
  expect(memory.owns(m)).toBe(true);
  expect(memory.statistics.current.metadata).toBe(16384);
  releaseRenderMetadata(m);
  empty(memory);
  memory.dispose();
});
it("holds actual point capacity through original math outside scope and keeps independently returned points live after mapping cleanup", async () => {
  const memory = new ManagedMemory(limits),
    m = await mapping(memory);
  const abs = Math.abs;
  let observations = 0;
  vi.spyOn(Math, "abs").mockImplementation((v) => {
    observations++;
    expect(memory.statistics.current.metadata).toBe(16384 + 272);
    expect(memory.owns(m)).toBe(true);
    return abs(v);
  });
  const first = m.sourcePoint(32, 24)!;
  vi.restoreAllMocks();
  const second = m.sourcePoint(0.5, 0.5)!;
  expect(observations).toBe(1);
  expect(memory.owns(first)).toBe(true);
  expect(memory.owns(second)).toBe(true);
  const before = [...first],
    secondBefore = [...second];
  releaseRenderMetadata(m);
  expect(m).toEqual({});
  expect(first).toEqual(before);
  expect(second).toEqual(secondBefore);
  expect(memory.statistics.current.metadata).toBe(544);
  releaseRenderMetadata(first);
  releaseRenderMetadata(second);
  expect(first).toHaveLength(0);
  expect(second).toHaveLength(0);
  empty(memory);
  memory.dispose();
});
it("uses the mapping's actual captured allocator even while a separate render scope is active", async () => {
  const owner = new ManagedMemory(limits),
    other = new ManagedMemory(limits),
    m = await mapping(owner);
  let point: number[] | undefined;
  await withManagedMemory(other, async () => {
    const reserve = vi.spyOn(other, "reserve");
    point = m.sourcePoint(32, 24)!;
    expect(owner.owns(point)).toBe(true);
    expect(other.owns(point)).toBe(false);
    expect(owner.statistics.current.metadata).toBe(16384 + 272);
    expect(reserve).not.toHaveBeenCalled();
    empty(other);
  });
  releaseRenderMetadata(m);
  expect(point).toHaveLength(2);
  releaseRenderMetadata(point!);
  empty(owner);
  owner.dispose();
  other.dispose();
});
it("preserves all three original undefined corner-point results and immediately clears their actual temporary owners", async () => {
  for (const row of emptyOriginals) {
    const memory = new ManagedMemory(limits);
    let m: ReturnType<typeof warpMapping> | undefined,
      marker: object | undefined;
    await withManagedMemory(memory, async () => {
      m = warpMapping(row.id, row.params, row.dimensions[0], row.dimensions[1]);
    });
    const adopt = memory.adopt.bind(memory);
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      marker = args[0];
      expect(marker).toEqual({ empty: true });
      expect(memory.statistics.current.metadata).toBe(16384 + 272);
      return adopt(...args);
    });
    expect(m!.sourcePoint(...row.destination)).toBeUndefined();
    expect(marker).toEqual({});
    expect(memory.statistics.current.metadata).toBe(16384);
    expect(memory.owns(m!)).toBe(true);
    vi.restoreAllMocks();
    releaseRenderMetadata(m!);
    empty(memory);
    memory.dispose();
  }
});
it("preserves original point math null over secondary captured-allocator lease cleanup and permits exact retry", async () => {
  const memory = new ManagedMemory(limits),
    m = await mapping(memory),
    reserve = memory.reserve.bind(memory);
  vi.spyOn(memory, "reserve").mockImplementation((...args) => {
    const lease = reserve(...args),
      release = lease.release.bind(lease);
    vi.spyOn(lease, "release").mockImplementation(() => {
      release();
      throw Error("secondary point cleanup");
    });
    return lease;
  });
  vi.spyOn(Math, "abs").mockImplementation(() => {
    throw null;
  });
  let failure: unknown = "unset";
  try {
    m.sourcePoint(32, 24);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeNull();
  expect(memory.statistics.current.metadata).toBe(16384);
  expect(memory.owns(m)).toBe(true);
  vi.restoreAllMocks();
  const point = m.sourcePoint(32, 24)!;
  expect(point).toHaveLength(2);
  releaseRenderMetadata(point);
  releaseRenderMetadata(m);
  empty(memory);
  memory.dispose();
});
it("clears the actual completed point after captured-allocator adoption null without retiring mapping data and permits retry", async () => {
  const memory = new ManagedMemory(limits),
    m = await mapping(memory);
  let actual: number[] | undefined;
  vi.spyOn(memory, "adopt").mockImplementation((value) => {
    actual = value as number[];
    throw null;
  });
  let failure: unknown = "unset";
  try {
    m.sourcePoint(32, 24);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeNull();
  expect(actual).toHaveLength(0);
  expect(memory.statistics.current.metadata).toBe(16384);
  expect(memory.owns(m)).toBe(true);
  expect(m.uniforms.rowX).toHaveLength(3);
  vi.restoreAllMocks();
  const point = m.sourcePoint(32, 24)!;
  releaseRenderMetadata(point);
  releaseRenderMetadata(m);
  empty(memory);
  memory.dispose();
});
it("retires independently returned points at scratch or allocator cleanup in either parent/result lifetime order", async () => {
  for (const scratch of [false, true]) {
    const memory = new ManagedMemory(limits),
      m = await mapping(memory);
    if (scratch) memory.beginScratch();
    const first = m.sourcePoint(32, 24)!,
      second = m.sourcePoint(0.5, 0.5)!;
    expect(memory.statistics.current.metadata).toBe(16384 + 544);
    if (scratch) {
      memory.endScratch();
      expect(memory.owns(m)).toBe(true);
      expect(m.uniforms.rowX).toHaveLength(3);
      releaseRenderMetadata(m);
    } else memory.dispose();
    expect(first).toHaveLength(0);
    expect(second).toHaveLength(0);
    empty(memory);
    releaseRenderMetadata(first);
    releaseRenderMetadata(second);
    memory.dispose();
  }
});
it("clears actual empty controls or returned points before propagating first consumer cleanup null", async () => {
  for (const noPoint of [false, true]) {
    const memory = new ManagedMemory(limits),
      m = await mapping(memory),
      reserve = memory.reserve.bind(memory),
      adopt = memory.adopt.bind(memory);
    let actual: object | undefined;
    vi.spyOn(memory, "reserve").mockImplementation((...args) => {
      const lease = reserve(...args),
        release = lease.release.bind(lease);
      vi.spyOn(lease, "release").mockImplementation(() => {
        release();
        throw null;
      });
      return lease;
    });
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      actual = args[0];
      return adopt(...args);
    });
    let failure: unknown = "unset";
    try {
      if (noPoint)
        m.sourcePoint(
          ...emptyOriginals.find((r) => r.dimensions[0] === 64)!.destination,
        );
      else releaseRenderMetadata(m.sourcePoint(32, 24)!);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(actual).toEqual(noPoint ? {} : []);
    expect(memory.statistics.current.metadata).toBe(16384);
    expect(memory.owns(m)).toBe(true);
    vi.restoreAllMocks();
    releaseRenderMetadata(m);
    empty(memory);
    memory.dispose();
  }
});
it("keeps an actual caller-admitted mapping/point route under its original parent without new standalone point reservations", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const work = allocateRenderMetadata<{
      arrays: number[][];
      mapping?: ReturnType<typeof warpMapping>;
      uniforms?: Record<string, readonly number[]>;
      point?: number[];
    }>(
      16384,
      () => ({ arrays: [] }),
      false,
      (v) => {
        for (const a of v.arrays) a.length = 0;
        v.arrays.length = 0;
        if (v.point) v.point.length = 0;
        if (v.uniforms) for (const k in v.uniforms) delete v.uniforms[k];
        if (v.mapping)
          for (const k in v.mapping)
            delete (v.mapping as Partial<ReturnType<typeof warpMapping>>)[
              k as keyof ReturnType<typeof warpMapping>
            ];
        for (const k in v) delete (v as Partial<typeof v>)[k as keyof typeof v];
      },
    );
    const m = warpMapping("distort.transform", transform, 64, 48, work),
      reserve = vi.spyOn(memory, "reserve"),
      point = m.sourcePoint(32, 24)!;
    expect(work.point).toBe(point);
    expect(memory.owns(work)).toBe(true);
    expect(memory.owns(point)).toBe(false);
    expect(reserve).not.toHaveBeenCalled();
    expect(memory.statistics.current.metadata).toBe(16384);
    releaseRenderMetadata(work);
    expect(point).toHaveLength(0);
    expect(m).toEqual({});
    empty(memory);
  });
  memory.dispose();
});
