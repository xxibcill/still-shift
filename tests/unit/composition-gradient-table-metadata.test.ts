import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { gradientColorTable } from "../../packages/renderer-core/src/composition/render/gradient-controls.ts";
import {
  ManagedMemory,
  type MemoryLease,
} from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
  serializeManagedMetadata,
  type ManagedMetadataText,
} from "../../packages/renderer-core/src/managed-metadata.ts";
type Config = { index: number; mode: string };
type Row = {
  config: Config;
  raw: { startColor: number[]; endColor: number[] };
  byteLength: number;
  sha256: string;
  trace: {
    calls: number;
    sha256: string;
    counts: Record<string, number>;
    prefix: string[];
    suffix: string[];
  };
};
const originals = JSON.parse(
  '[{"config":{"index":0,"mode":"ordinary"},"raw":{"startColor":[0,0.2,0.4,0.15],"endColor":[0.1,0.7,1,1]},"byteLength":262144,"sha256":"862d970d3dcfb8b2550b2374813f46dd6abe5a1b185c991c2cd4a4ecfb398f99","trace":{"calls":786446,"sha256":"091018bdf46f7e6ef4b38e036f8ba86ffc0fc3651a61a68fb65ed7be1074d729","counts":{"p.startColor":1,"p.endColor":1,"startColor.toJSON":1,"startColor.length":1,"startColor.0":131073,"startColor.1":131073,"startColor.2":131073,"startColor.3":131073,"endColor.toJSON":1,"endColor.length":1,"endColor.0":65537,"endColor.1":65537,"endColor.2":65537,"endColor.3":65537},"prefix":["p.startColor","p.endColor","startColor.toJSON","startColor.length","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","endColor.length","endColor.0","endColor.1","endColor.2","endColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1"],"suffix":["endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3"]}},{"config":{"index":1,"mode":"ordinary"},"raw":{"startColor":[0.0625,0.2,0.4,0.15],"endColor":[0.1,0.7,1,0.9375]},"byteLength":262144,"sha256":"0a7121db0b007df37e53896945860b8c76322969744dd25ad5c3ea5a8dedb105","trace":{"calls":786446,"sha256":"091018bdf46f7e6ef4b38e036f8ba86ffc0fc3651a61a68fb65ed7be1074d729","counts":{"p.startColor":1,"p.endColor":1,"startColor.toJSON":1,"startColor.length":1,"startColor.0":131073,"startColor.1":131073,"startColor.2":131073,"startColor.3":131073,"endColor.toJSON":1,"endColor.length":1,"endColor.0":65537,"endColor.1":65537,"endColor.2":65537,"endColor.3":65537},"prefix":["p.startColor","p.endColor","startColor.toJSON","startColor.length","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","endColor.length","endColor.0","endColor.1","endColor.2","endColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1"],"suffix":["endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3"]}},{"config":{"index":2,"mode":"ordinary"},"raw":{"startColor":[0.125,0.2,0.4,0.15],"endColor":[0.1,0.7,1,0.875]},"byteLength":262144,"sha256":"c81c0c5ac4a8e3dc17b49e1dddf91faf0e11ad0f2903fe2817430551c6222dec","trace":{"calls":786446,"sha256":"091018bdf46f7e6ef4b38e036f8ba86ffc0fc3651a61a68fb65ed7be1074d729","counts":{"p.startColor":1,"p.endColor":1,"startColor.toJSON":1,"startColor.length":1,"startColor.0":131073,"startColor.1":131073,"startColor.2":131073,"startColor.3":131073,"endColor.toJSON":1,"endColor.length":1,"endColor.0":65537,"endColor.1":65537,"endColor.2":65537,"endColor.3":65537},"prefix":["p.startColor","p.endColor","startColor.toJSON","startColor.length","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","endColor.length","endColor.0","endColor.1","endColor.2","endColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1"],"suffix":["endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3"]}},{"config":{"index":3,"mode":"ordinary"},"raw":{"startColor":[0.1875,0.2,0.4,0.15],"endColor":[0.1,0.7,1,0.8125]},"byteLength":262144,"sha256":"505ef97e2e9e2cd75deffe2a9284f24312eac9f98c63751027f321dd8ec02c06","trace":{"calls":786446,"sha256":"091018bdf46f7e6ef4b38e036f8ba86ffc0fc3651a61a68fb65ed7be1074d729","counts":{"p.startColor":1,"p.endColor":1,"startColor.toJSON":1,"startColor.length":1,"startColor.0":131073,"startColor.1":131073,"startColor.2":131073,"startColor.3":131073,"endColor.toJSON":1,"endColor.length":1,"endColor.0":65537,"endColor.1":65537,"endColor.2":65537,"endColor.3":65537},"prefix":["p.startColor","p.endColor","startColor.toJSON","startColor.length","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","endColor.length","endColor.0","endColor.1","endColor.2","endColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1"],"suffix":["endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3"]}},{"config":{"index":4,"mode":"ordinary"},"raw":{"startColor":[0.25,0.2,0.4,0.15],"endColor":[0.1,0.7,1,0.75]},"byteLength":262144,"sha256":"422e6ebf11078e955e0a4b17b83320006fbd45b8a4fa33f29c3e3654f424f01b","trace":{"calls":786446,"sha256":"091018bdf46f7e6ef4b38e036f8ba86ffc0fc3651a61a68fb65ed7be1074d729","counts":{"p.startColor":1,"p.endColor":1,"startColor.toJSON":1,"startColor.length":1,"startColor.0":131073,"startColor.1":131073,"startColor.2":131073,"startColor.3":131073,"endColor.toJSON":1,"endColor.length":1,"endColor.0":65537,"endColor.1":65537,"endColor.2":65537,"endColor.3":65537},"prefix":["p.startColor","p.endColor","startColor.toJSON","startColor.length","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","endColor.length","endColor.0","endColor.1","endColor.2","endColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1"],"suffix":["endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3"]}},{"config":{"index":5,"mode":"ordinary"},"raw":{"startColor":[0.3125,0.2,0.4,0.15],"endColor":[0.1,0.7,1,0.6875]},"byteLength":262144,"sha256":"1fae8ef36ea5f6c5ea21a86bc986f4086801d220f83237954c17db775a677596","trace":{"calls":786446,"sha256":"091018bdf46f7e6ef4b38e036f8ba86ffc0fc3651a61a68fb65ed7be1074d729","counts":{"p.startColor":1,"p.endColor":1,"startColor.toJSON":1,"startColor.length":1,"startColor.0":131073,"startColor.1":131073,"startColor.2":131073,"startColor.3":131073,"endColor.toJSON":1,"endColor.length":1,"endColor.0":65537,"endColor.1":65537,"endColor.2":65537,"endColor.3":65537},"prefix":["p.startColor","p.endColor","startColor.toJSON","startColor.length","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","endColor.length","endColor.0","endColor.1","endColor.2","endColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1"],"suffix":["endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3"]}},{"config":{"index":6,"mode":"ordinary"},"raw":{"startColor":[0.375,0.2,0.4,0.15],"endColor":[0.1,0.7,1,0.625]},"byteLength":262144,"sha256":"3d8105e47bbb78e8b5d59a483c8a9515a9edd1ebee6788568b8c18bb428dfebd","trace":{"calls":786446,"sha256":"091018bdf46f7e6ef4b38e036f8ba86ffc0fc3651a61a68fb65ed7be1074d729","counts":{"p.startColor":1,"p.endColor":1,"startColor.toJSON":1,"startColor.length":1,"startColor.0":131073,"startColor.1":131073,"startColor.2":131073,"startColor.3":131073,"endColor.toJSON":1,"endColor.length":1,"endColor.0":65537,"endColor.1":65537,"endColor.2":65537,"endColor.3":65537},"prefix":["p.startColor","p.endColor","startColor.toJSON","startColor.length","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","endColor.length","endColor.0","endColor.1","endColor.2","endColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1"],"suffix":["endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3"]}},{"config":{"index":7,"mode":"ordinary"},"raw":{"startColor":[0.4375,0.2,0.4,0.15],"endColor":[0.1,0.7,1,0.5625]},"byteLength":262144,"sha256":"ab47f001daa889e080a053c2761b7f78694f0f37f9f094d681a76ecac9170f76","trace":{"calls":786446,"sha256":"091018bdf46f7e6ef4b38e036f8ba86ffc0fc3651a61a68fb65ed7be1074d729","counts":{"p.startColor":1,"p.endColor":1,"startColor.toJSON":1,"startColor.length":1,"startColor.0":131073,"startColor.1":131073,"startColor.2":131073,"startColor.3":131073,"endColor.toJSON":1,"endColor.length":1,"endColor.0":65537,"endColor.1":65537,"endColor.2":65537,"endColor.3":65537},"prefix":["p.startColor","p.endColor","startColor.toJSON","startColor.length","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","endColor.length","endColor.0","endColor.1","endColor.2","endColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1"],"suffix":["endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3"]}},{"config":{"index":8,"mode":"ordinary"},"raw":{"startColor":[0.5,0.2,0.4,0.15],"endColor":[0.1,0.7,1,0.5]},"byteLength":262144,"sha256":"46a032c81b2e078b47c42370eb976cd6f1f03d57cd2ba2ed81c2387741ea7d01","trace":{"calls":786446,"sha256":"091018bdf46f7e6ef4b38e036f8ba86ffc0fc3651a61a68fb65ed7be1074d729","counts":{"p.startColor":1,"p.endColor":1,"startColor.toJSON":1,"startColor.length":1,"startColor.0":131073,"startColor.1":131073,"startColor.2":131073,"startColor.3":131073,"endColor.toJSON":1,"endColor.length":1,"endColor.0":65537,"endColor.1":65537,"endColor.2":65537,"endColor.3":65537},"prefix":["p.startColor","p.endColor","startColor.toJSON","startColor.length","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","endColor.length","endColor.0","endColor.1","endColor.2","endColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1"],"suffix":["endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3"]}},{"config":{"index":9,"mode":"ordinary"},"raw":{"startColor":[0.5625,0.2,0.4,0.15],"endColor":[0.1,0.7,1,0.4375]},"byteLength":262144,"sha256":"23cba21eedd1b440d954c277b82d502aad0f7b947430cf845271f295b5451d93","trace":{"calls":786446,"sha256":"091018bdf46f7e6ef4b38e036f8ba86ffc0fc3651a61a68fb65ed7be1074d729","counts":{"p.startColor":1,"p.endColor":1,"startColor.toJSON":1,"startColor.length":1,"startColor.0":131073,"startColor.1":131073,"startColor.2":131073,"startColor.3":131073,"endColor.toJSON":1,"endColor.length":1,"endColor.0":65537,"endColor.1":65537,"endColor.2":65537,"endColor.3":65537},"prefix":["p.startColor","p.endColor","startColor.toJSON","startColor.length","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","endColor.length","endColor.0","endColor.1","endColor.2","endColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1"],"suffix":["endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3"]}},{"config":{"index":9,"mode":"ordinary"},"raw":{"startColor":[0.5625,0.2,0.4,0.15],"endColor":[0.1,0.7,1,0.4375]},"byteLength":262144,"sha256":"23cba21eedd1b440d954c277b82d502aad0f7b947430cf845271f295b5451d93","trace":{"calls":14,"sha256":"65b937a3dc4f9d4812eadb4e7923d206007150bde686e4376ac3984de0651a94","counts":{"p.startColor":1,"p.endColor":1,"startColor.toJSON":1,"startColor.length":1,"startColor.0":1,"startColor.1":1,"startColor.2":1,"startColor.3":1,"endColor.toJSON":1,"endColor.length":1,"endColor.0":1,"endColor.1":1,"endColor.2":1,"endColor.3":1},"prefix":["p.startColor","p.endColor","startColor.toJSON","startColor.length","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","endColor.length","endColor.0","endColor.1","endColor.2","endColor.3"],"suffix":["p.startColor","p.endColor","startColor.toJSON","startColor.length","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","endColor.length","endColor.0","endColor.1","endColor.2","endColor.3"]}},{"config":{"index":0,"mode":"ordinary"},"raw":{"startColor":[0,0.2,0.4,0.15],"endColor":[0.1,0.7,1,1]},"byteLength":262144,"sha256":"862d970d3dcfb8b2550b2374813f46dd6abe5a1b185c991c2cd4a4ecfb398f99","trace":{"calls":786446,"sha256":"091018bdf46f7e6ef4b38e036f8ba86ffc0fc3651a61a68fb65ed7be1074d729","counts":{"p.startColor":1,"p.endColor":1,"startColor.toJSON":1,"startColor.length":1,"startColor.0":131073,"startColor.1":131073,"startColor.2":131073,"startColor.3":131073,"endColor.toJSON":1,"endColor.length":1,"endColor.0":65537,"endColor.1":65537,"endColor.2":65537,"endColor.3":65537},"prefix":["p.startColor","p.endColor","startColor.toJSON","startColor.length","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","endColor.length","endColor.0","endColor.1","endColor.2","endColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1"],"suffix":["endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3"]}},{"config":{"index":0,"mode":"ordinary"},"raw":{"startColor":[0,0.2,0.4,0.15],"endColor":[0.1,0.7,1,1]},"byteLength":262144,"sha256":"862d970d3dcfb8b2550b2374813f46dd6abe5a1b185c991c2cd4a4ecfb398f99","trace":{"calls":14,"sha256":"65b937a3dc4f9d4812eadb4e7923d206007150bde686e4376ac3984de0651a94","counts":{"p.startColor":1,"p.endColor":1,"startColor.toJSON":1,"startColor.length":1,"startColor.0":1,"startColor.1":1,"startColor.2":1,"startColor.3":1,"endColor.toJSON":1,"endColor.length":1,"endColor.0":1,"endColor.1":1,"endColor.2":1,"endColor.3":1},"prefix":["p.startColor","p.endColor","startColor.toJSON","startColor.length","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","endColor.length","endColor.0","endColor.1","endColor.2","endColor.3"],"suffix":["p.startColor","p.endColor","startColor.toJSON","startColor.length","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","endColor.length","endColor.0","endColor.1","endColor.2","endColor.3"]}},{"config":{"index":3,"mode":"long"},"raw":{"startColor":[0.1875,0.2,0.4,0.15,11,12,13,14,15],"endColor":[0.1,0.7,1,0.8125,21,22,23,24,25]},"byteLength":262144,"sha256":"505ef97e2e9e2cd75deffe2a9284f24312eac9f98c63751027f321dd8ec02c06","trace":{"calls":786456,"sha256":"dddad95bdc41c5b0e26417a6a8cc8c9a7ba5611f25453f6ca5c5c0ea9369b140","counts":{"p.startColor":1,"p.endColor":1,"startColor.toJSON":1,"startColor.length":1,"startColor.0":131073,"startColor.1":131073,"startColor.2":131073,"startColor.3":131073,"startColor.4":1,"startColor.5":1,"startColor.6":1,"startColor.7":1,"startColor.8":1,"endColor.toJSON":1,"endColor.length":1,"endColor.0":65537,"endColor.1":65537,"endColor.2":65537,"endColor.3":65537,"endColor.4":1,"endColor.5":1,"endColor.6":1,"endColor.7":1,"endColor.8":1},"prefix":["p.startColor","p.endColor","startColor.toJSON","startColor.length","startColor.0","startColor.1","startColor.2","startColor.3","startColor.4","startColor.5","startColor.6","startColor.7","startColor.8","endColor.toJSON","endColor.length","endColor.0","endColor.1","endColor.2","endColor.3","endColor.4","endColor.5","endColor.6","endColor.7","endColor.8","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2"],"suffix":["endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3","startColor.0","endColor.0","startColor.0","startColor.1","endColor.1","startColor.1","startColor.2","endColor.2","startColor.2","startColor.3","endColor.3","startColor.3"]}},{"config":{"index":4,"mode":"toJSON"},"raw":{"startColor":[0.25,0.2,0.4,0.15],"endColor":[0.1,0.7,1,0.75]},"byteLength":262144,"sha256":"422e6ebf11078e955e0a4b17b83320006fbd45b8a4fa33f29c3e3654f424f01b","trace":{"calls":14,"sha256":"ace4d3f7b8bc9a90587ffaff3655873ddddde382741c6c399c5b084eb76a822a","counts":{"p.startColor":1,"p.endColor":1,"startColor.toJSON":1,"call.startColor.toJSON":1,"startColor.0":1,"startColor.1":1,"startColor.2":1,"startColor.3":1,"endColor.toJSON":1,"call.endColor.toJSON":1,"endColor.0":1,"endColor.1":1,"endColor.2":1,"endColor.3":1},"prefix":["p.startColor","p.endColor","startColor.toJSON","call.startColor.toJSON","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","call.endColor.toJSON","endColor.0","endColor.1","endColor.2","endColor.3"],"suffix":["p.startColor","p.endColor","startColor.toJSON","call.startColor.toJSON","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","call.endColor.toJSON","endColor.0","endColor.1","endColor.2","endColor.3"]}},{"config":{"index":4,"mode":"toJSON"},"raw":{"startColor":[0.25,0.2,0.4,0.15],"endColor":[0.1,0.7,1,0.75]},"byteLength":262144,"sha256":"422e6ebf11078e955e0a4b17b83320006fbd45b8a4fa33f29c3e3654f424f01b","trace":{"calls":14,"sha256":"ace4d3f7b8bc9a90587ffaff3655873ddddde382741c6c399c5b084eb76a822a","counts":{"p.startColor":1,"p.endColor":1,"startColor.toJSON":1,"call.startColor.toJSON":1,"startColor.0":1,"startColor.1":1,"startColor.2":1,"startColor.3":1,"endColor.toJSON":1,"call.endColor.toJSON":1,"endColor.0":1,"endColor.1":1,"endColor.2":1,"endColor.3":1},"prefix":["p.startColor","p.endColor","startColor.toJSON","call.startColor.toJSON","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","call.endColor.toJSON","endColor.0","endColor.1","endColor.2","endColor.3"],"suffix":["p.startColor","p.endColor","startColor.toJSON","call.startColor.toJSON","startColor.0","startColor.1","startColor.2","startColor.3","endColor.toJSON","call.endColor.toJSON","endColor.0","endColor.1","endColor.2","endColor.3"]}}]',
) as Row[];
const limits = { pixels: 4194304, metadata: 2097152 };
type Entry = {
  memory?: ManagedMemory;
  key?: ManagedMetadataText;
  bytes?: Uint8Array<ArrayBuffer>;
};
type Cache = {
  memory?: ManagedMemory;
  entries?: Map<string, Entry>;
  retire?: (entry: Entry) => void;
};
type Phase = {
  managed?: boolean;
  memory?: ManagedMemory;
  cache?: Cache;
  start?: readonly number[];
  end?: readonly number[];
  tuple?: readonly unknown[];
  key?: ManagedMetadataText;
  bytes?: Uint8Array<ArrayBuffer>;
  entry?: Entry;
  producer?: () => Uint8Array<ArrayBuffer>;
  pixelProducer?: () => Uint8Array<ArrayBuffer>;
  entryProducer?: () => Entry;
  pixelLease?: MemoryLease;
};
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function trace(
  config: Config,
  before?: (key: string, index: number) => void,
  collect = true,
) {
  const hash = createHash("sha256"),
    counts: Record<string, number> = {},
    prefix: string[] = [],
    suffix: string[] = [];
  let calls = 0,
    pendingHash = "",
    suffixCursor = 0;
  const record = (key: string) => {
    if (collect) {
      pendingHash += key + "\0";
      if (pendingHash.length >= 65536) {
        hash.update(pendingHash);
        pendingHash = "";
      }
      counts[key] = (counts[key] ?? 0) + 1;
      if (prefix.length < 32) prefix.push(key);
      if (suffix.length < 32) suffix.push(key);
      else {
        suffix[suffixCursor] = key;
        suffixCursor = (suffixCursor + 1) % 32;
      }
    }
    const index = calls++;
    before?.(key, index);
  };
  const raw = {
    startColor: [config.index / 16, 0.2, 0.4, 0.15],
    endColor: [0.1, 0.7, 1, (16 - config.index) / 16],
  };
  if (config.mode === "long") {
    raw.startColor.push(11, 12, 13, 14, 15);
    raw.endColor.push(21, 22, 23, 24, 25);
  }
  const child = (key: keyof typeof raw) =>
    new Proxy(raw[key], {
      get(t, k, r) {
        record(key + "." + String(k));
        if (k === "toJSON" && config.mode === "toJSON")
          return function (this: number[]) {
            record("call." + key + ".toJSON");
            return [this[0], this[1], this[2], this[3]];
          };
        return Reflect.get(t, k, r);
      },
    });
  const refs = { startColor: child("startColor"), endColor: child("endColor") },
    params = new Proxy(raw, {
      get(t, k, r) {
        record("p." + String(k));
        return k === "startColor" || k === "endColor"
          ? refs[k]
          : Reflect.get(t, k, r);
      },
    });
  return {
    raw,
    refs,
    params,
    result: () => ({
      calls,
      sha256: hash.update(pendingHash).digest("hex"),
      counts,
      prefix,
      suffix: [...suffix.slice(suffixCursor), ...suffix.slice(0, suffixCursor)],
    }),
  };
}
function observe(memory: ManagedMemory) {
  const adopt = memory.adopt.bind(memory);
  let phase: Phase | undefined, cache: Cache | undefined;
  const entries: Entry[] = [],
    keys: { value: string | undefined }[] = [];
  vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) => {
    if (lease.bytes === 8192) phase = value as Phase;
    if (lease.bytes === 4096) cache = value as Cache;
    if (lease.bytes === 2048) entries.push(value as Entry);
    if (lease.bytes === 128) keys.push(value as { value: string | undefined });
    return adopt(value, lease, destroy);
  });
  return { phase: () => phase, cache: () => cache, entries, keys };
}
afterEach(() => vi.restoreAllMocks());
it("preserves all 16 independently frozen original complete table bytes and getter hashes through native hits/evictions, long arrays and toJSON active/inactive with the original eight-entry bound", async () => {
  for (const active of [false, true]) {
    const memory = new ManagedMemory(limits),
      seen = observe(memory),
      outputs: Uint8Array<ArrayBuffer>[] = [];
    const run = async () => {
      if (active) memory.beginScratch();
      for (const row of originals) {
        const t = trace(row.config),
          bytes = gradientColorTable(t.params);
        expect(bytes.byteLength).toBe(row.byteLength);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(
          row.sha256,
        );
        expect(t.result()).toEqual(row.trace);
        expect(t.raw).toEqual(row.raw);
        outputs.push(bytes);
        if (active) {
          expect(seen.phase()).toEqual({});
          expect(memory.owns(bytes.buffer)).toBe(true);
          expect(seen.cache()!.entries!.size).toBeLessThanOrEqual(8);
          expect(memory.statistics.current.pixels).toBeLessThanOrEqual(
            8 * 262144,
          );
        }
      }
      if (active) {
        const before = memory.statistics.current;
        memory.endScratch();
        expect(memory.statistics.current).toEqual(before);
      }
    };
    if (active) await withManagedMemory(memory, run);
    else await run();
    memory.dispose();
    empty(memory);
    if (active) {
      expect(seen.cache()).toEqual({});
      for (const entry of seen.entries) expect(entry).toEqual({});
      for (const key of seen.keys) expect(key.value).toBeUndefined();
      for (const bytes of outputs) expect(bytes.byteLength).toBe(0);
    }
    vi.restoreAllMocks();
  }
});
it("rejects exact phase/cache/key-header/entry and pixel quota cuts before their original factories and before interpolation math", async () => {
  const config = originals[0]!.config,
    raw = originals[0]!.raw,
    keyBytes = 128 + 2 * JSON.stringify([raw.startColor, raw.endColor]).length;
  for (const cut of ["phase", "cache", "key", "entry", "pixels"]) {
    const quota =
        cut === "phase"
          ? 8191
          : cut === "cache"
            ? 12287
            : cut === "key"
              ? 12415
              : cut === "entry"
                ? 8192 + 4096 + keyBytes + 2048 - 1
                : limits.metadata,
      memory = new ManagedMemory({
        ...limits,
        metadata: quota,
        pixels: cut === "pixels" ? 262143 : limits.pixels,
      }),
      seen = observe(memory),
      t = trace(config);
    await withManagedMemory(memory, async () => {
      const round = vi.spyOn(Math, "round");
      expect(() => gradientColorTable(t.params)).toThrow(/metadata|pixels/);
      expect(round).not.toHaveBeenCalled();
      const actual = t.result();
      expect(actual.calls).toBe(
        cut === "phase" || cut === "cache" ? 0 : cut === "key" ? 2 : 14,
      );
      if (seen.phase()) expect(seen.phase()).toEqual({});
      if (seen.cache()) expect(seen.cache()).toEqual({});
      empty(memory);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("captures actual Map/borrowed refs/tuple/key record/entry/view and producer before original factories and keeps independent cache owners outside scope with another allocator active", async () => {
  const memory = new ManagedMemory(limits),
    second = new ManagedMemory(limits),
    seen = observe(memory);
  let bytes: Uint8Array<ArrayBuffer> | undefined,
    keyRecord: { value: string | undefined } | undefined;
  const t = trace(originals[0]!.config, (_key, index) => {
    if (index > 14) return;
    const phase = seen.phase()!;
    expect(memory.owns(phase)).toBe(true);
    expect(memory.owns(seen.cache()!)).toBe(true);
    expect(typeof phase.producer).toBe("function");
    if (index === 0) expect(phase.start).toBeUndefined();
    if (index === 1) expect(phase.start === t.refs.startColor).toBe(true);
    if (index === 2) {
      expect(phase.end === t.refs.endColor).toBe(true);
      expect(phase.tuple?.[0] === t.refs.startColor).toBe(true);
      expect(phase.tuple?.[1] === t.refs.endColor).toBe(true);
      keyRecord = seen.keys[0];
      expect(memory.owns(keyRecord!)).toBe(true);
      expect(keyRecord!.value).toBe("");
    }
    if (index === 14) {
      expect(phase.entry).toBe(seen.entries[0]);
      expect(memory.owns(phase.entry!)).toBe(true);
      expect(phase.entry!.bytes).toBe(phase.bytes);
      expect(memory.owns(phase.bytes!.buffer)).toBe(true);
      expect(typeof phase.pixelProducer).toBe("function");
      expect(typeof phase.entryProducer).toBe("function");
      expect(phase.pixelLease!.active).toBe(true);
    }
  });
  await withManagedMemory(memory, async () => {
    bytes = gradientColorTable(t.params);
    expect(seen.phase()).toEqual({});
    expect(seen.entries[0]!.bytes).toBe(bytes);
    expect(keyRecord!.value).toBe(seen.entries[0]!.key!.value);
  });
  expect(t.result()).toEqual(originals[0]!.trace);
  await withManagedMemory(second, async () => {
    expect(memory.owns(bytes!.buffer)).toBe(true);
    expect(second.owns(bytes!.buffer)).toBe(false);
    memory.dispose();
    expect(bytes!.byteLength).toBe(0);
    expect(seen.entries[0]).toEqual({});
    expect(seen.cache()).toEqual({});
    expect(keyRecord!.value).toBeUndefined();
    empty(memory);
    empty(second);
  });
  second.dispose();
});
it("clears actual partial keys/records/Map/view after all original JSON getters and early/mid/late interpolation or round nulls, preserving first null over secondary cleanup and retry", async () => {
  const total = originals[0]!.trace.calls,
    cuts: (number | string)[] = [
      ...Array.from({ length: 14 }, (_, i) => i),
      14,
      15,
      16,
      Math.floor(total / 2),
      total - 3,
      total - 2,
      total - 1,
      "round-1",
      "round-131072",
      "round-262144",
    ];
  for (const cut of cuts) {
    const memory = new ManagedMemory(limits),
      seen = observe(memory),
      reserve = memory.reserve.bind(memory),
      t = trace(
        originals[0]!.config,
        (_key, index) => {
          if (index === cut) throw null;
        },
        false,
      ),
      originalRound = Math.round;
    let calls = 0,
      view: Uint8Array<ArrayBuffer> | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "reserve").mockImplementation((...v) => {
        const lease = reserve(...v),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw Error("secondary cleanup");
        });
        return lease;
      });
      let failure: unknown = "unset";
      try {
        if (typeof cut === "string")
          Math.round = (v) => {
            view = seen.phase()!.bytes;
            if (++calls === Number(cut.split("-")[1])) throw null;
            return originalRound(v);
          };
        gradientColorTable(t.params);
      } catch (error) {
        failure = error;
      } finally {
        Math.round = originalRound;
      }
      expect(failure).toBeNull();
      expect(seen.phase()).toEqual({});
      if (seen.cache()) expect(seen.cache()).toEqual({});
      for (const entry of seen.entries) expect(entry).toEqual({});
      for (const key of seen.keys) expect(key.value).toBeUndefined();
      if (view) expect(view.byteLength).toBe(0);
      empty(memory);
      vi.restoreAllMocks();
      const retry = gradientColorTable(originals[0]!.raw);
      expect(createHash("sha256").update(retry).digest("hex")).toBe(
        originals[0]!.sha256,
      );
    });
    memory.dispose();
    empty(memory);
  }
});
it("clears actual phase/cache/key/entry/backing after every adoption null including the original pixel helper gap, preserving null over secondary release", async () => {
  for (const cut of [8192, 4096, 128, 2048, 262144]) {
    const memory = new ManagedMemory(limits),
      adopt = memory.adopt.bind(memory),
      reserve = memory.reserve.bind(memory);
    let phase: Phase | undefined,
      cache: Cache | undefined,
      entry: Entry | undefined,
      key: { value: string | undefined } | undefined,
      backing: ArrayBuffer | undefined;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "reserve").mockImplementation((...v) => {
        const lease = reserve(...v),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw Error("secondary cleanup");
        });
        return lease;
      });
      vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) => {
        if (lease.bytes === 8192) phase = value as Phase;
        if (lease.bytes === 4096) cache = value as Cache;
        if (lease.bytes === 128) key = value as { value: string | undefined };
        if (lease.bytes === 2048) entry = value as Entry;
        if (lease.bytes === 262144) {
          backing = value as ArrayBuffer;
          expect(phase!.bytes!.buffer).toBe(backing);
        }
        if (lease.bytes === cut) throw null;
        return adopt(value, lease, destroy);
      });
      let failure: unknown = "unset";
      try {
        gradientColorTable(trace(originals[0]!.config).params);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(phase).toEqual({});
      if (cache) expect(cache).toEqual({});
      if (entry) expect(entry).toEqual({});
      if (key) expect(key.value).toBeUndefined();
      if (backing) expect(backing.byteLength).toBe(0);
      empty(memory);
      vi.restoreAllMocks();
      const retry = gradientColorTable(originals[0]!.raw);
      expect(createHash("sha256").update(retry).digest("hex")).toBe(
        originals[0]!.sha256,
      );
    });
    memory.dispose();
    empty(memory);
  }
});
it("rolls back actual candidate entries after native Map insertion null while preserving a prior valid table or clearing a newly created cache", async () => {
  for (const prior of [false, true])
    for (const afterMutation of [false, true]) {
      const memory = new ManagedMemory(limits),
        seen = observe(memory);
      let previous: Uint8Array<ArrayBuffer> | undefined,
        baseline: { pixels: number; metadata: number } | undefined;
      await withManagedMemory(memory, async () => {
        if (prior) {
          previous = gradientColorTable(trace(originals[0]!.config).params);
          baseline = memory.statistics.current;
          const entries = seen.cache()!.entries!,
            set = entries.set.bind(entries);
          vi.spyOn(entries, "set").mockImplementationOnce((...args) => {
            if (afterMutation) set(...args);
            throw null;
          });
        } else {
          const adopt = memory.adopt.bind(memory);
          vi.spyOn(memory, "adopt").mockImplementation(
            (value, lease, destroy) => {
              const result = adopt(value, lease, destroy);
              if (lease.bytes === 4096) {
                const entries = (value as Cache).entries!,
                  set = entries.set.bind(entries);
                vi.spyOn(entries, "set").mockImplementationOnce((...args) => {
                  if (afterMutation) set(...args);
                  throw null;
                });
              }
              return result;
            },
          );
        }
        let failure: unknown = "unset";
        try {
          gradientColorTable(trace(originals[1]!.config).params);
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeNull();
        expect(seen.phase()).toEqual({});
        if (prior) {
          expect(previous!.byteLength).toBe(262144);
          expect(memory.statistics.current).toEqual(baseline);
          expect(seen.cache()!.entries!.size).toBe(1);
        } else empty(memory);
        vi.restoreAllMocks();
        const retry = gradientColorTable(originals[1]!.raw);
        expect(createHash("sha256").update(retry).digest("hex")).toBe(
          originals[1]!.sha256,
        );
      });
      memory.dispose();
      empty(memory);
    }
});
it("retires original oldest entry and failed candidate after eviction cleanup null, leaves seven valid entries and permits exact retry without stale keys", async () => {
  const memory = new ManagedMemory(limits),
    seen = observe(memory),
    adopt = memory.adopt.bind(memory),
    outputs: Uint8Array<ArrayBuffer>[] = [];
  let first = true,
    candidate: Uint8Array<ArrayBuffer> | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) => {
      if (lease.bytes === 2048 && first) {
        first = false;
        return adopt(value, lease, (v) => {
          destroy?.(v);
          throw null;
        });
      }
      if (lease.bytes === 262144 && outputs.length === 8)
        candidate = seen.phase()!.bytes;
      return adopt(value, lease, destroy);
    });
    for (let i = 0; i < 8; i++)
      outputs.push(gradientColorTable(trace(originals[i]!.config).params));
    let failure: unknown = "unset";
    try {
      gradientColorTable(trace(originals[8]!.config).params);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(outputs[0]!.byteLength).toBe(0);
    expect(candidate!.byteLength).toBe(0);
    expect(seen.cache()!.entries!.size).toBe(7);
    expect(memory.statistics.current.pixels).toBe(7 * 262144);
    vi.restoreAllMocks();
    const retry = gradientColorTable(originals[8]!.raw);
    expect(createHash("sha256").update(retry).digest("hex")).toBe(
      originals[8]!.sha256,
    );
    expect(memory.statistics.current.pixels).toBe(8 * 262144);
  });
  memory.dispose();
  empty(memory);
});
it("rolls back independently inserted actual entry/key/backing and cache after successful temporary cleanup null then permits exact retry", async () => {
  const memory = new ManagedMemory(limits),
    seen = observe(memory),
    reserve = memory.reserve.bind(memory);
  let bytes: Uint8Array<ArrayBuffer> | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "reserve").mockImplementation((...v) => {
      const lease = reserve(...v);
      if (v[1] === 8192) {
        const release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          bytes = seen.entries[0]!.bytes;
          expect(memory.owns(seen.entries[0]!)).toBe(true);
          release();
          throw null;
        });
      }
      return lease;
    });
    let failure: unknown = "unset";
    try {
      gradientColorTable(trace(originals[0]!.config).params);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(bytes!.byteLength).toBe(0);
    expect(seen.phase()).toEqual({});
    expect(seen.cache()).toEqual({});
    expect(seen.entries[0]).toEqual({});
    for (const key of seen.keys) expect(key.value).toBeUndefined();
    empty(memory);
    vi.restoreAllMocks();
    const retry = gradientColorTable(originals[0]!.raw);
    expect(createHash("sha256").update(retry).digest("hex")).toBe(
      originals[0]!.sha256,
    );
  });
  memory.dispose();
  empty(memory);
});
it("retires actual cache Map and every entry/key/backing outside scope despite multiple destructor errors, preserving first null while another allocator is active", async () => {
  const memory = new ManagedMemory(limits),
    second = new ManagedMemory(limits),
    seen = observe(memory),
    adopt = memory.adopt.bind(memory),
    outputs: Uint8Array<ArrayBuffer>[] = [];
  let index = 0;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) => {
      if (lease.bytes === 2048) {
        const first = index++ === 0;
        return adopt(value, lease, (v) => {
          destroy?.(v);
          throw first ? null : Error("later cleanup");
        });
      }
      return adopt(value, lease, destroy);
    });
    for (let i = 0; i < 8; i++)
      outputs.push(gradientColorTable(trace(originals[i]!.config).params));
  });
  await withManagedMemory(second, async () => {
    let failure: unknown = "unset";
    try {
      memory.dispose();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    for (const bytes of outputs) expect(bytes.byteLength).toBe(0);
    expect(seen.cache()).toEqual({});
    for (const entry of seen.entries) expect(entry).toEqual({});
    for (const key of seen.keys) expect(key.value).toBeUndefined();
    empty(memory);
    empty(second);
  });
  memory.dispose();
  second.dispose();
});
it("serializes borrowed arrays with native read order and complete native boxed/toJSON/sparse values without an additional length getter", async () => {
  for (const mode of ["boxed", "toJSON", "sparse"]) {
    const build = (reads: string[]) => {
        const raw: unknown[] =
          mode === "boxed"
            ? [
                new Number(1),
                new String('quoted"value'),
                new Boolean(false),
                null,
              ]
            : mode === "sparse"
              ? Array(4)
              : [1, 0.5, 0, 1];
        return new Proxy(raw, {
          get(t, k, r) {
            reads.push(String(k));
            if (k === "toJSON" && mode === "toJSON")
              return function (this: unknown[]) {
                reads.push("call.toJSON");
                return [this[0], this[1], this[2], this[3]];
              };
            return Reflect.get(t, k, r);
          },
        });
      },
      nativeReads: string[] = [],
      native = JSON.stringify([build(nativeReads)]),
      reads: string[] = [],
      memory = new ManagedMemory(limits);
    let text: ManagedMetadataText | undefined;
    await withManagedMemory(memory, async () => {
      const phase = allocateRenderMetadata(8192, () => ({}));
      text = serializeManagedMetadata(memory, [build(reads)], undefined, false);
      expect(text.value).toBe(native);
      expect(reads).toEqual(nativeReads);
      expect(memory.statistics.current.metadata).toBe(
        8192 + 128 + 2 * native.length,
      );
      releaseRenderMetadata(phase);
    });
    text!.release();
    empty(memory);
    memory.dispose();
  }
});
