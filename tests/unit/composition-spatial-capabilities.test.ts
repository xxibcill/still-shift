import { expect,it,vi } from "vitest";
import { requireSpatialCapabilities } from "../../packages/renderer-core/src/composition/render/spatial-capabilities.ts";
import { executeGraph,type RenderBackend } from "../../packages/renderer-core/src/composition/render/backend.ts";
import type { ProjectOp,SurfaceNode } from "../../packages/renderer-core/src/composition/render/graph.ts";
const local:SurfaceNode={id:"local",width:10,height:10,background:null,ops:[]};
const project:ProjectOp={kind:"project",layer:"plane",surface:local,placement:{homography:[1,0,0,0,1,0,.01,0,1],inverse:[1,0,0,0,1,0,-.01,0,1],affineMatrix:null,bounds:null},effects:[],matte:null,clips:[],opacity:1,blend:"normal"};
const root:SurfaceNode={id:"root",width:100,height:100,background:null,ops:[project]};
it("rejects perspective before lifecycle hooks or retained-target mutation",()=>{
  const clear=vi.fn(),beginFrame=vi.fn(),createSurface=vi.fn(),endFrame=vi.fn();
  const backend={clear,beginFrame,createSurface,endFrame} as unknown as RenderBackend;
  expect(()=>executeGraph(backend,{root,culled:[],spatial:true},{width:100,height:100})).toThrow("True perspective");
  expect(clear).not.toHaveBeenCalled();expect(beginFrame).not.toHaveBeenCalled();expect(createSurface).not.toHaveBeenCalled();expect(endFrame).not.toHaveBeenCalled();
});
it("traverses nested local artwork, named inputs and mattes before publishing a frame",()=>{
  const affine={...project,placement:{...project.placement,affineMatrix:[1,0,0,1,0,0] as [number,number,number,number,number,number]}};
  const captures=[{...affine,surface:{...local,ops:[project]}},{...affine,matte:{mode:"alpha" as const,layer:"matte",ops:[project]}},{...affine,effects:[{id:"input",effect:"compound.blur",enabled:true,params:{},layerInputs:{map:[project]}}]}];
  for(const capture of captures) expect(()=>requireSpatialCapabilities({...root,ops:[capture]},{projective:false})).toThrow("True perspective");
});
it("accepts affine camera projection on Canvas and validates device allocations on WebGL",()=>{
  const affine={...project,placement:{...project.placement,affineMatrix:[1,0,0,1,0,0] as [number,number,number,number,number,number]}};
  expect(()=>requireSpatialCapabilities({...root,ops:[affine]},{projective:false})).not.toThrow();
  const validateSurface=vi.fn();requireSpatialCapabilities(root,{projective:true,validateSurface});
  expect(validateSurface).toHaveBeenCalledWith(10,10,"plane");
});
it("rejects projection coefficients outside finite GPU precision",()=>{
  const huge={...project,placement:{...project.placement,inverse:[1e100,0,0,0,1,0,0,0,1] as [number,number,number,number,number,number,number,number,number]}};
  expect(()=>requireSpatialCapabilities({...root,ops:[huge]},{projective:true})).toThrow("precision");
});
