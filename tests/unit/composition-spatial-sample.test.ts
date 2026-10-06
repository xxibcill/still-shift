import { expect, it } from "vitest";
import { vector, vector3 } from "../../packages/renderer-core/src/composition/evaluate/sample.ts";

it("samples static, defaulted and separated xyz without discarding z", () => {
  expect(vector3([1,2,3],0,24,[0,0,0])).toEqual([1,2,3]);
  expect(vector3([1,2],0,24,[1,1,1])).toEqual([1,2,1]);
  expect(vector3(undefined,0,24,[1,1,1])).toEqual([1,1,1]);
  const value={x:1,y:2,z:{keys:[{frame:0,value:10},{frame:20,value:30,interpolation:"linear"}]}};
  expect(vector3(value,5.5,24,[0,0,0])).toEqual([1,2,15.5]);
});

it("samples grouped xyz clocks and scalar component temporal handles", () => {
  const value={keys:[{frame:0,value:[0,10,20]},{frame:20,value:[20,30,40],interpolation:"linear"}]};
  expect(vector3(value,5.5,24,[0,0,0])).toEqual([5.5,15.5,25.5]);
  const speed={keys:[{frame:0,value:[0,0,0],out:{ease:1/3,speed:[0,0,2]}},{frame:20,value:[20,20,20],in:{ease:1/3,speed:[2,2,0]}}]};
  const sample=vector3(speed,10,24,[0,0,0]);
  expect(sample[0]).toBeCloseTo(sample[1]);
  expect(sample[2]).toBeGreaterThan(sample[0]);
});

it("uses three-dimensional spatial arc length including pure z travel", () => {
  const value={keys:[{frame:0,value:[0,0,0],spatialOut:[0,0,10]},{frame:20,value:[0,0,20],spatialIn:[0,0,-10],interpolation:"linear"}]};
  expect(vector3(value,10,24,[0,0,0])).toEqual([0,0,10]);
  expect(vector3(value,-10,24,[0,0,0])).toEqual([0,0,0]);
  expect(vector3(value,30,24,[0,0,0])).toEqual([0,0,20]);
  const first=vector3(value,5.5,24,[0,0,0]);
  vector3(value,19,24,[0,0,0]);
  expect(vector3(value,5.5,24,[0,0,0])).toEqual(first);
  expect(first[2]).toBeCloseTo(5.5,10);
});

it("keeps implicit scale z defaults independent of shared keyed object cache", () => {
  const value={keys:[{frame:0,value:[1,2]},{frame:20,value:[3,4],interpolation:"linear"}]};
  expect(vector3(value,10,24,[0,0,0])).toEqual([2,3,0]);
  expect(vector3(value,10,24,[1,1,1])).toEqual([2,3,1]);
  expect(vector3(value,10,24,[0,0,0])).toEqual([2,3,0]);
  expect(vector(value,10,24,[0,0])).toEqual([2,3]);
});

it("keeps xy results identical on ordinary keys and independent sampler caches", () => {
  const value={keys:[{frame:0,value:[10,20]},{frame:20,value:[30,40],interpolation:"linear"}]};
  for(const frame of [-2,0,.25,5.5,19,20,40])
    expect(vector3(value,frame,24,[0,0,0]).slice(0,2)).toEqual(vector(value,frame,24,[0,0]));
});
