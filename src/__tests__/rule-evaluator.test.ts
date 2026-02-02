import { describe, it, expect } from 'vitest';
import { detectMatchedRule } from '../workflow/rule-evaluator.js';
import type { WorkflowStep, WorkflowState } from '../models/types.js';

describe('detectMatchedRule', () => {
  it('prefers phase1 tag when phase3 conflicts', async () => {
    const step: WorkflowStep = {
      name: 'plan',
      agent: 'planner',
      agentDisplayName: 'planner',
      instructionTemplate: '',
      passPreviousResponse: false,
      rules: [
        { condition: 'ok', next: 'next' },
        { condition: 'not', next: 'abort' },
      ],
    };

    const state: WorkflowState = {
      iteration: 1,
      stepOutputs: new Map(),
      stepIterations: new Map(),
      currentStep: 'plan',
      agentSessions: new Map(),
    };

    const agentContent = '[PLAN:1]';
    const tagContent = '[PLAN:2]';

    const result = await detectMatchedRule(step, agentContent, tagContent, { state, cwd: process.cwd() });

    expect(result).toEqual({ index: 0, method: 'phase1_tag_conflict' });
  });
});
