import { afterEach, expect, it, vi } from "vitest";
import { fractalNoiseColor } from "../../packages/renderer-core/src/composition/render/noise-effects.ts";
import {
  ManagedMemory,
  type MemoryLease,
} from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import {
  allocateRenderMetadata,
  allocateManagedRenderMetadata,
  releaseRenderMetadata,
} from "../../packages/renderer-core/src/managed-metadata.ts";
type Params = Parameters<typeof fractalNoiseColor>[1];
type Row = {
  params: Params;
  value: number;
  rgb: number[];
  rgbKeys: string[];
  output: number[];
  outputKeys: string[];
  accesses: string[];
  has: string[];
};
const originals = JSON.parse(
  '[{"params":{"contrast":1,"brightness":0,"amount":1,"dark":[0,0,0,1],"light":[1,1,1,1]},"value":0,"rgb":[0.2,0.4,0.6],"rgbKeys":["0","1","2"],"output":[0,0,0],"outputKeys":["0","1","2"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2"],"has":["0","1","2"]},{"params":{"contrast":1,"brightness":0,"amount":1,"dark":[0,0,0,1],"light":[1,1,1,1]},"value":12345,"rgb":[0.2,0.4,0.6],"rgbKeys":["0","1","2"],"output":[0.18837262531471732,0.18837262531471732,0.18837262531471732],"outputKeys":["0","1","2"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2"],"has":["0","1","2"]},{"params":{"contrast":1,"brightness":0,"amount":1,"dark":[0,0,0,1],"light":[1,1,1,1]},"value":32768,"rgb":[0.2,0.4,0.6],"rgbKeys":["0","1","2"],"output":[0.5000076295109483,0.5000076295109483,0.5000076295109483],"outputKeys":["0","1","2"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2"],"has":["0","1","2"]},{"params":{"contrast":1,"brightness":0,"amount":1,"dark":[0,0,0,1],"light":[1,1,1,1]},"value":65535,"rgb":[0.2,0.4,0.6],"rgbKeys":["0","1","2"],"output":[1,1,1],"outputKeys":["0","1","2"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2"],"has":["0","1","2"]},{"params":{"contrast":3.25,"brightness":-0.2,"amount":0.7,"dark":[0.2,0.8,0.1,0.3],"light":[0.9,0.1,0.7,0.6]},"value":0,"rgb":[0.2,0.4,0.6],"rgbKeys":["0","1","2"],"output":[0.2,0.48400000000000004,0.495],"outputKeys":["0","1","2"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2"],"has":["0","1","2"]},{"params":{"contrast":3.25,"brightness":-0.2,"amount":0.7,"dark":[0.2,0.8,0.1,0.3],"light":[0.9,0.1,0.7,0.6]},"value":12345,"rgb":[0.2,0.4,0.6],"rgbKeys":["0","1","2"],"output":[0.2,0.48400000000000004,0.495],"outputKeys":["0","1","2"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2"],"has":["0","1","2"]},{"params":{"contrast":3.25,"brightness":-0.2,"amount":0.7,"dark":[0.2,0.8,0.1,0.3],"light":[0.9,0.1,0.7,0.6]},"value":32768,"rgb":[0.2,0.4,0.6],"rgbKeys":["0","1","2"],"output":[0.25733583208855,0.4518662507679389,0.5126423953624317],"outputKeys":["0","1","2"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2"],"has":["0","1","2"]},{"params":{"contrast":3.25,"brightness":-0.2,"amount":0.7,"dark":[0.2,0.8,0.1,0.3],"light":[0.9,0.1,0.7,0.6]},"value":65535,"rgb":[0.2,0.4,0.6],"rgbKeys":["0","1","2"],"output":[0.494,0.274,0.642],"outputKeys":["0","1","2"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2"],"has":["0","1","2"]},{"params":{"contrast":8,"brightness":1,"amount":0,"dark":[0.9,0.3,0.1,0.4],"light":[0.2,0.5,0.8,1]},"value":0,"rgb":[0.2,0.4,0.6],"rgbKeys":["0","1","2"],"output":[0.2,0.4,0.6],"outputKeys":["0","1","2"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2"],"has":["0","1","2"]},{"params":{"contrast":8,"brightness":1,"amount":0,"dark":[0.9,0.3,0.1,0.4],"light":[0.2,0.5,0.8,1]},"value":12345,"rgb":[0.2,0.4,0.6],"rgbKeys":["0","1","2"],"output":[0.2,0.4,0.6],"outputKeys":["0","1","2"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2"],"has":["0","1","2"]},{"params":{"contrast":8,"brightness":1,"amount":0,"dark":[0.9,0.3,0.1,0.4],"light":[0.2,0.5,0.8,1]},"value":32768,"rgb":[0.2,0.4,0.6],"rgbKeys":["0","1","2"],"output":[0.2,0.4,0.6],"outputKeys":["0","1","2"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2"],"has":["0","1","2"]},{"params":{"contrast":8,"brightness":1,"amount":0,"dark":[0.9,0.3,0.1,0.4],"light":[0.2,0.5,0.8,1]},"value":65535,"rgb":[0.2,0.4,0.6],"rgbKeys":["0","1","2"],"output":[0.2,0.4,0.6],"outputKeys":["0","1","2"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2"],"has":["0","1","2"]},{"params":{"contrast":0.1,"brightness":-1,"amount":0.5,"dark":[0.7,0.2,0.4,0.8],"light":[0.4,0.8,0.2,0.1]},"value":0,"rgb":[0.2,0.4,0.6],"rgbKeys":["0","1","2"],"output":[0.4,0.32,0.52],"outputKeys":["0","1","2"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2"],"has":["0","1","2"]},{"params":{"contrast":0.1,"brightness":-1,"amount":0.5,"dark":[0.7,0.2,0.4,0.8],"light":[0.4,0.8,0.2,0.1]},"value":12345,"rgb":[0.2,0.4,0.6],"rgbKeys":["0","1","2"],"output":[0.4,0.32,0.52],"outputKeys":["0","1","2"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2"],"has":["0","1","2"]},{"params":{"contrast":0.1,"brightness":-1,"amount":0.5,"dark":[0.7,0.2,0.4,0.8],"light":[0.4,0.8,0.2,0.1]},"value":32768,"rgb":[0.2,0.4,0.6],"rgbKeys":["0","1","2"],"output":[0.4,0.32,0.52],"outputKeys":["0","1","2"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2"],"has":["0","1","2"]},{"params":{"contrast":0.1,"brightness":-1,"amount":0.5,"dark":[0.7,0.2,0.4,0.8],"light":[0.4,0.8,0.2,0.1]},"value":65535,"rgb":[0.2,0.4,0.6],"rgbKeys":["0","1","2"],"output":[0.4,0.32,0.52],"outputKeys":["0","1","2"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2"],"has":["0","1","2"]},{"params":{"contrast":1.25,"brightness":-0.1,"amount":0.7,"dark":[0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1],"light":[1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9]},"value":23456,"rgb":[],"rgbKeys":[],"output":[],"outputKeys":[],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor"],"has":[]},{"params":{"contrast":1.25,"brightness":-0.1,"amount":0.7,"dark":[0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1],"light":[1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9]},"value":23456,"rgb":[0],"rgbKeys":["0"],"output":[0.06055146018009685],"outputKeys":["0"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0"],"has":["0"]},{"params":{"contrast":1.25,"brightness":-0.1,"amount":0.7,"dark":[0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1],"light":[1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9]},"value":23456,"rgb":[0,0.1,0.2,0.3],"rgbKeys":["0","1","2","3"],"output":[0.06055146018009685,0.14844116814407748,0.23633087610805814,0.32422058407203874],"outputKeys":["0","1","2","3"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2","rgb.3"],"has":["0","1","2","3"]},{"params":{"contrast":1.25,"brightness":-0.1,"amount":0.7,"dark":[0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1],"light":[1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9]},"value":23456,"rgb":[0,0.1,0.2,0.3,0.4,0.5,0.6],"rgbKeys":["0","1","2","3","4","5","6"],"output":[0.06055146018009685,0.14844116814407748,0.23633087610805814,0.32422058407203874,0.4121102920360194,0.5,0.5878897079639807],"outputKeys":["0","1","2","3","4","5","6"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2","rgb.3","rgb.4","rgb.5","rgb.6"],"has":["0","1","2","3","4","5","6"]},{"params":{"contrast":1.25,"brightness":-0.1,"amount":0.7,"dark":[0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1,0.2,0.3,0.4,0.5,0.6,0,0.1],"light":[1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9,0.8,0.7,0.6,0.5,0.4,1,0.9]},"value":23456,"rgb":[0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1,0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1,0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1,0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1,0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1,0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8],"rgbKeys":["0","1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40","41","42","43","44","45","46","47","48","49","50","51","52","53","54","55","56","57","58","59","60","61","62","63"],"output":[0.06055146018009685,0.14844116814407748,0.23633087610805814,0.32422058407203874,0.4121102920360194,0.5,0.5878897079639807,0.5699621338659135,0.6578518418298943,0.7457415497938749,0.8336312577578555,0.12101847850126693,0.20890818646524756,0.2967978944292282,0.27887032033116116,0.3667600282951418,0.45464973625912247,0.5425394442231031,0.6304291521870836,0.7183188601510644,0.8062085681150449,0.7882809940169779,0.07566821476038936,0.16355792272437003,0.25144763068835063,0.33933733865233123,0.4272270466163119,0.5151167545802925,0.4971891804822255,0.5850788884462061,0.6729685964101868,0.7608583043741675,0.848748012338148,0.13613523308155945,0.2240249410455401,0.20609736694747308,0.2939870749114537,0.38187678287543436,0.46976649083941496,0.5576561988033956,0.6455459067673762,0.7334356147313569,0.7155080406332899,0.8033977485972705,0.09078496934068189,0.17867467730466252,0.2665643852686431,0.3544540932326238,0.44234380119660444,0.4244162270985374,0.512305935062518,0.6001956430264986,0.6880853509904793,0.77597505895446,0.8638647669184405,0.15125198766185197,0.13332441356378497,0.2212141215277656,0.3091038294917462,0.39699353745572685,0.48488324541970745,0.572772953383688,0.6606626613476687,0.6427350872496018],"outputKeys":["0","1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40","41","42","43","44","45","46","47","48","49","50","51","52","53","54","55","56","57","58","59","60","61","62","63"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.1","rgb.2","rgb.3","rgb.4","rgb.5","rgb.6","rgb.7","rgb.8","rgb.9","rgb.10","rgb.11","rgb.12","rgb.13","rgb.14","rgb.15","rgb.16","rgb.17","rgb.18","rgb.19","rgb.20","rgb.21","rgb.22","rgb.23","rgb.24","rgb.25","rgb.26","rgb.27","rgb.28","rgb.29","rgb.30","rgb.31","rgb.32","rgb.33","rgb.34","rgb.35","rgb.36","rgb.37","rgb.38","rgb.39","rgb.40","rgb.41","rgb.42","rgb.43","rgb.44","rgb.45","rgb.46","rgb.47","rgb.48","rgb.49","rgb.50","rgb.51","rgb.52","rgb.53","rgb.54","rgb.55","rgb.56","rgb.57","rgb.58","rgb.59","rgb.60","rgb.61","rgb.62","rgb.63"],"has":["0","1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33","34","35","36","37","38","39","40","41","42","43","44","45","46","47","48","49","50","51","52","53","54","55","56","57","58","59","60","61","62","63"]},{"params":{"contrast":1,"brightness":0,"amount":1,"dark":[0,0,0,1],"light":[1,1,1,1]},"value":12345,"rgb":[0.2,null,0.6],"rgbKeys":["0","2"],"output":[0.18837262531471732,null,0.18837262531471732],"outputKeys":["0","2"],"accesses":["p.contrast","p.brightness","p.dark","p.light","p.amount","rgb.map","rgb.length","rgb.constructor","rgb.0","rgb.2"],"has":["0","1","2"]}]',
) as Row[];
const limits = { pixels: 1048576, metadata: 2097152 };
type Phase = {
  managed?: boolean;
  producer?: () => number[];
  admitted?: (lease: MemoryLease) => void;
  resultLease?: MemoryLease;
  colorProducer?: (source: number, c: number) => number;
  colorOutput?: number[];
  mapper?: unknown;
  receiver?: readonly number[];
  arguments?: unknown[];
  handler?: ProxyHandler<readonly number[]>;
};
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function observe(memory: ManagedMemory) {
  const adopt = memory.adopt.bind(memory);
  let phase: Phase | undefined;
  vi.spyOn(memory, "adopt").mockImplementation((...args) => {
    if (args[1].bytes === 4096) phase = args[0] as Phase;
    return adopt(...args);
  });
  return () => phase;
}
function sparse(row: Row) {
  const rgb = structuredClone(row.rgb);
  for (let i = 0; i < rgb.length; i++)
    if (!row.rgbKeys.includes(String(i))) delete rgb[i];
  return rgb;
}
afterEach(() => vi.restoreAllMocks());
it("preserves 22 complete original color arrays and params/RGB getter receivers/order/has checks with native length 0/1/3/4/7/64 and sparse holes active and inactive", async () => {
  for (const active of [false, true])
    for (const row of originals) {
      const memory = new ManagedMemory(limits),
        getPhase = observe(memory),
        raw = structuredClone(row.params),
        borrowed = sparse(row),
        accesses: string[] = [],
        has: string[] = [];
      let result: number[] | undefined;
      const rgb: readonly number[] = new Proxy(borrowed, {
        get(t, k, r) {
          expect(r).toBe(rgb);
          accesses.push("rgb." + String(k));
          return Reflect.get(t, k, r);
        },
        has(t, k) {
          has.push(String(k));
          return Reflect.has(t, k);
        },
      });
      const params = new Proxy(raw, {
          get(t, k, r) {
            accesses.push("p." + String(k));
            return Reflect.get(t, k, r);
          },
        }),
        produce = async () => {
          result = fractalNoiseColor(row.value, params, rgb);
        };
      if (active) await withManagedMemory(memory, produce);
      else await produce();
      expect(JSON.stringify(result)).toBe(JSON.stringify(row.output));
      expect(Object.keys(result!)).toEqual(row.outputKeys);
      expect(accesses).toEqual(row.accesses);
      expect(has).toEqual(row.has);
      expect(borrowed).toEqual(sparse(row));
      expect(raw).toEqual(row.params);
      expect(memory.owns(result!)).toBe(active);
      if (active) {
        expect(getPhase()).toEqual({});
        expect(memory.statistics.current.metadata).toBe(
          512 + row.rgb.length * 8,
        );
        releaseRenderMetadata(result!);
        expect(result).toEqual([]);
      }
      empty(memory);
      memory.dispose();
      vi.restoreAllMocks();
    }
});
it("rejects exact phase/result/three-element capacity cuts before corresponding original factories and does not read length twice or start constructor/channels after growth rejection", async () => {
  for (const quota of [4095, 4607, 4631]) {
    const memory = new ManagedMemory({ ...limits, metadata: quota }),
      getPhase = observe(memory),
      row = originals[0]!,
      accesses: string[] = [];
    await withManagedMemory(memory, async () => {
      const reserve = vi.spyOn(memory, "reserve"),
        raw = new Proxy(row.params, {
          get(t, k, r) {
            accesses.push("p." + String(k));
            return Reflect.get(t, k, r);
          },
        }),
        rgb = new Proxy(row.rgb, {
          get(t, k, r) {
            accesses.push("rgb." + String(k));
            return Reflect.get(t, k, r);
          },
        });
      expect(() => fractalNoiseColor(row.value, raw, rgb)).toThrow(/metadata/);
      expect(accesses).toEqual(quota === 4631 ? row.accesses.slice(0, 7) : []);
      expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual(
        quota === 4095
          ? [["metadata", 4096]]
          : [
              ["metadata", 4096],
              ["metadata", 512],
            ],
      );
      if (getPhase()) expect(getPhase()).toEqual({});
      empty(memory);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("holds actual producer/native map receiver/handler/callback/argument tuple and growing result capacity through original getters then retains actual returned array outside scope and with another allocator active", async () => {
  const memory = new ManagedMemory(limits),
    second = new ManagedMemory(limits),
    getPhase = observe(memory),
    row = originals[0]!,
    accesses: string[] = [];
  let result: number[] | undefined,
    handler: Phase["handler"],
    args: Phase["arguments"],
    producer: Phase["colorProducer"];
  await withManagedMemory(memory, async () => {
    const reserve = vi.spyOn(memory, "reserve"),
      params = new Proxy(row.params, {
        get(t, k, r) {
          accesses.push("p." + String(k));
          const phase = getPhase()!;
          expect(memory.owns(phase)).toBe(true);
          expect(memory.statistics.current.metadata).toBe(4608);
          expect(phase.resultLease!.bytes).toBe(512);
          expect(typeof phase.producer).toBe("function");
          return Reflect.get(t, k, r);
        },
      }),
      rgb = new Proxy(row.rgb, {
        get(t, k, r) {
          accesses.push("rgb." + String(k));
          const phase = getPhase()!;
          expect(memory.owns(phase)).toBe(true);
          if (k === "map") expect(phase.colorProducer).toBeUndefined();
          else {
            handler = phase.handler;
            args = phase.arguments;
            producer = phase.colorProducer;
            expect(typeof handler!.get).toBe("function");
            expect(args).toEqual([producer]);
            expect(typeof producer).toBe("function");
            expect(phase.receiver === rgb).toBe(false);
            expect(memory.statistics.current.metadata).toBe(
              k === "length" ? 4608 : 4632,
            );
          }
          return Reflect.get(t, k, r);
        },
      });
    result = fractalNoiseColor(row.value, params, rgb);
    expect(result).toEqual(row.output);
    expect(memory.owns(result)).toBe(true);
    expect(memory.statistics.current.metadata).toBe(536);
    expect(getPhase()).toEqual({});
    expect(handler).toEqual({});
    expect(args).toEqual([]);
    expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual([
      ["metadata", 4096],
      ["metadata", 512],
    ]);
  });
  expect(accesses).toEqual(row.accesses);
  await withManagedMemory(second, async () => {
    expect(memory.owns(result!)).toBe(true);
    expect(second.owns(result!)).toBe(false);
    expect(result).toEqual(row.output);
    releaseRenderMetadata(result!);
    expect(result).toEqual([]);
    empty(memory);
    empty(second);
  });
  memory.dispose();
  second.dispose();
});
it("clears actual phase/map callback/receiver/handler/arguments after original params/map/length/constructor/channel/coercion or clamp null preserving null over secondary cleanup with exact retry", async () => {
  for (const cut of [
    "p.contrast",
    "p.brightness",
    "p.dark",
    "p.light",
    "p.amount",
    "rgb.map",
    "rgb.length",
    "rgb.constructor",
    "rgb.0",
    "rgb.1",
    "coercion",
    "clamp-field",
    "clamp-first",
    "clamp-last",
  ]) {
    const memory = new ManagedMemory(limits),
      getPhase = observe(memory),
      reserve = memory.reserve.bind(memory),
      row = originals[0]!,
      raw = structuredClone(row.params),
      borrowed = structuredClone(row.rgb);
    let handler: Phase["handler"], args: Phase["arguments"];
    const capture = () => {
      handler = getPhase()!.handler;
      args = getPhase()!.arguments;
      throw null;
    };
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "reserve").mockImplementation((...v) => {
        const lease = reserve(...v),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw Error("secondary metadata cleanup");
        });
        return lease;
      });
      const params = new Proxy(raw, {
          get(t, k, r) {
            if ("p." + String(k) === cut) return capture();
            return Reflect.get(t, k, r);
          },
        }),
        rgb = new Proxy(borrowed, {
          get(t, k, r) {
            if ("rgb." + String(k) === cut) return capture();
            if (k === "length" && cut === "coercion")
              return { valueOf: capture };
            return Reflect.get(t, k, r);
          },
        });
      if (cut.startsWith("clamp")) {
        const min = Math.min;
        let calls = 0;
        const failAt =
          cut === "clamp-field" ? 1 : cut === "clamp-first" ? 2 : 4;
        vi.spyOn(Math, "min").mockImplementation((...v) =>
          ++calls === failAt ? capture() : min(...v),
        );
      }
      let failure: unknown = "unset";
      try {
        fractalNoiseColor(row.value, params, rgb);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(getPhase()).toEqual({});
      if (handler) expect(handler).toEqual({});
      if (args) expect(args).toEqual([]);
      expect(raw).toEqual(row.params);
      expect(borrowed).toEqual(row.rgb);
      empty(memory);
      vi.restoreAllMocks();
      const retry = fractalNoiseColor(row.value, row.params, row.rgb);
      expect(retry).toEqual(row.output);
      releaseRenderMetadata(retry);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual phase header or completed adopted color array after adoption null preserving null over secondary cleanup and exact retry", async () => {
  for (const cut of [4096, 536]) {
    const memory = new ManagedMemory(limits),
      adopt = memory.adopt.bind(memory),
      reserve = memory.reserve.bind(memory),
      row = originals[0]!;
    let phase: Phase | undefined,
      actual: object | undefined,
      handler: Phase["handler"],
      args: Phase["arguments"];
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "reserve").mockImplementation((...v) => {
        const lease = reserve(...v),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw Error("secondary metadata cleanup");
        });
        return lease;
      });
      vi.spyOn(memory, "adopt").mockImplementation((...v) => {
        if (v[1].bytes === 4096) phase = v[0] as Phase;
        if (v[1].bytes === cut) {
          actual = v[0];
          if (cut === 536) {
            expect(actual).toBe(phase!.colorOutput);
            expect(actual).toEqual(row.output);
            handler = phase!.handler;
            args = phase!.arguments;
          }
          throw null;
        }
        return adopt(...v);
      });
      let failure: unknown = "unset";
      try {
        fractalNoiseColor(row.value, row.params, row.rgb);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(actual).toEqual(cut === 4096 ? {} : []);
      expect(phase).toEqual({});
      if (handler) expect(handler).toEqual({});
      if (args) expect(args).toEqual([]);
      empty(memory);
      vi.restoreAllMocks();
      const retry = fractalNoiseColor(row.value, row.params, row.rgb);
      expect(retry).toEqual(row.output);
      releaseRenderMetadata(retry);
      empty(memory);
    });
    memory.dispose();
  }
});
it("retires independently adopted actual color result when successful temporary-phase cleanup throws null then permits exact retry", async () => {
  const memory = new ManagedMemory(limits),
    adopt = memory.adopt.bind(memory),
    reserve = memory.reserve.bind(memory),
    row = originals[0]!;
  let phase: Phase | undefined, result: number[] | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((...v) => {
      if (v[1].bytes === 4096) phase = v[0] as Phase;
      else result = v[0] as number[];
      return adopt(...v);
    });
    vi.spyOn(memory, "reserve").mockImplementation((...v) => {
      const lease = reserve(...v);
      if (v[1] === 4096) {
        const release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          expect(phase!.colorOutput).toBeUndefined();
          expect(memory.owns(result!)).toBe(true);
          release();
          throw null;
        });
      }
      return lease;
    });
    let failure: unknown = "unset";
    try {
      fractalNoiseColor(row.value, row.params, row.rgb);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(phase).toEqual({});
    expect(result).toEqual([]);
    empty(memory);
    vi.restoreAllMocks();
    const retry = fractalNoiseColor(row.value, row.params, row.rgb);
    expect(retry).toEqual(row.output);
    releaseRenderMetadata(retry);
    empty(memory);
  });
  memory.dispose();
});
it("clears actual color result at consumer/scratch/allocator retirement outside scope before propagating first result cleanup null", async () => {
  for (const route of ["consumer", "scratch", "allocator"]) {
    const memory = new ManagedMemory(limits),
      adopt = memory.adopt.bind(memory),
      row = originals[0]!;
    let result: number[] | undefined;
    await withManagedMemory(memory, async () => {
      if (route === "scratch") memory.beginScratch();
      vi.spyOn(memory, "adopt").mockImplementation((value, lease, destroy) =>
        adopt(
          value,
          lease,
          lease.bytes !== 4096
            ? (v) => {
                destroy?.(v);
                throw null;
              }
            : destroy,
        ),
      );
      result = fractalNoiseColor(row.value, row.params, row.rgb);
      expect(result).toEqual(row.output);
      expect(memory.owns(result)).toBe(true);
    });
    let failure: unknown = "unset";
    try {
      if (route === "consumer") releaseRenderMetadata(result!);
      else if (route === "scratch") memory.endScratch();
      else memory.dispose();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(result).toEqual([]);
    empty(memory);
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("keeps provided caller map receiver and original property lookup-before-callback behavior using one actual admitted owner without extra result/phase leases", async () => {
  const memory = new ManagedMemory(limits),
    row = originals[0]!;
  await withManagedMemory(memory, async () => {
    const reserve = vi.spyOn(memory, "reserve"),
      work = allocateRenderMetadata<Phase>(
        4096,
        () => ({}),
        false,
        (v) => {
          if (v.colorOutput) v.colorOutput.length = 0;
          for (const key in v) delete v[key as keyof Phase];
        },
      ),
      nativeMap = Array.prototype.map;
    const rgb: readonly number[] = new Proxy(row.rgb, {
      get(t, k, r) {
        expect(r).toBe(rgb);
        expect(memory.owns(work)).toBe(true);
        expect(memory.statistics.current.metadata).toBe(4096);
        if (k === "map") {
          expect(work.colorProducer).toBeUndefined();
          return nativeMap;
        }
        if (k === "length") {
          expect(typeof work.colorProducer).toBe("function");
          expect(work.handler).toBeUndefined();
        }
        return Reflect.get(t, k, r);
      },
    });
    const result = fractalNoiseColor(row.value, row.params, rgb, work);
    expect(result).toEqual(row.output);
    expect(work.colorOutput).toBe(result);
    expect(memory.owns(result)).toBe(false);
    expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual([
      ["metadata", 4096],
    ]);
    releaseRenderMetadata(work);
    expect(work).toEqual({});
    expect(result).toEqual([]);
    empty(memory);
  });
  memory.dispose();
});
it("coerces native borrowed length once and reserves its truncated native extent before species/element factories, including frozen own native map", async () => {
  for (const freeze of [false, true]) {
    const memory = new ManagedMemory(limits),
      row = originals[0]!,
      valueOf = vi.fn(() => 2.9),
      raw = structuredClone(row.rgb);
    if (freeze) {
      Object.defineProperty(raw, "map", {
        value: Array.prototype.map,
        writable: false,
        configurable: false,
      });
      Object.freeze(raw);
    }
    const rgb: readonly number[] = new Proxy(raw, {
      get(t, k, r) {
        expect(r).toBe(rgb);
        if (k === "length" && !freeze) return { valueOf };
        return Reflect.get(t, k, r);
      },
    });
    await withManagedMemory(memory, async () => {
      const result = fractalNoiseColor(row.value, row.params, rgb);
      expect(result).toEqual(freeze ? row.output : row.output.slice(0, 2));
      expect(memory.statistics.current.metadata).toBe(
        512 + (freeze ? 3 : 2) * 8,
      );
      expect(valueOf).toHaveBeenCalledTimes(freeze ? 0 : 1);
      releaseRenderMetadata(result);
      empty(memory);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("preserves admission-hook null over secondary lease cleanup before actual result factory and leaves existing result adoption/release behavior intact on retry", () => {
  const memory = new ManagedMemory(limits),
    reserve = memory.reserve.bind(memory),
    factory = vi.fn(() => [1, 2, 3]);
  vi.spyOn(memory, "reserve").mockImplementation((...v) => {
    const lease = reserve(...v),
      release = lease.release.bind(lease);
    vi.spyOn(lease, "release").mockImplementation(() => {
      release();
      throw Error("secondary metadata cleanup");
    });
    return lease;
  });
  let failure: unknown = "unset";
  try {
    allocateManagedRenderMetadata(
      memory,
      512,
      factory,
      false,
      (v) => {
        v.length = 0;
      },
      (lease) => {
        expect(lease.active).toBe(true);
        expect(lease.bytes).toBe(512);
        throw null;
      },
    );
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeNull();
  expect(factory).not.toHaveBeenCalled();
  empty(memory);
  vi.restoreAllMocks();
  const result = allocateManagedRenderMetadata(
    memory,
    512,
    () => [1, 2, 3],
    false,
    (v) => {
      v.length = 0;
    },
    (lease) => lease.resize(536),
  );
  expect(memory.owns(result)).toBe(true);
  expect(memory.statistics.current.metadata).toBe(536);
  releaseRenderMetadata(result);
  expect(result).toEqual([]);
  empty(memory);
  memory.dispose();
});
it("uses the full ordinary-array result bound before a non-native borrowed map factory while preserving its original receiver when admitted", async () => {
  const row = originals[0]!,
    full = 512 + 8 * 4294967295;
  for (const allowed of [false, true]) {
    const memory = new ManagedMemory({
        ...limits,
        metadata: allowed ? 4096 + full : limits.metadata,
      }),
      getPhase = observe(memory),
      raw = structuredClone(row.rgb),
      map = vi.fn(function (
        this: number[],
        callback: (source: number, c: number) => number,
      ) {
        expect(this).toBe(raw);
        expect(memory.statistics.current.metadata).toBe(4096 + full);
        return [callback(this[0]!, 0)];
      });
    Object.defineProperty(raw, "map", {
      value: map,
      writable: false,
      configurable: false,
    });
    await withManagedMemory(memory, async () => {
      if (allowed) {
        const result = fractalNoiseColor(row.value, row.params, raw);
        expect(result).toEqual([row.output[0]]);
        expect(map).toHaveBeenCalledTimes(1);
        expect(memory.statistics.current.metadata).toBe(full);
        releaseRenderMetadata(result);
        expect(result).toEqual([]);
      } else {
        expect(() => fractalNoiseColor(row.value, row.params, raw)).toThrow(
          /metadata/,
        );
        expect(map).not.toHaveBeenCalled();
      }
      expect(getPhase()).toEqual({});
      expect(raw.slice()).toEqual(row.rgb);
      empty(memory);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
});
