import { passageError } from "../../passage-diagnostics.ts";
import type { RenderOp,SurfaceNode } from "./graph.ts";
import type { ProjectivePlacement } from "./projective-placement.ts";
/** Check the complete spatial graph before a retained target is cleared or drawn. */
export function requireSpatialCapabilities(root:SurfaceNode,capabilities:{projective:boolean;validateSurface?:(width:number,height:number,node:string)=>void}) {
  const check=(placement:ProjectivePlacement,node:string)=>{
    if(![...placement.homography,...placement.inverse,...(placement.depth??[])].every(value=>Number.isFinite(Math.fround(value))))
      passageError("comp-3d-transform","Projection coefficients exceed finite WebGL2 precision",{node});
    if(!placement.affineMatrix&&!capabilities.projective)
      passageError("comp-feature-backend","True perspective requires the composition WebGL2 backend; Canvas supports affine camera projection",{node});
  };
  const visit=(ops:readonly RenderOp[])=>{
    for(const op of ops) {
      for(const clip of op.clips) if(clip.projection) check(clip.projection,op.layer);
      if(op.kind==="project") {
        check(op.placement,op.layer);
        capabilities.validateSurface?.(op.surface.width,op.surface.height,op.layer);
        visit(op.surface.ops);
      } else if(op.kind==="draw") {
        if(op.content.type==="surface") visit(op.content.surface.ops);
      } else {
        if(op.kind==="isolate") visit(op.ops);
        else for(const history of op.history??[]) visit(history.ops);
      }
      if(op.kind!=="draw") {
        for(const effect of op.effects) for(const input of Object.values(effect.layerInputs??{})) visit(input);
        if(op.matte) visit(op.matte.ops);
      }
    }
  };
  visit(root.ops);
}
