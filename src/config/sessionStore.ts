/**
 * Session storage for takt
 *
 * Manages agent sessions and input history persistence.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { getProjectConfigDir, ensureDir } from './paths.js';

/**
 * Write file atomically using temp file + rename.
 * This prevents corruption when multiple processes write simultaneously.
 */
function writeFileAtomic(filePath: string, content: string): void {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tempPath, content, 'utf-8');
    renameSync(tempPath, filePath);
  } catch (error) {
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

// ============ Input History ============

/** Get path for storing input history */
export function getInputHistoryPath(projectDir: string): string {
  return join(getProjectConfigDir(projectDir), 'input_history');
}

/** Maximum number of input history entries to keep */
export const MAX_INPUT_HISTORY = 100;

/** Load input history */
export function loadInputHistory(projectDir: string): string[] {
  const path = getInputHistoryPath(projectDir);
  if (existsSync(path)) {
    try {
      const content = readFileSync(path, 'utf-8');
      return content
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          try {
            return JSON.parse(line) as string;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is string => entry !== null);
    } catch {
      return [];
    }
  }
  return [];
}

/** Save input history (atomic write) */
export function saveInputHistory(projectDir: string, history: string[]): void {
  const path = getInputHistoryPath(projectDir);
  ensureDir(getProjectConfigDir(projectDir));
  const trimmed = history.slice(-MAX_INPUT_HISTORY);
  const content = trimmed.map((entry) => JSON.stringify(entry)).join('\n');
  writeFileAtomic(path, content);
}

/** Add an entry to input history */
export function addToInputHistory(projectDir: string, input: string): void {
  const history = loadInputHistory(projectDir);
  if (history[history.length - 1] !== input) {
    history.push(input);
  }
  saveInputHistory(projectDir, history);
}

// ============ Agent Sessions ============

/** Agent session data for persistence */
export interface AgentSessionData {
  agentSessions: Record<string, string>;
  updatedAt: string;
}

/** Get path for storing agent sessions */
export function getAgentSessionsPath(projectDir: string): string {
  return join(getProjectConfigDir(projectDir), 'agent_sessions.json');
}

/** Load saved agent sessions */
export function loadAgentSessions(projectDir: string): Record<string, string> {
  const path = getAgentSessionsPath(projectDir);
  if (existsSync(path)) {
    try {
      const content = readFileSync(path, 'utf-8');
      const data = JSON.parse(content) as AgentSessionData;
      return data.agentSessions || {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Save agent sessions (atomic write) */
export function saveAgentSessions(
  projectDir: string,
  sessions: Record<string, string>
): void {
  const path = getAgentSessionsPath(projectDir);
  ensureDir(getProjectConfigDir(projectDir));
  const data: AgentSessionData = {
    agentSessions: sessions,
    updatedAt: new Date().toISOString(),
  };
  writeFileAtomic(path, JSON.stringify(data, null, 2));
}

/**
 * Update a single agent session atomically.
 * Uses read-modify-write with atomic file operations.
 */
export function updateAgentSession(
  projectDir: string,
  agentName: string,
  sessionId: string
): void {
  const path = getAgentSessionsPath(projectDir);
  ensureDir(getProjectConfigDir(projectDir));

  let sessions: Record<string, string> = {};
  if (existsSync(path)) {
    try {
      const content = readFileSync(path, 'utf-8');
      const data = JSON.parse(content) as AgentSessionData;
      sessions = data.agentSessions || {};
    } catch {
      sessions = {};
    }
  }

  sessions[agentName] = sessionId;

  const data: AgentSessionData = {
    agentSessions: sessions,
    updatedAt: new Date().toISOString(),
  };
  writeFileAtomic(path, JSON.stringify(data, null, 2));
}

/** Clear all saved agent sessions */
export function clearAgentSessions(projectDir: string): void {
  const path = getAgentSessionsPath(projectDir);
  ensureDir(getProjectConfigDir(projectDir));
  const data: AgentSessionData = {
    agentSessions: {},
    updatedAt: new Date().toISOString(),
  };
  writeFileAtomic(path, JSON.stringify(data, null, 2));

  // Also clear Claude CLI project sessions
  clearClaudeProjectSessions(projectDir);
}

/**
 * Get the Claude CLI project session directory path.
 * Claude CLI stores sessions in ~/.claude/projects/{encoded-project-path}/
 */
export function getClaudeProjectSessionsDir(projectDir: string): string {
  const resolvedPath = resolve(projectDir);
  // Claude CLI encodes the path by replacing '/' and other special chars with '-'
  // Based on observed behavior: /Users/takt -> -Users-takt
  const encodedPath = resolvedPath.replace(/[/\\_ ]/g, '-');
  return join(homedir(), '.claude', 'projects', encodedPath);
}

/**
 * Clear Claude CLI project sessions.
 * Removes all session files (*.jsonl) from the project's session directory.
 */
export function clearClaudeProjectSessions(projectDir: string): void {
  const sessionDir = getClaudeProjectSessionsDir(projectDir);

  if (!existsSync(sessionDir)) {
    return;
  }

  try {
    const entries = readdirSync(sessionDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(sessionDir, entry.name);

      // Remove .jsonl session files and sessions-index.json
      if (entry.isFile() && (entry.name.endsWith('.jsonl') || entry.name === 'sessions-index.json')) {
        try {
          unlinkSync(fullPath);
        } catch {
          // Ignore individual file deletion errors
        }
      }

      // Remove session subdirectories (some sessions have associated directories)
      if (entry.isDirectory()) {
        try {
          rmSync(fullPath, { recursive: true, force: true });
        } catch {
          // Ignore directory deletion errors
        }
      }
    }
  } catch {
    // Ignore errors if we can't read the directory
  }
}
