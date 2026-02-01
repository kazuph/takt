/**
 * Claude CLI wrapper
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { PermissionMode } from '../models/types.js';
import type {
  StreamCallback,
  PermissionHandler,
  AskUserQuestionHandler,
  ClaudeResult,
} from './types.js';
import {
  generateQueryId,
  registerQuery,
  unregisterQuery,
  hasActiveProcess,
  interruptCurrentProcess,
} from './query-manager.js';
import { createLogger } from '../utils/debug.js';

const log = createLogger('claude-cli');

// Re-export types for backward compatibility
export type {
  StreamEvent,
  StreamCallback,
  PermissionRequest,
  PermissionHandler,
  AskUserQuestionInput,
  AskUserQuestionHandler,
  ClaudeResult,
  ClaudeResultWithQueryId,
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

/** Options for calling Claude via CLI */
export interface ClaudeSpawnOptions {
  cwd: string;
  sessionId?: string;
  allowedTools?: string[];
  model?: string;
  maxTurns?: number;
  systemPrompt?: string;
  /** Permission mode for tool execution */
  permissionMode?: PermissionMode;
  /** Disable session persistence (CLI only) */
  noSessionPersistence?: boolean;
  /** Enable streaming mode with callback */
  onStream?: StreamCallback;
  /** Custom permission handler for interactive permission prompts (CLI-only, not used here) */
  onPermissionRequest?: PermissionHandler;
  /** Custom handler for AskUserQuestion tool (CLI-only, not used here) */
  onAskUserQuestion?: AskUserQuestionHandler;
  /** Bypass all permission checks */
  bypassPermissions?: boolean;
}

/** Execute a Claude query using the CLI. */
export async function executeClaudeCli(
  prompt: string,
  options: ClaudeSpawnOptions
): Promise<ClaudeResult> {
  const queryId = generateQueryId();
  const sessionId = options.sessionId ?? randomUUID();

  const args: string[] = ['--output-format', 'text'];

  if (options.noSessionPersistence) {
    args.push('--no-session-persistence');
  } else {
    args.push('--session-id', sessionId);
  }

  if (options.model) {
    args.push('--model', options.model);
  }

  const combinedPrompt = options.systemPrompt
    ? `${options.systemPrompt}\n\n${prompt}`
    : prompt;

  if (options.allowedTools && options.allowedTools.length > 0) {
    args.push('--allowed-tools', options.allowedTools.join(' '));
  }

  if (options.permissionMode) {
    args.push('--permission-mode', options.permissionMode);
  }

  if (options.bypassPermissions) {
    args.push('--dangerously-skip-permissions');
  }

  args.push('-p', combinedPrompt);

  const shellEscape = (value: string): string => {
    if (value.length === 0) return '""';
    if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
    return `"${value.replace(/(["\\$`])/g, '\\$1')}"`;
  };
  const commandString = `claude ${args.map((arg) => shellEscape(arg)).join(' ')}`;
  log.info(`Claude CLI exec: ${commandString}`);
  log.info(`Claude CLI prompt: ${combinedPrompt}`);

  return new Promise((resolve) => {
    const child = spawn('claude', args, {
      cwd: options.cwd,
      stdio: 'pipe',
      env: process.env,
    });

    log.info(`Claude CLI spawned: pid=${child.pid ?? 'unknown'}`);

    registerQuery(queryId, child);

    let stdout = '';
    let stderr = '';
    const startedAt = Date.now();
    const heartbeat = setInterval(() => {
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      log.info(`Claude CLI waiting: pid=${child.pid ?? 'unknown'} elapsed=${elapsedSec}s`);
    }, 10_000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      log.info(`Claude CLI stdout: ${chunk}`);
      if (options.onStream) {
        options.onStream({
          type: 'text',
          data: { text: chunk },
        });
      }
    });

    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      log.info(`Claude CLI stderr: ${chunk}`);
    });

    child.on('close', (code) => {
      clearInterval(heartbeat);
      unregisterQuery(queryId);
      const exitCode = code ?? 0;
      const success = exitCode === 0;
      const content = stdout.trim();
      const error = success ? undefined : (stderr.trim() || content || `Claude CLI exited with code ${exitCode}`);

      log.info(`Claude CLI exit: code=${exitCode} success=${success}`);
      if (stderr.trim()) {
        log.info(`Claude CLI stderr: ${stderr.trim()}`);
      }

      resolve({
        success,
        content: success ? content : '',
        sessionId,
        error,
        interrupted: !success && (error ? error.includes('interrupted') : false),
        fullContent: content,
      });
    });

    child.on('error', (error) => {
      clearInterval(heartbeat);
      unregisterQuery(queryId);
      resolve({
        success: false,
        content: '',
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
}

/** ClaudeProcess class for backward compatibility. */
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
