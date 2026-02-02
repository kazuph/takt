/**
 * Workflow configuration and runtime state types
 */

import type { PermissionMode } from './status.js';
import type { AgentResponse } from './response.js';

/** Rule-based transition configuration (unified format) */
export interface WorkflowRule {
  /** Human-readable condition text */
  condition: string;
  /** Next step name (e.g., implement, COMPLETE, ABORT). Optional for parallel sub-steps. */
  next?: string;
  /** Template for additional AI output */
  appendix?: string;
  /** Require user input before continuing (interactive mode only) */
  requiresUserInput?: boolean;
  /** Rule applies only in interactive mode */
  interactiveOnly?: boolean;
  /** Whether this condition uses ai() expression (set by loader) */
  isAiCondition?: boolean;
  /** The condition text inside ai("...") for AI judge evaluation (set by loader) */
  aiConditionText?: string;
  /** Whether this condition uses all()/any() aggregate expression (set by loader) */
  isAggregateCondition?: boolean;
  /** Aggregate type: 'all' requires all sub-steps match, 'any' requires at least one (set by loader) */
  aggregateType?: 'all' | 'any';
  /** The condition text inside all("...")/any("...") to match against sub-step results (set by loader) */
  aggregateConditionText?: string;
}

/** Report file configuration for a workflow step (label: path pair) */
export interface ReportConfig {
  /** Display label (e.g., "Scope", "Decisions") */
  label: string;
  /** File path relative to report directory (e.g., "01-coder-scope.md") */
  path: string;
}

/** Report object configuration with order/format instructions */
export interface ReportObjectConfig {
  /** Report file name (e.g., "00-plan.md") */
  name: string;
  /** Instruction prepended before instruction_template (e.g., output destination) */
  order?: string;
  /** Instruction appended after instruction_template (e.g., output format) */
  format?: string;
}

/** Single step in a workflow */
export interface WorkflowStep {
  name: string;
  /** Agent name or path as specified in workflow YAML */
  agent: string;
  /** Session handling for this step */
  session?: 'continue' | 'refresh';
  /** Display name for the agent (shown in output). Falls back to agent basename if not specified */
  agentDisplayName: string;
  /** Allowed tools for this step (optional, passed to agent execution) */
  allowedTools?: string[];
  /** Resolved absolute path to agent prompt file (set by loader) */
  agentPath?: string;
  /** Provider override for this step */
  provider?: 'claude' | 'codex' | 'mock';
  /** Model override for this step */
  model?: string;
  /** Permission mode for tool execution in this step */
  permissionMode?: PermissionMode;
  /** Whether this step is allowed to edit project files (true=allowed, false=prohibited, undefined=no prompt) */
  edit?: boolean;
  instructionTemplate: string;
  /** Rules for step routing */
  rules?: WorkflowRule[];
  /** Report file configuration. Single string, array of label:path, or object with order/format. */
  report?: string | ReportConfig[] | ReportObjectConfig;
  passPreviousResponse: boolean;
  /** Sub-steps to execute in parallel. When set, this step runs all sub-steps concurrently. */
  parallel?: WorkflowStep[];
}

/** Loop detection configuration */
export interface LoopDetectionConfig {
  /** Maximum consecutive runs of the same step before triggering (default: 10) */
  maxConsecutiveSameStep?: number;
  /** Action to take when loop is detected (default: 'warn') */
  action?: 'abort' | 'warn' | 'ignore';
}

/** Workflow configuration */
export interface WorkflowConfig {
  name: string;
  description?: string;
  steps: WorkflowStep[];
  initialStep: string;
  maxIterations: number;
  /** Loop detection settings */
  loopDetection?: LoopDetectionConfig;
  /**
   * Agent to use for answering AskUserQuestion prompts automatically.
   * When specified, questions from Claude Code are routed to this agent
   * instead of prompting the user interactively.
   */
  answerAgent?: string;
}

/** Runtime state of a workflow execution */
export interface WorkflowState {
  workflowName: string;
  currentStep: string;
  iteration: number;
  stepOutputs: Map<string, AgentResponse>;
  userInputs: string[];
  agentSessions: Map<string, string>;
  /** Per-step iteration counters (how many times each step has been executed) */
  stepIterations: Map<string, number>;
  status: 'running' | 'completed' | 'aborted';
}
