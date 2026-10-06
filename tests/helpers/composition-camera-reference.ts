/** Independent camera oracle: cast a screen ray, intersect an authored Y-rotated
 * plane and resolve its local coordinates by dot products. No evaluator,
 * production matrices, homographies, samplers or backend shaders are imported. */
export type CameraReferencePlane = {
  position: readonly [number, number, number];
  rotationY: number;
  width: number;
  height: number;
  pixels?: Uint8ClampedArray;
};
export function cameraRayPlanePoint(
  x: number,
  y: number,
  width: number,
  height: number,
  plane: CameraReferencePlane,
  near = 0.01,
  far = 10_000_000,
) {
  const angle = plane.rotationY * Math.PI / 180,
    c = Math.cos(angle), s = Math.sin(angle),
    dx = (x-width/2)/width, dy = (y-height/2)/width,
    denominator = s*dx+c;
  if (Math.abs(denominator)<1e-12) return null;
  const distance = (s*(plane.position[0]-width/2)+c*(plane.position[2]+width))/denominator;
  if (distance<near||distance>far) return null;
  const wx=width/2+distance*dx-plane.position[0],
    wy=height/2+distance*dy-plane.position[1],
    wz=-width+distance-plane.position[2],
    u=c*wx-s*wz;
  return u>=0&&u<plane.width&&wy>=0&&wy<plane.height ? [u,wy] as const : null;
}
function sample(plane:CameraReferencePlane,u:number,v:number) {
  if(!plane.pixels) return [255,255,255,255];
  const bx=Math.floor(u-.5),by=Math.floor(v-.5),
    fx=Math.floor((u-.5-bx)*16)/16,fy=Math.floor((v-.5-by)*16)/16,
    pixel=(x:number,y:number,i:number)=>plane.pixels![(Math.max(0,Math.min(plane.height-1,y))*plane.width+Math.max(0,Math.min(plane.width-1,x)))*4+i]!;
  return [0,1,2,3].map(i=>Math.floor((pixel(bx,by,i)*(1-fx)+pixel(bx+1,by,i)*fx)*(1-fy)+(pixel(bx,by+1,i)*(1-fx)+pixel(bx+1,by+1,i)*fx)*fy));
}
/** Four fixed subpixel rays and the declared 1/16 bilinear weight policy, over black. */
export function cameraPlaneReference(width:number,height:number,plane:CameraReferencePlane,near=0.01,far=10_000_000) {
  const pixels=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const sum=[0,0,0];
    for(const oy of [.25,.75]) for(const ox of [.25,.75]) {
      const p=cameraRayPlanePoint(x+ox,y+oy,width,height,plane,near,far);
      if(!p) continue;
      const rgba=sample(plane,p[0],p[1]);
      for(let i=0;i<3;i++) sum[i]=sum[i]!+rgba[i]!;
    }
    const offset=(y*width+x)*4;
    for(let i=0;i<3;i++) pixels[offset+i]=Math.floor(sum[i]!/4+.5);
    pixels[offset+3]=255;
  }
  return pixels;
}
/** Hand-authored linear clocks for the two ray-oracle fixtures. */
export function cameraFixturePlane(name:string,frame:number,pixels?:Uint8ClampedArray):CameraReferencePlane|null {
  if(name!=="perspective"&&name!=="checker-perspective"&&name!=="clipping") return null;
  return {position:name!=="clipping" ? [34+.5*frame,24,20] : [46,24,-105],rotationY:name!=="clipping" ? 30+frame/2 : 55,width:48,height:40,...(pixels ? {pixels} : {})};
}
/** Independent depth order/parallax drawing for the affine fixture. */
export function affineCameraReference(frame:number) {
  const canvas=document.createElement("canvas");canvas.width=128;canvas.height=96;
  const ctx=canvas.getContext("2d",{alpha:false})!,cameraX=64+16*frame/31;
  ctx.fillStyle="#000000";ctx.fillRect(0,0,128,96);
  const paint=(x:number,y:number,z:number,width:number,height:number,color:string)=>{
    const scale=128/(128+z);ctx.save();ctx.setTransform(scale,0,0,scale,64+scale*(x-cameraX),48+scale*(y-48));ctx.fillStyle=color;ctx.fillRect(0,0,width,height);ctx.restore();
  };
  paint(25,14,90,90,66,"#9a78b4");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,88,128,6);
  const red={x:35,y:18,z:-12+72*frame/31,color:"#eb8d55"},blue={x:52,y:30,z:60-72*frame/31,color:"#347fac"};
  for(const p of red.z<=blue.z ? [blue,red] : [red,blue]) paint(p.x,p.y,p.z,48,40,p.color);
  return ctx.getImageData(0,0,128,96).data;
}
