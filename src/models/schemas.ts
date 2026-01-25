/**
 * Zod schemas for configuration validation
 *
 * Note: Uses zod v4 syntax for SDK compatibility.
 */

import { z } from 'zod/v4';
import { DEFAULT_LANGUAGE } from '../constants.js';

/** Agent type schema */
export const AgentTypeSchema = z.enum(['coder', 'architect', 'supervisor', 'custom']);

/** Status schema */
export const StatusSchema = z.enum([
  'pending',
  'in_progress',
  'done',
  'blocked',
  'approved',
  'rejected',
  'cancelled',
  'interrupted',
]);

/** Transition condition schema */
export const TransitionConditionSchema = z.enum([
  'done',
  'blocked',
  'approved',
  'rejected',
  'always',
]);

/** On no status behavior schema */
export const OnNoStatusBehaviorSchema = z.enum(['complete', 'continue', 'stay']);

/** Workflow transition schema */
export const WorkflowTransitionSchema = z.object({
  condition: TransitionConditionSchema,
  nextStep: z.string().min(1),
});

/** Workflow step schema - raw YAML format */
export const WorkflowStepRawSchema = z.object({
  name: z.string().min(1),
  agent: z.string().min(1),
  /** Display name for the agent (shown in output). Falls back to agent basename if not specified */
  agent_name: z.string().optional(),
  instruction: z.string().optional(),
  instruction_template: z.string().optional(),
  pass_previous_response: z.boolean().optional().default(true),
  on_no_status: OnNoStatusBehaviorSchema.optional(),
  transitions: z.array(
    z.object({
      condition: TransitionConditionSchema,
      next_step: z.string().min(1),
    })
  ).optional().default([]),
});

/** Workflow configuration schema - raw YAML format */
export const WorkflowConfigRawSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(WorkflowStepRawSchema).min(1),
  initial_step: z.string().optional(),
  max_iterations: z.number().int().positive().optional().default(10),
  answer_agent: z.string().optional(),
});

/** Custom agent configuration schema */
export const CustomAgentConfigSchema = z.object({
  name: z.string().min(1),
  prompt_file: z.string().optional(),
  prompt: z.string().optional(),
  allowed_tools: z.array(z.string()).optional(),
  status_patterns: z.record(z.string(), z.string()).optional(),
  claude_agent: z.string().optional(),
  claude_skill: z.string().optional(),
  model: z.string().optional(),
}).refine(
  (data) => data.prompt_file || data.prompt || data.claude_agent || data.claude_skill,
  { message: 'Agent must have prompt_file, prompt, claude_agent, or claude_skill' }
);

/** Debug config schema */
export const DebugConfigSchema = z.object({
  enabled: z.boolean().optional().default(false),
  log_file: z.string().optional(),
});

/** Language setting schema */
export const LanguageSchema = z.enum(['en', 'ja']);

/** Global config schema */
export const GlobalConfigSchema = z.object({
  language: LanguageSchema.optional().default(DEFAULT_LANGUAGE),
  trusted_directories: z.array(z.string()).optional().default([]),
  default_workflow: z.string().optional().default('default'),
  log_level: z.enum(['debug', 'info', 'warn', 'error']).optional().default('info'),
  debug: DebugConfigSchema.optional(),
});

/** Project config schema */
export const ProjectConfigSchema = z.object({
  workflow: z.string().optional(),
  agents: z.array(CustomAgentConfigSchema).optional(),
});

/** Status pattern for parsing agent output */
export const DEFAULT_STATUS_PATTERNS: Record<string, Record<string, string>> = {
  coder: {
    done: '\\[CODER:(DONE|FIXED)\\]',
    blocked: '\\[CODER:BLOCKED\\]',
  },
  architect: {
    approved: '\\[ARCHITECT:APPROVE\\]',
    rejected: '\\[ARCHITECT:REJECT\\]',
  },
  supervisor: {
    approved: '\\[SUPERVISOR:APPROVE\\]',
    rejected: '\\[SUPERVISOR:REJECT\\]',
  },
  security: {
    approved: '\\[SECURITY:APPROVE\\]',
    rejected: '\\[SECURITY:REJECT\\]',
  },
  // MAGI System agents
  melchior: {
    approved: '\\[MELCHIOR:APPROVE\\]',
    rejected: '\\[MELCHIOR:REJECT\\]',
  },
  balthasar: {
    approved: '\\[BALTHASAR:APPROVE\\]',
    rejected: '\\[BALTHASAR:REJECT\\]',
  },
  casper: {
    approved: '\\[MAGI:APPROVE\\]',
    rejected: '\\[MAGI:REJECT\\]',
  },
  // Research workflow agents
  planner: {
    done: '\\[PLANNER:DONE\\]',
    blocked: '\\[PLANNER:BLOCKED\\]',
  },
  digger: {
    done: '\\[DIGGER:DONE\\]',
    blocked: '\\[DIGGER:BLOCKED\\]',
  },
  // Research supervisor - uses same patterns as default supervisor
  'research/supervisor': {
    approved: '\\[SUPERVISOR:APPROVE\\]',
    rejected: '\\[SUPERVISOR:REJECT\\]',
  },
};
