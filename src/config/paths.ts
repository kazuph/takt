/**
 * Path utilities for takt configuration
 *
 * This module provides pure path utilities without UI dependencies.
 * For initialization with language selection, use initialization.ts.
 */

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import type { Language } from '../models/types.js';
import { getLanguageResourcesDir } from '../resources/index.js';

/** Get takt global config directory (~/.takt) */
export function getGlobalConfigDir(): string {
  return join(homedir(), '.takt');
}

/** Get takt global agents directory (~/.takt/agents) */
export function getGlobalAgentsDir(): string {
  return join(getGlobalConfigDir(), 'agents');
}

/** Get takt global workflows directory (~/.takt/workflows) */
export function getGlobalWorkflowsDir(): string {
  return join(getGlobalConfigDir(), 'workflows');
}

/** Get takt global logs directory */
export function getGlobalLogsDir(): string {
  return join(getGlobalConfigDir(), 'logs');
}

/** Get takt global config file path */
export function getGlobalConfigPath(): string {
  return join(getGlobalConfigDir(), 'config.yaml');
}

/** Get builtin workflows directory (resources/global/{lang}/workflows) */
export function getBuiltinWorkflowsDir(lang: Language): string {
  return join(getLanguageResourcesDir(lang), 'workflows');
}

/** Get builtin agents directory (resources/global/{lang}/agents) */
export function getBuiltinAgentsDir(lang: Language): string {
  return join(getLanguageResourcesDir(lang), 'agents');
}

/** Get project takt config directory (.takt in project) */
export function getProjectConfigDir(projectDir: string): string {
  return join(resolve(projectDir), '.takt');
}

/** Get project config file path */
export function getProjectConfigPath(projectDir: string): string {
  return join(getProjectConfigDir(projectDir), 'config.yaml');
}

/** Get project tasks directory */
export function getProjectTasksDir(projectDir: string): string {
  return join(getProjectConfigDir(projectDir), 'tasks');
}

/** Get project completed tasks directory */
export function getProjectCompletedDir(projectDir: string): string {
  return join(getProjectConfigDir(projectDir), 'completed');
}

/** Get project logs directory */
export function getProjectLogsDir(projectDir: string): string {
  return join(getProjectConfigDir(projectDir), 'logs');
}

/** Ensure a directory exists, create if not */
export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/** Validate path is safe (no directory traversal) */
export function isPathSafe(basePath: string, targetPath: string): boolean {
  const resolvedBase = resolve(basePath);
  const resolvedTarget = resolve(targetPath);
  return resolvedTarget.startsWith(resolvedBase);
}

// Re-export project config functions
export {
  loadProjectConfig,
  saveProjectConfig,
  updateProjectConfig,
  getCurrentWorkflow,
  setCurrentWorkflow,
  isVerboseMode,
  type ProjectLocalConfig,
} from './projectConfig.js';

// Re-export session storage functions for backward compatibility
export {
  writeFileAtomic,
  getInputHistoryPath,
  MAX_INPUT_HISTORY,
  loadInputHistory,
  saveInputHistory,
  addToInputHistory,
  type AgentSessionData,
  getAgentSessionsPath,
  loadAgentSessions,
  saveAgentSessions,
  updateAgentSession,
  clearAgentSessions,
  // Worktree sessions
  getWorktreeSessionsDir,
  encodeWorktreePath,
  getWorktreeSessionPath,
  loadWorktreeSessions,
  updateWorktreeSession,
} from './sessionStore.js';
