/**
 * Claude query executor
 *
 * Executes Claude queries using the Agent SDK and handles
 * response processing and error handling.
 */

import {
  query,
  AbortError,
  type SDKResultMessage,
  type SDKAssistantMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { createLogger, getErrorMessage } from '../../shared/utils/index.js';
import {
  generateQueryId,
  registerQuery,
  unregisterQuery,
} from './query-manager.js';
import { sdkMessageToStreamEvent } from './stream-converter.js';
import { SdkOptionsBuilder } from './options-builder.js';
import type {
  ClaudeSpawnOptions,
  ClaudeResult,
} from './types.js';

const log = createLogger('claude-sdk');

/**
 * Executes Claude queries using the Agent SDK.
 *
 * Handles query lifecycle (register/unregister), streaming,
 * assistant text accumulation, and error classification.
 */
export class QueryExecutor {
  /**
   * Execute a Claude query.
   */
  async execute(
    prompt: string,
    options: ClaudeSpawnOptions,
  ): Promise<ClaudeResult> {
    const queryId = generateQueryId();

    log.debug('Executing Claude query via SDK', {
      queryId,
      cwd: options.cwd,
      model: options.model,
      hasSystemPrompt: !!options.systemPrompt,
      allowedTools: options.allowedTools,
    });

    const sdkOptions = new SdkOptionsBuilder(options).build();

    let sessionId: string | undefined;
    let success = false;
    let resultContent: string | undefined;
    let hasResultMessage = false;
    let accumulatedAssistantText = '';

    try {
      const q = query({ prompt, options: sdkOptions });
      registerQuery(queryId, q);

      for await (const message of q) {
        if ('session_id' in message) {
          sessionId = message.session_id;
        }

        if (options.onStream) {
          sdkMessageToStreamEvent(message, options.onStream, true);
        }

        if (message.type === 'assistant') {
          const assistantMsg = message as SDKAssistantMessage;
          for (const block of assistantMsg.message.content) {
            if (block.type === 'text') {
              accumulatedAssistantText += block.text;
            }
          }
        }

        if (message.type === 'result') {
          hasResultMessage = true;
          const resultMsg = message as SDKResultMessage;
          if (resultMsg.subtype === 'success') {
            resultContent = resultMsg.result;
            success = true;
          } else {
            success = false;
            if (resultMsg.errors && resultMsg.errors.length > 0) {
              resultContent = resultMsg.errors.join('\n');
            }
          }
        }
      }

      unregisterQuery(queryId);

      const finalContent = resultContent || accumulatedAssistantText;

      log.info('Claude query completed', {
        queryId,
        sessionId,
        contentLength: finalContent.length,
        success,
        hasResultMessage,
      });

      return {
        success,
        content: finalContent.trim(),
        sessionId,
        fullContent: accumulatedAssistantText.trim(),
      };
    } catch (error) {
      unregisterQuery(queryId);
      return QueryExecutor.handleQueryError(error, queryId, sessionId, hasResultMessage, success, resultContent);
    }
  }

  /**
   * Handle query execution errors.
   * Classifies errors (abort, rate limit, auth, timeout) and returns appropriate ClaudeResult.
   */
  private static handleQueryError(
    error: unknown,
    queryId: string,
    sessionId: string | undefined,
    hasResultMessage: boolean,
    success: boolean,
    resultContent: string | undefined,
  ): ClaudeResult {
    if (error instanceof AbortError) {
      log.info('Claude query was interrupted', { queryId });
      return {
        success: false,
        content: '',
        error: 'Query interrupted',
        interrupted: true,
      };
    }

    const errorMessage = getErrorMessage(error);

    if (hasResultMessage && success) {
      log.info('Claude query completed with post-completion error (ignoring)', {
        queryId,
        sessionId,
        error: errorMessage,
      });
      return {
        success: true,
        content: (resultContent ?? '').trim(),
        sessionId,
      };
    }

    log.error('Claude query failed', { queryId, error: errorMessage });

    if (errorMessage.includes('rate_limit') || errorMessage.includes('rate limit')) {
      return { success: false, content: '', error: 'Rate limit exceeded. Please try again later.' };
    }

    if (errorMessage.includes('authentication') || errorMessage.includes('unauthorized')) {
      return { success: false, content: '', error: 'Authentication failed. Please check your API credentials.' };
    }

    if (errorMessage.includes('timeout')) {
      return { success: false, content: '', error: 'Request timed out. Please try again.' };
    }

    return { success: false, content: '', error: errorMessage };
  }
}

export async function executeClaudeQuery(
  prompt: string,
  options: ClaudeSpawnOptions,
): Promise<ClaudeResult> {
  return new QueryExecutor().execute(prompt, options);
}
