/**
 * Tests for takt models
 */

import { describe, it, expect } from 'vitest';
import {
  AgentTypeSchema,
  StatusSchema,
  TransitionConditionSchema,
  WorkflowConfigRawSchema,
  CustomAgentConfigSchema,
  GlobalConfigSchema,
  DEFAULT_STATUS_PATTERNS,
} from '../models/schemas.js';

describe('AgentTypeSchema', () => {
  it('should accept valid agent types', () => {
    expect(AgentTypeSchema.parse('coder')).toBe('coder');
    expect(AgentTypeSchema.parse('architect')).toBe('architect');
    expect(AgentTypeSchema.parse('supervisor')).toBe('supervisor');
    expect(AgentTypeSchema.parse('custom')).toBe('custom');
  });

  it('should reject invalid agent types', () => {
    expect(() => AgentTypeSchema.parse('invalid')).toThrow();
  });
});

describe('StatusSchema', () => {
  it('should accept valid statuses', () => {
    expect(StatusSchema.parse('pending')).toBe('pending');
    expect(StatusSchema.parse('done')).toBe('done');
    expect(StatusSchema.parse('approved')).toBe('approved');
    expect(StatusSchema.parse('rejected')).toBe('rejected');
    expect(StatusSchema.parse('blocked')).toBe('blocked');
  });

  it('should reject invalid statuses', () => {
    expect(() => StatusSchema.parse('unknown')).toThrow();
    expect(() => StatusSchema.parse('conditional')).toThrow();
  });
});

describe('TransitionConditionSchema', () => {
  it('should accept valid conditions', () => {
    expect(TransitionConditionSchema.parse('done')).toBe('done');
    expect(TransitionConditionSchema.parse('approved')).toBe('approved');
    expect(TransitionConditionSchema.parse('rejected')).toBe('rejected');
    expect(TransitionConditionSchema.parse('always')).toBe('always');
  });

  it('should reject invalid conditions', () => {
    expect(() => TransitionConditionSchema.parse('conditional')).toThrow();
    expect(() => TransitionConditionSchema.parse('fixed')).toThrow();
  });
});

describe('WorkflowConfigRawSchema', () => {
  it('should parse valid workflow config', () => {
    const config = {
      name: 'test-workflow',
      description: 'A test workflow',
      steps: [
        {
          name: 'step1',
          agent: 'coder',
          instruction: '{task}',
          transitions: [
            { condition: 'done', next_step: 'COMPLETE' },
          ],
        },
      ],
    };

    const result = WorkflowConfigRawSchema.parse(config);
    expect(result.name).toBe('test-workflow');
    expect(result.steps).toHaveLength(1);
    expect(result.max_iterations).toBe(10);
  });

  it('should require at least one step', () => {
    const config = {
      name: 'empty-workflow',
      steps: [],
    };

    expect(() => WorkflowConfigRawSchema.parse(config)).toThrow();
  });
});

describe('CustomAgentConfigSchema', () => {
  it('should accept agent with prompt', () => {
    const config = {
      name: 'my-agent',
      prompt: 'You are a helpful assistant.',
    };

    const result = CustomAgentConfigSchema.parse(config);
    expect(result.name).toBe('my-agent');
  });

  it('should accept agent with prompt_file', () => {
    const config = {
      name: 'my-agent',
      prompt_file: '/path/to/prompt.md',
    };

    const result = CustomAgentConfigSchema.parse(config);
    expect(result.prompt_file).toBe('/path/to/prompt.md');
  });

  it('should accept agent with claude_agent', () => {
    const config = {
      name: 'my-agent',
      claude_agent: 'architect',
    };

    const result = CustomAgentConfigSchema.parse(config);
    expect(result.claude_agent).toBe('architect');
  });

  it('should reject agent without any prompt source', () => {
    const config = {
      name: 'my-agent',
    };

    expect(() => CustomAgentConfigSchema.parse(config)).toThrow();
  });
});

describe('GlobalConfigSchema', () => {
  it('should provide defaults', () => {
    const config = {};
    const result = GlobalConfigSchema.parse(config);

    expect(result.trusted_directories).toEqual([]);
    expect(result.default_workflow).toBe('default');
    expect(result.log_level).toBe('info');
  });

  it('should accept valid config', () => {
    const config = {
      trusted_directories: ['/home/user/projects'],
      default_workflow: 'custom',
      log_level: 'debug' as const,
    };

    const result = GlobalConfigSchema.parse(config);
    expect(result.trusted_directories).toHaveLength(1);
    expect(result.log_level).toBe('debug');
  });
});

describe('DEFAULT_STATUS_PATTERNS', () => {
  it('should have patterns for built-in agents', () => {
    expect(DEFAULT_STATUS_PATTERNS.coder).toBeDefined();
    expect(DEFAULT_STATUS_PATTERNS.architect).toBeDefined();
    expect(DEFAULT_STATUS_PATTERNS.supervisor).toBeDefined();
  });

  it('should have patterns for MAGI system agents', () => {
    expect(DEFAULT_STATUS_PATTERNS.melchior).toBeDefined();
    expect(DEFAULT_STATUS_PATTERNS.balthasar).toBeDefined();
    expect(DEFAULT_STATUS_PATTERNS.casper).toBeDefined();

    // MAGI agents should have approved/rejected patterns
    expect(DEFAULT_STATUS_PATTERNS.melchior.approved).toBeDefined();
    expect(DEFAULT_STATUS_PATTERNS.melchior.rejected).toBeDefined();
    expect(DEFAULT_STATUS_PATTERNS.balthasar.approved).toBeDefined();
    expect(DEFAULT_STATUS_PATTERNS.balthasar.rejected).toBeDefined();
    expect(DEFAULT_STATUS_PATTERNS.casper.approved).toBeDefined();
    expect(DEFAULT_STATUS_PATTERNS.casper.rejected).toBeDefined();
  });

  it('should have patterns for research workflow agents', () => {
    expect(DEFAULT_STATUS_PATTERNS.planner).toBeDefined();
    expect(DEFAULT_STATUS_PATTERNS.digger).toBeDefined();

    expect(DEFAULT_STATUS_PATTERNS.planner.done).toBeDefined();
    expect(DEFAULT_STATUS_PATTERNS.digger.done).toBeDefined();
  });

  it('should have valid regex patterns', () => {
    for (const agentPatterns of Object.values(DEFAULT_STATUS_PATTERNS)) {
      for (const pattern of Object.values(agentPatterns)) {
        expect(() => new RegExp(pattern)).not.toThrow();
      }
    }
  });

  it('should match expected status markers', () => {
    // MAGI patterns
    expect(new RegExp(DEFAULT_STATUS_PATTERNS.melchior.approved).test('[MELCHIOR:APPROVE]')).toBe(true);
    expect(new RegExp(DEFAULT_STATUS_PATTERNS.melchior.conditional).test('[MELCHIOR:CONDITIONAL]')).toBe(true);
    expect(new RegExp(DEFAULT_STATUS_PATTERNS.casper.approved).test('[MAGI:APPROVE]')).toBe(true);
    expect(new RegExp(DEFAULT_STATUS_PATTERNS.casper.conditional).test('[MAGI:CONDITIONAL]')).toBe(true);

    // Research patterns
    expect(new RegExp(DEFAULT_STATUS_PATTERNS.planner.done).test('[PLANNER:DONE]')).toBe(true);
    expect(new RegExp(DEFAULT_STATUS_PATTERNS.digger.done).test('[DIGGER:DONE]')).toBe(true);
  });
});
