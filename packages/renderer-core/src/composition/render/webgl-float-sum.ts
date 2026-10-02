/**
 * The reference sums byte/255 values in a Float32Array, rounding after each
 * double-precision addition. Prematurely rounding each addend changes half-byte
 * output ties. Q32 integers compare the exact rational value to the adjacent
 * Float32 midpoints. Nonzero inputs are >= 1/255 and totals are <= 64*255,
 * so the complete comparison fits in two unsigned 32-bit words.
 */
// Only integer products can land exactly on a Float32 midpoint. JavaScript's
// preceding double multiply occasionally lies one double ULP either side of that
// integer; retain those 42 byte-pair exceptions as shader control constants.
function productErrors() {
  const cases: string[] = [];
  for (let alpha = 1; alpha < 256; alpha++)
    for (let color = 1; color < 256; color++) {
      const numerator = color * alpha;
      if (numerator % 255) continue;
      const error = color * (alpha / 255) - numerator / 255;
      if (error) cases.push(`case ${alpha * 256 + color}u: return ${error};`);
    }
  return `float byteProductError(uvec2 bytes) {
    switch(bytes.y*256u+bytes.x) { ${cases.join("\n")} default: return 0.0; }
  }`;
}
export const FLOAT32_RATIONAL_SUM = `
${productErrors()}
uvec2 addWide(uvec2 a, uvec2 b) {
  uint low=a.x+b.x;
  return uvec2(low,a.y+b.y+uint(low<a.x));
}
uvec2 subtractWide(uvec2 a, uvec2 b) {
  return uvec2(a.x-b.x,a.y-b.y-uint(a.x<b.x));
}
bool lessWide(uvec2 a, uvec2 b) { return a.y<b.y || (a.y==b.y && a.x<b.x); }
uvec2 timesSmall(uvec2 value, uint factor) {
  uint low=(value.x&65535u)*factor;
  uint high=(value.x>>16u)*factor+(low>>16u);
  return uvec2((low&65535u)|(high<<16u),value.y*factor+(high>>16u));
}
uvec2 fixed32(float value) {
  if(value==0.0) return uvec2(0u);
  uint bits=floatBitsToUint(value), mantissa=(bits&8388607u)|8388608u;
  uint shift=(bits>>23u)-118u;
  return uvec2(mantissa<<shift,mantissa>>(32u-shift));
}
float addByteFraction(float total, uint numerator, uvec2 product) {
  if(numerator==0u) return total;
  uint bits=floatBitsToUint(total+float(numerator)*(1.0/255.0));
  uvec2 exact=addWide(timesSmall(fixed32(total),255u),uvec2(0u,numerator));
  // A software GPU's approximate division can place the initial guess two ULPs away.
  for(int correction=0;correction<4;correction++) {
    uint halfStep=1u<<((bits>>23u)-119u);
    uint lowerStep=(bits&8388607u)==0u ? halfStep>>1u : halfStep;
    uvec2 position=fixed32(uintBitsToFloat(bits));
    uvec2 lower=timesSmall(subtractWide(position,uvec2(lowerStep,0u)),255u);
    uvec2 upper=timesSmall(addWide(position,uvec2(halfStep,0u)),255u);
    bool odd=(bits&1u)!=0u, down=lessWide(exact,lower), up=lessWide(upper,exact);
    bool atLower=all(equal(exact,lower)), atUpper=all(equal(exact,upper));
    if(atLower || atUpper) {
      float error=byteProductError(product);
      uint exponent=(bits>>23u)-53u;
      if(atLower && (bits&8388607u)==0u) exponent--;
      float cutoff=uintBitsToFloat(exponent<<23u);
      bool tied=abs(error)<=cutoff;
      if(atLower) down=error < -cutoff || (tied && odd);
      if(atUpper) up=error > cutoff || (tied && odd);
    }
    if(down) bits--;
    else if(up) bits++;
    else break;
  }
  return uintBitsToFloat(bits);
}
float addByteFraction(float total, uint numerator) {
  return addByteFraction(total,numerator,uvec2(0u));
}
uint averageAlpha(float total, uint count) {
  uvec2 scaled=timesSmall(fixed32(total),255u);
  uint result=scaled.y/count, remainder=scaled.y%count, midpoint=count/2u;
  bool up=remainder>midpoint || (remainder==midpoint && ((count&1u)==0u || scaled.x>=2147483648u));
  return result+uint(up);
}
uint straightByte(float total, float alpha) {
  uint candidate=uint(floor(total/alpha+0.5));
  uvec2 twice=timesSmall(fixed32(total),2u), weight=fixed32(alpha);
  if(candidate>0u && lessWide(twice,timesSmall(weight,2u*candidate-1u))) candidate--;
  else if(!lessWide(twice,timesSmall(weight,2u*candidate+1u))) candidate++;
  return candidate;
}
`;
