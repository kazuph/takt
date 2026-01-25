/**
 * Workflow state transition logic
 *
 * Handles determining the next step based on agent response status
 * and transition conditions defined in the workflow configuration.
 */

import type {
  WorkflowConfig,
  WorkflowStep,
  Status,
  TransitionCondition,
} from '../models/types.js';
import { COMPLETE_STEP, ABORT_STEP } from './constants.js';

/**
 * Check if status matches transition condition.
 */
export function matchesCondition(
  status: Status,
  condition: TransitionCondition
): boolean {
  if (condition === 'always') {
    return true;
  }

  // Map status to condition
  const statusConditionMap: Record<Status, TransitionCondition[]> = {
    done: ['done'],
    blocked: ['blocked'],
    approved: ['approved'],
    rejected: ['rejected'],
    pending: [],
    in_progress: [],
    cancelled: [],
    interrupted: [], // Interrupted is handled separately
  };

  const matchingConditions = statusConditionMap[status] || [];
  return matchingConditions.includes(condition);
}

/**
 * Handle case when no status marker is found in agent output.
 */
export function handleNoStatus(
  step: WorkflowStep,
  config: WorkflowConfig
): string {
  const behavior = step.onNoStatus || 'complete';

  switch (behavior) {
    case 'stay':
      // Stay on current step (original behavior, may cause loops)
      return step.name;

    case 'continue': {
      // Try to find done/always transition, otherwise find next step in workflow
      for (const transition of step.transitions) {
        if (transition.condition === 'done' || transition.condition === 'always') {
          return transition.nextStep;
        }
      }
      // Find next step in workflow order
      const stepIndex = config.steps.findIndex(s => s.name === step.name);
      const nextStep = config.steps[stepIndex + 1];
      if (stepIndex >= 0 && nextStep) {
        return nextStep.name;
      }
      return COMPLETE_STEP;
    }

    case 'complete':
    default:
      // Try to find done/always transition, otherwise complete workflow
      for (const transition of step.transitions) {
        if (transition.condition === 'done' || transition.condition === 'always') {
          return transition.nextStep;
        }
      }
      return COMPLETE_STEP;
  }
}

/**
 * Determine next step based on current status.
 */
export function determineNextStep(
  step: WorkflowStep,
  status: Status,
  config: WorkflowConfig
): string {
  // If interrupted, abort immediately
  if (status === 'interrupted') {
    return ABORT_STEP;
  }

  // Check transitions in order
  for (const transition of step.transitions) {
    if (matchesCondition(status, transition.condition)) {
      return transition.nextStep;
    }
  }

  // If status is 'in_progress' (no status marker found), use onNoStatus behavior
  if (status === 'in_progress') {
    return handleNoStatus(step, config);
  }

  // Unexpected status - treat as done and complete
  return COMPLETE_STEP;
}

/**
 * Extract user-facing prompt from blocked response.
 * Looks for common patterns like "必要な情報:", "質問:", etc.
 */
export function extractBlockedPrompt(content: string): string {
  // Try to extract specific question/info needed
  const patterns = [
    /必要な情報[:：]\s*(.+?)(?:\n|$)/i,
    /質問[:：]\s*(.+?)(?:\n|$)/i,
    /理由[:：]\s*(.+?)(?:\n|$)/i,
    /確認[:：]\s*(.+?)(?:\n|$)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  // Return the full content if no specific pattern found
  return content;
}
