/** Family authoring is prepared once; every frame uses the shared composition backend. */
export {
  loadIllustratedImages,
  type Images,
} from "./composition/adapters/illustrated-assets.ts";
export { createPreparedIllustratedPreview as createIllustratedPreview } from "./composition/adapters/illustrated-preview.ts";
