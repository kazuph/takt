/**
 * Phase execution logic extracted from engine.ts.
 *
 * Handles Phase 2 (report output) and Phase 3 (status judgment)
 * as session-resume operations.
 */

import type { WorkflowStep, Language } from '../models/types.js';
import { runAgent, type RunAgentOptions } from '../agents/runner.js';
import {
  buildReportInstruction as buildReportInstructionFromTemplate,
  buildStatusJudgmentInstruction as buildStatusJudgmentInstructionFromTemplate,
} from './instruction-builder.js';
import { hasTagBasedRules } from './rule-utils.js';
import { createLogger } from '../utils/debug.js';

const log = createLogger('phase-runner');

export interface PhaseRunnerContext {
  /** Working directory (agent work dir, may be a clone) */
  cwd: string;
  /** Report directory path */
  reportDir: string;
  /** Language for instructions */
  language?: Language;
  /** Get agent session ID */
  getSessionId: (agent: string) => string | undefined;
  /** Build resume options for a step */
  buildResumeOptions: (step: WorkflowStep, sessionId: string, overrides: Pick<RunAgentOptions, 'allowedTools' | 'maxTurns'>) => RunAgentOptions;
  /** Update agent session after a phase run */
  updateAgentSession: (agent: string, sessionId: string | undefined) => void;
}

/**
 * Check if a step needs Phase 3 (status judgment).
 * Returns true when at least one rule requires tag-based detection.
 */
export function needsStatusJudgmentPhase(step: WorkflowStep): boolean {
  return hasTagBasedRules(step);
}

/**
 * Phase 2: Report output.
 * Resumes the agent session with Write-only tools to output reports.
 * The response is discarded — only sessionId is updated.
 */
export async function runReportPhase(
  step: WorkflowStep,
  stepIteration: number,
  ctx: PhaseRunnerContext,
): Promise<void> {
  const sessionId = ctx.getSessionId(step.agent);
  if (!sessionId) {
    throw new Error(`Report phase requires a session to resume, but no sessionId found for agent "${step.agent}" in step "${step.name}"`);
  }

  log.debug('Running report phase', { step: step.name, sessionId });

  const reportInstruction = buildReportInstructionFromTemplate(step, {
    cwd: ctx.cwd,
    reportDir: ctx.reportDir,
    stepIteration,
    language: ctx.language,
  });

  const reportOptions = ctx.buildResumeOptions(step, sessionId, {
    allowedTools: ['Write'],
    maxTurns: 3,
  });

  const reportResponse = await runAgent(step.agent, reportInstruction, reportOptions);

  // Update session (phase 2 may update it)
  ctx.updateAgentSession(step.agent, reportResponse.sessionId);

  log.debug('Report phase complete', { step: step.name, status: reportResponse.status });
}

/**
 * Phase 3: Status judgment.
 * Resumes the agent session with no tools to ask the agent to output a status tag.
 * Returns the Phase 3 response content (containing the status tag).
 */
export async function runStatusJudgmentPhase(
  step: WorkflowStep,
  ctx: PhaseRunnerContext,
): Promise<string> {
  const sessionId = ctx.getSessionId(step.agent);
  if (!sessionId) {
    throw new Error(`Status judgment phase requires a session to resume, but no sessionId found for agent "${step.agent}" in step "${step.name}"`);
  }

  log.debug('Running status judgment phase', { step: step.name, sessionId });

  const judgmentInstruction = buildStatusJudgmentInstructionFromTemplate(step, {
    language: ctx.language,
  });

  const judgmentOptions = ctx.buildResumeOptions(step, sessionId, {
    allowedTools: [],
    maxTurns: 3,
  });

  const judgmentResponse = await runAgent(step.agent, judgmentInstruction, judgmentOptions);

  // Update session (phase 3 may update it)
  ctx.updateAgentSession(step.agent, judgmentResponse.sessionId);

  log.debug('Status judgment phase complete', { step: step.name, status: judgmentResponse.status });
  return judgmentResponse.content;
}
