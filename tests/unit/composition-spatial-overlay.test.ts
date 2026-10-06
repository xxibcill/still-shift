import { expect,it } from "vitest";
import { cameraFrustumOverlay,spatialOverlayPoint } from "../../apps/lab/src/composition-spatial-overlay.ts";
import { evaluateComp } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { cameraGeometry,layerMatrix3d,type SpatialTransform } from "../../packages/renderer-core/src/composition/evaluate/spatial-geometry.ts";
const transform:SpatialTransform={anchor:[0,0,0],position:[50,50,-100],scale:[1,1,1],orientation:[0,0,0],rotation:0,rotationX:0,rotationY:0,skewX:0,skewY:0};
it("builds a camera inset from real clip/focus corners and changes with evaluated position/aim",()=>{
  const camera=cameraGeometry({width:100,height:100,zoom:100,world:layerMatrix3d(transform),nearClip:10,focusDistance:200});
  const overlay=cameraFrustumOverlay(camera,100,100);
  expect(overlay.axes).toBe("X/Z");expect(overlay.near[0]).toEqual([45,45,-90]);
  expect(overlay.focus[0]).toEqual([-50,-50,100]);expect(overlay.focus[2]).toEqual([150,150,100]);
  const aimed=cameraGeometry({width:100,height:100,zoom:100,world:layerMatrix3d({...transform,position:[60,50,-100]}),pointOfInterest:[75,50,0],nearClip:10,focusDistance:200});
  expect(cameraFrustumOverlay(aimed,100,100).focus).not.toEqual(overlay.focus);
});
it("uses an X/Y inset when the camera faces vertically",()=>{
  const camera=cameraGeometry({width:100,height:100,zoom:100,world:layerMatrix3d(transform),pointOfInterest:[50,150,-100]});
  expect(cameraFrustumOverlay(camera,100,100).axes).toBe("X/Y");
});
it("projects real anchors through an outer precomp homography and respects clipping",()=>{
  const tree=evaluateComp({schemaVersion:"composition-1",id:"main",width:100,height:100,fps:24,frameCount:24,assets:[],layers:[{id:"plane",type:"solid",threeD:true,size:[10,10],color:"#ffffff",transform:{position:[75,50,100]}}]},0);
  const state=tree.layers[0]!,identity:[number,number,number,number,number,number]=[1,0,0,1,0,0];
  expect(spatialOverlayPoint(state,identity,identity,undefined,[5,5])).toEqual([62.5,50]);
  expect(spatialOverlayPoint(state,identity,identity,[2,0,3,0,2,7,0,0,1],[5,5])).toEqual([128,107]);
  state.projection!.nearClip=201;
  expect(spatialOverlayPoint(state,identity,identity,undefined,[5,5])).toBeNull();
});
