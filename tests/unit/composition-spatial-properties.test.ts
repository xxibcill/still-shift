import { expect, it } from "vitest";
import type { CompositionLayer } from "@still-shift/scene-contract";
import { readProperty, writeProperty, writeValue } from "../../packages/renderer-core/src/composition/evaluate/properties.ts";
import { sampleCameraControls, sampleSpatialTransform, refreshCameraControls } from "../../packages/renderer-core/src/composition/evaluate/spatial-state.ts";
import type { EvaluatedLayer } from "../../packages/renderer-core/src/composition/evaluate/types.ts";

function state(layer:CompositionLayer):EvaluatedLayer {
  const spatial=sampleSpatialTransform(layer,0,24,[100,100],[20,20]);
  return {id:layer.id,layer,time:0,visible:true,drawable:false,transform:spatial.transform,constraintReference:spatial.constraintReference,localMatrix:[1,0,0,1,0,0],worldMatrix:[1,0,0,1,0,0],screenMatrix:[1,0,0,1,0,0],opacity:1,bounds:null,masks:[],effects:[],...(layer.type==="camera" ? {camera:sampleCameraControls(layer,0,24,[100,100])} : {})};
}

it("writes spatial z and orientation components without corrupting xy",()=>{
  const evaluated=state({id:"plane",type:"solid",size:[20,20],color:"#ffffff",threeD:true,transform:{position:[10,20,30]}});
  writeProperty(evaluated,[{name:"transform"},{name:"position"},{name:"z"}],40);
  expect(readProperty(evaluated,[{name:"transform"},{name:"position"}])).toEqual([10,20,40]);
  writeProperty(evaluated,[{name:"transform"},{name:"orientation"},{name:"y"}],45);
  expect(evaluated.transform.orientation).toEqual([0,45,0]);
  writeProperty(evaluated,[{name:"constraintReference"},{name:"z"}],5);
  expect(evaluated.constraintReference).toEqual([10,10,5]);
});

it("copies grouped xyz expression values rather than retaining mutable results",()=>{
  const evaluated=state({id:"control",type:"null",threeD:true});
  const value=[1,2,3];
  writeValue(evaluated,[{name:"transform"},{name:"position"}],value);
  value[2]=99;
  expect(evaluated.transform.position).toEqual([1,2,3]);
});

it("binds camera POI/optics to their owned state and updates the primary optical mode",()=>{
  const evaluated=state({id:"camera",type:"camera",model:"two-node"});
  writeProperty(evaluated,[{name:"pointOfInterest"},{name:"z"}],20);
  expect(readProperty(evaluated,[{name:"pointOfInterest"}])).toEqual([50,50,20]);
  writeProperty(evaluated,[{name:"focalLength"}],72);
  refreshCameraControls(evaluated.camera!,100);
  expect(evaluated.camera).toMatchObject({opticalMode:"focal-length",zoom:200,focalLength:72});
  writeValue(evaluated,[{name:"zoom"}],100);
  refreshCameraControls(evaluated.camera!,100);
  expect(evaluated.camera).toMatchObject({opticalMode:"zoom",zoom:100,focalLength:36});
});
