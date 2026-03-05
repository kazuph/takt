/**
 * takt status command — show progress of the running task.
 *
 * Scans `.takt/runs/` for a meta.json with status: 'running',
 * reads the NDJSON log, and displays a formatted timeline.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectConfigDir } from '../../infra/config/paths.js';
import { loadPieceByIdentifier } from '../../infra/config/loaders/pieceResolver.js';
import { parseStatusFromLog } from './statusParser.js';
import { formatStatus, formatNoRunningTask } from './statusFormatter.js';

interface RunMeta {
  task: string;
  piece: string;
  runSlug: string;
  runRoot: string;
  reportDirectory: string;
  contextDirectory: string;
  logsDirectory: string;
  status: 'running' | 'completed' | 'aborted';
  startTime: string;
  endTime?: string;
  iterations?: number;
}

/**
 * Find the most recent running meta.json in .takt/runs/.
 */
function findRunningMeta(projectDir: string): { meta: RunMeta; runDir: string } | null {
  const runsDir = join(getProjectConfigDir(projectDir), 'runs');
  if (!existsSync(runsDir)) return null;

  let entries: string[];
  try {
    entries = readdirSync(runsDir);
  } catch {
    return null;
  }

  // Sort descending to find most recent first
  entries.sort().reverse();

  for (const entry of entries) {
    const metaPath = join(runsDir, entry, 'meta.json');
    if (!existsSync(metaPath)) continue;

    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as RunMeta;
      if (meta.status === 'running') {
        return { meta, runDir: join(runsDir, entry) };
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Find the NDJSON log file in the logs directory.
 */
function findLogFile(logsDir: string): string | null {
  if (!existsSync(logsDir)) return null;

  let entries: string[];
  try {
    entries = readdirSync(logsDir);
  } catch {
    return null;
  }

  // Find .jsonl files (NDJSON log files)
  const jsonlFiles = entries.filter(e => e.endsWith('.jsonl'));
  if (jsonlFiles.length === 0) return null;

  // Return the first (and typically only) one
  return join(logsDir, jsonlFiles[0]!);
}

/**
 * Show the status of the currently running task.
 */
export async function showStatus(projectDir: string): Promise<void> {
  const running = findRunningMeta(projectDir);
  if (!running) {
    formatNoRunningTask();
    return;
  }

  const { meta, runDir } = running;

  // Resolve absolute logs directory path
  const logsDir = join(runDir, 'logs');
  const logFile = findLogFile(logsDir);

  if (!logFile) {
    formatNoRunningTask();
    return;
  }

  const snapshot = parseStatusFromLog(logFile);
  if (!snapshot) {
    formatNoRunningTask();
    return;
  }

  // Try to load the piece to get all movement names
  let allMovementNames: string[] | undefined;
  try {
    const piece = loadPieceByIdentifier(meta.piece, projectDir);
    if (piece) {
      allMovementNames = piece.movements.map(m => m.name);
    }
  } catch {
    // Piece resolution failure is non-fatal
  }

  formatStatus(snapshot, allMovementNames);
}
