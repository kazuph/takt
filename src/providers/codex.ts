/**
 * Codex provider implementation (CLI-based)
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCliCommand } from './cli-runner.js';
import type { AgentResponse } from '../models/types.js';
import type { Provider, ProviderCallOptions } from './index.js';

function buildPrompt(prompt: string, systemPrompt?: string): string {
  return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

/** Codex provider - wraps Codex CLI */
export class CodexProvider implements Provider {
  async call(agentName: string, prompt: string, options: ProviderCallOptions): Promise<AgentResponse> {
    return this.execute(agentName, prompt, options);
  }

  async callCustom(agentName: string, prompt: string, systemPrompt: string, options: ProviderCallOptions): Promise<AgentResponse> {
    return this.execute(agentName, prompt, { ...options, systemPrompt });
  }

  private async execute(agentName: string, prompt: string, options: ProviderCallOptions): Promise<AgentResponse> {
    const args: string[] = ['-C', options.cwd, '--color', 'never'];

    if (options.model) {
      args.push('-m', options.model);
    }

    if (options.bypassPermissions || options.permissionMode === 'bypassPermissions') {
      args.push('--dangerously-bypass-approvals-and-sandbox');
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'takt-codex-'));
    const outputFile = join(tempDir, 'last_message.txt');
    args.push('--output-last-message', outputFile);

    const fullPrompt = buildPrompt(prompt, options.systemPrompt);

    const baseArgs = options.sessionId
      ? ['exec', 'resume', options.sessionId]
      : ['exec'];

    const { stdout, stderr, exitCode } = await runCliCommand('codex', [...baseArgs, ...args, fullPrompt], {
      cwd: options.cwd,
    });

    let content = '';
    if (existsSync(outputFile)) {
      content = readFileSync(outputFile, 'utf8').trim();
    }

    rmSync(tempDir, { recursive: true, force: true });

    if (exitCode !== 0) {
      const message = stderr.trim() || stdout.trim() || `Codex CLI exited with code ${exitCode}`;
      return {
        agent: agentName,
        status: 'blocked',
        content: message,
        timestamp: new Date(),
        error: message,
        sessionId: options.sessionId,
      };
    }

    return {
      agent: agentName,
      status: 'done',
      content: content || stdout.trim(),
      timestamp: new Date(),
      sessionId: options.sessionId,
    };
  }
}
