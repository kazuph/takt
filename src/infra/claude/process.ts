/**
 * Claude CLI wrapper
 *
 * Executes `claude -p` for non-interactive runs.
 */

import { spawn } from 'node:child_process';
import type { Query } from '@anthropic-ai/claude-agent-sdk';
import {
  generateQueryId,
  registerQuery,
  unregisterQuery,
  interruptAllQueries,
  interruptQuery,
  isQueryActive,
  getActiveQueryCount,
  hasActiveProcess,
  interruptCurrentProcess,
} from './query-manager.js';
import type {
  ClaudeSpawnOptions,
  ClaudeResult,
} from './types.js';
import { parseStructuredOutput } from '../../shared/utils/index.js';

export type {
  StreamEvent,
  StreamCallback,
  PermissionRequest,
  PermissionHandler,
  AskUserQuestionInput,
  AskUserQuestionHandler,
  ClaudeResult,
  ClaudeResultWithQueryId,
  ClaudeSpawnOptions,
  InitEventData,
  ToolUseEventData,
  ToolResultEventData,
  ToolOutputEventData,
  TextEventData,
  ThinkingEventData,
  ResultEventData,
  ErrorEventData,
} from './types.js';

// Re-export query management functions
export {
  generateQueryId,
  hasActiveProcess,
  isQueryActive,
  getActiveQueryCount,
  interruptQuery,
  interruptAllQueries,
  interruptCurrentProcess,
} from './query-manager.js';

function mapPermissionMode(mode: ClaudeSpawnOptions['permissionMode']): string | undefined {
  if (!mode) return undefined;
  switch (mode) {
    case 'readonly':
      return 'default';
    case 'edit':
      return 'acceptEdits';
    case 'full':
      return 'bypassPermissions';
    default:
      return undefined;
  }
}

function extractAssistantText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';

  const blocks = content
    .map((block) => {
      if (!block || typeof block !== 'object') return '';
      if ((block as { type?: unknown }).type !== 'text') return '';
      return typeof (block as { text?: unknown }).text === 'string'
        ? (block as { text: string }).text
        : '';
    })
    .filter((text) => text.length > 0);

  return blocks.join('\n');
}

function buildClaudeArgs(prompt: string, options: ClaudeSpawnOptions): string[] {
  const args: string[] = [
    '-p',
    '--verbose',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
  ];

  if (options.model) {
    args.push('--model', options.model);
  }
  if (options.sessionId) {
    args.push('--resume', options.sessionId);
  }
  if (options.systemPrompt) {
    args.push('--system-prompt', options.systemPrompt);
  }

  const permissionMode = mapPermissionMode(options.permissionMode);
  if (permissionMode) {
    args.push('--permission-mode', permissionMode);
  }
  if (options.bypassPermissions) {
    args.push('--dangerously-skip-permissions');
  }
  if (options.allowedTools && options.allowedTools.length > 0) {
    args.push('--allowed-tools', options.allowedTools.join(','));
  }
  if (options.outputSchema) {
    args.push('--json-schema', JSON.stringify(options.outputSchema));
  }

  args.push(prompt);
  return args;
}

/**
 * Execute a Claude query using the Claude CLI.
 */
export async function executeClaudeCli(
  prompt: string,
  options: ClaudeSpawnOptions,
): Promise<ClaudeResult> {
  return new Promise<ClaudeResult>((resolve) => {
    const args = buildClaudeArgs(prompt, options);
    const env = options.anthropicApiKey
      ? { ...process.env, ANTHROPIC_API_KEY: options.anthropicApiKey }
      : process.env;

    const child = spawn('claude', args, {
      cwd: options.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const queryId = generateQueryId();
    const interruptable = {
      interrupt: async (): Promise<void> => {
        if (!child.killed) {
          child.kill('SIGINT');
        }
      },
    } as unknown as Query;
    registerQuery(queryId, interruptable);

    let sessionId = options.sessionId;
    let model = options.model ?? 'claude';
    let resultContent = '';
    let fallbackContent = '';
    let errorContent = '';
    let stderrContent = '';
    let success = false;
    let hasResult = false;
    let interrupted = false;
    let structuredOutput: Record<string, unknown> | undefined;

    const onAbort = (): void => {
      interrupted = true;
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

        if (rawLine.length === 0) {
          newlineIndex = stdoutBuffer.indexOf('\n');
          continue;
        }

        try {
          const parsed = JSON.parse(rawLine) as Record<string, unknown>;
          if (typeof parsed.session_id === 'string') {
            sessionId = parsed.session_id;
          }

          const type = typeof parsed.type === 'string' ? parsed.type : '';
          if (type === 'system' && parsed.subtype === 'init') {
            if (typeof parsed.model === 'string' && parsed.model.length > 0) {
              model = parsed.model;
            }
            if (sessionId) {
              options.onStream?.({
                type: 'init',
                data: { model, sessionId },
              });
            }
          } else if (type === 'stream_event') {
            const event = parsed.event as Record<string, unknown> | undefined;
            const eventType = typeof event?.type === 'string' ? event.type : '';
            if (eventType === 'content_block_delta') {
              const delta = event?.delta as Record<string, unknown> | undefined;
              if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
                fallbackContent += delta.text;
                options.onStream?.({
                  type: 'text',
                  data: { text: delta.text },
                });
              }
            }
          } else if (type === 'assistant') {
            const text = extractAssistantText(parsed.message);
            if (text.length > 0) {
              fallbackContent = text;
            }
          } else if (type === 'result') {
            hasResult = true;
            success = parsed.subtype === 'success';
            if (typeof parsed.result === 'string') {
              resultContent = parsed.result;
            } else if (parsed.result != null) {
              resultContent = JSON.stringify(parsed.result);
            }
            if (!success) {
              if (typeof parsed.result === 'string') {
                errorContent = parsed.result;
              } else if (typeof parsed.subtype === 'string') {
                errorContent = parsed.subtype;
              } else {
                errorContent = 'Claude execution failed';
              }
            }
            if (
              parsed.structured_output
              && typeof parsed.structured_output === 'object'
              && !Array.isArray(parsed.structured_output)
            ) {
              structuredOutput = parsed.structured_output as Record<string, unknown>;
            }
          } else if (type === 'error') {
            if (typeof parsed.message === 'string') {
              errorContent = parsed.message;
            }
          }
        } catch {
          // Some environments can emit non-JSON lines in stream mode.
          fallbackContent += (fallbackContent ? '\n' : '') + rawLine;
        }

        newlineIndex = stdoutBuffer.indexOf('\n');
      }
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      stderrContent += text;
      options.onStderr?.(text);
    });

    child.on('error', () => {
      unregisterQuery(queryId);
      if (options.abortSignal) {
        options.abortSignal.removeEventListener('abort', onAbort);
      }
      resolve({
        success: false,
        content: '',
        error: 'Failed to spawn claude process',
      });
    });

    child.on('close', (code, signal) => {
      unregisterQuery(queryId);
      if (options.abortSignal) {
        options.abortSignal.removeEventListener('abort', onAbort);
      }

      if (stdoutBuffer.trim().length > 0) {
        fallbackContent += (fallbackContent ? '\n' : '') + stdoutBuffer.trim();
      }

      const content = (resultContent || fallbackContent).trim();
      const exitSucceeded = code === 0 && !signal;
      const finalSuccess = interrupted
        ? false
        : hasResult
          ? success
          : exitSucceeded;

      const stderrTrimmed = stderrContent.trim();
      const error = finalSuccess
        ? undefined
        : (errorContent || stderrTrimmed || (interrupted ? 'Query interrupted' : `claude exited with code ${code ?? 'unknown'}`));

      if (!structuredOutput) {
        structuredOutput = parseStructuredOutput(content, !!options.outputSchema);
      }

      if (options.onStream) {
        options.onStream({
          type: 'result',
          data: {
            success: finalSuccess,
            result: content,
            sessionId: sessionId ?? '',
            ...(error ? { error } : {}),
          },
        });
      }

      resolve({
        success: finalSuccess,
        content,
        sessionId,
        error,
        interrupted: interrupted || signal === 'SIGINT',
        fullContent: fallbackContent.trim(),
        structuredOutput,
      });
    });
  });
}

/**
 * ClaudeProcess class wrapping the SDK query function.
 * Wraps the SDK query function.
 */
export class ClaudeProcess {
  private options: ClaudeSpawnOptions;
  private currentSessionId?: string;
  private interrupted = false;

  constructor(options: ClaudeSpawnOptions) {
    this.options = options;
  }

  /** Execute a prompt */
  async execute(prompt: string): Promise<ClaudeResult> {
    this.interrupted = false;
    const result = await executeClaudeCli(prompt, this.options);
    this.currentSessionId = result.sessionId;
    if (result.interrupted) {
      this.interrupted = true;
    }
    return result;
  }

  /** Interrupt the running query */
  kill(): void {
    this.interrupted = true;
    interruptCurrentProcess();
  }

  /** Check if a query is running */
  isRunning(): boolean {
    return hasActiveProcess();
  }

  /** Get session ID */
  getSessionId(): string | undefined {
    return this.currentSessionId;
  }

  /** Check if query was interrupted */
  wasInterrupted(): boolean {
    return this.interrupted;
  }
}
