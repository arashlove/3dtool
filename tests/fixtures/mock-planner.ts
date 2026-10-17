import type { TextPlanner } from '@/ai/planner.interface';

/**
 * MOCK planner for tests only. Returns scripted text in order. It is not a language model
 * and its results are never evidence of live model behaviour.
 */
export class MockPlanner implements TextPlanner {
  readonly label = 'Mock planner (tests only)';
  readonly isMock = true;
  calls: Array<{ userText: string; correction?: { previousOutput: string; error: string } }> = [];

  constructor(private outputs: string[]) {}

  async generatePlan(input: Parameters<TextPlanner['generatePlan']>[0]) {
    this.calls.push({ userText: input.userText, correction: input.correction });
    const next = this.outputs.shift();
    if (next === undefined) throw new Error('MockPlanner ran out of scripted outputs');
    return next;
  }
}
