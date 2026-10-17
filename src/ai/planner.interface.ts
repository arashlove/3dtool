import type { CompactSceneContext } from '@/core/prompt/scene-context';

export type PlanCorrection = { previousOutput: string; error: string };

export type GenerationProgress = { phase: 'waiting' | 'thinking' | 'writing'; tokens: number };

export interface TextPlanner {
  /** Shown in the UI. Mock planners must say so. */
  readonly label: string;
  readonly isMock: boolean;
  /** Returns raw model text. It is untrusted and must go through the parser and validators. */
  generatePlan(input: {
    userText: string;
    sceneContext: CompactSceneContext;
    correction?: PlanCorrection;
    onProgress?: (progress: GenerationProgress) => void;
  }): Promise<string>;
  cancel?(): void;
}
