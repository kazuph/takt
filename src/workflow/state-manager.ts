/**
 * Workflow state management
 *
 * Manages the mutable state of a workflow execution including
 * user inputs and agent sessions.
 */

import type { WorkflowState, WorkflowConfig, AgentResponse } from '../models/types.js';
import {
  MAX_USER_INPUTS,
  MAX_INPUT_LENGTH,
} from './constants.js';
import type { WorkflowEngineOptions } from './types.js';

/**
 * Create initial workflow state from config and options.
 */
export function createInitialState(
  config: WorkflowConfig,
  options: WorkflowEngineOptions
): WorkflowState {
  // Restore agent sessions from options if provided
  const agentSessions = new Map<string, string>();
  if (options.initialSessions) {
    for (const [agent, sessionId] of Object.entries(options.initialSessions)) {
      agentSessions.set(agent, sessionId);
    }
  }

  // Initialize user inputs from options if provided
  const userInputs = options.initialUserInputs
    ? [...options.initialUserInputs]
    : [];

  return {
    workflowName: config.name,
    currentStep: config.initialStep,
    iteration: 0,
    stepOutputs: new Map(),
    userInputs,
    agentSessions,
    stepIterations: new Map(),
    status: 'running',
  };
}

/**
 * Increment the iteration counter for a step and return the new value.
 */
export function incrementStepIteration(state: WorkflowState, stepName: string): number {
  const current = state.stepIterations.get(stepName) ?? 0;
  const next = current + 1;
  state.stepIterations.set(stepName, next);
  return next;
}

/**
 * Add user input to state with truncation and limit handling.
 */
export function addUserInput(state: WorkflowState, input: string): void {
  if (state.userInputs.length >= MAX_USER_INPUTS) {
    state.userInputs.shift(); // Remove oldest
  }
  const truncated = input.slice(0, MAX_INPUT_LENGTH);
  state.userInputs.push(truncated);
}

/**
 * Get the most recent step output.
 */
export function getPreviousOutput(state: WorkflowState): AgentResponse | undefined {
  const outputs = Array.from(state.stepOutputs.values());
  return outputs[outputs.length - 1];
}

/**
 * Store a step output and update agent session.
 */
export function storeStepOutput(
  state: WorkflowState,
  stepName: string,
  agentName: string,
  response: AgentResponse
): void {
  state.stepOutputs.set(stepName, response);

  if (response.sessionId) {
    state.agentSessions.set(agentName, response.sessionId);
  }
}
