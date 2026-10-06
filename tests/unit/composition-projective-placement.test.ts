import { expect,it } from "vitest";
import { localSurfaceBounds,planePlacement } from "../../packages/renderer-core/src/composition/render/projective-placement.ts";
import { cameraGeometry,layerMatrix3d,projectPlane,type SpatialTransform } from "../../packages/renderer-core/src/composition/evaluate/spatial-geometry.ts";
const transform:SpatialTransform={anchor:[0,0,0],position:[0,0,0],scale:[1,1,1],orientation:[0,0,0],rotation:0,rotationX:0,rotationY:0,skewX:0,skewY:0};
const camera=cameraGeometry({width:100,height:100,zoom:100,world:layerMatrix3d({...transform,position:[50,50,-100]})});
it("maps negative artwork origins and outer precomp placement through the actual homography",()=>{
  const plane=projectPlane(layerMatrix3d({...transform,position:[40,40,0],rotationY:30}),camera,{left:-4.2,top:-3.1,right:10,bottom:10});
  const raster=localSurfaceBounds(plane.localBounds,"plane");
  expect(raster).toEqual({origin:[-5,-4],width:15,height:14});
  const placement=planePlacement(plane,[2,0,0,2,3,7],raster.origin)!;
  expect(placement.affineMatrix).toBeNull();
  const x=5,y=4,h=placement.homography,w=h[6]*x+h[7]*y+h[8];
  expect((h[0]*x+h[1]*y+h[2])/w).toBeCloseTo(83,10);
  expect((h[3]*x+h[4]*y+h[5])/w).toBeCloseTo(87,10);
  const ix=placement.inverse,qx=83,qy=87,d=ix[6]*qx+ix[7]*qy+ix[8];
  expect((ix[0]*qx+ix[1]*qy+ix[2])/d).toBeCloseTo(x,10);
  expect((ix[3]*qx+ix[4]*qy+ix[5])/d).toBeCloseTo(y,10);
  expect(placement.depth![2]).toBeCloseTo(102.5,10);
});
it("retains the exact affine map when the plane denominator is constant",()=>{
  const plane=projectPlane(layerMatrix3d({...transform,position:[40,40,100]}),camera,{left:0,top:0,right:10,bottom:10});
  expect(planePlacement(plane,[1,0,0,1,0,0],[0,0])!.affineMatrix).toEqual([.5,0,0,.5,45,45]);
});
it("returns no placement for clipped or zero-area geometry",()=>{
  const bounds={left:0,top:0,right:10,bottom:10};
  expect(planePlacement(projectPlane(layerMatrix3d({...transform,position:[0,0,-101]}),camera,bounds),[1,0,0,1,0,0],[0,0])).toBeNull();
});
it("bounds allocations independently of zoom and rejects oversized artwork",()=>{
  expect(localSurfaceBounds({left:0,top:0,right:8192,bottom:1},"wide").width).toBe(8192);
  for(const bounds of [{left:0,top:0,right:8193,bottom:1},{left:0,top:0,right:8192,bottom:8192},{left:NaN,top:0,right:1,bottom:1}]) expect(()=>localSurfaceBounds(bounds,"wide")).toThrow("surface exceeds");
});
