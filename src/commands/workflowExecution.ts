/**
 * Workflow execution logic
 */

import { readFileSync } from 'node:fs';
import { WorkflowEngine } from '../workflow/engine.js';
import type { WorkflowConfig, Language } from '../models/types.js';
import type { IterationLimitRequest } from '../workflow/types.js';
import type { ProviderType } from '../providers/index.js';
import {
  loadAgentSessionsByProvider,
  updateAgentSession,
  loadWorktreeSessionsByProvider,
  updateWorktreeSession,
} from '../config/paths.js';
import { loadGlobalConfig } from '../config/globalConfig.js';
import { isQuietMode, isNonInteractiveMode } from '../utils/runtime.js';
import {
  header,
  info,
  warn,
  error,
  success,
  status,
  StreamDisplay,
} from '../utils/ui.js';
import {
  generateSessionId,
  generateReportDir,
  createSessionLog,
  finalizeSessionLog,
  updateLatestPointer,
  initNdjsonLog,
  appendNdjsonLine,
  type NdjsonStepStart,
  type NdjsonStepComplete,
  type NdjsonWorkflowComplete,
  type NdjsonWorkflowAbort,
  type NdjsonUserInput,
  type NdjsonNeedsInput,
  type NdjsonReportPhase,
  type SessionLog,
  loadLatestSessionLog,
} from '../utils/session.js';
import { createLogger } from '../utils/debug.js';
import { notifySuccess, notifyError } from '../utils/notification.js';
import { selectOption, promptInput } from '../prompt/index.js';
import { EXIT_SIGINT } from '../exitCodes.js';
import { updateCloneMetaSession } from '../task/clone.js';

const log = createLogger('workflow');

/**
 * Format elapsed time in human-readable format
 */
function formatElapsedTime(startTime: string, endTime: string): string {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const elapsedMs = end - start;
  const elapsedSec = elapsedMs / 1000;

  if (elapsedSec < 60) {
    return `${elapsedSec.toFixed(1)}s`;
  }

  const minutes = Math.floor(elapsedSec / 60);
  const seconds = Math.floor(elapsedSec % 60);
  return `${minutes}m ${seconds}s`;
}

export function extractInfoQuestions(request: { response: { content: string } }): string[] {
  const lines = request.response.content.split(/\r?\n/);
  const questions: string[] = [];
  let inBlock = false;

  const isHeader = (line: string): boolean => {
    return /^(確認事項|Questions?)[:：]?$/.test(line);
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (isHeader(trimmed)) {
      inBlock = true;
      continue;
    }

    if (!inBlock) {
      continue;
    }

    if (trimmed === '') {
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('・')) {
      const q = trimmed
        .replace(/^[-*]\s+/, '')
        .replace(/^・\s*/, '')
        .trim();
      if (q.length > 0) {
        questions.push(q);
      }
      continue;
    }

    inBlock = false;
  }

  return questions;
}

/** Result of workflow execution */
export interface WorkflowExecutionResult {
  success: boolean;
  reason?: string;
}

/** Options for workflow execution */
export interface WorkflowExecutionOptions {
  /** Header prefix for display */
  headerPrefix?: string;
  /** Project root directory (where .takt/ lives). Defaults to cwd. */
  projectCwd?: string;
  /** Branch name for this workflow execution (if applicable) */
  branch?: string;
  /** Language for instruction metadata */
  language?: Language;
  provider?: ProviderType;
  model?: string;
}

/**
 * Execute a workflow and handle all events
 */
export async function executeWorkflow(
  workflowConfig: WorkflowConfig,
  task: string,
  cwd: string,
  options: WorkflowExecutionOptions = {}
): Promise<WorkflowExecutionResult> {
  const {
    headerPrefix = 'Running Workflow:',
  } = options;

  // projectCwd is where .takt/ lives (project root, not the clone)
  const projectCwd = options.projectCwd ?? cwd;

  // Always continue from previous sessions (use /clear to reset)
  log.debug('Continuing session (use /clear to reset)');

  header(`${headerPrefix} ${workflowConfig.name}`);

  const workflowSessionId = generateSessionId();
  const reportDirName = `.takt/reports/${generateReportDir(task)}`;
  let sessionLog: SessionLog = { ...createSessionLog(task, projectCwd, workflowConfig.name), reportDir: reportDirName };

  // Initialize NDJSON log file + pointer at workflow start
  const ndjsonLogPath = initNdjsonLog(workflowSessionId, task, workflowConfig.name, projectCwd, reportDirName);
  updateLatestPointer(sessionLog, workflowSessionId, projectCwd, { copyToPrevious: true });

  if (options.branch) {
    updateCloneMetaSession(projectCwd, options.branch, {
      sessionId: workflowSessionId,
      reportDir: reportDirName,
      task,
      workflowName: workflowConfig.name,
    });
  }

  // Track current display for streaming
  const displayRef: { current: StreamDisplay | null } = { current: null };

  // Create stream handler that delegates to UI display
  const streamHandler = (
    event: Parameters<ReturnType<StreamDisplay['createHandler']>>[0]
  ): void => {
    if (!displayRef.current) return;
    if (event.type === 'result') return;
    displayRef.current.createHandler()(event);
  };

  // Load saved agent sessions for continuity (from project root or clone-specific storage)
  const isWorktree = cwd !== projectCwd;
  const currentProvider = loadGlobalConfig().provider ?? 'claude';
  const sessionsByProvider = isWorktree
    ? loadWorktreeSessionsByProvider(projectCwd, cwd, currentProvider)
    : loadAgentSessionsByProvider(projectCwd, currentProvider);
  const savedSessions: Record<string, string> = {};
  for (const [providerKey, sessions] of Object.entries(sessionsByProvider)) {
    for (const [agentName, sessionId] of Object.entries(sessions)) {
      savedSessions[`${providerKey}::${agentName}`] = sessionId;
    }
  }
  const latestLog = loadLatestSessionLog(projectCwd);
  const initialUserInputs = latestLog && latestLog.task === task
    ? latestLog.history
        .filter((entry) => entry.status === 'answer')
        .map((entry) => entry.content)
    : [];

  if (!latestLog) {
    info('前回セッションのログが見つからないため、新規タスクとして開始します。');
  } else if (latestLog.task !== task) {
    warn('前回セッションのタスクと一致しないため、回答履歴を引き継ぎません。');
    log.debug('Latest session task mismatch', {
      latestTask: latestLog.task,
      currentTask: task,
      latestStatus: latestLog.status,
      latestIterations: latestLog.iterations,
    });
  } else if (initialUserInputs.length > 0) {
    info(`前回セッションの回答を ${initialUserInputs.length} 件 引き継ぎました。`);
  } else {
    info('前回セッションの回答は見つかりませんでした。');
  }

  // Session update handler - persist session IDs when they change
  // Clone sessions are stored separately per clone path
  const sessionUpdateHandler = isWorktree
    ? (agentName: string, agentSessionId: string, provider?: ProviderType): void => {
        updateWorktreeSession(projectCwd, cwd, agentName, agentSessionId, provider ?? currentProvider);
      }
    : (agentName: string, agentSessionId: string, provider?: ProviderType): void => {
        updateAgentSession(projectCwd, agentName, agentSessionId, provider ?? currentProvider);
      };

  const iterationLimitHandler = async (
    request: IterationLimitRequest
  ): Promise<number | null> => {
    if (displayRef.current) {
      displayRef.current.flush();
      displayRef.current = null;
    }

    console.log();
    warn(
      `最大イテレーションに到達しました (${request.currentIteration}/${request.maxIterations})`
    );
    info(`現在のステップ: ${request.currentStep}`);

    if (isNonInteractiveMode()) {
      warn('Non-interactive mode: iteration limit reached, aborting.');
      return null;
    }

    const action = await selectOption('続行しますか？', [
      {
        label: '続行する（追加イテレーション数を入力）',
        value: 'continue',
        description: '入力した回数だけ上限を増やします',
      },
      { label: '終了する', value: 'stop' },
    ]);

    if (action !== 'continue') {
      return null;
    }

    while (true) {
      const input = await promptInput('追加するイテレーション数を入力してください（1以上）');
      if (!input) {
        return null;
      }

      const additionalIterations = Number.parseInt(input, 10);
      if (Number.isInteger(additionalIterations) && additionalIterations > 0) {
        workflowConfig.maxIterations += additionalIterations;
        return additionalIterations;
      }

      warn('1以上の整数を入力してください。');
    }
  };

  const engine = new WorkflowEngine(workflowConfig, cwd, task, {
    onStream: streamHandler,
    initialSessions: savedSessions,
    initialUserInputs,
    onSessionUpdate: sessionUpdateHandler,
    onIterationLimit: iterationLimitHandler,
    onUserInput: async (request) => {
      const questions = extractInfoQuestions(request);
      if (questions.length === 0) {
        if (isNonInteractiveMode()) {
          warn('Non-interactive mode: skipping user input prompt.');
          return null;
        }
        return promptInput('追加情報を入力してください（空で中断）');
      }

      const needsRecord: NdjsonNeedsInput = {
        type: 'needs_input',
        step: request.step.name,
        agent: request.step.agentDisplayName,
        questions,
        timestamp: new Date().toISOString(),
      };
      appendNdjsonLine(ndjsonLogPath, needsRecord);

      if (isNonInteractiveMode()) {
        warn('Non-interactive mode: skipping user input prompt.');
        return null;
      }

      const action = await selectOption('情報不足のため確認が必要です。回答しますか？', [
        { label: '回答する', value: 'answer' },
        { label: '中断する', value: 'cancel' },
      ]);
      if (action !== 'answer') {
        return null;
      }

      const answers: string[] = [];
      for (const q of questions) {
        const answer = await promptInput(`${q}\n> `);
        if (answer == null) {
          return null;
        }
        answers.push(`${q} ${answer.trim()}`);
      }
      return answers.join('\n');
    },
    projectCwd,
    reportDir: reportDirName,
    language: options.language,
    provider: options.provider,
    model: options.model,
  });

  let abortReason: string | undefined;

  engine.on('step:start', (step, iteration, instruction) => {
    log.debug('Step starting', { step: step.name, agent: step.agentDisplayName, iteration });
    info(`[${iteration}/${workflowConfig.maxIterations}] ${step.name} (${step.agentDisplayName})`);

    // Log prompt content for debugging
    if (instruction) {
      log.debug('Step instruction', instruction);
    }

    // Use quiet mode from CLI (already resolved CLI flag + config in preAction)
    const permissionLabel = step.permissionMode === 'bypassPermissions'
      ? `${step.agentDisplayName}(bypassPermissions)`
      : step.agentDisplayName;
    displayRef.current = new StreamDisplay(permissionLabel, isQuietMode());

    // Write step_start record to NDJSON log
    const record: NdjsonStepStart = {
      type: 'step_start',
      step: step.name,
      agent: step.agentDisplayName,
      iteration,
      timestamp: new Date().toISOString(),
      ...(instruction ? { instruction } : {}),
    };
    appendNdjsonLine(ndjsonLogPath, record);
  });

  engine.on('step:user_input', (step, userInput) => {
    const record: NdjsonUserInput = {
      type: 'user_input',
      step: step.name,
      agent: step.agentDisplayName,
      input: userInput,
      timestamp: new Date().toISOString(),
    };
    appendNdjsonLine(ndjsonLogPath, record);
  });

  engine.on('step:complete', (step, response, instruction) => {
    log.debug('Step completed', {
      step: step.name,
      status: response.status,
      matchedRuleIndex: response.matchedRuleIndex,
      matchedRuleMethod: response.matchedRuleMethod,
      contentLength: response.content.length,
      sessionId: response.sessionId,
      error: response.error,
    });
    if (displayRef.current) {
      displayRef.current.flush();
      displayRef.current = null;
    }
    console.log();

    if (response.matchedRuleIndex != null && step.rules) {
      const rule = step.rules[response.matchedRuleIndex];
      if (rule) {
        const methodLabel = response.matchedRuleMethod ? ` (${response.matchedRuleMethod})` : '';
        status('Status', `${rule.condition}${methodLabel}`);
      } else {
        status('Status', response.status);
      }
    } else {
      status('Status', response.status);
    }

    if (response.error) {
      error(`Error: ${response.error}`);
    }
    if (response.sessionId) {
      status('Session', response.sessionId);
    }

    // Write step_complete record to NDJSON log
    const record: NdjsonStepComplete = {
      type: 'step_complete',
      step: step.name,
      agent: response.agent,
      status: response.status,
      content: response.content,
      instruction,
      ...(response.matchedRuleIndex != null ? { matchedRuleIndex: response.matchedRuleIndex } : {}),
      ...(response.matchedRuleMethod ? { matchedRuleMethod: response.matchedRuleMethod } : {}),
      ...(response.error ? { error: response.error } : {}),
      timestamp: response.timestamp.toISOString(),
    };
    appendNdjsonLine(ndjsonLogPath, record);

    // Update in-memory log for pointer metadata (immutable)
    sessionLog = { ...sessionLog, iterations: sessionLog.iterations + 1 };
    updateLatestPointer(sessionLog, workflowSessionId, projectCwd);
  });

  engine.on('step:report', (_step, filePath, fileName) => {
    const content = readFileSync(filePath, 'utf-8');
    console.log(`\n📄 Report: ${fileName}\n`);
    console.log(content);
  });

  engine.on('phase:report:start', (step, fileNames: string[]) => {
    info(`レポート出力開始: ${step.name} (${fileNames.join(', ')})`);
    const record: NdjsonReportPhase = {
      type: 'report_phase',
      phase: 'start',
      step: step.name,
      agent: step.agentDisplayName,
      files: fileNames,
      timestamp: new Date().toISOString(),
    };
    appendNdjsonLine(ndjsonLogPath, record);
  });

  engine.on('phase:report:complete', (step, fileNames: string[]) => {
    info(`レポート出力完了: ${step.name} (${fileNames.join(', ')})`);
    const record: NdjsonReportPhase = {
      type: 'report_phase',
      phase: 'complete',
      step: step.name,
      agent: step.agentDisplayName,
      files: fileNames,
      timestamp: new Date().toISOString(),
    };
    appendNdjsonLine(ndjsonLogPath, record);
  });

  engine.on('workflow:complete', (state) => {
    log.info('Workflow completed successfully', { iterations: state.iteration });
    sessionLog = finalizeSessionLog(sessionLog, 'completed');

    // Write workflow_complete record to NDJSON log
    const record: NdjsonWorkflowComplete = {
      type: 'workflow_complete',
      iterations: state.iteration,
      endTime: new Date().toISOString(),
    };
    appendNdjsonLine(ndjsonLogPath, record);
    updateLatestPointer(sessionLog, workflowSessionId, projectCwd);

    const elapsed = sessionLog.endTime
      ? formatElapsedTime(sessionLog.startTime, sessionLog.endTime)
      : '';
    const elapsedDisplay = elapsed ? `, ${elapsed}` : '';

    success(`Workflow completed (${state.iteration} iterations${elapsedDisplay})`);
    info(`Session log: ${ndjsonLogPath}`);
    notifySuccess('TAKT', `ワークフロー完了 (${state.iteration} iterations)`);
  });

  engine.on('workflow:abort', (state, reason) => {
    log.error('Workflow aborted', { reason, iterations: state.iteration });
    if (displayRef.current) {
      displayRef.current.flush();
      displayRef.current = null;
    }
    abortReason = reason;
    sessionLog = finalizeSessionLog(sessionLog, 'aborted');

    // Write workflow_abort record to NDJSON log
    const record: NdjsonWorkflowAbort = {
      type: 'workflow_abort',
      iterations: state.iteration,
      reason,
      endTime: new Date().toISOString(),
    };
    appendNdjsonLine(ndjsonLogPath, record);
    updateLatestPointer(sessionLog, workflowSessionId, projectCwd);

    const elapsed = sessionLog.endTime
      ? formatElapsedTime(sessionLog.startTime, sessionLog.endTime)
      : '';
    const elapsedDisplay = elapsed ? ` (${elapsed})` : '';

    error(`Workflow aborted after ${state.iteration} iterations${elapsedDisplay}: ${reason}`);
    info(`Session log: ${ndjsonLogPath}`);
    notifyError('TAKT', `中断: ${reason}`);
  });

  // SIGINT handler: 1st Ctrl+C = graceful abort, 2nd = force exit
  let sigintCount = 0;
  const onSigInt = () => {
    sigintCount++;
    if (sigintCount === 1) {
      console.log();
      warn('Ctrl+C: ワークフローを中断しています...');
      engine.abort();
    } else {
      console.log();
      error('Ctrl+C: 強制終了します');
      process.exit(EXIT_SIGINT);
    }
  };
  process.on('SIGINT', onSigInt);

  try {
    const finalState = await engine.run();

    return {
      success: finalState.status === 'completed',
      reason: abortReason,
    };
  } finally {
    process.removeListener('SIGINT', onSigInt);
  }
}
