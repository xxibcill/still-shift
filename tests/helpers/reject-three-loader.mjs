/** Independent Node admission guard: pure renderer loading must not resolve Three. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "three" || specifier.startsWith("three/"))
    throw Error("Unexpected eager Three.js import through the pure renderer");
  return nextResolve(specifier, context);
}
