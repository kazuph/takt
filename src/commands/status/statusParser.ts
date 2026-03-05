/**
 * NDJSON log parser for takt status command.
 *
 * Reads NDJSON session logs and builds a status snapshot
 * representing the current progress of a piece execution.
 */

import { readFileSync } from 'node:fs';
import type {
  NdjsonRecord,
  NdjsonPieceStart,
  NdjsonStepStart,
  NdjsonStepComplete,
  NdjsonPhaseStart,
  NdjsonPieceComplete,
  NdjsonPieceAbort,
} from '../../shared/utils/types.js';

/** A single movement's execution entry */
export interface MovementEntry {
  name: string;
  startIteration: number;
  endIteration?: number;
  status: 'running' | 'completed';
  currentPhase?: { phase: 1 | 2 | 3; phaseName: string };
  nextMovement?: string;
}

/** Aggregated status snapshot of a piece execution */
export interface StatusSnapshot {
  pieceName: string;
  task: string;
  startTime: string;
  overallStatus: 'running' | 'completed' | 'aborted';
  completedMovements: MovementEntry[];
  currentMovement: MovementEntry | null;
}

/**
 * Parse NDJSON log file into a StatusSnapshot.
 *
 * Processes records sequentially to reconstruct current state:
 * - piece_start → initialize snapshot
 * - step_start → create new movement entry
 * - phase_start → update current phase
 * - step_complete → finalize movement
 * - piece_complete / piece_abort → finalize overall status
 */
export function parseStatusFromLog(logPath: string): StatusSnapshot | null {
  let content: string;
  try {
    content = readFileSync(logPath, 'utf-8');
  } catch {
    return null;
  }

  const lines = content.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return null;

  let snapshot: StatusSnapshot | null = null;
  let currentMovement: MovementEntry | null = null;

  for (const line of lines) {
    let record: NdjsonRecord;
    try {
      record = JSON.parse(line) as NdjsonRecord;
    } catch {
      continue;
    }

    switch (record.type) {
      case 'piece_start': {
        const r = record as NdjsonPieceStart;
        snapshot = {
          pieceName: r.pieceName,
          task: r.task,
          startTime: r.startTime,
          overallStatus: 'running',
          completedMovements: [],
          currentMovement: null,
        };
        break;
      }

      case 'step_start': {
        if (!snapshot) break;
        const r = record as NdjsonStepStart;
        // Finalize previous movement if still running
        if (currentMovement && currentMovement.status === 'running') {
          currentMovement.status = 'completed';
          currentMovement.endIteration = r.iteration;
          snapshot.completedMovements.push(currentMovement);
        }
        currentMovement = {
          name: r.step,
          startIteration: r.iteration,
          status: 'running',
        };
        snapshot.currentMovement = currentMovement;
        break;
      }

      case 'phase_start': {
        if (!currentMovement) break;
        const r = record as NdjsonPhaseStart;
        currentMovement.currentPhase = {
          phase: r.phase,
          phaseName: r.phaseName,
        };
        break;
      }

      case 'step_complete': {
        if (!snapshot || !currentMovement) break;
        const r = record as NdjsonStepComplete;
        currentMovement.status = 'completed';
        currentMovement.endIteration = currentMovement.startIteration;
        currentMovement.currentPhase = undefined;
        // Extract next movement from matched rule if available
        if (r.matchedRuleIndex != null) {
          currentMovement.nextMovement = r.status;
        }
        snapshot.completedMovements.push(currentMovement);
        snapshot.currentMovement = null;
        currentMovement = null;
        break;
      }

      case 'piece_complete': {
        if (!snapshot) break;
        const _r = record as NdjsonPieceComplete;
        snapshot.overallStatus = 'completed';
        if (currentMovement && currentMovement.status === 'running') {
          currentMovement.status = 'completed';
          snapshot.completedMovements.push(currentMovement);
          snapshot.currentMovement = null;
          currentMovement = null;
        }
        break;
      }

      case 'piece_abort': {
        if (!snapshot) break;
        const _r = record as NdjsonPieceAbort;
        snapshot.overallStatus = 'aborted';
        if (currentMovement && currentMovement.status === 'running') {
          snapshot.completedMovements.push(currentMovement);
          snapshot.currentMovement = null;
          currentMovement = null;
        }
        break;
      }
    }
  }

  return snapshot;
}
