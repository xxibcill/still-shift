import type {
  AnimationRequest,
  AnimationResult,
} from "@still-shift/scene-contract";

export interface AnimationEngine {
  requestIdentity(request: AnimationRequest): string;
  animate(request: AnimationRequest): Promise<AnimationResult>;
}
