import type { CameraGeometry, Matrix4, Point3 } from "./spatial-geometry.ts";
import { worldPoint } from "./spatial-geometry.ts";

const dot=(a:Point3,b:Point3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:Point3,b:Point3):Point3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(v:Point3):Point3=>{
  const length=Math.hypot(...v);
  if(!Number.isFinite(length)||length<=1e-12) throw Error("Camera-facing orientation requires a finite nonzero basis");
  return v.map(value=>value/length) as Point3;
};
const column=(m:Matrix4,offset:number):Point3=>[m[offset]!,m[offset+1]!,m[offset+2]!];

/**
 * Spherical camera-facing orientation replaces the parent's orthonormal frame.
 * Rotate the complete authored linear map: local rotations, shear, signed scale
 * and parent mirror parity survive. The world anchor stays fixed.
 */
export function cameraFacingWorld(world:Matrix4,parent:Matrix4|undefined,anchor:Point3,camera:CameraGeometry):Matrix4 {
  const position=worldPoint(world,anchor);
  const forward=unit(position.map((v,axis)=>v-camera.position[axis]!) as Point3);
  let hint=camera.down;
  if(Math.hypot(...cross(hint,forward))<=1e-12) hint=camera.right;
  const right=unit(cross(hint,forward)),down=unit(cross(forward,right));
  const oldRight=parent ? unit(column(parent,0)) : [1,0,0] as Point3;
  const parentDown=parent ? column(parent,4) : [0,1,0] as Point3;
  const oldDown=unit(parentDown.map((v,axis)=>v-oldRight[axis]!*dot(parentDown,oldRight)) as Point3);
  const oldForward=unit(cross(oldRight,oldDown));
  const old=[oldRight,oldDown,oldForward],facing=[right,down,forward];
  const result=[...world] as Matrix4;
  for(let col=0;col<3;col++) {
    const v=column(world,col);
    for(let row=0;row<3;row++) result[col*4+row]=facing.reduce((sum,axis,index)=>sum+axis[row]!*dot(old[index]!,v),0);
  }
  for(let row=0;row<3;row++) result[12+row]=position[row]!-result[row]!*anchor[0]-result[4+row]!*anchor[1]-result[8+row]!*anchor[2];
  if(!result.every(Number.isFinite)) throw Error("Camera-facing transform is not finite");
  return result;
}
