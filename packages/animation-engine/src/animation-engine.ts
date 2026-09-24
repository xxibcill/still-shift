import type {
  AnimationRequest,
  AnimationResult,
} from "@still-shift/scene-contract";

export interface AnimationEngine {
  animate(request: AnimationRequest): Promise<AnimationResult>;
}
