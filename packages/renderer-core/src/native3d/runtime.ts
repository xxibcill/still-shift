import type { NativeObservedFrame } from "@still-shift/scene-contract";
import type {
  NativeDepthOp,
  SurfaceNode,
} from "../composition/render/graph.ts";
import type {
  WebglDevice,
  WebglSurface,
} from "../composition/render/webgl-device.ts";
import type { PreparedNative3DScene } from "./types.ts";
import type { NativeTextureFont } from "./three-textures.ts";

/** Type-only browser injection: importing the pure renderer never imports Three. */
export type NativeDepthRuntimeOptions = {
  native3D?: Readonly<Record<string, PreparedNative3DScene>>;
  nativeTextureFont?: (asset: string) => NativeTextureFont | undefined;
  nativeAppearanceCodeSha256?: string;
  observeNativeFrame?: (
    observed: NativeObservedFrame,
    sampleFrame: number,
  ) => void;
};
export type NativeDepthRuntime = {
  readonly allocated: number;
  validate(op: NativeDepthOp): void;
  render(
    op: NativeDepthOp,
    target: WebglSurface,
    renderArtwork: (node: SurfaceNode) => WebglSurface,
  ): void;
  dispose(): void;
};
export type NativeDepthRuntimeFactory = (
  device: WebglDevice,
  options: NativeDepthRuntimeOptions,
) => NativeDepthRuntime;
