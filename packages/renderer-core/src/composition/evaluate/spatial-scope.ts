import type { Composition, CompositionScope } from "@still-shift/scene-contract";
import { passageError } from "../../passage-diagnostics.ts";
import { sampleCamera } from "./camera.ts";
import { localBounds } from "./geometry.ts";
import { effectBounds } from "./effects.ts";
import {
  affineMatrix4,
  cameraGeometry,
  cameraDepth,
  circleOfConfusion,
  layerMatrix3d,
  projectPlane,
  worldPoint,
  type Point3,
} from "./spatial-geometry.ts";
import { sampleSpatialTransform } from "./spatial-state.ts";
import type { EvaluatedLayer, EvaluatedLayerTree, EvaluationOptions } from "./types.ts";

/** Camera optics remain active while isolating drawable layers with solo. */
function cameraActive(state: EvaluatedLayer,scope: CompositionScope,tree: EvaluatedLayerTree,options: EvaluationOptions,byId: ReadonlyMap<string,EvaluatedLayer>) {
  for(let layer: typeof state.layer|undefined=state.layer;layer;layer=layer.parent ? byId.get(layer.parent)?.layer : undefined) {
    if(layer!==state.layer&&layer.type!=="group") continue;
    if(layer.enabled===false||(layer.guide&&!options.includeGuides)||tree.time<0||tree.time>=scope.frameCount||tree.time<(layer.inPoint??0)||tree.time>=(layer.outPoint??scope.frameCount)) return false;
  }
  return true;
}

/** Attach actual scoped geometry only after all parent world states have settled. */
export function projectSpatialScope(comp: Composition,scope: CompositionScope,tree: EvaluatedLayerTree,options: EvaluationOptions,route: readonly string[]=[],rootFrame=tree.time) {
  const byId=new Map(tree.layers.map(state=>[state.id,state]));
  const active=tree.layers.find(state=>state.camera&&cameraActive(state,scope,tree,options,byId));
  const width=scope.width,height=scope.height;
  const location={frame:rootFrame,path:route.join("/")||"layers"};
  try {
    if(active?.camera) {
      const controls=active.camera;
      const parent=active.layer.parent ? byId.get(active.layer.parent)! : undefined;
      const pointOfInterest=controls.model==="two-node" ? parent?.worldMatrix3d ? worldPoint(parent.worldMatrix3d,controls.pointOfInterest) : controls.pointOfInterest : undefined;
      tree.camera={...cameraGeometry({width,height,world:active.worldMatrix3d ?? affineMatrix4(active.worldMatrix),zoom:controls.zoom,filmSize:controls.filmSize,nearClip:controls.nearClip,farClip:controls.farClip,focusDistance:controls.focusDistance,blurLevel:controls.blurLevel,...(pointOfInterest ? {pointOfInterest} : {}),aperture:controls.depthOfField ? controls.aperture : 0}),id:active.id,source:"native"};
    } else {
      const legacy=scope===comp&&comp.camera2d ? sampleCamera(comp,tree.time) : undefined;
      const transform=sampleSpatialTransform({id:"default-camera",type:"camera"},0,tree.fps,[width,height],[0,0]).transform;
      if(legacy) transform.position=[legacy.x,legacy.y,-width];
      tree.camera={...cameraGeometry({width,height,world:layerMatrix3d(transform),zoom:legacy ? width*legacy.zoom : width}),id:null,source:legacy ? "legacy2d" : "default"};
    }
  } catch(error) {
    passageError("comp-camera-geometry",error instanceof Error ? error.message : String(error),{...location,...(active ? {node:active.id,path:[...route,active.id].join("/")} : {})});
  }
  const camera=tree.camera!;
  for(const state of tree.layers) {
    if(!state.layer.threeD||!state.worldMatrix3d) continue;
    const bounds=localBounds(comp,scope,state,options);
    if(!bounds) continue;
    const path=[...route,state.id].join("/");
    const expanded=effectBounds(bounds,state.effects,{node:state.id,path,frame:rootFrame});
    const plane=projectPlane(state.worldMatrix3d,camera,expanded);
    state.projection=plane;
    const anchor=state.transform.anchor;
    state.cameraDepth=cameraDepth(camera,worldPoint(state.worldMatrix3d,[anchor[0],anchor[1],anchor[2]??0] as Point3));
    state.focusBlur=circleOfConfusion(camera,state.cameraDepth);
    state.bounds=plane.bounds;
    if(plane.affineMatrix) state.screenMatrix=plane.affineMatrix;
  }
}
