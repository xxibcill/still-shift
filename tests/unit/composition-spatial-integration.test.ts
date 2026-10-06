import { expect,it } from "vitest";
import { CompositionSchema,type Composition,type CompositionLayer } from "@still-shift/scene-contract";
import { evaluateComp,evaluateProperty } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
import { projectLocalPoint,worldPoint } from "../../packages/renderer-core/src/composition/evaluate/spatial-geometry.ts";
import { buildRenderGraph,type ProjectOp } from "../../packages/renderer-core/src/composition/render/graph.ts";
const document=(layers:CompositionLayer[]):Composition=>({schemaVersion:"composition-1",id:"main",width:100,height:100,fps:24,frameCount:24,assets:[],layers});
const plane=(id:string,z=0):CompositionLayer=>({id,type:"solid",size:[10,10],color:"#ffffff",threeD:true,transform:{position:[75,50,z]}});
it("evaluates native xyz, one-node optics and stable depth-sorted projection without mutating input",()=>{
  const doc=CompositionSchema.parse(document([plane("far",100),plane("near"),{id:"camera",type:"camera"}])),before=JSON.stringify(doc);
  const tree=evaluateComp(doc,5.5),graph=buildRenderGraph(doc,tree);
  expect(tree.camera).toMatchObject({id:"camera",source:"native",position:[50,50,-100],zoom:100});
  expect(tree.layers[0]!.transform.position).toEqual([75,50,100]);
  expect(projectLocalPoint(tree.layers[0]!.projection!,[5,5])).toEqual([62.5,50]);
  expect(graph.root.ops.map(op=>op.layer)).toEqual(["far","near"]);
  expect(graph.root.ops.every(op=>op.kind==="project")).toBe(true);
  expect(JSON.stringify(doc)).toBe(before);
  expect(evaluateComp(doc,5.5)).toEqual(tree);
});
it("keeps local effects/masks before perspective and focus/matte after it",()=>{
  const doc=CompositionSchema.parse(document([{id:"camera",type:"camera",depthOfField:true,aperture:36,focusDistance:100}, {...plane("art",100),transform:{position:[75,50,100],rotationY:20},effects:[{id:"blur",effect:"blur.gaussian",params:{radius:2}}]}]));
  const op=buildRenderGraph(doc,evaluateComp(doc,0)).root.ops[0] as ProjectOp;
  expect(op.kind).toBe("project");expect(op.placement.affineMatrix).toBeNull();
  expect(op.effects[0]).toMatchObject({effect:"blur.lens",params:{radius:25,samples:32}});
  expect(op.surface.ops[0]).toMatchObject({kind:"isolate",effects:[{effect:"blur.gaussian"}]});
});
it("uses parented full xyz and interpolated expression values at fractional layer clocks",()=>{
  const doc=CompositionSchema.parse({...document([{id:"parent",type:"null",threeD:true,transform:{position:[10,0,20]}}, {...plane("art"),parent:"parent",transform:{position:{keys:[{frame:0,value:[65,50,0]},{frame:20,value:[65,50,40],interpolation:"linear"}]}}}]),expressions:{"art.transform.position.z":{source:"value + 2"}}});
  const tree=evaluateComp(doc,5.5),state=tree.layers[1]!;
  expect(evaluateProperty(doc,"art.transform.position.z",5.5)).toBe(13);
  expect(worldPoint(state.worldMatrix3d!,state.transform.anchor as [number,number,number])).toEqual([75,50,33]);
});
it("auto-orients a 3D path toward z motion rather than discarding its third component",()=>{
  const doc=CompositionSchema.parse(document([{...plane("art"),transform:{autoOrient:"path",position:{keys:[{frame:0,value:[50,50,0]},{frame:20,value:[50,50,100],interpolation:"linear"}]}}}]));
  const state=evaluateComp(doc,5.5).layers[0]!;
  expect(state.transform.rotationY).toBe(-90);
  expect(state.worldMatrix3d![2]).toBeCloseTo(1,12);
});
it("camera shake is seeded, seek-stable and reaches genuine camera geometry",()=>{
  const doc=CompositionSchema.parse({...document([{id:"camera",type:"camera"},plane("art")]),behaviours:[{type:"camera-shake",target:"camera.transform.position",amplitude:3,startFrame:0,seed:19}]});
  const first=evaluateComp(doc,7.5);
  evaluateComp(doc,2);evaluateComp(doc,19);
  expect(evaluateComp(doc,7.5)).toEqual(first);
  expect(first.camera!.position).not.toEqual([50,50,-100]);
});
it("a camera-facing parent updates descendant geometry before projection",()=>{
  const doc=CompositionSchema.parse(document([{id:"parent",type:"null",threeD:true,transform:{position:[75,50,0],autoOrient:"camera"}},{...plane("child"),parent:"parent",transform:{position:[0,0,0]}}]));
  const tree=evaluateComp(doc,0),parent=tree.layers[0]!,child=tree.layers[1]!;
  expect(child.worldMatrix3d!.slice(0,12)).toEqual(parent.worldMatrix3d!.slice(0,12));
  expect(projectLocalPoint(child.projection!,[5,5])).toEqual([75,50]);
});

it("projects parent group masks using bounded local coverage instead of an XY approximation",()=>{
  const doc=CompositionSchema.parse(document([{id:"group",type:"group",threeD:true,size:[30,30],transform:{position:[50,50,0],rotationY:25},masks:[{id:"cut",mode:"subtract",inverted:true,feather:2,path:{closed:true,vertices:[[0,0],[20,0],[20,20],[0,20]]}}]},{...plane("art"),parent:"group",transform:{position:[15,15,0]}}]));
  const op=buildRenderGraph(doc,evaluateComp(doc,0)).root.ops[0]!;
  expect(op.kind).toBe("isolate");
  if(op.kind!=="isolate") throw Error("Expected parent isolation");
  expect(op.masks[0]!.projected!.placement!.affineMatrix).toBeNull();
  expect(op.masks[0]!.matrix).toEqual([1,0,0,1,5,5]);
  expect(op.ops[0]!.kind).toBe("project");
});
