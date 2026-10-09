import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  noiseEffectKernel,
  noiseControls,
  noiseField,
  noiseFieldUniforms,
  fractalNoiseColor,
} from "../../packages/renderer-core/src/composition/render/noise-effects.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import { releaseRenderMetadata } from "../../packages/renderer-core/src/managed-metadata.ts";
export const sha = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function shadowHarness() {
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
type Row = {
  kind: string;
  id?: string;
  params: Record<string, number | number[]>;
  gpu?: boolean;
  calls?: number;
  records?: unknown[];
  sha256: string;
  controls?: ReturnType<typeof noiseControls>;
  uniforms?: Record<string, number | readonly number[]>;
  values?: number[];
  accesses?: string[];
  value?: number;
  rgb?: number[];
  output?: number[];
};
const originals = JSON.parse(
  '[{"kind":"controls","params":{"seed":1,"scale":64,"octaves":4,"evolution":0},"controls":{"seed":1,"inverseScale":16384,"octaves":4,"z":0,"zWeight":0},"uniforms":{"inverseScale":16384,"octaves":4,"seedParts":[1,0],"zParts":[0,0,0]},"values":[28054,29179,30818,20732,15911],"accesses":["evolution","seed","scale","octaves"],"sha256":"224c5b312d0e0b7683af05a698153801da21475ead2bacd7bfff5b19b6af6081"},{"kind":"controls","params":{"seed":0,"scale":1,"octaves":1,"evolution":-216000},"controls":{"seed":0,"inverseScale":1048576,"octaves":1,"z":4294751296,"zWeight":0},"uniforms":{"inverseScale":1048576,"octaves":1,"seedParts":[0,0],"zParts":[46144,65532,0]},"values":[25154,50069,25665,35260,77641],"accesses":["evolution","seed","scale","octaves"],"sha256":"8eb72f1320efd9d89857f94bdde35b41abdc30441101826440cf11cf86f748b1"},{"kind":"controls","params":{"seed":2147483647,"scale":73.25,"octaves":8,"evolution":-215999.123},"controls":{"seed":2147483647,"inverseScale":14315,"octaves":8,"z":4294751296,"zWeight":224},"uniforms":{"inverseScale":14315,"octaves":8,"seedParts":[65535,32767],"zParts":[46144,65532,224]},"values":[27675,27661,21890,30483,31966],"accesses":["evolution","seed","scale","octaves"],"sha256":"929e1544dc9a539248afc1e76ec3c52f04dac39fd7548b5b3fcc0f5292f5402a"},{"kind":"controls","params":{"seed":2147483647,"scale":10000,"octaves":8,"evolution":216000},"controls":{"seed":2147483647,"inverseScale":105,"octaves":8,"z":216000,"zWeight":0},"uniforms":{"inverseScale":105,"octaves":8,"seedParts":[65535,32767],"zParts":[19392,3,0]},"values":[37143,37146,37116,16516,26749],"accesses":["evolution","seed","scale","octaves"],"sha256":"c45846a6e52cfa7d22422e7330c1db0defeb9c4af38283a49beacb0864cf82ba"},{"kind":"controls","params":{"seed":32768,"scale":2.5,"octaves":3,"evolution":0.03125},"controls":{"seed":32768,"inverseScale":419430,"octaves":3,"z":0,"zWeight":8},"uniforms":{"inverseScale":419430,"octaves":3,"seedParts":[32768,0],"zParts":[0,0,8]},"values":[24545,17232,37424,34420,-9066],"accesses":["evolution","seed","scale","octaves"],"sha256":"1f7ffe0dca1601058681650be1fcc534f5fb30b9889634f8d8ac79028ddede48"},{"kind":"controls","params":{"seed":12345,"scale":127.0625,"octaves":7,"evolution":19.875},"controls":{"seed":12345,"inverseScale":8252,"octaves":7,"z":19,"zWeight":224},"uniforms":{"inverseScale":8252,"octaves":7,"seedParts":[12345,0],"zParts":[19,0,224]},"values":[26565,26846,26025,31060,39399],"accesses":["evolution","seed","scale","octaves"],"sha256":"427b22a116c700bad7db22d68b34859edc584e2c68abbe786c8be606a67d9984"},{"kind":"color","params":{"contrast":1,"brightness":0,"amount":1,"dark":[0,0,0,1],"light":[1,1,1,1]},"value":0,"rgb":[0.2,0.4,0.6],"output":[0,0,0],"sha256":"2a08979e8002252124e861b2816490b04fe03b6b779f9287fb7c25652bbc4052"},{"kind":"color","params":{"contrast":1,"brightness":0,"amount":1,"dark":[0,0,0,1],"light":[1,1,1,1]},"value":12345,"rgb":[0.2,0.4,0.6],"output":[0.18837262531471732,0.18837262531471732,0.18837262531471732],"sha256":"c678bf9f8ed0994edb4f8f32ff757939eea7a6d7e1989da67d09cc7fadcba2e7"},{"kind":"color","params":{"contrast":1,"brightness":0,"amount":1,"dark":[0,0,0,1],"light":[1,1,1,1]},"value":32768,"rgb":[0.2,0.4,0.6],"output":[0.5000076295109483,0.5000076295109483,0.5000076295109483],"sha256":"a3f478d96154cc1f6df108d94d5166e33f1f42e41993cdf72811233d5597a1a0"},{"kind":"color","params":{"contrast":1,"brightness":0,"amount":1,"dark":[0,0,0,1],"light":[1,1,1,1]},"value":65535,"rgb":[0.2,0.4,0.6],"output":[1,1,1],"sha256":"9e07ab64261fb6803c6572f7b5c3098ea68fb45873128af820d42a2262eb900b"},{"kind":"color","params":{"contrast":3.25,"brightness":-0.2,"amount":0.7,"dark":[0.2,0.8,0.1,0.3],"light":[0.9,0.1,0.7,0.6]},"value":0,"rgb":[0.2,0.4,0.6],"output":[0.2,0.48400000000000004,0.495],"sha256":"e65034a43069f65264f485a3a586479ccdb323179ed5d1d6f570e66dd988810c"},{"kind":"color","params":{"contrast":3.25,"brightness":-0.2,"amount":0.7,"dark":[0.2,0.8,0.1,0.3],"light":[0.9,0.1,0.7,0.6]},"value":12345,"rgb":[0.2,0.4,0.6],"output":[0.2,0.48400000000000004,0.495],"sha256":"e65034a43069f65264f485a3a586479ccdb323179ed5d1d6f570e66dd988810c"},{"kind":"color","params":{"contrast":3.25,"brightness":-0.2,"amount":0.7,"dark":[0.2,0.8,0.1,0.3],"light":[0.9,0.1,0.7,0.6]},"value":32768,"rgb":[0.2,0.4,0.6],"output":[0.25733583208855,0.4518662507679389,0.5126423953624317],"sha256":"150e75c9e7355c4814c472c0ef15fdf7624e2c736773095d0e4e8e44b99ce2ec"},{"kind":"color","params":{"contrast":3.25,"brightness":-0.2,"amount":0.7,"dark":[0.2,0.8,0.1,0.3],"light":[0.9,0.1,0.7,0.6]},"value":65535,"rgb":[0.2,0.4,0.6],"output":[0.494,0.274,0.642],"sha256":"04bd2505927f1e9ed5e8a617f41f9f3c6ea79f4b1451bc1d7b755d21028ce48e"},{"kind":"color","params":{"contrast":8,"brightness":1,"amount":0,"dark":[0.9,0.3,0.1,0.4],"light":[0.2,0.5,0.8,1]},"value":0,"rgb":[0.2,0.4,0.6],"output":[0.2,0.4,0.6],"sha256":"6b2352b24f827050ea43fb19cf0da63a01151f07268cee46cdc3134a5a52ca4b"},{"kind":"color","params":{"contrast":8,"brightness":1,"amount":0,"dark":[0.9,0.3,0.1,0.4],"light":[0.2,0.5,0.8,1]},"value":12345,"rgb":[0.2,0.4,0.6],"output":[0.2,0.4,0.6],"sha256":"6b2352b24f827050ea43fb19cf0da63a01151f07268cee46cdc3134a5a52ca4b"},{"kind":"color","params":{"contrast":8,"brightness":1,"amount":0,"dark":[0.9,0.3,0.1,0.4],"light":[0.2,0.5,0.8,1]},"value":32768,"rgb":[0.2,0.4,0.6],"output":[0.2,0.4,0.6],"sha256":"6b2352b24f827050ea43fb19cf0da63a01151f07268cee46cdc3134a5a52ca4b"},{"kind":"color","params":{"contrast":8,"brightness":1,"amount":0,"dark":[0.9,0.3,0.1,0.4],"light":[0.2,0.5,0.8,1]},"value":65535,"rgb":[0.2,0.4,0.6],"output":[0.2,0.4,0.6],"sha256":"6b2352b24f827050ea43fb19cf0da63a01151f07268cee46cdc3134a5a52ca4b"},{"kind":"color","params":{"contrast":0.1,"brightness":-1,"amount":0.5,"dark":[0.7,0.2,0.4,0.8],"light":[0.4,0.8,0.2,0.1]},"value":0,"rgb":[0.2,0.4,0.6],"output":[0.4,0.32,0.52],"sha256":"36682f3554896df38ec2cd6cdeba4913cd8fdc20c168f3cb628b91614dfea982"},{"kind":"color","params":{"contrast":0.1,"brightness":-1,"amount":0.5,"dark":[0.7,0.2,0.4,0.8],"light":[0.4,0.8,0.2,0.1]},"value":12345,"rgb":[0.2,0.4,0.6],"output":[0.4,0.32,0.52],"sha256":"36682f3554896df38ec2cd6cdeba4913cd8fdc20c168f3cb628b91614dfea982"},{"kind":"color","params":{"contrast":0.1,"brightness":-1,"amount":0.5,"dark":[0.7,0.2,0.4,0.8],"light":[0.4,0.8,0.2,0.1]},"value":32768,"rgb":[0.2,0.4,0.6],"output":[0.4,0.32,0.52],"sha256":"36682f3554896df38ec2cd6cdeba4913cd8fdc20c168f3cb628b91614dfea982"},{"kind":"color","params":{"contrast":0.1,"brightness":-1,"amount":0.5,"dark":[0.7,0.2,0.4,0.8],"light":[0.4,0.8,0.2,0.1]},"value":65535,"rgb":[0.2,0.4,0.6],"output":[0.4,0.32,0.52],"sha256":"36682f3554896df38ec2cd6cdeba4913cd8fdc20c168f3cb628b91614dfea982"},{"id":"stylize.fractal-noise","params":{"seed":1,"scale":64,"octaves":4,"evolution":0,"contrast":1,"brightness":0,"amount":0,"dark":[0,0,0,1],"light":[1,1,1,1]},"kind":"native","gpu":true,"calls":0,"records":[],"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","accesses":["amount"]},{"id":"stylize.fractal-noise","params":{"seed":1,"scale":64,"octaves":4,"evolution":0,"contrast":1,"brightness":0,"amount":0,"dark":[0,0,0,1],"light":[1,1,1,1]},"kind":"native","gpu":false,"calls":0,"records":[],"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","accesses":["amount"]},{"id":"stylize.fractal-noise","params":{"seed":1,"scale":64,"octaves":4,"evolution":0,"contrast":1,"brightness":0,"amount":1,"dark":[0,0,0,1],"light":[1,1,1,1]},"kind":"native","gpu":true,"calls":2,"records":[["create",2,2,2],["pass",2513,"9ef0b181334f6d4d633a70666e24871a794e7e26721fbd011a4f340932794d67",2,[1],{"inverseScale":16384,"octaves":4,"seedParts":[1,0],"zParts":[0,0,0],"amount":1,"contrast":1,"brightness":0,"dark":[0,0,0,1],"light":[1,1,1,1]}]],"sha256":"5f90ac39428cdae072ee2b4a5d002cd1f1f9db8ec36436ca0f549dc09ca3daa4","accesses":["amount","evolution","seed","scale","octaves","contrast","brightness","dark","light"]},{"id":"stylize.fractal-noise","params":{"seed":1,"scale":64,"octaves":4,"evolution":0,"contrast":1,"brightness":0,"amount":1,"dark":[0,0,0,1],"light":[1,1,1,1]},"kind":"native","gpu":false,"calls":3,"records":[["read",1],["create",2,2,2],["put",2,[109,109,109,213,111,111,111,81,112,112,112,151,114,114,114,0],0,0]],"sha256":"079f3dc323ae1f32ec2e8cbc2dd4e57e7456fa6c8b56751a5cbbdf8ff7053eab","accesses":["amount","evolution","seed","scale","octaves","contrast","brightness","dark","light","amount","contrast","brightness","dark","light","amount","contrast","brightness","dark","light","amount","contrast","brightness","dark","light","amount"]},{"id":"stylize.fractal-noise","params":{"seed":2147483647,"scale":73.25,"octaves":8,"evolution":-215999.123,"contrast":3.25,"brightness":-0.2,"amount":0.7,"dark":[0.2,0.8,0.1,0.3],"light":[0.9,0.1,0.7,0.6]},"kind":"native","gpu":true,"calls":2,"records":[["create",2,2,2],["pass",2513,"9ef0b181334f6d4d633a70666e24871a794e7e26721fbd011a4f340932794d67",2,[1],{"inverseScale":14315,"octaves":8,"seedParts":[65535,32767],"zParts":[46144,65532,224],"amount":0.7,"contrast":3.25,"brightness":-0.2,"dark":[0.2,0.8,0.1,0.3],"light":[0.9,0.1,0.7,0.6]}]],"sha256":"abc3e8553f0a83703b1b98c7076af3e1ec3e7e455a656197eeddbe9703467325","accesses":["amount","evolution","seed","scale","octaves","contrast","brightness","dark","light"]},{"id":"stylize.fractal-noise","params":{"seed":2147483647,"scale":73.25,"octaves":8,"evolution":-215999.123,"contrast":3.25,"brightness":-0.2,"amount":0.7,"dark":[0.2,0.8,0.1,0.3],"light":[0.9,0.1,0.7,0.6]},"kind":"native","gpu":false,"calls":3,"records":[["read",1],["create",2,2,2],["put",2,[31,75,162,213,170,48,118,81,40,193,14,151,13,43,7,0],0,0]],"sha256":"fb9126e207d0976546a18f332a7344bb2c06c3567bbb8a245cd82560a9e00257","accesses":["amount","evolution","seed","scale","octaves","contrast","brightness","dark","light","amount","contrast","brightness","dark","light","amount","contrast","brightness","dark","light","amount","contrast","brightness","dark","light","amount"]},{"id":"stylize.fractal-noise","params":{"seed":2147483647,"scale":10000,"octaves":8,"evolution":216000,"contrast":0.1,"brightness":-1,"amount":0.5,"dark":[0.7,0.2,0.4,0.8],"light":[0.4,0.8,0.2,0.1]},"kind":"native","gpu":true,"calls":2,"records":[["create",2,2,2],["pass",2513,"9ef0b181334f6d4d633a70666e24871a794e7e26721fbd011a4f340932794d67",2,[1],{"inverseScale":105,"octaves":8,"seedParts":[65535,32767],"zParts":[19392,3,0],"amount":0.5,"contrast":0.1,"brightness":-1,"dark":[0.7,0.2,0.4,0.8],"light":[0.4,0.8,0.2,0.1]}]],"sha256":"a04fc386f154f2e256c320f39b7b9bdb863330d46c8d0aab0776b7df178b6e6e","accesses":["amount","evolution","seed","scale","octaves","contrast","brightness","dark","light"]},{"id":"stylize.fractal-noise","params":{"seed":2147483647,"scale":10000,"octaves":8,"evolution":216000,"contrast":0.1,"brightness":-1,"amount":0.5,"dark":[0.7,0.2,0.4,0.8],"light":[0.4,0.8,0.2,0.1]},"kind":"native","gpu":false,"calls":3,"records":[["read",1],["create",2,2,2],["put",2,[85,45,160,213,192,24,126,81,92,136,46,151,71,20,41,0],0,0]],"sha256":"198c286b26dbfdb33eaab6d128407438effd259c2db3d44fecd82d7e2257a1b9","accesses":["amount","evolution","seed","scale","octaves","contrast","brightness","dark","light","amount","contrast","brightness","dark","light","amount","contrast","brightness","dark","light","amount","contrast","brightness","dark","light","amount"]},{"id":"distort.turbulent","params":{"seed":1,"scale":64,"octaves":4,"evolution":0,"amount":0},"kind":"native","gpu":true,"calls":0,"records":[],"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","accesses":["amount"]},{"id":"distort.turbulent","params":{"seed":1,"scale":64,"octaves":4,"evolution":0,"amount":0},"kind":"native","gpu":false,"calls":0,"records":[],"sha256":"4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945","accesses":["amount"]},{"id":"distort.turbulent","params":{"seed":1,"scale":64,"octaves":4,"evolution":0,"amount":1},"kind":"native","gpu":true,"calls":2,"records":[["create",2,2,2],["pass",3047,"ec7ba0c00af9dcb708d7c42c002abc0566b27fa7a7479978cb572b11c748b2a5",2,[1],{"inverseScale":16384,"octaves":4,"seedParts":[1,0],"zParts":[0,0,0],"amountFixed":16}]],"sha256":"1ae422491769f6602fad10aa6b3bae36e8bfc9be02c58ad5557b5d77f8225e0c","accesses":["amount","evolution","seed","scale","octaves"]},{"id":"distort.turbulent","params":{"seed":1,"scale":64,"octaves":4,"evolution":0,"amount":1},"kind":"native","gpu":false,"calls":3,"records":[["read",1],["create",2,2,2],["put",2,[24,41,199,151,152,16,158,79,32,156,55,152,128,74,106,24],0,0]],"sha256":"c56219ac551ccd96a17d12cbc943ea47aea91a8d131d6b5e6a1f08d7ca9fb88c","accesses":["amount","evolution","seed","scale","octaves"]},{"id":"distort.turbulent","params":{"seed":2147483647,"scale":73.25,"octaves":8,"evolution":-215999.123,"amount":-1000},"kind":"native","gpu":true,"calls":2,"records":[["create",2,2,2],["pass",3047,"ec7ba0c00af9dcb708d7c42c002abc0566b27fa7a7479978cb572b11c748b2a5",2,[1],{"inverseScale":14315,"octaves":8,"seedParts":[65535,32767],"zParts":[46144,65532,224],"amountFixed":-16000}]],"sha256":"d60baeb5df6a4d374ef66a4a174bc6161904ab3985d4c710580075cd55d31e2f","accesses":["amount","evolution","seed","scale","octaves"]},{"id":"distort.turbulent","params":{"seed":2147483647,"scale":73.25,"octaves":8,"evolution":-215999.123,"amount":-1000},"kind":"native","gpu":false,"calls":3,"records":[["read",1],["create",2,2,2],["put",2,[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],0,0]],"sha256":"f0668b10cc72af9137e84153788d9c76b13f9dddd464cfb4a355d90c4814d38f","accesses":["amount","evolution","seed","scale","octaves"]},{"id":"distort.turbulent","params":{"seed":2147483647,"scale":10000,"octaves":8,"evolution":216000,"amount":1000},"kind":"native","gpu":true,"calls":2,"records":[["create",2,2,2],["pass",3047,"ec7ba0c00af9dcb708d7c42c002abc0566b27fa7a7479978cb572b11c748b2a5",2,[1],{"inverseScale":105,"octaves":8,"seedParts":[65535,32767],"zParts":[19392,3,0],"amountFixed":16000}]],"sha256":"9cf2a4d13115d2f8036e3e3bd0077add447569669f322733ea9b14a836319f91","accesses":["amount","evolution","seed","scale","octaves"]},{"id":"distort.turbulent","params":{"seed":2147483647,"scale":10000,"octaves":8,"evolution":216000,"amount":1000},"kind":"native","gpu":false,"calls":3,"records":[["read",1],["create",2,2,2],["put",2,[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],0,0]],"sha256":"f0668b10cc72af9137e84153788d9c76b13f9dddd464cfb4a355d90c4814d38f","accesses":["amount","evolution","seed","scale","octaves"]}]',
) as Row[];
const limits = { pixels: 1048576, metadata: 2097152 };
const fractal = {
    seed: 1,
    scale: 64,
    octaves: 4,
    evolution: 0,
    contrast: 1,
    brightness: 0,
    amount: 1,
    dark: [0, 0, 0, 1],
    light: [1, 1, 1, 1],
  },
  turbulent = { seed: 1, scale: 64, octaves: 4, evolution: 0, amount: 1 };
type Work = {
  managed?: boolean;
  memory?: ManagedMemory;
  controls?: Partial<ReturnType<typeof noiseControls>>;
  sampling?: { index?: (x: number, y: number) => number };
  plane?: (z: number) => number;
  input?: object;
  output?: object;
  image?: { data: Uint8ClampedArray };
  premultiplied?: Uint8Array;
  sample?: number[];
  rgbKeys?: number[];
  rgb?: number[];
  rgbProducer?: (channel: number) => number;
  colorProducer?: (value: number, channel: number) => number;
  colorOutput?: number[];
};
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function run(
  h: ReturnType<typeof shadowHarness>,
  params: typeof fractal | typeof turbulent,
  id = "stylize.fractal-noise",
) {
  return noiseEffectKernel(id)!.renderCanvas!(
    h.context as never,
    h.input as never,
    params as never,
  );
}
function observe(memory: ManagedMemory) {
  const adopt = memory.adopt.bind(memory);
  let work: Work | undefined;
  vi.spyOn(memory, "adopt").mockImplementation((...args) => {
    if (args[1].bytes === 16384) work = args[0] as Work;
    return adopt(...args);
  });
  return () => work;
}
afterEach(() => vi.restoreAllMocks());
it("preserves all 16 original native callbacks/full pixels, six controls/uniform tables with 30 field values and 16 complete colors", async () => {
  for (const active of [false, true])
    for (const row of originals) {
      const memory = new ManagedMemory(limits),
        h = shadowHarness(),
        params = structuredClone(row.params),
        produce = async () => {
          if (row.kind === "native") {
            const accesses: string[] = [],
              traced = new Proxy(params, {
                get(t, k, r) {
                  accesses.push(String(k));
                  return Reflect.get(t, k, r);
                },
              }),
              plugin = noiseEffectKernel(row.id!)!;
            if (row.gpu)
              plugin.renderGpu(
                h.context as never,
                h.input as never,
                traced as never,
              );
            else
              plugin.renderCanvas!(
                h.context as never,
                h.input as never,
                traced as never,
              );
            expect(accesses).toEqual(row.accesses);
            expect(h.records).toEqual(row.records);
            expect(sha(h.records)).toBe(row.sha256);
          } else if (row.kind === "controls") {
            const accesses: string[] = [],
              p = new Proxy(params, {
                get(t, k, r) {
                  accesses.push(String(k));
                  return Reflect.get(t, k, r);
                },
              }),
              controls = noiseControls(p);
            expect(controls).toEqual(row.controls);
            const fieldUniforms = noiseFieldUniforms(controls);
            expect(fieldUniforms).toEqual(row.uniforms);
            releaseRenderMetadata(fieldUniforms);
            const fields = [
              [0.5, 0.5],
              [1.5, 1.5],
              [20.5, 12.5],
              [8191.5, 8191.5],
              [-0.5, -0.5],
            ].map(([x, y]) => noiseField(controls, x!, y!));
            expect(fields).toEqual(row.values);
            expect(accesses).toEqual(row.accesses);
            releaseRenderMetadata(controls);
          } else {
            const rgb = structuredClone(row.rgb!);
            const color = fractalNoiseColor(row.value!, params, rgb);
            expect(color).toEqual(row.output);
            releaseRenderMetadata(color);
            expect(rgb).toEqual(row.rgb);
          }
        };
      if (active) await withManagedMemory(memory, produce);
      else await produce();
      expect(params).toEqual(row.params);
      expect(memory.statistics.current.metadata).toBe(0);
      empty(memory);
      memory.dispose();
    }
});
it("rejects exact Canvas header before original controls/math/readback/view factories and retains amount-zero allocation-free behavior", async () => {
  for (const id of ["stylize.fractal-noise", "distort.turbulent"]) {
    const raw = id === "stylize.fractal-noise" ? fractal : turbulent,
      memory = new ManagedMemory({ ...limits, metadata: 16383 }),
      h = shadowHarness(),
      get = vi.fn((t: object, k: PropertyKey, r: unknown) =>
        Reflect.get(t, k, r),
      );
    await withManagedMemory(memory, async () => {
      const floor = vi.spyOn(Math, "floor"),
        round = vi.spyOn(Math, "round");
      expect(() => run(h, new Proxy(raw, { get }) as never, id)).toThrow(
        /metadata/,
      );
      expect(get.mock.calls.map((x) => x[1])).toEqual(["amount"]);
      expect(floor).not.toHaveBeenCalled();
      expect(round).not.toHaveBeenCalled();
      expect(h.records).toEqual([]);
      empty(memory);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const reserve = vi.spyOn(memory, "reserve");
    run(shadowHarness(), { ...fractal, amount: 0 });
    run(shadowHarness(), { ...turbulent, amount: 0 }, "distort.turbulent");
    expect(reserve).not.toHaveBeenCalled();
    empty(memory);
  });
  memory.dispose();
});
it("holds actual controls/views/sample/native refs through publication with bounded actual octave planes and four RGB-key-color results under one owner", async () => {
  for (const id of ["stylize.fractal-noise", "distort.turbulent"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      raw = structuredClone(
        id === "stylize.fractal-noise" ? fractal : turbulent,
      ),
      getWork = observe(memory),
      rgbs: number[][] = [],
      keys: number[][] = [],
      colors: number[][] = [],
      planes = new Set<unknown>();
    let work: Work | undefined,
      controls: Work["controls"],
      image: Uint8ClampedArray | undefined,
      premult: Uint8Array | undefined,
      sample: number[] | undefined,
      sampling: Work["sampling"],
      indexCalls = 0;
    await withManagedMemory(memory, async () => {
      const reserve = vi.spyOn(memory, "reserve"),
        round = Math.round,
        floor = Math.floor,
        imul = Math.imul;
      vi.spyOn(Math, "round").mockImplementation((v) => {
        const w = getWork();
        if (w?.colorOutput && !colors.includes(w.colorOutput)) {
          expect(memory.owns(w)).toBe(true);
          expect(memory.statistics.current.metadata).toBe(16384);
          expect(w.rgbKeys).toEqual([0, 1, 2]);
          expect(typeof w.rgbProducer).toBe("function");
          expect(typeof w.colorProducer).toBe("function");
          expect(w.plane).toBeUndefined();
          rgbs.push(w.rgb!);
          keys.push(w.rgbKeys!);
          colors.push(w.colorOutput);
        }
        return round(v);
      });
      vi.spyOn(Math, "imul").mockImplementation((...v) => {
        const w = getWork();
        if (w?.plane) {
          expect(memory.owns(w)).toBe(true);
          expect(memory.statistics.current.metadata).toBe(16384);
          planes.add(w.plane);
        }
        return imul(...v);
      });
      vi.spyOn(Math, "floor").mockImplementation((v) => {
        const w = getWork();
        if (w?.sampling?.index) {
          indexCalls++;
          expect(memory.owns(w)).toBe(true);
          expect(w.sample).toHaveLength(4);
        }
        return floor(v);
      });
      const create = h.context.createSurface;
      vi.spyOn(h.context, "createSurface").mockImplementation((...args) => {
        const output = create(...args),
          put = output.ctx.putImageData;
        vi.spyOn(output.ctx, "putImageData").mockImplementation((...v) => {
          work = getWork();
          expect(memory.owns(work!)).toBe(true);
          expect(memory.statistics.current).toEqual({
            pixels: id === "stylize.fractal-noise" ? 16 : 32,
            metadata: 16384,
          });
          expect(work!.input).toBe(h.input);
          expect(work!.output).toBe(output);
          expect(work!.image).toBe(v[0]);
          controls = work!.controls;
          expect(controls).toEqual(
            originals.find(
              (row) =>
                row.kind === "controls" &&
                row.params.seed === raw.seed &&
                row.params.scale === raw.scale &&
                row.params.octaves === raw.octaves &&
                row.params.evolution === raw.evolution,
            )!.controls,
          );
          image = work!.image!.data;
          premult = work!.premultiplied;
          sample = work!.sample;
          sampling = work!.sampling;
          expect(memory.owns(image.buffer)).toBe(true);
          if (premult) expect(memory.owns(premult.buffer)).toBe(true);
          expect(sample).toHaveLength(4);
          for (const key of [
            "rgb",
            "rgbKeys",
            "rgbProducer",
            "colorOutput",
            "colorProducer",
            "plane",
          ] as const)
            expect(work![key]).toBeUndefined();
          expect(sampling?.index).toBeUndefined();
          return put(...v);
        });
        return output;
      });
      run(h, raw, id);
      expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual(
        id === "stylize.fractal-noise"
          ? [
              ["metadata", 16384],
              ["pixels", 16],
            ]
          : [
              ["metadata", 16384],
              ["pixels", 16],
              ["pixels", 16],
            ],
      );
      expect(planes.size).toBe(id === "stylize.fractal-noise" ? 16 : 32);
      expect(indexCalls > 0).toBe(id !== "stylize.fractal-noise");
      expect(rgbs).toHaveLength(id === "stylize.fractal-noise" ? 4 : 0);
      expect(colors).toHaveLength(rgbs.length);
      for (const value of [...rgbs, ...keys, ...colors, sample!])
        expect(value).toHaveLength(0);
      expect(sampling).toEqual({});
      expect(controls).toEqual({});
      expect(image!.byteLength).toBe(0);
      if (premult) expect(premult.byteLength).toBe(0);
      expect(work).toEqual({});
      expect(h.records).toEqual(
        originals.find(
          (x) =>
            x.kind === "native" &&
            !x.gpu &&
            x.id === id &&
            JSON.stringify(x.params) === JSON.stringify(raw),
        )!.records,
      );
      empty(memory);
    });
    expect(raw).toEqual(id === "stylize.fractal-noise" ? fractal : turbulent);
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("preserves both original turbulent pixel quota cuts and retires every actual earlier backing and controls", async () => {
  for (const quota of [15, 31]) {
    const memory = new ManagedMemory({ ...limits, pixels: quota }),
      h = shadowHarness(),
      getWork = observe(memory);
    let earlier: Uint8ClampedArray | undefined, controls: Work["controls"];
    await withManagedMemory(memory, async () => {
      const read = h.input.ctx.getImageData;
      vi.spyOn(h.input.ctx, "getImageData").mockImplementation(() => {
        controls = getWork()!.controls;
        const image = read();
        earlier = image.data;
        return image;
      });
      expect(() => run(h, turbulent, "distort.turbulent")).toThrow(/pixels/);
      expect(h.records).toHaveLength(quota === 15 ? 0 : 1);
      if (earlier) expect(earlier.byteLength).toBe(0);
      if (controls) expect(controls).toEqual({});
      expect(getWork()).toEqual({});
      empty(memory);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("captures actual partial premultiply view before early/mid loops and retires both stores even when first release fails", async () => {
  for (const failAt of [2, 7]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      getWork = observe(memory),
      release = memory.release.bind(memory);
    let image: Uint8ClampedArray | undefined,
      premult: Uint8Array | undefined,
      controls: Work["controls"],
      visits = 0;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "release").mockImplementation((v) => {
        release(v);
        if (++visits === 1) throw Error("secondary pixel cleanup");
      });
      const round = Math.round;
      let calls = 0;
      vi.spyOn(Math, "round").mockImplementation((v) => {
        if (++calls === failAt) {
          const w = getWork()!;
          image = w.image!.data;
          premult = w.premultiplied;
          controls = w.controls;
          expect(memory.statistics.current).toEqual({
            pixels: 32,
            metadata: 16384,
          });
          throw null;
        }
        return round(v);
      });
      let failure: unknown = "unset";
      try {
        run(h, turbulent, "distort.turbulent");
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(visits).toBe(2);
      expect(image!.byteLength).toBe(0);
      expect(premult!.byteLength).toBe(0);
      expect(controls).toEqual({});
      expect(getWork()).toEqual({});
      expect(h.records).toHaveLength(1);
      empty(memory);
      vi.restoreAllMocks();
      run(h, turbulent, "distort.turbulent");
      expect(h.records).toHaveLength(4);
      empty(memory);
    });
    memory.dispose();
  }
});
it("retires actual original octave plane/sample/controls after field math null and preserves first null over secondary backing cleanup", async () => {
  for (const id of ["stylize.fractal-noise", "distort.turbulent"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      getWork = observe(memory),
      release = memory.release.bind(memory);
    let work: Work | undefined,
      plane: unknown,
      controls: Work["controls"],
      sample: number[] | undefined,
      image: Uint8ClampedArray | undefined,
      premult: Uint8Array | undefined,
      visits = 0;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "release").mockImplementation((v) => {
        release(v);
        if (++visits === 1) throw Error("secondary pixel cleanup");
      });
      const imul = Math.imul;
      vi.spyOn(Math, "imul").mockImplementation((...v) => {
        work = getWork();
        if (work?.plane) {
          plane = work.plane;
          expect(typeof plane).toBe("function");
          expect(memory.owns(work)).toBe(true);
          controls = work.controls;
          sample = work.sample;
          image = work.image!.data;
          premult = work.premultiplied;
          throw null;
        }
        return imul(...v);
      });
      let failure: unknown = "unset";
      try {
        run(h, id === "stylize.fractal-noise" ? fractal : turbulent, id);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(visits).toBe(id === "stylize.fractal-noise" ? 1 : 2);
      expect(controls).toEqual({});
      expect(sample).toHaveLength(0);
      expect(image!.byteLength).toBe(0);
      if (premult) expect(premult.byteLength).toBe(0);
      expect(work).toEqual({});
      expect(h.records).toHaveLength(1);
      empty(memory);
      vi.restoreAllMocks();
      run(h, id === "stylize.fractal-noise" ? fractal : turbulent, id);
      expect(h.records).toHaveLength(4);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual partial RGB keys/map/color producers and arrays after original map/channel/color getters fail without mutating borrowed color vectors", async () => {
  for (const cut of [
    "rgb-map",
    "rgb-channel",
    "color-getter",
    "color-map",
    "color-channel",
  ]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      getWork = observe(memory),
      release = memory.release.bind(memory),
      descriptor = Object.getOwnPropertyDescriptor(Array.prototype, "map")!;
    let image: Uint8ClampedArray | undefined,
      keys: number[] | undefined,
      rgb: number[] | undefined,
      sample: number[] | undefined,
      controls: Work["controls"];
    const capture = () => {
      const w = getWork()!;
      expect(memory.owns(w)).toBe(true);
      image = w.image!.data;
      keys = w.rgbKeys;
      rgb = w.rgb;
      sample = w.sample;
      controls = w.controls;
      throw null;
    };
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "release").mockImplementation((v) => {
        release(v);
        throw Error("secondary pixel cleanup");
      });
      let params: typeof fractal = fractal;
      if (cut === "rgb-map" || cut === "color-map")
        Object.defineProperty(Array.prototype, "map", {
          configurable: descriptor.configurable!,
          enumerable: descriptor.enumerable!,
          get: function (this: number[]) {
            const w = getWork();
            if (cut === "rgb-map" && this === w?.rgbKeys) {
              expect(w!.rgbProducer).toBeUndefined();
              return capture();
            }
            if (cut === "color-map" && this === w?.rgb) {
              expect(w!.colorProducer).toBeUndefined();
              return capture();
            }
            return descriptor.value;
          },
        });
      if (cut === "rgb-channel") {
        const round = Math.round;
        vi.spyOn(Math, "round").mockImplementation((v) => {
          const w = getWork();
          if (w?.rgbKeys && !w.rgb) {
            expect(typeof w.rgbProducer).toBe("function");
            return capture();
          }
          return round(v);
        });
      }
      if (cut === "color-getter" || cut === "color-channel")
        params = new Proxy(fractal, {
          get(t, k, r) {
            if (k === "dark" && getWork()?.rgb) {
              if (cut === "color-getter") {
                expect(getWork()!.colorProducer).toBeUndefined();
                return capture();
              }
              return new Proxy(t.dark, {
                get(a, key, receiver) {
                  if (key === "0") {
                    expect(typeof getWork()!.colorProducer).toBe("function");
                    return capture();
                  }
                  return Reflect.get(a, key, receiver);
                },
              });
            }
            return Reflect.get(t, k, r);
          },
        });
      let failure: unknown = "unset";
      try {
        run(h, params);
      } catch (error) {
        failure = error;
      } finally {
        Object.defineProperty(Array.prototype, "map", descriptor);
      }
      expect(failure).toBeNull();
      expect(image!.byteLength).toBe(0);
      for (const v of [keys, rgb, sample]) if (v) expect(v).toHaveLength(0);
      expect(controls).toEqual({});
      expect(getWork()).toEqual({});
      expect(fractal.dark).toEqual([0, 0, 0, 1]);
      expect(fractal.light).toEqual([1, 1, 1, 1]);
      expect(h.records).toHaveLength(1);
      empty(memory);
      vi.restoreAllMocks();
      run(h, fractal);
      expect(h.records).toHaveLength(4);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual sampling index and sample after original turbulent interpolation null and visits both backings", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness(),
    getWork = observe(memory),
    release = memory.release.bind(memory);
  let sampling: Work["sampling"],
    sample: number[] | undefined,
    image: Uint8ClampedArray | undefined,
    premult: Uint8Array | undefined,
    visits = 0;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "release").mockImplementation((v) => {
      release(v);
      if (++visits === 1) throw Error("secondary pixel cleanup");
    });
    const floor = Math.floor;
    vi.spyOn(Math, "floor").mockImplementation((v) => {
      const w = getWork();
      if (w?.sampling?.index) {
        sampling = w.sampling;
        sample = w.sample;
        image = w.image!.data;
        premult = w.premultiplied;
        throw null;
      }
      return floor(v);
    });
    let failure: unknown = "unset";
    try {
      run(h, turbulent, "distort.turbulent");
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(visits).toBe(2);
    expect(sampling).toEqual({});
    expect(sample).toHaveLength(0);
    expect(image!.byteLength).toBe(0);
    expect(premult!.byteLength).toBe(0);
    expect(getWork()).toEqual({});
    expect(h.records).toHaveLength(1);
    empty(memory);
    vi.restoreAllMocks();
    run(h, turbulent, "distort.turbulent");
    expect(h.records).toHaveLength(4);
    empty(memory);
  });
  memory.dispose();
});
it("retires actual earlier views/controls on native read/create/publication null preserving first null over secondary metadata cleanup with retry", async () => {
  for (const cut of ["read", "create", "put"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      getWork = observe(memory),
      reserve = memory.reserve.bind(memory);
    let image: Uint8ClampedArray | undefined,
      premult: Uint8Array | undefined,
      controls: Work["controls"];
    const fail = () => {
      const w = getWork()!;
      image = w.image?.data;
      premult = w.premultiplied;
      controls = w.controls;
      throw null;
    };
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "reserve").mockImplementation((...args) => {
        const lease = reserve(...args);
        if (args[0] === "metadata") {
          const release = lease.release.bind(lease);
          vi.spyOn(lease, "release").mockImplementation(() => {
            release();
            throw Error("secondary metadata cleanup");
          });
        }
        return lease;
      });
      if (cut === "read")
        vi.spyOn(h.input.ctx, "getImageData").mockImplementation(fail);
      else {
        const create = h.context.createSurface;
        vi.spyOn(h.context, "createSurface").mockImplementation((...args) => {
          if (cut === "create") return fail();
          const output = create(...args);
          vi.spyOn(output.ctx, "putImageData").mockImplementation(fail);
          return output;
        });
      }
      let failure: unknown = "unset";
      try {
        run(h, turbulent, "distort.turbulent");
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      if (image) expect(image.byteLength).toBe(0);
      if (premult) expect(premult.byteLength).toBe(0);
      expect(controls).toEqual({});
      expect(getWork()).toEqual({});
      empty(memory);
      vi.restoreAllMocks();
      run(shadowHarness(), turbulent, "distort.turbulent");
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual Canvas header/sampling record after adoption null before original controls/math/readback factories", async () => {
  const memory = new ManagedMemory(limits),
    h = shadowHarness();
  let work: Work | undefined, sampling: Work["sampling"];
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "adopt").mockImplementation((...args) => {
      work = args[0] as Work;
      sampling = work.sampling;
      throw null;
    });
    const floor = vi.spyOn(Math, "floor"),
      round = vi.spyOn(Math, "round");
    let failure: unknown = "unset";
    try {
      run(h, fractal);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(work).toEqual({});
    expect(sampling).toEqual({});
    expect(floor).not.toHaveBeenCalled();
    expect(round).not.toHaveBeenCalled();
    expect(h.records).toEqual([]);
    empty(memory);
    vi.restoreAllMocks();
    run(h, fractal);
    expect(h.records).toHaveLength(3);
    empty(memory);
  });
  memory.dispose();
});
it("detaches actual captured premultiply backing after adoption null before loops and clears refs even when both native detachments throw secondary errors", async () => {
  for (const nativeFailure of [false, true]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      adopt = memory.adopt.bind(memory),
      backingPrototype = ArrayBuffer.prototype as ArrayBuffer & {
        transfer(bytes?: number): ArrayBuffer;
      },
      transfer = backingPrototype.transfer;
    let work: Work | undefined,
      image: Uint8ClampedArray | undefined,
      premult: Uint8Array | undefined,
      controls: Work["controls"],
      transfers = 0;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "adopt").mockImplementation((...args) => {
        if (args[1].bytes === 16384) work = args[0] as Work;
        else if (args[0] === work?.premultiplied?.buffer) {
          image = work.image!.data;
          premult = work.premultiplied;
          controls = work.controls;
          throw null;
        }
        return adopt(...args);
      });
      if (nativeFailure)
        vi.spyOn(backingPrototype, "transfer").mockImplementation(function (
          this: ArrayBuffer,
          bytes?: number,
        ) {
          transfer.call(this, bytes);
          transfers++;
          throw Error("secondary native detachment cleanup");
        });
      const round = vi.spyOn(Math, "round");
      let failure: unknown = "unset";
      try {
        run(h, turbulent, "distort.turbulent");
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(round).toHaveBeenCalledTimes(1);
      expect(transfers).toBe(nativeFailure ? 2 : 0);
      expect(image!.byteLength).toBe(0);
      expect(premult!.byteLength).toBe(0);
      expect(controls).toEqual({});
      expect(work).toEqual({});
      expect(h.records).toHaveLength(1);
      empty(memory);
      vi.restoreAllMocks();
      run(h, turbulent, "distort.turbulent");
      expect(h.records).toHaveLength(4);
      empty(memory);
    });
    memory.dispose();
  }
});
it("propagates successful publication cleanup null after every actual pixel backing/controls/sample/controller ref retires", async () => {
  for (const id of ["stylize.fractal-noise", "distort.turbulent"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      getWork = observe(memory),
      release = memory.release.bind(memory);
    let image: Uint8ClampedArray | undefined,
      premult: Uint8Array | undefined,
      controls: Work["controls"],
      sample: number[] | undefined,
      visits = 0;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "release").mockImplementation((v) => {
        const w = getWork()!;
        image = w.image!.data;
        premult = w.premultiplied;
        controls = w.controls;
        sample = w.sample;
        release(v);
        if (++visits === 1) throw null;
      });
      let failure: unknown = "unset";
      try {
        run(h, id === "stylize.fractal-noise" ? fractal : turbulent, id);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      expect(visits).toBe(id === "stylize.fractal-noise" ? 1 : 2);
      expect(image!.byteLength).toBe(0);
      if (premult) expect(premult.byteLength).toBe(0);
      expect(controls).toEqual({});
      expect(sample).toHaveLength(0);
      expect(getWork()).toEqual({});
      expect(h.records).toHaveLength(3);
      empty(memory);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("clears actual partial Canvas controls on original evolution/seed/scale/octaves getter null before pixel factories and permits retry", async () => {
  for (const cut of ["evolution", "seed", "scale", "octaves"]) {
    const memory = new ManagedMemory(limits),
      h = shadowHarness(),
      getWork = observe(memory);
    let controls: Work["controls"];
    await withManagedMemory(memory, async () => {
      const params = new Proxy(fractal, {
        get(t, k, r) {
          if (k === cut) {
            controls = getWork()!.controls;
            throw null;
          }
          return Reflect.get(t, k, r);
        },
      });
      let failure: unknown = "unset";
      try {
        run(h, params);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      if (controls) expect(controls).toEqual({});
      expect(getWork()).toEqual({});
      expect(h.records).toEqual([]);
      empty(memory);
      vi.restoreAllMocks();
      run(h, fractal);
      expect(h.records).toHaveLength(3);
      empty(memory);
    });
    memory.dispose();
  }
});
