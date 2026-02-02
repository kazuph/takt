/**
 * Builds RunAgentOptions for different execution phases.
 *
 * Centralizes the option construction logic that was previously
 * scattered across WorkflowEngine methods.
 */

import { join } from 'node:path';
import type { WorkflowStep, WorkflowState, Language } from '../../models/types.js';
import type { RunAgentOptions } from '../../../agents/runner.js';
import type { PhaseRunnerContext } from '../phase-runner.js';
import type { WorkflowEngineOptions } from '../types.js';

export class OptionsBuilder {
  constructor(
    private readonly engineOptions: WorkflowEngineOptions,
    private readonly getCwd: () => string,
    private readonly getProjectCwd: () => string,
    private readonly getSessionId: (agent: string) => string | undefined,
    private readonly getReportDir: () => string,
    private readonly getLanguage: () => Language | undefined,
  ) {}

  /** Build common RunAgentOptions shared by all phases */
  buildBaseOptions(step: WorkflowStep): RunAgentOptions {
    return {
      cwd: this.getCwd(),
      agentPath: step.agentPath,
      provider: step.provider ?? this.engineOptions.provider,
      model: step.model ?? this.engineOptions.model,
      permissionMode: step.permissionMode,
      onStream: this.engineOptions.onStream,
      onPermissionRequest: this.engineOptions.onPermissionRequest,
      onAskUserQuestion: this.engineOptions.onAskUserQuestion,
      bypassPermissions: this.engineOptions.bypassPermissions,
    };
  }

  /** Build RunAgentOptions for Phase 1 (main execution) */
  buildAgentOptions(step: WorkflowStep): RunAgentOptions {
    // Phase 1: exclude Write from allowedTools when step has report config
    const allowedTools = step.report
      ? step.allowedTools?.filter((t) => t !== 'Write')
      : step.allowedTools;

    return {
      ...this.buildBaseOptions(step),
      sessionId: step.session === 'refresh' ? undefined : this.getSessionId(step.agent),
      allowedTools,
    };
  }

  /** Build RunAgentOptions for session-resume phases (Phase 2, Phase 3) */
  buildResumeOptions(
    step: WorkflowStep,
    sessionId: string,
    overrides: Pick<RunAgentOptions, 'allowedTools' | 'maxTurns'>,
  ): RunAgentOptions {
    return {
      ...this.buildBaseOptions(step),
      // Do not pass permission mode in report/status phases.
      permissionMode: undefined,
      sessionId,
      allowedTools: overrides.allowedTools,
      maxTurns: overrides.maxTurns,
    };
  }

  /** Build PhaseRunnerContext for Phase 2/3 execution */
  buildPhaseRunnerContext(
    state: WorkflowState,
    updateAgentSession: (agent: string, sessionId: string | undefined) => void,
  ): PhaseRunnerContext {
    return {
      cwd: this.getCwd(),
      reportDir: join(this.getProjectCwd(), this.getReportDir()),
      language: this.getLanguage(),
      interactive: this.engineOptions.interactive,
      getSessionId: (agent: string) => state.agentSessions.get(agent),
      buildResumeOptions: this.buildResumeOptions.bind(this),
      updateAgentSession,
    };
  }
}
