/**
 * Gemini provider implementation (CLI-based)
 */

import { runCliCommand } from './cli-runner.js';
import type { AgentResponse, PermissionMode } from '../models/types.js';
import type { Provider, ProviderCallOptions } from './index.js';

function buildPrompt(prompt: string, systemPrompt?: string): string {
  return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

function mapApprovalMode(permissionMode?: PermissionMode, bypassPermissions?: boolean): string | undefined {
  if (bypassPermissions || permissionMode === 'bypassPermissions') {
    return 'yolo';
  }
  if (permissionMode === 'acceptEdits') {
    return 'auto_edit';
  }
  return undefined;
}

/** Gemini provider - wraps Gemini CLI */
export class GeminiProvider implements Provider {
  async call(agentName: string, prompt: string, options: ProviderCallOptions): Promise<AgentResponse> {
    return this.execute(agentName, prompt, options);
  }

  async callCustom(agentName: string, prompt: string, systemPrompt: string, options: ProviderCallOptions): Promise<AgentResponse> {
    return this.execute(agentName, prompt, { ...options, systemPrompt });
  }

  private async execute(agentName: string, prompt: string, options: ProviderCallOptions): Promise<AgentResponse> {
    const args: string[] = ['--output-format', 'text'];

    if (options.model) {
      args.push('--model', options.model);
    }

    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push('--allowed-tools', ...options.allowedTools);
    }

    if (options.sessionId) {
      args.push('--resume', options.sessionId);
    }

    const approvalMode = mapApprovalMode(options.permissionMode, options.bypassPermissions);
    if (approvalMode) {
      args.push('--approval-mode', approvalMode);
    }

    const fullPrompt = buildPrompt(prompt, options.systemPrompt);

    const { stdout, stderr, exitCode } = await runCliCommand('gemini', [...args, fullPrompt], {
      cwd: options.cwd,
    });

    if (exitCode !== 0) {
      const message = stderr.trim() || stdout.trim() || `Gemini CLI exited with code ${exitCode}`;
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
      content: stdout.trim(),
      timestamp: new Date(),
      sessionId: options.sessionId,
    };
  }
}
