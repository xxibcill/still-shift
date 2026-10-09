import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { colorEffectKernel } from "../../packages/renderer-core/src/composition/render/color-effects.ts";
import {
  ManagedMemory,
  type MemoryLease,
} from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
type NativeRow = {
  id: string;
  params: Parameters<
    NonNullable<ReturnType<typeof colorEffectKernel>>["renderGpu"]
  >[2];
  accesses: string[];
  sha256: string;
};
type EntryRow = NativeRow & {
  mode: string;
  records: unknown[];
  keys: string[];
};
const originals = JSON.parse(
  '[{"id":"color.curves","params":{"curve":[[0,0],[1,1]],"amount":1},"accesses":["curve","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount"],"sha256":"b67c72fe82f34817daf6d17df051e86ce724fdddbf4b2b155794e1ea9b950d77"},{"id":"color.levels","params":{"inputBlack":0,"inputWhite":1,"gamma":1,"outputBlack":0,"outputWhite":1},"accesses":["inputBlack","inputWhite","gamma","outputBlack","outputWhite"],"sha256":"a746c4aed0f4ccc192312f095c1b2188b63865dd0d02f6703f06175c92db27a7"},{"id":"color.tint","params":{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1},"accesses":["black","white","amount"],"sha256":"4c88c44b9d68894010f4b5a452d40230fd22dce6ce9a10d5e5d9f3368ed5250a"},{"id":"color.hue-saturation","params":{"hue":0,"saturation":0,"lightness":0},"accesses":["hue","saturation","lightness"],"sha256":"60096302ea215b80152785cb2a56d266e0b4534ac96fe60097099e7a24d7982f"},{"id":"color.exposure","params":{"exposure":0,"offset":0,"gamma":1},"accesses":["exposure","offset","gamma"],"sha256":"e20f1acf6f5021db6126382084c972f342dcf1d0859c17d25df3097c38aa95b6"},{"id":"color.brightness-contrast","params":{"brightness":0,"contrast":0},"accesses":["brightness","contrast"],"sha256":"5da6387d27a22aefedb4833f3655aaa54297f6c4e740ba5537375132c55ffedc"},{"id":"color.fill","params":{"color":[1,1,1,1],"amount":1},"accesses":["color","amount"],"sha256":"2b530693800f72d7fb956d2bee9a118d0e6ec5f3aa3b154ed45ce845b4753149"},{"id":"color.gradient-ramp","params":{"start":[0,0],"end":[100,0],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"accesses":["start","end","startColor","endColor","amount","startColor","endColor","start","end"],"sha256":"d16254758742e9952d7a74aa237e40073f67cfa412110715b2c570ae3c058541"},{"id":"color.invert","params":{"amount":1},"accesses":["amount"],"sha256":"ab5f9540f6e87a8bf612f510f99dbe829ef217aedccc9f929ce7b87e7d52510e"},{"id":"color.posterize","params":{"levels":8},"accesses":["levels"],"sha256":"fe7232bf8c709807dfcadd89dd3190afd232ebff8d078cf5eaa25e3f7e6c477e"},{"id":"color.curves","params":{"curve":[[0,0.2],[0.37,0.8],[0.5,0.1],[1,0.9]],"amount":1},"accesses":["curve","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount","curve","amount","amount","amount"],"sha256":"4c593024084533985655d843cdc22070825a73ef3f41608e1c0865f46be4d35e"},{"id":"color.levels","params":{"inputBlack":0.4,"inputWhite":0.4,"gamma":2.75,"outputBlack":0.15,"outputWhite":0.85},"accesses":["inputBlack","inputWhite","gamma","outputBlack","outputWhite"],"sha256":"adcea3507adbd5dd375c456e4148225a8b29b3ba29137604d4bd8e4d4872ad5c"},{"id":"color.tint","params":{"black":[0.7,0.2,0.9,0.3],"white":[0.1,0.8,0.2,0.6],"amount":0.7},"accesses":["black","white","amount"],"sha256":"1920e9352151206014daa699ca6d7364d9e79af82ad7f599243b3804d692620a"},{"id":"color.hue-saturation","params":{"hue":-247.5,"saturation":133.25,"lightness":-42.5},"accesses":["hue","saturation","lightness"],"sha256":"d26c5d2ae117353e4fbbedda2bb0c95ee91966d0a4decd27ebbd14404e08db4b"},{"id":"color.exposure","params":{"exposure":-3.5,"offset":0.25,"gamma":2.3},"accesses":["exposure","offset","gamma"],"sha256":"4abe7203db84920a5d51f0fd9bbf842a5234c1f30282609c07eedec05ea98490"},{"id":"color.brightness-contrast","params":{"brightness":-0.2,"contrast":0.75},"accesses":["brightness","contrast"],"sha256":"320600b92ff61113c4b76f4cf9f187936b353313cea4d8d378a03978cdd5a5f7"},{"id":"color.brightness-contrast","params":{"brightness":0.3,"contrast":-0.8},"accesses":["brightness","contrast"],"sha256":"ac1275a214db03342b5624944f01c78053d9aceb63e156c0f177e6afc8f7f494"},{"id":"color.fill","params":{"color":[0.8,0.2,0.4,0.6],"amount":0.7},"accesses":["color","amount"],"sha256":"f8a8d01d9f1e4810cce55ca63109800878b287d2e91bea6d196d658a66fe7664"},{"id":"color.gradient-ramp","params":{"start":[10,3],"end":[-7,-2],"startColor":[0.2,0.8,0.1,0.3],"endColor":[0.7,0.1,0.9,0.8],"amount":0.7},"accesses":["start","end","startColor","endColor","amount","startColor","endColor","start","end"],"sha256":"0ebcde3396624f08d7aa257461ff6056d4395644d7b384c635332b3aa5eeb3aa"},{"id":"color.gradient-ramp","params":{"start":[1,2],"end":[1,2],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"accesses":["start","end","startColor","endColor","amount","startColor","endColor","start","end"],"sha256":"a47b9a4856806fe2a4276e7273c08125de2e9e7f6e2ef727af9870eea369d271"},{"id":"color.gradient-ramp","params":{"start":[0,0],"end":[0.001953125,0],"startColor":[0,0,0,1],"endColor":[1,1,1,1],"amount":1},"accesses":["start","end","startColor","endColor","amount","startColor","endColor","start","end"],"sha256":"bf496f1a6b7e11ba9eaf362e7c6a14ed21b7c3cd4bcb5e6bd1b912bdbb1d35c2"},{"id":"color.invert","params":{"amount":0.5},"accesses":["amount"],"sha256":"6a79499276aaf11db8593ca54d1e650703262dc6094f3996e020047d17359027"},{"id":"color.posterize","params":{"levels":7.25},"accesses":["levels"],"sha256":"9049caddc18af590b5af0168f0bf7c18aca7e08366972b1acde67f07526abfec"}]',
) as NativeRow[];
const entryOriginals = JSON.parse(
  '[{"mode":"ordinary","id":"color.tint","params":{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1},"accesses":["ownKeys","descriptor.black","get.black:true","descriptor.white","get.white:true","descriptor.amount","get.amount:true"],"records":[["create",2,2,2],["pass",539,"9078ff78ffa02795faaad7f005fa5008f766ef4fcb6ca9b78a566c6094681412",2,[1],{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1}]],"sha256":"752380d24636b51f46fb11a8b664198975278d3bd0a4c5ce20edad094015511e","keys":["black","white","amount"]},{"mode":"reverse","id":"color.tint","params":{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1},"accesses":["ownKeys","descriptor.amount","get.amount:true","descriptor.white","get.white:true","descriptor.black","get.black:true"],"records":[["create",2,2,2],["pass",539,"9078ff78ffa02795faaad7f005fa5008f766ef4fcb6ca9b78a566c6094681412",2,[1],{"amount":1,"white":[1,1,1,1],"black":[0,0,0,1]}]],"sha256":"e89a98886a81d75e280af8c078dce210f644c1859b1a54b3417045751f4bef99","keys":["black","white","amount"]},{"mode":"nonenumerable","id":"color.tint","params":{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1},"accesses":["ownKeys","descriptor.black","get.black:true","descriptor.white","descriptor.amount","get.amount:true"],"records":[["create",2,2,2],["pass",539,"9078ff78ffa02795faaad7f005fa5008f766ef4fcb6ca9b78a566c6094681412",2,[1],{"black":[0,0,0,1],"amount":1}]],"sha256":"c9836bf6a235dd83601769b5ae2cb4578e8cfc38cb8cfdec3d77371e86dfae47","keys":["black","white","amount"]},{"mode":"accessor","id":"color.tint","params":{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1},"accesses":["ownKeys","descriptor.black","get.black:true","descriptor.white","get.white:true","this.white:true","descriptor.amount","get.amount:true"],"records":[["create",2,2,2],["pass",539,"9078ff78ffa02795faaad7f005fa5008f766ef4fcb6ca9b78a566c6094681412",2,[1],{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1}]],"sha256":"2986d1c63fbccd6297f7812018fb753e61b0d87a18f941ca1d70729cfe5e78d2","keys":["black","white","amount"]},{"mode":"symbol","id":"color.tint","params":{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1},"accesses":["ownKeys","descriptor.black","get.black:true","descriptor.white","get.white:true","descriptor.amount","get.amount:true"],"records":[["create",2,2,2],["pass",539,"9078ff78ffa02795faaad7f005fa5008f766ef4fcb6ca9b78a566c6094681412",2,[1],{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1}]],"sha256":"752380d24636b51f46fb11a8b664198975278d3bd0a4c5ce20edad094015511e","keys":["black","white","amount"]},{"mode":"locked","id":"color.tint","params":{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1},"accesses":["ownKeys","descriptor.black","get.black:true","descriptor.white","get.white:true","descriptor.amount","get.amount:true"],"records":[["create",2,2,2],["pass",539,"9078ff78ffa02795faaad7f005fa5008f766ef4fcb6ca9b78a566c6094681412",2,[1],{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1}]],"sha256":"752380d24636b51f46fb11a8b664198975278d3bd0a4c5ce20edad094015511e","keys":["black","white","amount"]},{"mode":"locked-accessor","id":"color.tint","params":{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1},"accesses":["ownKeys","descriptor.black","get.black:true","descriptor.white","get.white:true","this.white:true","descriptor.amount","get.amount:true"],"records":[["create",2,2,2],["pass",539,"9078ff78ffa02795faaad7f005fa5008f766ef4fcb6ca9b78a566c6094681412",2,[1],{"black":[0,0,0,1],"white":[1,1,1,1],"amount":1}]],"sha256":"2986d1c63fbccd6297f7812018fb753e61b0d87a18f941ca1d70729cfe5e78d2","keys":["black","white","amount"]}]',
) as EntryRow[];
const limits = { pixels: 4194304, metadata: 2097152 };
type Uniforms = Record<string, number | readonly number[]>;
type Entries = [string, unknown][];
type Work = {
  managed?: boolean;
  memory?: ManagedMemory;
  pixel: {
    rgb?: number[];
    output?: number[];
    unitOutput?: number[];
    colorOutput?: number[];
  };
  entryCount: number;
  entryBytes: number;
  entriesLease?: MemoryLease;
  entriesProducer?: unknown;
  handler?: ProxyHandler<object>;
  receiver?: object;
  enumerationKeys?: (string | symbol)[];
  descriptor?: PropertyDescriptor;
  entries?: Entries;
  filtered?: Entries;
  filterCallback?: unknown;
  uniforms?: Uniforms;
  combined?: Uniforms;
  gradient?: Uniforms;
  output?: unknown;
  transfer?: unknown;
  inputs?: unknown[];
  bytes?: Uint8Array<ArrayBuffer>;
  pixelLease?: MemoryLease;
  sourcePixel?: number[];
  shader?: string;
};
const kernelMetadata = 4096 + 8192;
const constructorHeadroom = 32768 + kernelMetadata;
function kernelOnly(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({
    pixels: 0,
    metadata: kernelMetadata,
  });
  expect(memory.statistics.reservations).toBe(2);
}
function prewarmWithFiller(memory: ManagedMemory, id: string) {
  // Charge a real backing after construction to restore the original callback quota.
  expect(colorEffectKernel(id)).toBeDefined();
  const filler = memory.allocate(
    "metadata",
    32768,
    () => new ArrayBuffer(32768),
    true,
    (value) => value,
    (value) =>
      (
        value as ArrayBuffer & { transfer(bytes: number): ArrayBuffer }
      ).transfer(0),
  );
  expect(memory.owns(filler)).toBe(true);
  expect(filler.byteLength).toBe(32768);
  expect(memory.statistics.current).toEqual({
    pixels: 0,
    metadata: constructorHeadroom,
  });
  expect(memory.statistics.reservations).toBe(3);
  return filler;
}
function releaseFiller(memory: ManagedMemory, filler: ArrayBuffer) {
  memory.release(filler);
  expect(filler.byteLength).toBe(0);
  kernelOnly(memory);
}
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function observe(memory: ManagedMemory) {
  const adopt = memory.adopt.bind(memory);
  let work: Work | undefined;
  vi.spyOn(memory, "adopt").mockImplementation((...v) => {
    if (v[1].bytes === 16384) work = v[0] as Work;
    return adopt(...v);
  });
  return () => work;
}
function gpu(
  row: NativeRow,
  h: ReturnType<typeof shadowHarness>,
  params: NativeRow["params"],
) {
  return colorEffectKernel(row.id)!.renderGpu(
    h.context as never,
    h.input as never,
    params,
  );
}
function nativeParams(
  row: NativeRow,
  accesses: string[],
  before?: (key: string, index: number) => void,
) {
  const raw = structuredClone(row.params),
    params = new Proxy(raw, {
      get(t, k, r) {
        const key = String(k),
          index = accesses.length;
        accesses.push(key);
        before?.(key, index);
        return Reflect.get(t, k, r);
      },
    });
  return { raw, params };
}
function entryParams(row: EntryRow, accesses: string[]) {
  const raw = structuredClone(row.params);
  if (row.mode === "locked")
    Object.defineProperty(raw, "white", {
      configurable: false,
      writable: false,
    });
  if (row.mode === "nonenumerable")
    Object.defineProperty(raw, "white", { enumerable: false });
  if (row.mode === "accessor" || row.mode === "locked-accessor") {
    const value = raw.white;
    Object.defineProperty(raw, "white", {
      enumerable: true,
      configurable: row.mode !== "locked-accessor",
      get() {
        accesses.push("this.white:" + String(this === params));
        return value;
      },
    });
  }
  if (row.mode === "symbol")
    Object.defineProperty(raw, Symbol("ignored"), {
      value: 42,
      enumerable: true,
    });
  const params = new Proxy(raw, {
    ownKeys(t) {
      accesses.push("ownKeys");
      const result = Reflect.ownKeys(t);
      return row.mode === "reverse" ? result.reverse() : result;
    },
    getOwnPropertyDescriptor(t, k) {
      accesses.push("descriptor." + String(k));
      return Reflect.getOwnPropertyDescriptor(t, k);
    },
    get(t, k, r) {
      accesses.push("get." + String(k) + ":" + String(r === params));
      return Reflect.get(t, k, r);
    },
  });
  return params;
}
afterEach(() => vi.restoreAllMocks());
it("preserves all 23 original whole GPU shader/upload/uniform/input traces and complete parameter getters active/inactive while retiring callback and curve resources", async () => {
  for (const active of [false, true])
    for (const row of originals) {
      const memory = new ManagedMemory(limits),
        getWork = observe(memory),
        h = shadowHarness(),
        accesses: string[] = [],
        { raw, params } = nativeParams(row, accesses);
      const run = async () => gpu(row, h, params);
      if (active) await withManagedMemory(memory, run);
      else await run();
      expect(sha([h.records, accesses])).toBe(row.sha256);
      expect(accesses).toEqual(row.accesses);
      expect(raw).toEqual(row.params);
      if (active) expect(getWork()).toEqual({});
      if (active && row.id === "color.gradient-ramp") {
        expect(
          memory.statistics.current.metadata - kernelMetadata,
        ).toBeGreaterThanOrEqual(6144);
        expect(
          memory.statistics.current.metadata - kernelMetadata,
        ).toBeLessThan(8192);
        expect(memory.statistics.current.pixels).toBe(262144);
      } else if (active) kernelOnly(memory);
      else empty(memory);
      memory.dispose();
      empty(memory);
      vi.restoreAllMocks();
    }
});
it("preserves seven independently original ownKeys/descriptor/getter receiver sequences including reversed/nonenumerable/accessor/symbol/locked parameters", async () => {
  for (const active of [false, true])
    for (const row of entryOriginals) {
      const memory = new ManagedMemory(limits),
        h = shadowHarness(),
        accesses: string[] = [],
        params = entryParams(row, accesses);
      const run = async () => gpu(row, h, params);
      if (active) await withManagedMemory(memory, run);
      else await run();
      expect(accesses).toEqual(row.accesses);
      expect(h.records).toEqual(row.records);
      expect(sha([h.records, accesses])).toBe(row.sha256);
      if (active) kernelOnly(memory);
      else empty(memory);
      memory.dispose();
      vi.restoreAllMocks();
    }
});
it("rejects exact header/raw-result/first-tuple growth quotas before original input/parameter factories and value reads", async () => {
  const row = originals.find((r) => r.id === "color.tint")!,
    first = Object.keys(row.params)[0]!;
  for (const quota of [
    16383,
    16895,
    16384 + 512 + 256 + 2 * first.length - 1,
  ]) {
    const memory = new ManagedMemory({
        ...limits,
        metadata: quota + constructorHeadroom,
      }),
      getWork = observe(memory),
      h = shadowHarness(),
      accesses: string[] = [],
      { params } = nativeParams(row, accesses);
    await withManagedMemory(memory, async () => {
      const filler = prewarmWithFiller(memory, row.id);
      expect(() => gpu(row, h, params)).toThrow(/metadata/);
      expect(accesses).toEqual([]);
      expect(h.records).toHaveLength(quota === 16383 ? 0 : 1);
      if (getWork()) expect(getWork()).toEqual({});
      releaseFiller(memory, filler);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("admits each original tuple before its borrowed getter, captures actual entries/filter/uniform/input roots through native pass and clears actual tuple/handler refs afterwards", async () => {
  const row = originals.find((r) => r.id === "color.tint")!,
    memory = new ManagedMemory(limits),
    getWork = observe(memory),
    h = shadowHarness(),
    accesses: string[] = [],
    keys = Object.keys(row.params);
  let entries: Entries | undefined,
    filtered: Entries | undefined,
    uniforms: Uniforms | undefined,
    inputs: unknown[] | undefined,
    handler: Work["handler"],
    enumerationKeys: Work["enumerationKeys"],
    descriptor: Work["descriptor"];
  const { raw, params } = nativeParams(row, accesses, (_key, index) => {
    const work = getWork()!;
    expect(memory.owns(work)).toBe(true);
    expect(work.entryCount).toBe(index + 1);
    expect(work.entriesLease!.bytes).toBe(
      512 +
        keys
          .slice(0, index + 1)
          .reduce((sum, key) => sum + 256 + 2 * key.length, 0),
    );
    expect(work.entries).toBeUndefined();
    expect(work.receiver === params).toBe(false);
    expect(typeof work.handler!.get).toBe("function");
    expect(typeof work.entriesProducer).toBe("function");
  });
  await withManagedMemory(memory, async () => {
    const pass = h.context.pass;
    vi.spyOn(h.context, "pass").mockImplementation((...v) => {
      const work = getWork()!;
      entries = work.entries;
      filtered = work.filtered;
      uniforms = work.uniforms;
      inputs = work.inputs;
      handler = work.handler;
      enumerationKeys = work.enumerationKeys;
      descriptor = work.descriptor;
      expect(memory.owns(entries!)).toBe(true);
      expect(memory.owns(filtered!)).toBe(true);
      expect(memory.owns(uniforms!)).toBe(true);
      expect(v[2]).toBe(inputs);
      expect(v[3]).toBe(uniforms);
      expect(entries!.map((v) => v[0])).toEqual(keys);
      expect(filtered).toEqual(entries);
      return pass(...v);
    });
    gpu(row, h, params);
    expect(getWork()).toEqual({});
    expect(entries).toEqual([]);
    expect(filtered).toEqual([]);
    expect(uniforms).toEqual({});
    expect(inputs).toEqual([]);
    expect(handler).toEqual({});
    expect(enumerationKeys).toEqual([]);
    expect(descriptor).toEqual({});
    kernelOnly(memory);
  });
  expect(sha([h.records, accesses])).toBe(row.sha256);
  expect(raw).toEqual(row.params);
  memory.dispose();
});
it("reuses one actual admitted pixel work across 256 original curve samples without standalone leases and retires actual sources/results/view/backing after the native pass", async () => {
  const row = originals.find((r) => r.id === "color.curves")!,
    memory = new ManagedMemory(limits),
    getWork = observe(memory),
    h = shadowHarness(),
    round = Math.round;
  let calls = 0,
    pixel: Work["pixel"] | undefined,
    source: number[] | undefined,
    result: number[] | undefined,
    bytes: Uint8Array<ArrayBuffer> | undefined,
    inputs: unknown[] | undefined;
  await withManagedMemory(memory, async () => {
    expect(colorEffectKernel(row.id)).toBeDefined();
    const reserve = vi.spyOn(memory, "reserve");
    vi.spyOn(Math, "round").mockImplementation((v) => {
      const work = getWork()!;
      expect(memory.owns(work)).toBe(true);
      if (!pixel) pixel = work.pixel;
      expect(work.pixel).toBe(pixel);
      source = work.sourcePixel;
      result = work.pixel.colorOutput;
      expect(source).toHaveLength(4);
      expect(result).toHaveLength(4);
      expect(memory.owns(result!)).toBe(false);
      calls++;
      return round(v);
    });
    const pass = h.context.pass;
    vi.spyOn(h.context, "pass").mockImplementation((...v) => {
      const work = getWork()!;
      expect(work.pixel).toEqual({});
      expect(work.sourcePixel).toBeUndefined();
      bytes = work.bytes;
      inputs = work.inputs;
      expect(memory.owns(bytes!.buffer)).toBe(true);
      expect(bytes!.byteLength).toBe(1024);
      return pass(...v);
    });
    gpu(row, h, row.params);
    expect(calls).toBe(256);
    expect(reserve.mock.calls.filter((v) => v[0] === "metadata")).toHaveLength(
      4,
    );
    expect(
      reserve.mock.calls.filter(
        (v) => v[0] === "metadata" && [4096, 512].includes(v[1]),
      ),
    ).toHaveLength(1);
    expect(pixel).toEqual({});
    expect(source).toEqual([]);
    expect(result).toEqual([]);
    expect(bytes!.byteLength).toBe(0);
    expect(inputs).toEqual([]);
    expect(getWork()).toEqual({});
    kernelOnly(memory);
  });
  memory.dispose();
});
it("clears actual working and tuple/curve results after every initial original parameter getter plus mid/late curve and gradient getter null with first null and retry", async () => {
  for (const row of originals) {
    const count = Object.keys(row.params).length,
      cuts = [...Array.from({ length: count }, (_, i) => i)];
    if (row.accesses.length > count)
      cuts.push(
        count,
        Math.floor(row.accesses.length / 2),
        row.accesses.length - 1,
      );
    for (const cut of cuts) {
      let producerFailed = false;
      const memory = new ManagedMemory(limits),
        getWork = observe(memory),
        reserve = memory.reserve.bind(memory),
        h = shadowHarness(),
        accesses: string[] = [],
        { raw, params } = nativeParams(row, accesses, (_key, index) => {
          if (index === cut) {
            producerFailed = true;
            throw null;
          }
        });
      await withManagedMemory(memory, async () => {
        vi.spyOn(memory, "reserve").mockImplementation((...v) => {
          const lease = reserve(...v),
            release = lease.release.bind(lease);
          vi.spyOn(lease, "release").mockImplementation(() => {
            release();
            if (producerFailed) throw Error("secondary cleanup");
          });
          return lease;
        });
        let failure: unknown = "unset";
        try {
          gpu(row, h, params);
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeNull();
        expect(getWork()).toEqual({});
        expect(raw).toEqual(row.params);
        vi.restoreAllMocks();
        const retry = shadowHarness(),
          retryAccesses: string[] = [],
          retryParams = nativeParams(row, retryAccesses).params;
        gpu(row, retry, retryParams);
        expect(sha([retry.records, retryAccesses])).toBe(row.sha256);
      });
      memory.dispose();
      empty(memory);
    }
  }
});
it("retires actual header/entries/filter/uniform/combined or curve backing after adoption null preserving first null over secondary release", async () => {
  for (const cut of [
    "header",
    "entries",
    "filtered",
    "uniforms",
    "combined",
    "pixels",
  ]) {
    const row = originals.find(
        (r) =>
          r.id ===
          (cut === "combined"
            ? "color.gradient-ramp"
            : cut === "pixels"
              ? "color.curves"
              : "color.tint"),
      )!,
      memory = new ManagedMemory(limits),
      getWork = observe(memory),
      adopt = memory.adopt.bind(memory),
      reserve = memory.reserve.bind(memory),
      h = shadowHarness();
    let producerFailed = false;
    let actual: object | undefined,
      work: Work | undefined,
      backing: ArrayBuffer | undefined;
    await withManagedMemory(memory, async () => {
      expect(colorEffectKernel(row.id)).toBeDefined();
      vi.spyOn(memory, "reserve").mockImplementation((...v) => {
        const lease = reserve(...v),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          if (producerFailed) throw Error("secondary cleanup");
        });
        return lease;
      });
      vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) => {
        if (lease.bytes === 16384) work = value as Work;
        const matches =
          cut === "header"
            ? lease.bytes === 16384
            : cut === "entries"
              ? value === work!.entries
              : cut === "filtered"
                ? value === work!.filtered
                : cut === "uniforms"
                  ? value === work!.uniforms
                  : cut === "combined"
                    ? value === work!.combined
                    : value instanceof ArrayBuffer && lease.bytes === 1024;
        if (matches) {
          producerFailed = true;
          actual = value;
          if (value instanceof ArrayBuffer) backing = value;
          throw null;
        }
        return adopt(value, lease, destroy);
      });
      let failure: unknown = "unset";
      try {
        gpu(row, h, row.params);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(work).toEqual({});
      expect(actual).toEqual(
        Array.isArray(actual)
          ? []
          : actual instanceof ArrayBuffer
            ? actual
            : {},
      );
      if (backing) expect(backing.byteLength).toBe(0);
      expect(getWork()).toEqual(cut === "header" ? undefined : {});
    });
    vi.restoreAllMocks();
    memory.dispose();
    empty(memory);
  }
});
it("clears all actual callback roots after original create/upload/pass or curve round null, preserving native null over secondary parent cleanup", async () => {
  for (const cut of ["create", "upload", "pass", "round"]) {
    const row = originals.find(
        (r) =>
          r.id ===
          (cut === "upload" || cut === "round" ? "color.curves" : "color.tint"),
      )!,
      memory = new ManagedMemory(limits),
      getWork = observe(memory),
      adopt = memory.adopt.bind(memory),
      h = shadowHarness(),
      round = Math.round;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) =>
        adopt(
          value,
          lease,
          lease.bytes === 16384
            ? (v) => {
                destroy?.(v);
                throw Error("secondary parent cleanup");
              }
            : destroy,
        ),
      );
      if (cut === "create")
        vi.spyOn(h.context, "createSurface").mockImplementation(() => {
          throw null;
        });
      if (cut === "upload")
        vi.spyOn(h.context, "uploadBytes").mockImplementation(() => {
          throw null;
        });
      if (cut === "pass")
        vi.spyOn(h.context, "pass").mockImplementation(() => {
          throw null;
        });
      if (cut === "round")
        vi.spyOn(Math, "round").mockImplementation((v) => {
          if (getWork()?.pixel.colorOutput) throw null;
          return round(v);
        });
      let failure: unknown = "unset";
      try {
        gpu(row, h, row.params);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(getWork()).toEqual({});
      kernelOnly(memory);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("clears actual callback family after successful parent cleanup null then retries identical native callback", async () => {
  const row = originals.find((r) => r.id === "color.curves")!,
    memory = new ManagedMemory(limits),
    getWork = observe(memory),
    reserve = memory.reserve.bind(memory),
    h = shadowHarness();
  let work: Work | undefined, bytes: Uint8Array<ArrayBuffer> | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "reserve").mockImplementation((...v) => {
      const lease = reserve(...v);
      if (v[1] === 16384) {
        const release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          work = getWork();
          bytes = work!.bytes;
          release();
          throw null;
        });
      }
      return lease;
    });
    let failure: unknown = "unset";
    try {
      gpu(row, h, row.params);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(work).toEqual({});
    expect(bytes!.byteLength).toBe(0);
    kernelOnly(memory);
    vi.restoreAllMocks();
    const retry = shadowHarness(),
      accesses: string[] = [],
      params = nativeParams(row, accesses).params;
    gpu(row, retry, params);
    expect(sha([retry.records, accesses])).toBe(row.sha256);
    kernelOnly(memory);
  });
  memory.dispose();
});
it("rejects large enumerable parameter results before an original value/tuple factory exceeds admitted metadata without an extra ownKeys or descriptor read", async () => {
  const memory = new ManagedMemory({
      ...limits,
      metadata: 32768 + constructorHeadroom,
    }),
    getWork = observe(memory),
    h = shadowHarness(),
    raw: Record<string, number> = {},
    accesses: string[] = [];
  for (let i = 0; i < 1000; i++) raw["unknown" + i] = i;
  let ownKeys = 0,
    descriptors = 0;
  const params = new Proxy(raw, {
    ownKeys(t) {
      ownKeys++;
      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, k) {
      descriptors++;
      return Reflect.getOwnPropertyDescriptor(t, k);
    },
    get(t, k, r) {
      accesses.push(String(k));
      const work = getWork()!;
      expect(work.entriesLease!.bytes).toBeLessThanOrEqual(32768 - 16384);
      return Reflect.get(t, k, r);
    },
  });
  await withManagedMemory(memory, async () => {
    const filler = prewarmWithFiller(memory, "color.tint");
    expect(() =>
      gpu(originals.find((r) => r.id === "color.tint")!, h, params),
    ).toThrow(/metadata/);
    expect(ownKeys).toBe(1);
    expect(descriptors).toBe(accesses.length + 1);
    expect(accesses.length).toBeGreaterThan(0);
    expect(accesses.length).toBeLessThan(1000);
    expect(getWork()).toEqual({});
    releaseFiller(memory, filler);
  });
  memory.dispose();
});

const sha = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
function shadowHarness() {
  let id = 1;
  const records: unknown[] = [];
  const call = (name: string, ...v: unknown[]) => {
    records.push([name, ...v]);
  };
  const pixels = [
    23, 41, 199, 213, 201, 7, 143, 81, 33, 192, 9, 151, 241, 59, 73, 0,
  ];
  const surface = (value: number, w = 2, h = 2) => ({
    id: value,
    width: w,
    height: h,
    canvas: { id: value },
    ctx: {
      getImageData: () => {
        call("read", value);
        return { data: new Uint8ClampedArray(pixels) };
      },
      putImageData: (image: { data: Uint8ClampedArray }, ...v: unknown[]) =>
        call("put", value, [...image.data], ...v),
    },
  });
  const input = surface(1),
    context = {
      createSurface: (w: number, h: number) => {
        const v = surface(++id, w, h);
        call("create", v.id, w, h);
        return v;
      },
      uploadBytes: (v: { id: number }, data: Uint8Array) =>
        call("upload", v.id, [...data]),
      pass: (
        body: string,
        out: { id: number },
        inputs: readonly { id: number }[],
        uniforms: unknown,
      ) =>
        call(
          "pass",
          body.length,
          sha(body),
          out.id,
          inputs.map((v) => v.id),
          JSON.parse(JSON.stringify(uniforms)),
        ),
    };
  return { records, input, context };
}
