import { expect, it } from "vitest";
import type { Composition, CompositionLayer, CompositionScope } from "@still-shift/scene-contract";
import { projectSpatialScope } from "../../packages/renderer-core/src/composition/evaluate/spatial-scope.ts";
import { sampleCameraControls, sampleSpatialTransform } from "../../packages/renderer-core/src/composition/evaluate/spatial-state.ts";
import { layerMatrix3d, projectLocalPoint, type Matrix4 } from "../../packages/renderer-core/src/composition/evaluate/spatial-geometry.ts";
import type { EvaluatedLayer, EvaluatedLayerTree } from "../../packages/renderer-core/src/composition/evaluate/types.ts";

const plane=(z=0):CompositionLayer=>({id:"plane",type:"solid",size:[10,10],color:"#ffffff",threeD:true,transform:{position:[75,50,z]}});
const document=(layers:CompositionLayer[]):Composition=>({schemaVersion:"composition-1",id:"main",width:100,height:100,fps:24,frameCount:24,assets:[],layers});
function evaluated(scope:CompositionScope,frame:number):EvaluatedLayerTree {
  const states=scope.layers.map(layer=>{
    const size="size" in layer&&layer.size ? layer.size : [0,0] as [number,number];
    const spatial=sampleSpatialTransform(layer,frame,24,[scope.width,scope.height],size);
    const state:EvaluatedLayer={id:layer.id,layer,time:frame,visible:true,drawable:layer.type==="solid",transform:spatial.transform,constraintReference:spatial.constraintReference,localMatrix:[1,0,0,1,0,0],worldMatrix:[1,0,0,1,0,0],screenMatrix:[1,0,0,1,0,0],opacity:1,bounds:null,masks:[],effects:[],...(layer.type==="camera" ? {camera:sampleCameraControls(layer,frame,24,[scope.width,scope.height])} : {})};
    return state;
  });
  const byId=new Map(states.map(state=>[state.id,state]));
  const world=(state:EvaluatedLayer):Matrix4=>state.worldMatrix3d??(state.worldMatrix3d=layerMatrix3d({...state.transform,anchor:state.transform.anchor as [number,number,number],position:state.transform.position as [number,number,number],scale:state.transform.scale as [number,number,number],orientation:state.transform.orientation!,rotationX:state.transform.rotationX!,rotationY:state.transform.rotationY!},state.layer.parent ? world(byId.get(state.layer.parent)!) : undefined));
  states.forEach(world);
  return {id:scope.id,time:frame,width:scope.width,height:scope.height,fps:24,background:null,layers:states,diagnostics:[]};
}

it("selects the highest active camera in this scope and respects exact switch windows",()=>{
  const doc=document([{id:"first",type:"camera",outPoint:12},{id:"second",type:"camera",inPoint:12,transform:{position:[60,50,-100]}},plane()]);
  const a=evaluated(doc,11.5),b=evaluated(doc,12);
  projectSpatialScope(doc,doc,a,{});projectSpatialScope(doc,doc,b,{});
  expect(a.camera?.id).toBe("first");expect(b.camera?.id).toBe("second");
  expect(projectLocalPoint(a.layers[2]!.projection!,[5,5])).toEqual([75,50]);
  expect(projectLocalPoint(b.layers[2]!.projection!,[5,5])).toEqual([65,50]);
});

it("retains active optics while a drawable layer is soloed",()=>{
  const doc=document([{id:"camera",type:"camera",transform:{position:[60,50,-100]}},{...plane(),solo:true}]);
  const tree=evaluated(doc,0);tree.layers[0]!.visible=false;
  projectSpatialScope(doc,doc,tree,{});
  expect(tree.camera?.id).toBe("camera");
  expect(projectLocalPoint(tree.layers[1]!.projection!,[5,5])).toEqual([65,50]);
});

it("uses one-node orientation without accidentally aiming at the default POI",()=>{
  const doc=document([{id:"camera",type:"camera",transform:{rotationY:45}},{...plane(),transform:{position:[150,50,0]}}]);
  const tree=evaluated(doc,0);projectSpatialScope(doc,doc,tree,{});
  const point=projectLocalPoint(tree.layers[1]!.projection!,[5,5])!;
  expect(point[0]).toBeCloseTo(50,10);expect(point[1]).toBeCloseTo(50,10);
});

it("converts a parent-space POI to world coordinates before aiming",()=>{
  const doc=document([{id:"parent",type:"null",transform:{position:[10,0]}},{id:"camera",type:"camera",parent:"parent",model:"two-node",pointOfInterest:[75,50,0]}, {...plane(),transform:{position:[85,50,0]}}]);
  const tree=evaluated(doc,0);projectSpatialScope(doc,doc,tree,{});
  const point=projectLocalPoint(tree.layers[2]!.projection!,[5,5])!;
  expect(point[0]).toBeCloseTo(50,10);expect(point[1]).toBeCloseTo(50,10);
});

it("uses the nested scope's default camera without borrowing outer optics",()=>{
  const inner:CompositionScope={id:"inner",width:200,height:100,frameCount:24,layers:[{...plane(),transform:{position:[100,50,0]}}]};
  const doc=document([{id:"outer-camera",type:"camera",transform:{position:[0,0,-100]}}]);
  const tree=evaluated(inner,5.5);projectSpatialScope(doc,inner,tree,{});
  expect(tree.camera).toMatchObject({id:null,source:"default",position:[100,50,-200],zoom:200});
  expect(projectLocalPoint(tree.layers[0]!.projection!,[5,5])).toEqual([100,50]);
});

it("maps the existing cubic story jolt into the shared camera geometry",()=>{
  const doc=document([plane()]);
  doc.camera2d={keys:[{frame:0,x:50,y:50,zoom:2},{frame:20,x:50,y:50,zoom:2}],jolts:[{frame:0,dx:10,dy:0,decayFrames:20}]};
  const tree=evaluated(doc,10);projectSpatialScope(doc,doc,tree,{});
  expect(tree.camera?.source).toBe("legacy2d");
  expect(projectLocalPoint(tree.layers[0]!.projection!,[5,5])).toEqual([97.5,50]);
});

it("uses the actual receiver camera depth for bounded focus blur",()=>{
  const doc=document([{id:"camera",type:"camera",filmSize:50,focusDistance:100,aperture:50,depthOfField:true},plane(100)]);
  const tree=evaluated(doc,0);projectSpatialScope(doc,doc,tree,{});
  expect(tree.layers[1]!.cameraDepth).toBe(200);
  expect(tree.layers[1]!.focusBlur).toBe(25);
});
