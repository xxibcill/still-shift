import { WebglDevice } from "../../packages/renderer-core/src/composition/render/webgl-device.ts";
import { FLOAT32_RATIONAL_SUM } from "../../packages/renderer-core/src/composition/render/webgl-float-sum.ts";

/** Compare actual shader arithmetic to the reference's Float32Array stores and byte rounding. */
export function checkWebglFloatSum() {
  const cases = 4096,
    samples = 64;
  const input = new Float32Array(cases * samples * 4);
  const expected = new Float32Array(cases * 4);
  const bytes = new Uint8Array(cases * 4);
  const midpointCases: {
    alpha: number;
    color: number;
    prior: number;
    priorAlpha: number;
  }[] = [];
  for (let alpha = 1; alpha < 256; alpha++)
    for (let color = 1; color < 256; color++) {
      if (
        (alpha * color) % 255 ||
        color * (alpha / 255) === (alpha * color) / 255
      )
        continue;
      findPrior: for (let priorAlpha = 1; priorAlpha < 256; priorAlpha++)
        for (let prior = 1; prior < 256; prior++) {
          const total = Math.fround(prior * (priorAlpha / 255));
          if (
            Math.fround(total + color * (alpha / 255)) !==
            Math.fround(total + (alpha * color) / 255)
          ) {
            midpointCases.push({ alpha, color, prior, priorAlpha });
            break findPrior;
          }
        }
    }
  if (midpointCases.length !== 42)
    throw new Error("Missing double-product midpoint cases");
  let seed = 123456789;
  const randomByte = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed >>> 24;
  };
  for (let row = 0; row < cases; row++) {
    const count = (row % samples) + 1;
    for (let index = 0; index < count; index++) {
      const critical =
        count === 2 ? midpointCases[Math.floor(row / samples)] : undefined;
      const alpha = critical
        ? index === 0
          ? critical.priorAlpha
          : critical.alpha
        : row === 3
          ? [161, 165, 166, 166][index]!
          : randomByte();
      const colors = critical
        ? (Array(3).fill(
            index === 0 ? critical.prior : critical.color,
          ) as number[])
        : [randomByte(), randomByte(), randomByte()];
      for (let channel = 0; channel < 4; channel++) {
        const numerator = (channel === 3 ? 1 : colors[channel]!) * alpha;
        input[(row * samples + index) * 4 + channel] = numerator;
        expected[row * 4 + channel] =
          expected[row * 4 + channel]! +
          (channel === 3 ? alpha / 255 : colors[channel]! * (alpha / 255));
      }
    }
    const alpha = Math.round((expected[row * 4 + 3]! * 255) / count);
    for (let channel = 0; channel < 3; channel++) {
      const color =
        expected[row * 4 + 3]! > 0
          ? Math.round(expected[row * 4 + channel]! / expected[row * 4 + 3]!)
          : 0;
      bytes[row * 4 + channel] = Math.round((color * alpha) / 255);
    }
    bytes[row * 4 + 3] = alpha;
  }
  const canvas = document.createElement("canvas");
  canvas.width = cases;
  canvas.height = 1;
  const device = new WebglDevice(canvas);
  const source = device.surface(samples, cases, true),
    sums = device.surface(cases, 1, true),
    output = device.surface(cases, 1);
  const body = `${FLOAT32_RATIONAL_SUM}
  void main() {
    int row=int(gl_FragCoord.x), count=row%64+1;
    vec4 sum=vec4(0.0);
    for(int index=0;index<64;index++) {
      if(index>=count) break;
      uvec4 n=uvec4(texelFetch(source,ivec2(index,row),0));
      uvec3 c=n.a>0u ? n.rgb/n.a : uvec3(0u);
      sum=vec4(addByteFraction(sum.r,n.r,uvec2(c.r,n.a)),addByteFraction(sum.g,n.g,uvec2(c.g,n.a)),addByteFraction(sum.b,n.b,uvec2(c.b,n.a)),addByteFraction(sum.a,n.a));
    }
    OUTPUT
  }`;
  try {
    device.uploadFloats(source, input);
    device.pass(body.replace("OUTPUT", "pixel=sum;"), sums, [source]);
    const gl = device.gl,
      actual = new Float32Array(expected.length);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sums.framebuffer);
    gl.readPixels(0, 0, cases, 1, gl.RGBA, gl.FLOAT, actual);
    const aBits = new Uint32Array(actual.buffer),
      eBits = new Uint32Array(expected.buffer);
    for (let index = 0; index < actual.length; index++)
      if (aBits[index] !== eBits[index])
        throw new Error(
          `GPU rational sum ${index}: ${actual[index]} != ${expected[index]}`,
        );
    device.pass(
      body.replace(
        "OUTPUT",
        `uint a=averageAlpha(sum.a,uint(count));
      uvec3 c=sum.a>0.0 ? uvec3(straightByte(sum.r,sum.a),straightByte(sum.g,sum.a),straightByte(sum.b,sum.a)) : uvec3(0u);
      pixel=vec4(vec3((c*a+127u)/255u),float(a))/255.0;`,
      ),
      output,
      [source],
    );
    const actualBytes = device.read(output);
    for (let index = 0; index < bytes.length; index++)
      if (actualBytes[index] !== bytes[index])
        throw new Error(
          `GPU rational byte ${index}: ${actualBytes[index]} != ${bytes[index]}`,
        );
    return cases;
  } finally {
    device.dispose();
  }
}
