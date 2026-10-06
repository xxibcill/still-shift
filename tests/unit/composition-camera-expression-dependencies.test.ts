import { expect,it } from "vitest";
import { CompositionSchema,validateComposition,type Composition } from "@still-shift/scene-contract";
import { evaluateComp,evaluateProperty } from "../../packages/renderer-core/src/composition/evaluate/index.ts";
const scene=(expressions:NonNullable<Composition["expressions"]>):Composition=>({schemaVersion:"composition-1",id:"optics",width:128,height:96,fps:24,frameCount:32,assets:[],layers:[{id:"camera",type:"camera"},{id:"reader",type:"null"}],expressions});
it("resolves derived focal length after zoom and film expressions regardless of author order",()=>{
  for(const reverse of [false,true]) {
    const entries:[string,{source:string}][]=[["reader.transform.position.x",{source:'ref("camera.focalLength")'}],["camera.filmSize",{source:"value * 1.5"}],["camera.zoom",{source:"value * 2"}]],
      doc=CompositionSchema.parse(scene(Object.fromEntries(reverse ? entries.reverse() : entries)));
    expect(evaluateComp(doc,5).layers[1]!.transform.position[0]).toBe(108);
    expect(evaluateProperty(doc,"camera.focalLength",5)).toBe(108);
  }
});
it("resolves derived zoom after focal-length and film expressions without insertion-order drift",()=>{
  for(const reverse of [false,true]) {
    const entries:[string,{source:string}][]=[["reader.transform.position.x",{source:'ref("camera.zoom")'}],["camera.filmSize",{source:"value * 1.5"}],["camera.focalLength",{source:"value * 2"}]],
      doc=CompositionSchema.parse(scene(Object.fromEntries(reverse ? entries.reverse() : entries)));
    expect(evaluateComp(doc,5).layers[1]!.transform.position[0]).toBeCloseTo(72*128/54,12);
    expect(evaluateProperty(doc,"camera.focalLength",5)).toBe(72);
  }
});
it("rejects implicit optical feedback cycles while allowing independent primary reads",()=>{
  for(const expressions of [{"camera.zoom":{source:'ref("camera.focalLength")'}},{"camera.filmSize":{source:'ref("camera.focalLength")'}}])
    expect(validateComposition(scene(expressions)).ok).toBe(false);
  expect(validateComposition(scene({"camera.filmSize":{source:'ref("camera.zoom") / 4'}})).ok).toBe(true);
});
it("resolves secondary zoom when a motion driver selects focal length and an expression changes film size",()=>{
  const doc=CompositionSchema.parse({...scene({"reader.transform.position.x":{source:'ref("camera.zoom")'},"camera.filmSize":{source:"value * 1.5"}}),signals:[{id:"focal",keys:[{frame:0,value:72}]}],drivers:[{target:"camera.focalLength",signal:"focal",blend:"replace"}]});
  expect(evaluateComp(doc,5).layers[1]!.transform.position[0]).toBeCloseTo(72*128/54,12);
});
