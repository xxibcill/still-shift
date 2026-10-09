import { afterEach, expect, it, vi } from "vitest";
import { noiseField } from "../../packages/renderer-core/src/composition/render/noise-effects.ts";
import { ManagedMemory } from "../../packages/renderer-core/src/managed-memory.ts";
import { withManagedMemory } from "../../packages/renderer-core/src/managed-memory-context.ts";
import {
  allocateRenderMetadata,
  releaseRenderMetadata,
} from "../../packages/renderer-core/src/managed-metadata.ts";
type Controls = Parameters<typeof noiseField>[0];
type Row = {
  controls: Controls;
  point: [number, number];
  seed?: number;
  override: boolean;
  output: number;
  accesses: string[];
  floors: number;
  multiplications: number;
};
const originals = JSON.parse(
  '[{"controls":{"seed":1,"inverseScale":16384,"octaves":4,"z":0,"zWeight":0},"point":[0.5,0.5],"override":false,"output":28054,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":46,"multiplications":164},{"controls":{"seed":1,"inverseScale":16384,"octaves":4,"z":0,"zWeight":0},"point":[1.5,1.5],"override":false,"output":29179,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":46,"multiplications":164},{"controls":{"seed":1,"inverseScale":16384,"octaves":4,"z":0,"zWeight":0},"point":[20.5,12.5],"override":false,"output":30818,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":46,"multiplications":164},{"controls":{"seed":1,"inverseScale":16384,"octaves":4,"z":0,"zWeight":0},"point":[8191.5,8191.5],"override":false,"output":20732,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":46,"multiplications":164},{"controls":{"seed":1,"inverseScale":16384,"octaves":4,"z":0,"zWeight":0},"point":[-0.5,-0.5],"override":false,"output":15911,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":46,"multiplications":164},{"controls":{"seed":1,"inverseScale":16384,"octaves":4,"z":0,"zWeight":0},"point":[0.5,0.5],"seed":1757159914,"override":true,"output":22200,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":46,"multiplications":164},{"controls":{"seed":1,"inverseScale":16384,"octaves":4,"z":0,"zWeight":0},"point":[1.5,1.5],"seed":1757159914,"override":true,"output":22851,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":46,"multiplications":164},{"controls":{"seed":1,"inverseScale":16384,"octaves":4,"z":0,"zWeight":0},"point":[20.5,12.5],"seed":1757159914,"override":true,"output":26855,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":46,"multiplications":164},{"controls":{"seed":1,"inverseScale":16384,"octaves":4,"z":0,"zWeight":0},"point":[8191.5,8191.5],"seed":1757159914,"override":true,"output":43279,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":46,"multiplications":164},{"controls":{"seed":1,"inverseScale":16384,"octaves":4,"z":0,"zWeight":0},"point":[-0.5,-0.5],"seed":1757159914,"override":true,"output":28469,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":46,"multiplications":164},{"controls":{"seed":0,"inverseScale":1048576,"octaves":1,"z":4294751296,"zWeight":0},"point":[0.5,0.5],"override":false,"output":25154,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":13,"multiplications":41},{"controls":{"seed":0,"inverseScale":1048576,"octaves":1,"z":4294751296,"zWeight":0},"point":[1.5,1.5],"override":false,"output":50069,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":13,"multiplications":41},{"controls":{"seed":0,"inverseScale":1048576,"octaves":1,"z":4294751296,"zWeight":0},"point":[20.5,12.5],"override":false,"output":25665,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":13,"multiplications":41},{"controls":{"seed":0,"inverseScale":1048576,"octaves":1,"z":4294751296,"zWeight":0},"point":[8191.5,8191.5],"override":false,"output":35260,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":13,"multiplications":41},{"controls":{"seed":0,"inverseScale":1048576,"octaves":1,"z":4294751296,"zWeight":0},"point":[-0.5,-0.5],"override":false,"output":77641,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":13,"multiplications":41},{"controls":{"seed":0,"inverseScale":1048576,"octaves":1,"z":4294751296,"zWeight":0},"point":[0.5,0.5],"seed":1757159915,"override":true,"output":38848,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":13,"multiplications":41},{"controls":{"seed":0,"inverseScale":1048576,"octaves":1,"z":4294751296,"zWeight":0},"point":[1.5,1.5],"seed":1757159915,"override":true,"output":22383,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":13,"multiplications":41},{"controls":{"seed":0,"inverseScale":1048576,"octaves":1,"z":4294751296,"zWeight":0},"point":[20.5,12.5],"seed":1757159915,"override":true,"output":29743,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":13,"multiplications":41},{"controls":{"seed":0,"inverseScale":1048576,"octaves":1,"z":4294751296,"zWeight":0},"point":[8191.5,8191.5],"seed":1757159915,"override":true,"output":51491,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":13,"multiplications":41},{"controls":{"seed":0,"inverseScale":1048576,"octaves":1,"z":4294751296,"zWeight":0},"point":[-0.5,-0.5],"seed":1757159915,"override":true,"output":-11825,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":13,"multiplications":41},{"controls":{"seed":2147483647,"inverseScale":14315,"octaves":8,"z":4294751296,"zWeight":224},"point":[0.5,0.5],"override":false,"output":27675,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":14315,"octaves":8,"z":4294751296,"zWeight":224},"point":[1.5,1.5],"override":false,"output":27661,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":14315,"octaves":8,"z":4294751296,"zWeight":224},"point":[20.5,12.5],"override":false,"output":21890,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":14315,"octaves":8,"z":4294751296,"zWeight":224},"point":[8191.5,8191.5],"override":false,"output":30483,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":14315,"octaves":8,"z":4294751296,"zWeight":224},"point":[-0.5,-0.5],"override":false,"output":31966,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":14315,"octaves":8,"z":4294751296,"zWeight":224},"point":[0.5,0.5],"seed":390323732,"override":true,"output":20420,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":14315,"octaves":8,"z":4294751296,"zWeight":224},"point":[1.5,1.5],"seed":390323732,"override":true,"output":20783,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":14315,"octaves":8,"z":4294751296,"zWeight":224},"point":[20.5,12.5],"seed":390323732,"override":true,"output":26613,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":14315,"octaves":8,"z":4294751296,"zWeight":224},"point":[8191.5,8191.5],"seed":390323732,"override":true,"output":27987,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":14315,"octaves":8,"z":4294751296,"zWeight":224},"point":[-0.5,-0.5],"seed":390323732,"override":true,"output":16835,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":105,"octaves":8,"z":216000,"zWeight":0},"point":[0.5,0.5],"override":false,"output":37143,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":105,"octaves":8,"z":216000,"zWeight":0},"point":[1.5,1.5],"override":false,"output":37146,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":105,"octaves":8,"z":216000,"zWeight":0},"point":[20.5,12.5],"override":false,"output":37116,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":105,"octaves":8,"z":216000,"zWeight":0},"point":[8191.5,8191.5],"override":false,"output":16516,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":105,"octaves":8,"z":216000,"zWeight":0},"point":[-0.5,-0.5],"override":false,"output":26749,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":105,"octaves":8,"z":216000,"zWeight":0},"point":[0.5,0.5],"seed":390323732,"override":true,"output":30043,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":105,"octaves":8,"z":216000,"zWeight":0},"point":[1.5,1.5],"seed":390323732,"override":true,"output":30044,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":105,"octaves":8,"z":216000,"zWeight":0},"point":[20.5,12.5],"seed":390323732,"override":true,"output":29904,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":105,"octaves":8,"z":216000,"zWeight":0},"point":[8191.5,8191.5],"seed":390323732,"override":true,"output":29860,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":2147483647,"inverseScale":105,"octaves":8,"z":216000,"zWeight":0},"point":[-0.5,-0.5],"seed":390323732,"override":true,"output":45117,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":90,"multiplications":328},{"controls":{"seed":32768,"inverseScale":419430,"octaves":3,"z":0,"zWeight":8},"point":[0.5,0.5],"override":false,"output":24545,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":35,"multiplications":123},{"controls":{"seed":32768,"inverseScale":419430,"octaves":3,"z":0,"zWeight":8},"point":[1.5,1.5],"override":false,"output":17232,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":35,"multiplications":123},{"controls":{"seed":32768,"inverseScale":419430,"octaves":3,"z":0,"zWeight":8},"point":[20.5,12.5],"override":false,"output":37424,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":35,"multiplications":123},{"controls":{"seed":32768,"inverseScale":419430,"octaves":3,"z":0,"zWeight":8},"point":[8191.5,8191.5],"override":false,"output":34420,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":35,"multiplications":123},{"controls":{"seed":32768,"inverseScale":419430,"octaves":3,"z":0,"zWeight":8},"point":[-0.5,-0.5],"override":false,"output":-9066,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":35,"multiplications":123},{"controls":{"seed":32768,"inverseScale":419430,"octaves":3,"z":0,"zWeight":8},"point":[0.5,0.5],"seed":1757192683,"override":true,"output":33891,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":35,"multiplications":123},{"controls":{"seed":32768,"inverseScale":419430,"octaves":3,"z":0,"zWeight":8},"point":[1.5,1.5],"seed":1757192683,"override":true,"output":28098,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":35,"multiplications":123},{"controls":{"seed":32768,"inverseScale":419430,"octaves":3,"z":0,"zWeight":8},"point":[20.5,12.5],"seed":1757192683,"override":true,"output":14490,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":35,"multiplications":123},{"controls":{"seed":32768,"inverseScale":419430,"octaves":3,"z":0,"zWeight":8},"point":[8191.5,8191.5],"seed":1757192683,"override":true,"output":34188,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":35,"multiplications":123},{"controls":{"seed":32768,"inverseScale":419430,"octaves":3,"z":0,"zWeight":8},"point":[-0.5,-0.5],"seed":1757192683,"override":true,"output":12223,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":35,"multiplications":123},{"controls":{"seed":12345,"inverseScale":8252,"octaves":7,"z":19,"zWeight":224},"point":[0.5,0.5],"override":false,"output":26565,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":79,"multiplications":287},{"controls":{"seed":12345,"inverseScale":8252,"octaves":7,"z":19,"zWeight":224},"point":[1.5,1.5],"override":false,"output":26846,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":79,"multiplications":287},{"controls":{"seed":12345,"inverseScale":8252,"octaves":7,"z":19,"zWeight":224},"point":[20.5,12.5],"override":false,"output":26025,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":79,"multiplications":287},{"controls":{"seed":12345,"inverseScale":8252,"octaves":7,"z":19,"zWeight":224},"point":[8191.5,8191.5],"override":false,"output":31060,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":79,"multiplications":287},{"controls":{"seed":12345,"inverseScale":8252,"octaves":7,"z":19,"zWeight":224},"point":[-0.5,-0.5],"override":false,"output":39399,"accesses":["seed","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":79,"multiplications":287},{"controls":{"seed":12345,"inverseScale":8252,"octaves":7,"z":19,"zWeight":224},"point":[0.5,0.5],"seed":1757155794,"override":true,"output":16352,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":79,"multiplications":287},{"controls":{"seed":12345,"inverseScale":8252,"octaves":7,"z":19,"zWeight":224},"point":[1.5,1.5],"seed":1757155794,"override":true,"output":16298,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":79,"multiplications":287},{"controls":{"seed":12345,"inverseScale":8252,"octaves":7,"z":19,"zWeight":224},"point":[20.5,12.5],"seed":1757155794,"override":true,"output":19678,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":79,"multiplications":287},{"controls":{"seed":12345,"inverseScale":8252,"octaves":7,"z":19,"zWeight":224},"point":[8191.5,8191.5],"seed":1757155794,"override":true,"output":33167,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":79,"multiplications":287},{"controls":{"seed":12345,"inverseScale":8252,"octaves":7,"z":19,"zWeight":224},"point":[-0.5,-0.5],"seed":1757155794,"override":true,"output":34362,"accesses":["octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","inverseScale","inverseScale","z","z","zWeight","octaves","octaves","octaves"],"floors":79,"multiplications":287}]',
) as Row[];
const limits = { pixels: 1048576, metadata: 2097152 };
type Phase = {
  managed?: boolean;
  plane?: (z: number) => number;
  producer?: () => number;
};
function empty(memory: ManagedMemory) {
  expect(memory.statistics.current).toEqual({ pixels: 0, metadata: 0 });
  expect(memory.statistics.reservations).toBe(0);
}
function observe(memory: ManagedMemory) {
  const adopt = memory.adopt.bind(memory);
  let phase: Phase | undefined;
  vi.spyOn(memory, "adopt").mockImplementation((...args) => {
    if (args[1].bytes === 1024) phase = args[0] as Phase;
    return adopt(...args);
  });
  return () => phase;
}
afterEach(() => vi.restoreAllMocks());
it("preserves 60 original complete field values, all getter sequences and floor/imul counts with default and explicit seed active and inactive", async () => {
  for (const active of [false, true])
    for (const row of originals) {
      const memory = new ManagedMemory(limits),
        raw = structuredClone(row.controls),
        accesses: string[] = [],
        getPhase = observe(memory),
        floor = vi.spyOn(Math, "floor"),
        imul = vi.spyOn(Math, "imul");
      let result: number | undefined;
      const produce = async () => {
        result = noiseField(
          new Proxy(raw, {
            get(t, k, r) {
              accesses.push(String(k));
              return Reflect.get(t, k, r);
            },
          }),
          ...row.point,
          row.seed,
        );
      };
      if (active) await withManagedMemory(memory, produce);
      else await produce();
      expect(result).toBe(row.output);
      expect(accesses).toEqual(row.accesses);
      expect(floor).toHaveBeenCalledTimes(row.floors);
      expect(imul).toHaveBeenCalledTimes(row.multiplications);
      if (active) expect(getPhase()).toEqual({});
      expect(raw).toEqual(row.controls);
      empty(memory);
      memory.dispose();
      vi.restoreAllMocks();
    }
});
it("rejects exact header quota after original allocation-free default seed read but before octave getters/math/producer/plane factories, with no seed read for explicit seed", async () => {
  for (const override of [false, true]) {
    const memory = new ManagedMemory({ ...limits, metadata: 1023 }),
      accesses: string[] = [];
    await withManagedMemory(memory, async () => {
      const reserve = vi.spyOn(memory, "reserve"),
        floor = vi.spyOn(Math, "floor"),
        imul = vi.spyOn(Math, "imul");
      expect(() =>
        noiseField(
          new Proxy(originals[0]!.controls, {
            get(t, k, r) {
              accesses.push(String(k));
              return Reflect.get(t, k, r);
            },
          }),
          0.5,
          0.5,
          override ? 1 : undefined,
        ),
      ).toThrow(/metadata/);
      expect(accesses).toEqual(override ? [] : ["seed"]);
      expect(floor).not.toHaveBeenCalled();
      expect(imul).not.toHaveBeenCalled();
      expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual([
        ["metadata", 1024],
      ]);
      empty(memory);
    });
    memory.dispose();
    vi.restoreAllMocks();
  }
});
it("owns actual producer and four original plane closures through each octave consumer and drops each plane before next octave/final scalar consumer under one lease", async () => {
  const memory = new ManagedMemory(limits),
    getPhase = observe(memory),
    raw = structuredClone(originals[0]!.controls),
    planes = new Set<NonNullable<Phase["plane"]>>(),
    accesses: string[] = [];
  let capturedProducer: Phase["producer"], result: number | undefined;
  await withManagedMemory(memory, async () => {
    const reserve = vi.spyOn(memory, "reserve"),
      floor = Math.floor;
    vi.spyOn(Math, "floor").mockImplementation((v) => {
      const phase = getPhase()!;
      expect(memory.owns(phase)).toBe(true);
      expect(memory.statistics.current.metadata).toBe(1024);
      expect(typeof phase.producer).toBe("function");
      capturedProducer = phase.producer;
      return floor(v);
    });
    result = noiseField(
      new Proxy(raw, {
        get(t, k, r) {
          accesses.push(String(k));
          if (k === "seed") expect(getPhase()).toBeUndefined();
          else {
            const phase = getPhase()!;
            expect(memory.owns(phase)).toBe(true);
            expect(memory.statistics.reservations).toBe(1);
            if (k === "z") {
              expect(typeof phase.plane).toBe("function");
              planes.add(phase.plane!);
            }
            if (k === "octaves") expect(phase.plane).toBeUndefined();
          }
          return Reflect.get(t, k, r);
        },
      }),
      0.5,
      0.5,
    );
    expect(result).toBe(originals[0]!.output);
    expect(planes.size).toBe(4);
    expect(typeof capturedProducer).toBe("function");
    expect(getPhase()).toEqual({});
    expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual([
      ["metadata", 1024],
    ]);
    empty(memory);
  });
  expect(accesses).toEqual(originals[0]!.accesses);
  expect(raw).toEqual(originals[0]!.controls);
  empty(memory);
  memory.dispose();
});
it("keeps original default seed getter null allocation-free and clears actual producer/plane after every remaining original getter null preserving first null over secondary cleanup with exact retry", async () => {
  for (let cut = 0; cut < originals[0]!.accesses.length; cut++) {
    const memory = new ManagedMemory(limits),
      getPhase = observe(memory),
      reserve = memory.reserve.bind(memory),
      raw = structuredClone(originals[0]!.controls);
    let calls = 0,
      capturedPlane: Phase["plane"],
      capturedProducer: Phase["producer"];
    await withManagedMemory(memory, async () => {
      const admitted = vi
        .spyOn(memory, "reserve")
        .mockImplementation((...args) => {
          const lease = reserve(...args),
            release = lease.release.bind(lease);
          vi.spyOn(lease, "release").mockImplementation(() => {
            release();
            throw Error("secondary metadata cleanup");
          });
          return lease;
        });
      let failure: unknown = "unset";
      try {
        noiseField(
          new Proxy(raw, {
            get(t, k, r) {
              if (calls++ === cut) {
                capturedPlane = getPhase()?.plane;
                capturedProducer = getPhase()?.producer;
                throw null;
              }
              return Reflect.get(t, k, r);
            },
          }),
          0.5,
          0.5,
        );
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      if (cut === 0) {
        expect(getPhase()).toBeUndefined();
        expect(admitted).not.toHaveBeenCalled();
      } else {
        expect(getPhase()).toEqual({});
        expect(typeof capturedProducer).toBe("function");
        if (
          originals[0]!.accesses[cut] === "z" ||
          originals[0]!.accesses[cut] === "zWeight"
        )
          expect(typeof capturedPlane).toBe("function");
      }
      expect(raw).toEqual(originals[0]!.controls);
      empty(memory);
      vi.restoreAllMocks();
      expect(noiseField(raw, 0.5, 0.5)).toBe(originals[0]!.output);
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual producer and any active plane after early/mid/final original floor or imul null preserving null over secondary cleanup and exact retry", async () => {
  for (const [method, cut] of [
    ["floor", 1],
    ["floor", 5],
    ["floor", 46],
    ["imul", 1],
    ["imul", 2],
    ["imul", 20],
    ["imul", 164],
  ] as const) {
    const memory = new ManagedMemory(limits),
      getPhase = observe(memory),
      reserve = memory.reserve.bind(memory);
    let capturedPlane: Phase["plane"],
      calls = 0;
    await withManagedMemory(memory, async () => {
      vi.spyOn(memory, "reserve").mockImplementation((...args) => {
        const lease = reserve(...args),
          release = lease.release.bind(lease);
        vi.spyOn(lease, "release").mockImplementation(() => {
          release();
          throw Error("secondary metadata cleanup");
        });
        return lease;
      });
      const capture = () => {
        expect(memory.owns(getPhase()!)).toBe(true);
        capturedPlane = getPhase()!.plane;
        throw null;
      };
      if (method === "floor") {
        const original = Math.floor;
        vi.spyOn(Math, "floor").mockImplementation((v) =>
          ++calls === cut ? capture() : original(v),
        );
      } else {
        const original = Math.imul;
        vi.spyOn(Math, "imul").mockImplementation((a, b) =>
          ++calls === cut ? capture() : original(a, b),
        );
      }
      let failure: unknown = "unset";
      try {
        noiseField(originals[0]!.controls, 0.5, 0.5);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeNull();
      if (
        (method === "floor" && cut === 5) ||
        (method === "imul" && (cut === 2 || cut === 20 || cut === 164))
      )
        expect(typeof capturedPlane).toBe("function");
      expect(getPhase()).toEqual({});
      empty(memory);
      vi.restoreAllMocks();
      expect(noiseField(originals[0]!.controls, 0.5, 0.5)).toBe(
        originals[0]!.output,
      );
      empty(memory);
    });
    memory.dispose();
  }
});
it("clears actual header after adoption null before producer/plane creation or original post-seed getters preserving null over secondary release and exact retry", async () => {
  const memory = new ManagedMemory(limits),
    reserve = memory.reserve.bind(memory),
    raw = structuredClone(originals[0]!.controls),
    accesses: string[] = [];
  let actual: Phase | undefined;
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "reserve").mockImplementation((...args) => {
      const lease = reserve(...args),
        release = lease.release.bind(lease);
      vi.spyOn(lease, "release").mockImplementation(() => {
        release();
        throw Error("secondary metadata cleanup");
      });
      return lease;
    });
    vi.spyOn(memory, "adopt").mockImplementation((value) => {
      actual = value as Phase;
      expect(actual).toEqual({ managed: true });
      throw null;
    });
    let failure: unknown = "unset";
    try {
      noiseField(
        new Proxy(raw, {
          get(t, k, r) {
            accesses.push(String(k));
            return Reflect.get(t, k, r);
          },
        }),
        0.5,
        0.5,
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(accesses).toEqual(["seed"]);
    expect(actual).toEqual({});
    expect(raw).toEqual(originals[0]!.controls);
    empty(memory);
    vi.restoreAllMocks();
    expect(noiseField(raw, 0.5, 0.5)).toBe(originals[0]!.output);
    empty(memory);
  });
  memory.dispose();
});
it("propagates successful scalar-consumer cleanup null only after actual producer/phase refs retire with no remaining plane and allows exact retry", async () => {
  const memory = new ManagedMemory(limits),
    getPhase = observe(memory),
    reserve = memory.reserve.bind(memory);
  await withManagedMemory(memory, async () => {
    vi.spyOn(memory, "reserve").mockImplementation((...args) => {
      const lease = reserve(...args),
        release = lease.release.bind(lease);
      vi.spyOn(lease, "release").mockImplementation(() => {
        expect(typeof getPhase()!.producer).toBe("function");
        expect(getPhase()!.plane).toBeUndefined();
        release();
        throw null;
      });
      return lease;
    });
    let failure: unknown = "unset";
    try {
      noiseField(originals[0]!.controls, 0.5, 0.5);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeNull();
    expect(getPhase()).toEqual({});
    empty(memory);
    vi.restoreAllMocks();
    expect(noiseField(originals[0]!.controls, 0.5, 0.5)).toBe(
      originals[0]!.output,
    );
    empty(memory);
  });
  memory.dispose();
});
it("uses actual admitted caller plane owner through original scalar production without new standalone lease or producer and drops plane after each octave", async () => {
  const memory = new ManagedMemory(limits);
  await withManagedMemory(memory, async () => {
    const reserve = vi.spyOn(memory, "reserve"),
      work = allocateRenderMetadata<Phase>(
        1024,
        () => ({}),
        false,
        (value) => {
          for (const key in value) delete value[key as keyof Phase];
        },
      ),
      planes = new Set<NonNullable<Phase["plane"]>>(),
      accesses: string[] = [];
    const result = noiseField(
      new Proxy(originals[0]!.controls, {
        get(t, k, r) {
          accesses.push(String(k));
          expect(memory.owns(work)).toBe(true);
          expect(memory.statistics.current.metadata).toBe(1024);
          expect(work.producer).toBeUndefined();
          if (k === "z") {
            expect(typeof work.plane).toBe("function");
            planes.add(work.plane!);
          }
          if (k === "octaves") expect(work.plane).toBeUndefined();
          return Reflect.get(t, k, r);
        },
      }),
      0.5,
      0.5,
      undefined,
      work,
    );
    expect(result).toBe(originals[0]!.output);
    expect(accesses).toEqual(originals[0]!.accesses);
    expect(planes.size).toBe(4);
    expect(work.plane).toBeUndefined();
    expect(reserve.mock.calls.map((x) => [x[0], x[1]])).toEqual([
      ["metadata", 1024],
    ]);
    releaseRenderMetadata(work);
    expect(work).toEqual({});
    empty(memory);
  });
  memory.dispose();
});
