/**
 * Agent execution runners
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import {
  callClaudeAgent,
  callClaudeSkill,
  type ClaudeCallOptions,
} from '../infra/claude/index.js';
import { loadCustomAgents, loadAgentPrompt, loadGlobalConfig, loadProjectConfig } from '../infra/config/index.js';
import { getProvider, type ProviderType, type ProviderCallOptions } from '../infra/providers/index.js';
import type { AgentResponse, CustomAgentConfig } from '../core/models/index.js';
import { createLogger } from '../shared/utils/index.js';
import type { RunAgentOptions } from './types.js';

// Re-export for backward compatibility
export type { RunAgentOptions, StreamCallback } from './types.js';

const log = createLogger('runner');

/**
 * Agent execution runner.
 *
 * Resolves agent configuration (provider, model, prompt) and
 * delegates execution to the appropriate provider.
 */
export class AgentRunner {
  /** Resolve provider type from options, agent config, project config, global config */
  private static resolveProvider(
    cwd: string,
    options?: RunAgentOptions,
    agentConfig?: CustomAgentConfig,
  ): ProviderType {
    if (options?.provider) return options.provider;
    if (agentConfig?.provider) return agentConfig.provider;
    const projectConfig = loadProjectConfig(cwd);
    if (projectConfig.provider) return projectConfig.provider;
    try {
      const globalConfig = loadGlobalConfig();
      if (globalConfig.provider) return globalConfig.provider;
    } catch {
      // Ignore missing global config; fallback below
    }
    return 'claude';
  }

  /** Resolve model from options, agent config, global config */
  private static resolveModel(
    cwd: string,
    options?: RunAgentOptions,
    agentConfig?: CustomAgentConfig,
  ): string | undefined {
    if (options?.model) return options.model;
    if (agentConfig?.model) return agentConfig.model;
    try {
      const globalConfig = loadGlobalConfig();
      if (globalConfig.model) return globalConfig.model;
    } catch {
      // Ignore missing global config
    }
    return undefined;
  }

  /** Load agent prompt from file path */
  private static loadAgentPromptFromPath(agentPath: string): string {
    if (!existsSync(agentPath)) {
      throw new Error(`Agent file not found: ${agentPath}`);
    }
    return readFileSync(agentPath, 'utf-8');
  }

  /**
   * Get agent name from path or spec.
   * For agents in subdirectories, includes parent dir for pattern matching.
   */
  private static extractAgentName(agentSpec: string): string {
    if (!agentSpec.endsWith('.md')) {
      return agentSpec;
    }

    const name = basename(agentSpec, '.md');
    const dir = basename(dirname(agentSpec));

    if (dir === 'default' || dir === 'agents' || dir === '.') {
      return name;
    }

    return `${dir}/${name}`;
  }

  /** Run a custom agent */
  async runCustom(
    agentConfig: CustomAgentConfig,
    task: string,
    options: RunAgentOptions,
  ): Promise<AgentResponse> {
    const allowedTools = options.allowedTools ?? agentConfig.allowedTools;

    // If agent references a Claude Code agent
    if (agentConfig.claudeAgent) {
      const callOptions: ClaudeCallOptions = {
        cwd: options.cwd,
        sessionId: options.sessionId,
        allowedTools,
        maxTurns: options.maxTurns,
        model: AgentRunner.resolveModel(options.cwd, options, agentConfig),
        permissionMode: options.permissionMode,
        onStream: options.onStream,
        onPermissionRequest: options.onPermissionRequest,
        onAskUserQuestion: options.onAskUserQuestion,
        bypassPermissions: options.bypassPermissions,
      };
      return callClaudeAgent(agentConfig.claudeAgent, task, callOptions);
    }

    // If agent references a Claude Code skill
    if (agentConfig.claudeSkill) {
      const callOptions: ClaudeCallOptions = {
        cwd: options.cwd,
        sessionId: options.sessionId,
        allowedTools,
        maxTurns: options.maxTurns,
        model: AgentRunner.resolveModel(options.cwd, options, agentConfig),
        permissionMode: options.permissionMode,
        onStream: options.onStream,
        onPermissionRequest: options.onPermissionRequest,
        onAskUserQuestion: options.onAskUserQuestion,
        bypassPermissions: options.bypassPermissions,
      };
      return callClaudeSkill(agentConfig.claudeSkill, task, callOptions);
    }

    // Custom agent with prompt
    const systemPrompt = loadAgentPrompt(agentConfig);

    const providerType = AgentRunner.resolveProvider(options.cwd, options, agentConfig);
    const provider = getProvider(providerType);

    const callOptions: ProviderCallOptions = {
      cwd: options.cwd,
      sessionId: options.sessionId,
      allowedTools,
      maxTurns: options.maxTurns,
      model: AgentRunner.resolveModel(options.cwd, options, agentConfig),
      permissionMode: options.permissionMode,
      onStream: options.onStream,
      onPermissionRequest: options.onPermissionRequest,
      onAskUserQuestion: options.onAskUserQuestion,
      bypassPermissions: options.bypassPermissions,
    };

    return provider.callCustom(agentConfig.name, task, systemPrompt, callOptions);
  }

  /** Run an agent by name or path */
  async run(
    agentSpec: string,
    task: string,
    options: RunAgentOptions,
  ): Promise<AgentResponse> {
    const agentName = AgentRunner.extractAgentName(agentSpec);
    log.debug('Running agent', {
      agentSpec,
      agentName,
      provider: options.provider,
      model: options.model,
      hasAgentPath: !!options.agentPath,
      hasSession: !!options.sessionId,
      permissionMode: options.permissionMode,
    });

    // If agentPath is provided (from workflow), use it to load prompt
    if (options.agentPath) {
      if (!existsSync(options.agentPath)) {
        throw new Error(`Agent file not found: ${options.agentPath}`);
      }
      const systemPrompt = AgentRunner.loadAgentPromptFromPath(options.agentPath);

      const providerType = AgentRunner.resolveProvider(options.cwd, options);
      const provider = getProvider(providerType);

      const callOptions: ProviderCallOptions = {
        cwd: options.cwd,
        sessionId: options.sessionId,
        allowedTools: options.allowedTools,
        maxTurns: options.maxTurns,
        model: AgentRunner.resolveModel(options.cwd, options),
        systemPrompt,
        permissionMode: options.permissionMode,
        onStream: options.onStream,
        onPermissionRequest: options.onPermissionRequest,
        onAskUserQuestion: options.onAskUserQuestion,
        bypassPermissions: options.bypassPermissions,
      };

      return provider.call(agentName, task, callOptions);
    }

    // Fallback: Look for custom agent by name
    const customAgents = loadCustomAgents();
    const agentConfig = customAgents.get(agentName);

    if (agentConfig) {
      return this.runCustom(agentConfig, task, options);
    }

    throw new Error(`Unknown agent: ${agentSpec}`);
  }
}

// ---- Backward-compatible module-level functions ----

const defaultRunner = new AgentRunner();

export async function runAgent(
  agentSpec: string,
  task: string,
  options: RunAgentOptions,
): Promise<AgentResponse> {
  return defaultRunner.run(agentSpec, task, options);
}

export async function runCustomAgent(
  agentConfig: CustomAgentConfig,
  task: string,
  options: RunAgentOptions,
): Promise<AgentResponse> {
  return defaultRunner.runCustom(agentConfig, task, options);
}
