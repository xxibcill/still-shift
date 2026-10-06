import type { Matrix } from "../../node-transform.ts";
import { passageError } from "../../passage-diagnostics.ts";
import type { Bounds } from "../evaluate/types.ts";
import { affineHomography,inverseHomography,multiplyHomographies,type Homography,type Point3,type ProjectedPlane } from "../evaluate/spatial-geometry.ts";
export type ProjectivePlacement={
  homography:Homography;
  inverse:Homography;
  affineMatrix:Matrix|null;
  /** Depth in source texture pixel coordinates; absent for coordinate-space captures. */
  depth?:Point3;
  nearClip?:number;
  farClip?:number;
  bounds:Bounds|null;
};
export function planePlacement(plane:ProjectedPlane,outer:Matrix,origin:[number,number]):ProjectivePlacement|null {
  if(!plane.inverse||!plane.bounds) return null;
  const h=multiplyHomographies(affineHomography(outer),multiplyHomographies(plane.homography,[1,0,origin[0],0,1,origin[1],0,0,1]));
  const inverse=inverseHomography(h);if(!inverse) return null;
  const points=plane.polygon.map(([x,y])=>[outer[0]*x+outer[2]*y+outer[4],outer[1]*x+outer[3]*y+outer[5]]);
  const bounds={left:Math.min(...points.map(p=>p[0]!)),top:Math.min(...points.map(p=>p[1]!)),right:Math.max(...points.map(p=>p[0]!)),bottom:Math.max(...points.map(p=>p[1]!))};
  return {homography:h,inverse,affineMatrix:plane.affineMatrix ? [h[0]/h[8],h[3]/h[8],h[1]/h[8],h[4]/h[8],h[2]/h[8],h[5]/h[8]] : null,depth:[plane.depth[0],plane.depth[1],plane.depth[2]+plane.depth[0]*origin[0]+plane.depth[1]*origin[1]],nearClip:plane.nearClip,farClip:plane.farClip,bounds};
}
/** Raster allocation is fixed by local artwork/effect bounds, independent of the projected size. */
export function localSurfaceBounds(bounds:Bounds,node:string) {
  const left=Math.floor(bounds.left),top=Math.floor(bounds.top),width=Math.max(1,Math.ceil(bounds.right)-left),height=Math.max(1,Math.ceil(bounds.bottom)-top);
  if(![left,top,width,height].every(Number.isSafeInteger)||width>8192||height>8192||width*height*4>128*1024*1024)
    passageError("comp-3d-surface-budget","A local 3D artwork surface exceeds 8192 pixels per axis or 128 MiB",{node});
  return {origin:[left,top] as [number,number],width,height};
}
