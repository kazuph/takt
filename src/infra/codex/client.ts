/**
 * Codex CLI integration for agent interactions
 *
 * Executes `codex exec` for non-interactive runs.
 */

import { spawn } from 'node:child_process';
import type { AgentResponse } from '../../core/models/index.js';
import { createLogger, getErrorMessage, createStreamDiagnostics, parseStructuredOutput, type StreamDiagnostics } from '../../shared/utils/index.js';
import { mapToCodexSandboxMode, type CodexCallOptions } from './types.js';
import {
  type CodexEvent,
  type CodexItem,
  createStreamTrackingState,
  extractThreadId,
  emitInit,
  emitText,
  emitResult,
  emitCodexItemStart,
  emitCodexItemCompleted,
  emitCodexItemUpdate,
} from './CodexStreamHandler.js';

export type { CodexCallOptions } from './types.js';

const log = createLogger('codex-sdk');
const CODEX_STREAM_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const CODEX_STREAM_ABORTED_MESSAGE = 'Codex execution aborted';
const CODEX_RETRY_MAX_ATTEMPTS = 3;
const CODEX_RETRY_BASE_DELAY_MS = 250;
const CODEX_RETRYABLE_ERROR_PATTERNS = [
  'stream disconnected before completion',
  'transport error',
  'network error',
  'error decoding response body',
  'econnreset',
  'etimedout',
  'eai_again',
  'fetch failed',
];

/**
 * Client for Codex SDK agent interactions.
 *
 * Handles thread management, streaming event conversion,
 * and response processing.
 */
export class CodexClient {
  private buildStructuredOutputSuffix(schema: Record<string, unknown>): string {
    return [
      '',
      '---',
      'IMPORTANT: You MUST respond with ONLY a valid JSON object matching this schema. No other text, no markdown code blocks, no explanation.',
      '```json',
      JSON.stringify(schema, null, 2),
      '```',
    ].join('\n');
  }

  private isRetriableError(message: string, aborted: boolean, abortCause?: 'timeout' | 'external'): boolean {
    if (aborted || abortCause) {
      return false;
    }

    const lower = message.toLowerCase();
    return CODEX_RETRYABLE_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
  }

  private async waitForRetryDelay(attempt: number, signal?: AbortSignal): Promise<void> {
    const delayMs = CODEX_RETRY_BASE_DELAY_MS * (2 ** Math.max(0, attempt - 1));
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        resolve();
      }, delayMs);

      const onAbort = (): void => {
        clearTimeout(timeoutId);
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        reject(new Error(CODEX_STREAM_ABORTED_MESSAGE));
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  /** Call Codex with an agent prompt */
  async call(
    agentType: string,
    prompt: string,
    options: CodexCallOptions,
  ): Promise<AgentResponse> {
    const sandboxMode = options.permissionMode
      ? mapToCodexSandboxMode(options.permissionMode)
      : 'workspace-write';
    const diag = createStreamDiagnostics('codex-cli', {
      agentType,
      model: options.model,
      hasSystemPrompt: !!options.systemPrompt,
    });

    let fullPrompt = options.systemPrompt
      ? `${options.systemPrompt}\n\n${prompt}`
      : prompt;
    if (options.outputSchema) {
      fullPrompt = `${fullPrompt}${this.buildStructuredOutputSuffix(options.outputSchema)}`;
    }

    const args: string[] = options.sessionId
      ? ['exec', 'resume', options.sessionId, fullPrompt, '--json', '--color', 'never']
      : ['exec', fullPrompt, '--json', '--color', 'never', '--sandbox', sandboxMode];

    if (!options.sessionId) {
      args.push('--cd', options.cwd);
    }
    if (options.model) {
      args.push('--model', options.model);
    }
    if (options.permissionMode === 'full') {
      args.push('--dangerously-bypass-approvals-and-sandbox');
    }

    const env = options.openaiApiKey
      ? { ...process.env, OPENAI_API_KEY: options.openaiApiKey }
      : process.env;

    let threadId = options.sessionId;
    let content = '';
    let failedMessage = '';
    let stdoutNoise = '';
    let stderrOutput = '';
    let turnCompleted = false;
    let aborted = false;
    const contentOffsets = new Map<string, number>();

    return new Promise<AgentResponse>((resolve) => {
      const child = spawn('codex', args, {
        cwd: options.cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const onAbort = (): void => {
        aborted = true;
        if (!child.killed) {
          child.kill('SIGINT');
        }
      };
      if (options.abortSignal) {
        if (options.abortSignal.aborted) {
          onAbort();
        } else {
          options.abortSignal.addEventListener('abort', onAbort, { once: true });
        }
      }

      let stdoutBuffer = '';
      child.stdout.on('data', (chunk: Buffer | string) => {
        stdoutBuffer += chunk.toString();
        let newlineIndex = stdoutBuffer.indexOf('\n');
        while (newlineIndex >= 0) {
          const rawLine = stdoutBuffer.slice(0, newlineIndex).trim();
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
          newlineIndex = stdoutBuffer.indexOf('\n');

          if (rawLine.length === 0) {
            continue;
          }

          try {
            const event = JSON.parse(rawLine) as CodexEvent;
            diag.onFirstEvent(event.type);
            diag.onEvent(event.type);

            if (event.type === 'thread.started') {
              threadId = typeof event.thread_id === 'string' ? event.thread_id : threadId;
              emitInit(options.onStream, options.model, threadId);
              continue;
            }

            if (event.type === 'turn.completed') {
              turnCompleted = true;
              continue;
            }

            if (event.type === 'turn.failed') {
              if (event.error && typeof event.error === 'object' && 'message' in event.error) {
                failedMessage = String((event.error as { message?: unknown }).message ?? '');
              } else {
                failedMessage = 'Codex execution failed';
              }
              continue;
            }

            if (event.type === 'error') {
              failedMessage = typeof event.message === 'string' ? event.message : 'Codex execution failed';
              continue;
            }

            if (event.type === 'item.updated' || event.type === 'item.completed') {
              const item = event.item as CodexItem | undefined;
              if (item && item.type === 'agent_message' && typeof item.text === 'string') {
                const itemId = item.id;
                const text = item.text;
                if (itemId) {
                  const prev = contentOffsets.get(itemId) ?? 0;
                  if (text.length > prev) {
                    const delta = text.slice(prev);
                    if (prev === 0 && content.length > 0) {
                      content += '\n';
                    }
                    content += delta;
                    contentOffsets.set(itemId, text.length);
                    emitText(options.onStream, delta);
                  }
                } else {
                  if (content.length > 0) {
                    content += '\n';
                  }
                  content += text;
                  emitText(options.onStream, text);
                }
              }
            }
          } catch {
            stdoutNoise += (stdoutNoise ? '\n' : '') + rawLine;
          }
        }
      });

      child.stderr.on('data', (chunk: Buffer | string) => {
        stderrOutput += chunk.toString();
      });

      child.on('error', (error) => {
        if (options.abortSignal) {
          options.abortSignal.removeEventListener('abort', onAbort);
        }
        const message = getErrorMessage(error);
        diag.onCompleted('error', message);
        emitResult(options.onStream, false, message, threadId);
        resolve({
          persona: agentType,
          status: 'error',
          content: message,
          timestamp: new Date(),
          sessionId: threadId,
        });
      });

      child.on('close', (code, signal) => {
        if (options.abortSignal) {
          options.abortSignal.removeEventListener('abort', onAbort);
        }

        if (stdoutBuffer.trim().length > 0) {
          stdoutNoise += (stdoutNoise ? '\n' : '') + stdoutBuffer.trim();
        }

        const trimmed = content.trim();
        const structuredOutput = parseStructuredOutput(trimmed, !!options.outputSchema);
        const success = !aborted && !failedMessage && turnCompleted && code === 0 && signal == null;
        const errorMessage = success
          ? ''
          : (failedMessage || stderrOutput.trim() || stdoutNoise.trim() || CODEX_STREAM_ABORTED_MESSAGE);

        diag.onCompleted(success ? 'normal' : (aborted ? 'abort' : 'error'), success ? undefined : errorMessage);
        emitResult(options.onStream, success, success ? trimmed : errorMessage, threadId);

        resolve({
          persona: agentType,
          status: success ? 'done' : 'error',
          content: success ? trimmed : errorMessage,
          timestamp: new Date(),
          sessionId: threadId,
          structuredOutput,
        });
      });
    });
  }

  /** Call Codex with a custom agent configuration (system prompt + prompt) */
  async callCustom(
    agentName: string,
    prompt: string,
    systemPrompt: string,
    options: CodexCallOptions,
  ): Promise<AgentResponse> {
    return this.call(agentName, prompt, {
      ...options,
      systemPrompt,
    });
  }
}

const defaultClient = new CodexClient();

export async function callCodex(
  agentType: string,
  prompt: string,
  options: CodexCallOptions,
): Promise<AgentResponse> {
  return defaultClient.call(agentType, prompt, options);
}

export async function callCodexCustom(
  agentName: string,
  prompt: string,
  systemPrompt: string,
  options: CodexCallOptions,
): Promise<AgentResponse> {
  return defaultClient.callCustom(agentName, prompt, systemPrompt, options);
}
