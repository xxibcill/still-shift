import type {
  NativeObservedFrame,
  NativeObservedFrameVersions,
} from "@still-shift/scene-contract";
import type {
  NativeDepthOp,
  SurfaceNode,
} from "../composition/render/graph.ts";
import type {
  WebglDevice,
  WebglSurface,
} from "../composition/render/webgl-device.ts";
import type { DeepReadonly } from "./types.ts";
import type { PreparedNative3DSceneVersions } from "./types-v2.ts";
import type { NativeTextureFont } from "./three-textures.ts";

import type { PreparedNativePbrResources } from "./pbr-resources.ts";

/** Type-only browser injection: importing the pure renderer never imports Three. */
export type NativeDepthRuntimeOptions = {
  native3D?: Readonly<Record<string, PreparedNative3DSceneVersions>>;
  nativePbrResources?: Readonly<Record<string, PreparedNativePbrResources>>;
  nativeTextureFont?: (asset: string) => NativeTextureFont | undefined;
  nativeAppearanceCodeSha256?: string;
  observeNativeFrameV2?: (
    observed:
      | DeepReadonly<NativeObservedFrameVersions>
      | Promise<DeepReadonly<NativeObservedFrameVersions>>,
    sampleFrame: number,
  ) => void;
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
  finalize?(): Promise<void>;
  dispose(): void;
};
export type NativeDepthRuntimeFactory = (
  device: WebglDevice,
  options: NativeDepthRuntimeOptions,
) => NativeDepthRuntime;
