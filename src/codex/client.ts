/**
 * Codex CLI integration for agent interactions
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCliCommand } from '../providers/cli-runner.js';
import type { AgentResponse, Status } from '../models/types.js';
import type { StreamCallback } from '../claude/process.js';
import { createLogger } from '../utils/debug.js';

const log = createLogger('codex-cli');

/** Options for calling Codex via CLI */
export interface CodexCallOptions {
  cwd: string;
  sessionId?: string;
  model?: string;
  systemPrompt?: string;
  /** Enable streaming mode with callback (best-effort) */
  onStream?: StreamCallback;
}

function buildPrompt(prompt: string, systemPrompt?: string): string {
  return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

function determineStatus(success: boolean): Status {
  return success ? 'done' : 'blocked';
}

function emitText(onStream: StreamCallback | undefined, text: string): void {
  if (!onStream || !text) return;
  onStream({ type: 'text', data: { text } });
}

function emitResult(
  onStream: StreamCallback | undefined,
  success: boolean,
  result: string,
  sessionId: string | undefined
): void {
  if (!onStream) return;
  onStream({
    type: 'result',
    data: {
      result,
      sessionId: sessionId || 'unknown',
      success,
      error: success ? undefined : result || undefined,
    },
  });
}

function readLastMessageFile(path: string): string {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8').trim();
}

/**
 * Call Codex with an agent prompt (CLI).
 */
export async function callCodex(
  agentType: string,
  prompt: string,
  options: CodexCallOptions
): Promise<AgentResponse> {
  const baseArgs: string[] = ['--color', 'never'];
  if (options.model) {
    baseArgs.push('-m', options.model);
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'takt-codex-'));
  const outputFile = join(tempDir, 'last_message.txt');
  const fullPrompt = buildPrompt(prompt, options.systemPrompt);

  const args = options.sessionId
    ? ['exec', 'resume', options.sessionId, ...baseArgs, '--output-last-message', outputFile, fullPrompt]
    : ['exec', ...baseArgs, '--output-last-message', outputFile, fullPrompt];

  log.debug('Executing Codex CLI', { agentType, model: options.model });

  const { stdout, stderr, exitCode } = await runCliCommand('codex', args, { cwd: options.cwd, onStdout: (chunk) => emitText(options.onStream, chunk) });
  const content = readLastMessageFile(outputFile) || stdout.trim();

  rmSync(tempDir, { recursive: true, force: true });

  if (exitCode !== 0) {
    const message = stderr.trim() || stdout.trim() || `Codex CLI exited with code ${exitCode}`;
    emitResult(options.onStream, false, message, options.sessionId);
    return {
      agent: agentType,
      status: determineStatus(false),
      content: message,
      timestamp: new Date(),
      sessionId: options.sessionId,
      error: message,
    };
  }

  emitResult(options.onStream, true, content, options.sessionId);

  return {
    agent: agentType,
    status: determineStatus(true),
    content,
    timestamp: new Date(),
    sessionId: options.sessionId,
  };
}

/**
 * Call Codex with a custom agent configuration (system prompt + prompt).
 */
export async function callCodexCustom(
  agentName: string,
  prompt: string,
  systemPrompt: string,
  options: CodexCallOptions
): Promise<AgentResponse> {
  return callCodex(agentName, prompt, {
    ...options,
    systemPrompt,
  });
}
