import type { CompactSceneContext } from '@/core/prompt/scene-context';
import type { ModelProgress } from './worker-types';

export type PlanCorrection = { previousOutput: string; error: string };

export interface TextPlanner {
  /** Shown in the UI. Mock planners must say so. */
  readonly label: string;
  readonly isMock: boolean;
  load(onProgress?: (event: ModelProgress) => void): Promise<void>;
  /** Returns raw model text. It is untrusted and must go through the parser and validators. */
  generatePlan(input: {
    userText: string;
    sceneContext: CompactSceneContext;
    correction?: PlanCorrection;
    /** Called with the running count of generated tokens. */
    onToken?: (tokens: number) => void;
  }): Promise<string>;
  cancel?(): void;
  dispose?(): Promise<void> | void;
}
