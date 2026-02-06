/**
 * Blocked state handler for piece execution
 *
 * Handles the case when an agent returns a blocked status,
 * requesting user input to continue.
 */

import type { PieceMovement, AgentResponse } from '../../models/types.js';
import type { UserInputRequest, PieceEngineOptions } from '../types.js';
import { extractBlockedPrompt } from './transitions.js';

/**
 * Result of handling a blocked state.
 */
export interface BlockedHandlerResult {
  /** Whether the piece should continue */
  shouldContinue: boolean;
  /** The user input provided (if any) */
  userInput?: string;
}

/**
 * Handle blocked status by requesting user input.
 *
 * @param step - The movement that is blocked
 * @param response - The blocked response from the agent
 * @param options - Piece engine options containing callbacks
 * @returns Result indicating whether to continue and any user input
 */
export async function handleBlocked(
  step: PieceMovement,
  response: AgentResponse,
  options: PieceEngineOptions
): Promise<BlockedHandlerResult> {
  // If no user input callback is provided, cannot continue
  if (!options.onUserInput) {
    return { shouldContinue: false };
  }

  // Extract prompt from blocked message
  const prompt = extractBlockedPrompt(response.content);

  // Build the request
  const request: UserInputRequest = {
    movement: step,
    response,
    prompt,
  };

  // Request user input
  const userInput = await options.onUserInput(request);

  // If user cancels (returns null), abort
  if (userInput === null) {
    return { shouldContinue: false };
  }

  return {
    shouldContinue: true,
    userInput,
  };
}
