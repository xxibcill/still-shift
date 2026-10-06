import { passageError } from "../../passage-diagnostics.ts";

type SpatialEntry = { id: string; layer: { threeD?: boolean }; cameraDepth?: number };
/** Authored top-to-bottom order: each drawable 3D run becomes near-to-far, with 2D barriers retained. */
export function spatialStackOrder<T extends SpatialEntry>(layers: readonly T[]): T[] {
  const ordered:T[]=[],run:{state:T;index:number}[]=[];
  const flush=()=>{
    run.sort((a,b)=>a.state.cameraDepth!-b.state.cameraDepth!||a.index-b.index);
    ordered.push(...run.map(entry=>entry.state));run.length=0;
  };
  layers.forEach((state,index)=>{
    if(state.layer.threeD) {
      if(state.cameraDepth===undefined||!Number.isFinite(state.cameraDepth))
        passageError("comp-3d-transform","Depth sorting requires evaluated finite camera-space depth",{node:state.id});
      run.push({state,index});
    } else {flush();ordered.push(state);}
  });
  flush();return ordered;
}
