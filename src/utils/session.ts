/**
 * Session management utilities
 */

import { existsSync, readFileSync, copyFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectLogsDir, getGlobalLogsDir, ensureDir, writeFileAtomic } from '../config/paths.js';

/** Session log entry */
export interface SessionLog {
  task: string;
  projectDir: string;
  workflowName: string;
  reportDir?: string;
  iterations: number;
  startTime: string;
  endTime?: string;
  status: 'running' | 'completed' | 'aborted';
  history: Array<{
    step: string;
    agent: string;
    instruction: string;
    status: string;
    timestamp: string;
    content: string;
    error?: string;
    /** Matched rule index (0-based) when rules-based detection was used */
    matchedRuleIndex?: number;
    /** How the rule match was detected */
    matchedRuleMethod?: string;
  }>;
}

// --- NDJSON log types ---

/** NDJSON record: workflow started */
export interface NdjsonWorkflowStart {
  type: 'workflow_start';
  task: string;
  workflowName: string;
  reportDir?: string;
  startTime: string;
}

/** NDJSON record: step started */
export interface NdjsonStepStart {
  type: 'step_start';
  step: string;
  agent: string;
  iteration: number;
  timestamp: string;
  /** Instruction (prompt) sent to the agent. Empty for parallel parent steps. */
  instruction?: string;
}

/** NDJSON record: step completed */
export interface NdjsonStepComplete {
  type: 'step_complete';
  step: string;
  agent: string;
  status: string;
  content: string;
  instruction: string;
  matchedRuleIndex?: number;
  matchedRuleMethod?: string;
  error?: string;
  timestamp: string;
}

/** NDJSON record: workflow completed successfully */
export interface NdjsonWorkflowComplete {
  type: 'workflow_complete';
  iterations: number;
  endTime: string;
}

/** NDJSON record: workflow aborted */
export interface NdjsonWorkflowAbort {
  type: 'workflow_abort';
  iterations: number;
  reason: string;
  endTime: string;
}

/** NDJSON record: user input provided */
export interface NdjsonUserInput {
  type: 'user_input';
  step: string;
  agent: string;
  input: string;
  timestamp: string;
}

/** NDJSON record: insufficient info detected (questions requested) */
export interface NdjsonNeedsInput {
  type: 'needs_input';
  step: string;
  agent: string;
  questions: string[];
  timestamp: string;
}

/** NDJSON record: report phase progress */
export interface NdjsonReportPhase {
  type: 'report_phase';
  phase: 'start' | 'complete';
  step: string;
  agent: string;
  files: string[];
  timestamp: string;
}

/** Union of all NDJSON record types */
export type NdjsonRecord =
  | NdjsonWorkflowStart
  | NdjsonStepStart
  | NdjsonStepComplete
  | NdjsonWorkflowComplete
  | NdjsonWorkflowAbort
  | NdjsonUserInput
  | NdjsonNeedsInput
  | NdjsonReportPhase;

/**
 * Append a single NDJSON line to a log file.
 * Uses appendFileSync for atomic open→write→close (no file lock held).
 */
export function appendNdjsonLine(filepath: string, record: NdjsonRecord): void {
  appendFileSync(filepath, JSON.stringify(record) + '\n', 'utf-8');
}

/**
 * Initialize an NDJSON log file with the workflow_start record.
 * Creates the logs directory if needed and returns the file path.
 */
export function initNdjsonLog(
  sessionId: string,
  task: string,
  workflowName: string,
  projectDir?: string,
  reportDir?: string,
): string {
  const logsDir = projectDir
    ? getProjectLogsDir(projectDir)
    : getGlobalLogsDir();
  ensureDir(logsDir);

  const filepath = join(logsDir, `${sessionId}.jsonl`);
  const record: NdjsonWorkflowStart = {
    type: 'workflow_start',
    task,
    workflowName,
    ...(reportDir ? { reportDir } : {}),
    startTime: new Date().toISOString(),
  };
  appendNdjsonLine(filepath, record);
  return filepath;
}

/**
 * Load an NDJSON log file and convert it to a SessionLog for backward compatibility.
 * Parses each line as a JSON record and reconstructs the SessionLog structure.
 */
export function loadNdjsonLog(filepath: string): SessionLog | null {
  if (!existsSync(filepath)) {
    return null;
  }

  const content = readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n').filter((line) => line.length > 0);
  if (lines.length === 0) return null;

  let sessionLog: SessionLog | null = null;

  for (const line of lines) {
    const record = JSON.parse(line) as NdjsonRecord;

    switch (record.type) {
      case 'workflow_start':
        sessionLog = {
          task: record.task,
          projectDir: '',
          workflowName: record.workflowName,
          ...(record.reportDir ? { reportDir: record.reportDir } : {}),
          iterations: 0,
          startTime: record.startTime,
          status: 'running',
          history: [],
        };
        break;

      case 'step_complete':
        if (sessionLog) {
          sessionLog.history.push({
            step: record.step,
            agent: record.agent,
            instruction: record.instruction,
            status: record.status,
            timestamp: record.timestamp,
            content: record.content,
            ...(record.error ? { error: record.error } : {}),
            ...(record.matchedRuleIndex != null ? { matchedRuleIndex: record.matchedRuleIndex } : {}),
            ...(record.matchedRuleMethod ? { matchedRuleMethod: record.matchedRuleMethod } : {}),
          });
          sessionLog.iterations++;
        }
        break;

      case 'workflow_complete':
        if (sessionLog) {
          sessionLog.status = 'completed';
          sessionLog.endTime = record.endTime;
        }
        break;

      case 'workflow_abort':
        if (sessionLog) {
          sessionLog.status = 'aborted';
          sessionLog.endTime = record.endTime;
        }
        break;
      case 'user_input':
        if (sessionLog) {
          sessionLog.history.push({
            step: record.step,
            agent: record.agent,
            instruction: record.input,
            status: 'answer',
            timestamp: record.timestamp,
            content: record.input,
          });
          sessionLog.iterations++;
        }
        break;

      // step_start records are not stored in SessionLog
      default:
        break;
    }
  }

  return sessionLog;
}

/** Generate a session ID */
export function generateSessionId(): string {
  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(
    now.getHours(),
  ).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Generate report directory name from task and timestamp.
 * Format: YYYYMMDD-HHMMSS-task-summary
 */
export function generateReportDir(task: string): string {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14)
    .replace(/(\d{8})(\d{6})/, '$1-$2');

  // Extract first 30 chars of task, sanitize for directory name
  const summary = task
    .slice(0, 30)
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'task';

  return `${timestamp}-${summary}`;
}

/** Create a new session log */
export function createSessionLog(
  task: string,
  projectDir: string,
  workflowName: string
): SessionLog {
  return {
    task,
    projectDir,
    workflowName,
    iterations: 0,
    startTime: new Date().toISOString(),
    status: 'running',
    history: [],
  };
}

/** Create a finalized copy of a session log (immutable — does not modify the original) */
export function finalizeSessionLog(
  log: SessionLog,
  status: 'completed' | 'aborted'
): SessionLog {
  return {
    ...log,
    status,
    endTime: new Date().toISOString(),
  };
}

/** Load session log from file (supports both .json and .jsonl formats) */
export function loadSessionLog(filepath: string): SessionLog | null {
  // Try NDJSON format for .jsonl files
  if (filepath.endsWith('.jsonl')) {
    return loadNdjsonLog(filepath);
  }

  if (!existsSync(filepath)) {
    return null;
  }
  const content = readFileSync(filepath, 'utf-8');
  return JSON.parse(content) as SessionLog;
}

/** Load latest session pointer (latest.json) */
export function loadLatestPointer(projectDir?: string): LatestLogPointer | null {
  const logsDir = projectDir
    ? getProjectLogsDir(projectDir)
    : getGlobalLogsDir();
  const latestPath = join(logsDir, 'latest.json');
  if (!existsSync(latestPath)) {
    return null;
  }
  try {
    const content = readFileSync(latestPath, 'utf-8');
    return JSON.parse(content) as LatestLogPointer;
  } catch {
    return null;
  }
}

/** Load the latest session log (from latest.json pointer) */
export function loadLatestSessionLog(projectDir?: string): SessionLog | null {
  const pointer = loadLatestPointer(projectDir);
  if (!pointer) return null;
  const logsDir = projectDir
    ? getProjectLogsDir(projectDir)
    : getGlobalLogsDir();
  const logPath = join(logsDir, pointer.logFile);
  return loadSessionLog(logPath);
}

/** Load project context (CLAUDE.md files) */
export function loadProjectContext(projectDir: string): string {
  const contextParts: string[] = [];

  // Check project root CLAUDE.md
  const rootClaudeMd = join(projectDir, 'CLAUDE.md');
  if (existsSync(rootClaudeMd)) {
    contextParts.push(readFileSync(rootClaudeMd, 'utf-8'));
  }

  // Check .claude/CLAUDE.md
  const dotClaudeMd = join(projectDir, '.claude', 'CLAUDE.md');
  if (existsSync(dotClaudeMd)) {
    contextParts.push(readFileSync(dotClaudeMd, 'utf-8'));
  }

  return contextParts.join('\n\n---\n\n');
}

/** Pointer metadata for latest/previous log files */
export interface LatestLogPointer {
  sessionId: string;
  logFile: string;
  task: string;
  workflowName: string;
  reportDir?: string;
  status: SessionLog['status'];
  startTime: string;
  updatedAt: string;
  iterations: number;
}

/**
 * Update latest.json pointer file.
 * On first call (workflow start), copies existing latest.json to previous.json.
 * On subsequent calls (step complete / workflow end), only overwrites latest.json.
 */
export function updateLatestPointer(
  log: SessionLog,
  sessionId: string,
  projectDir?: string,
  options?: { copyToPrevious?: boolean }
): void {
  const logsDir = projectDir
    ? getProjectLogsDir(projectDir)
    : getGlobalLogsDir();
  ensureDir(logsDir);

  const latestPath = join(logsDir, 'latest.json');
  const previousPath = join(logsDir, 'previous.json');

  // Copy latest → previous only when explicitly requested (workflow start)
  if (options?.copyToPrevious && existsSync(latestPath)) {
    copyFileSync(latestPath, previousPath);
  }

  const pointer: LatestLogPointer = {
    sessionId,
    logFile: `${sessionId}.jsonl`,
    task: log.task,
    workflowName: log.workflowName,
    ...(log.reportDir ? { reportDir: log.reportDir } : {}),
    status: log.status,
    startTime: log.startTime,
    updatedAt: new Date().toISOString(),
    iterations: log.iterations,
  };

  writeFileAtomic(latestPath, JSON.stringify(pointer, null, 2));
}
