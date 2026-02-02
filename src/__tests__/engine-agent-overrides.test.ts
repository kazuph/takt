/**
 * Tests for WorkflowEngine provider/model overrides.
 *
 * Verifies that CLI-specified overrides take precedence over workflow step defaults,
 * and that step-specific values are used when no overrides are present.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../agents/runner.js', () => ({
  runAgent: vi.fn(),
}));

vi.mock('../core/workflow/evaluation/index.js', () => ({
  detectMatchedRule: vi.fn(),
}));

vi.mock('../core/workflow/phase-runner.js', () => ({
  needsStatusJudgmentPhase: vi.fn(),
  runReportPhase: vi.fn(),
  runStatusJudgmentPhase: vi.fn(),
}));

vi.mock('../shared/utils/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateReportDir: vi.fn().mockReturnValue('test-report-dir'),
}));

import { WorkflowEngine } from '../core/workflow/index.js';
import { runAgent } from '../agents/runner.js';
import type { WorkflowConfig } from '../core/models/index.js';
import {
  makeResponse,
  makeRule,
  makeStep,
  mockRunAgentSequence,
  mockDetectMatchedRuleSequence,
  applyDefaultMocks,
} from './engine-test-helpers.js';

describe('WorkflowEngine agent overrides', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    applyDefaultMocks();
  });

  it('respects workflow step provider/model even when CLI overrides are provided', async () => {
    const step = makeStep('plan', {
      provider: 'claude',
      model: 'claude-step',
      rules: [makeRule('done', 'COMPLETE')],
    });
    const config: WorkflowConfig = {
      name: 'override-test',
      steps: [step],
      initialStep: 'plan',
      maxIterations: 1,
    };

    mockRunAgentSequence([
      makeResponse({ agent: step.agent, content: 'done' }),
    ]);
    mockDetectMatchedRuleSequence([{ index: 0, method: 'phase1_tag' }]);

    const engine = new WorkflowEngine(config, '/tmp/project', 'override task', {
      projectCwd: '/tmp/project',
      provider: 'codex',
      model: 'cli-model',
    });

    await engine.run();

    const options = vi.mocked(runAgent).mock.calls[0][2];
    expect(options.provider).toBe('claude');
    expect(options.model).toBe('claude-step');
  });

  it('allows CLI overrides when workflow step leaves provider/model undefined', async () => {
    const step = makeStep('plan', {
      rules: [makeRule('done', 'COMPLETE')],
    });
    const config: WorkflowConfig = {
      name: 'override-fallback',
      steps: [step],
      initialStep: 'plan',
      maxIterations: 1,
    };

    mockRunAgentSequence([
      makeResponse({ agent: step.agent, content: 'done' }),
    ]);
    mockDetectMatchedRuleSequence([{ index: 0, method: 'phase1_tag' }]);

    const engine = new WorkflowEngine(config, '/tmp/project', 'override task', {
      projectCwd: '/tmp/project',
      provider: 'codex',
      model: 'cli-model',
    });

    await engine.run();

    const options = vi.mocked(runAgent).mock.calls[0][2];
    expect(options.provider).toBe('codex');
    expect(options.model).toBe('cli-model');
  });

  it('falls back to workflow step provider/model when no overrides supplied', async () => {
    const step = makeStep('plan', {
      provider: 'claude',
      model: 'step-model',
      rules: [makeRule('done', 'COMPLETE')],
    });
    const config: WorkflowConfig = {
      name: 'step-defaults',
      steps: [step],
      initialStep: 'plan',
      maxIterations: 1,
    };

    mockRunAgentSequence([
      makeResponse({ agent: step.agent, content: 'done' }),
    ]);
    mockDetectMatchedRuleSequence([{ index: 0, method: 'phase1_tag' }]);

    const engine = new WorkflowEngine(config, '/tmp/project', 'step task', { projectCwd: '/tmp/project' });
    await engine.run();

    const options = vi.mocked(runAgent).mock.calls[0][2];
    expect(options.provider).toBe('claude');
    expect(options.model).toBe('step-model');
  });
});
