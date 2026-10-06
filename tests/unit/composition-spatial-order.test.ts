import { expect, it } from "vitest";
import { spatialStackOrder } from "../../packages/renderer-core/src/composition/render/spatial-order.ts";

const plane=(id:string,depth:number)=>({id,layer:{threeD:true},cameraDepth:depth});
const overlay=(id:string)=>({id,layer:{threeD:false}});
const ids=(layers:ReturnType<typeof spatialStackOrder>)=>layers.map(layer=>layer.id);

it("paints far planes first regardless of their authored 3D stacking order",()=>{
  const authored=[plane("far",300),plane("near",100),plane("middle",200)];
  expect(ids(spatialStackOrder(authored))).toEqual(["near","middle","far"]);
  expect(ids(spatialStackOrder(authored).reverse())).toEqual(["far","middle","near"]);
  expect(ids(authored)).toEqual(["far","near","middle"]);
});

it("retains 2D stack barriers between independently sorted 3D runs",()=>{
  const authored=[plane("far-front-run",300),plane("near-front-run",100),overlay("label"),plane("far-back-run",500),plane("near-back-run",50)];
  expect(ids(spatialStackOrder(authored))).toEqual(["near-front-run","far-front-run","label","near-back-run","far-back-run"]);
});

it("retains authored stacking ties and an ordinary 2D stack",()=>{
  expect(ids(spatialStackOrder([plane("top",100),plane("bottom",100)]))).toEqual(["top","bottom"]);
  expect(ids(spatialStackOrder([overlay("top"),overlay("bottom")]))).toEqual(["top","bottom"]);
});

it("rejects missing/non-finite evaluated depth rather than guessing a 3D order",()=>{
  expect(()=>spatialStackOrder([{id:"missing",layer:{threeD:true}}])).toThrow(/finite camera-space depth/);
  expect(()=>spatialStackOrder([plane("invalid",NaN)])).toThrow(/finite camera-space depth/);
});
