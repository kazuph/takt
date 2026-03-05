/**
 * Tests for status parser (NDJSON log → StatusSnapshot)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseStatusFromLog } from '../commands/status/statusParser.js';
import type { NdjsonRecord } from '../shared/utils/types.js';

function writeLogs(logPath: string, records: NdjsonRecord[]): void {
  const content = records.map(r => JSON.stringify(r)).join('\n');
  writeFileSync(logPath, content);
}

describe('parseStatusFromLog', () => {
  let tmpDir: string;
  let logPath: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `takt-test-status-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    logPath = join(tmpDir, 'test.jsonl');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null for non-existent file', () => {
    expect(parseStatusFromLog('/nonexistent/path.jsonl')).toBeNull();
  });

  it('returns null for empty file', () => {
    writeFileSync(logPath, '');
    expect(parseStatusFromLog(logPath)).toBeNull();
  });

  it('parses piece_start correctly', () => {
    writeLogs(logPath, [
      { type: 'piece_start', task: 'implement feature', pieceName: 'default', startTime: '2026-01-01T00:00:00Z' },
    ]);

    const snapshot = parseStatusFromLog(logPath);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.pieceName).toBe('default');
    expect(snapshot!.task).toBe('implement feature');
    expect(snapshot!.startTime).toBe('2026-01-01T00:00:00Z');
    expect(snapshot!.overallStatus).toBe('running');
    expect(snapshot!.completedMovements).toHaveLength(0);
    expect(snapshot!.currentMovement).toBeNull();
  });

  it('tracks movement start and phase start', () => {
    writeLogs(logPath, [
      { type: 'piece_start', task: 'test task', pieceName: 'dual', startTime: '2026-01-01T00:00:00Z' },
      { type: 'step_start', step: 'plan', persona: 'planner', iteration: 1, timestamp: '2026-01-01T00:00:01Z' },
      { type: 'phase_start', step: 'plan', phase: 1, phaseName: 'execute', timestamp: '2026-01-01T00:00:02Z' },
    ]);

    const snapshot = parseStatusFromLog(logPath);
    expect(snapshot!.currentMovement).not.toBeNull();
    expect(snapshot!.currentMovement!.name).toBe('plan');
    expect(snapshot!.currentMovement!.startIteration).toBe(1);
    expect(snapshot!.currentMovement!.status).toBe('running');
    expect(snapshot!.currentMovement!.currentPhase).toEqual({ phase: 1, phaseName: 'execute' });
    expect(snapshot!.completedMovements).toHaveLength(0);
  });

  it('moves completed movements to completedMovements array', () => {
    writeLogs(logPath, [
      { type: 'piece_start', task: 'test', pieceName: 'dual', startTime: '2026-01-01T00:00:00Z' },
      { type: 'step_start', step: 'plan', persona: 'planner', iteration: 1, timestamp: '2026-01-01T00:00:01Z' },
      { type: 'step_complete', step: 'plan', persona: 'planner', status: 'complete', content: 'done', instruction: '', matchedRuleIndex: 0, timestamp: '2026-01-01T00:00:10Z' },
      { type: 'step_start', step: 'implement', persona: 'coder', iteration: 2, timestamp: '2026-01-01T00:00:11Z' },
    ]);

    const snapshot = parseStatusFromLog(logPath);
    expect(snapshot!.completedMovements).toHaveLength(1);
    expect(snapshot!.completedMovements[0]!.name).toBe('plan');
    expect(snapshot!.completedMovements[0]!.status).toBe('completed');
    expect(snapshot!.currentMovement!.name).toBe('implement');
    expect(snapshot!.currentMovement!.status).toBe('running');
  });

  it('handles full lifecycle: start → movements → complete', () => {
    writeLogs(logPath, [
      { type: 'piece_start', task: 'test', pieceName: 'default', startTime: '2026-01-01T00:00:00Z' },
      { type: 'step_start', step: 'plan', persona: 'planner', iteration: 1, timestamp: '2026-01-01T00:00:01Z' },
      { type: 'step_complete', step: 'plan', persona: 'planner', status: 'review', content: 'plan done', instruction: '', matchedRuleIndex: 0, timestamp: '2026-01-01T00:00:10Z' },
      { type: 'step_start', step: 'review', persona: 'reviewer', iteration: 2, timestamp: '2026-01-01T00:00:11Z' },
      { type: 'step_complete', step: 'review', persona: 'reviewer', status: 'complete', content: 'lgtm', instruction: '', matchedRuleIndex: 0, timestamp: '2026-01-01T00:00:20Z' },
      { type: 'piece_complete', iterations: 2, endTime: '2026-01-01T00:00:21Z' },
    ]);

    const snapshot = parseStatusFromLog(logPath);
    expect(snapshot!.overallStatus).toBe('completed');
    expect(snapshot!.completedMovements).toHaveLength(2);
    expect(snapshot!.currentMovement).toBeNull();
  });

  it('handles piece abort', () => {
    writeLogs(logPath, [
      { type: 'piece_start', task: 'test', pieceName: 'default', startTime: '2026-01-01T00:00:00Z' },
      { type: 'step_start', step: 'implement', persona: 'coder', iteration: 1, timestamp: '2026-01-01T00:00:01Z' },
      { type: 'piece_abort', iterations: 1, reason: 'user_interrupted', endTime: '2026-01-01T00:00:10Z' },
    ]);

    const snapshot = parseStatusFromLog(logPath);
    expect(snapshot!.overallStatus).toBe('aborted');
    // Running movement gets pushed to completedMovements on abort
    expect(snapshot!.completedMovements).toHaveLength(1);
    expect(snapshot!.currentMovement).toBeNull();
  });

  it('skips malformed JSON lines gracefully', () => {
    writeFileSync(logPath, [
      JSON.stringify({ type: 'piece_start', task: 'test', pieceName: 'default', startTime: '2026-01-01T00:00:00Z' }),
      'not valid json',
      JSON.stringify({ type: 'step_start', step: 'plan', persona: 'p', iteration: 1, timestamp: '2026-01-01T00:00:01Z' }),
    ].join('\n'));

    const snapshot = parseStatusFromLog(logPath);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.currentMovement!.name).toBe('plan');
  });

  it('handles phase transitions correctly', () => {
    writeLogs(logPath, [
      { type: 'piece_start', task: 'test', pieceName: 'dual', startTime: '2026-01-01T00:00:00Z' },
      { type: 'step_start', step: 'review', persona: 'reviewer', iteration: 3, timestamp: '2026-01-01T00:00:01Z' },
      { type: 'phase_start', step: 'review', phase: 1, phaseName: 'execute', timestamp: '2026-01-01T00:00:02Z' },
      { type: 'phase_start', step: 'review', phase: 2, phaseName: 'report', timestamp: '2026-01-01T00:00:10Z' },
    ]);

    const snapshot = parseStatusFromLog(logPath);
    expect(snapshot!.currentMovement!.currentPhase).toEqual({ phase: 2, phaseName: 'report' });
  });

  it('finalizes previous movement when next step_start arrives without step_complete', () => {
    writeLogs(logPath, [
      { type: 'piece_start', task: 'test', pieceName: 'default', startTime: '2026-01-01T00:00:00Z' },
      { type: 'step_start', step: 'plan', persona: 'planner', iteration: 1, timestamp: '2026-01-01T00:00:01Z' },
      // No step_complete for plan - directly start next movement
      { type: 'step_start', step: 'implement', persona: 'coder', iteration: 2, timestamp: '2026-01-01T00:00:10Z' },
    ]);

    const snapshot = parseStatusFromLog(logPath);
    expect(snapshot!.completedMovements).toHaveLength(1);
    expect(snapshot!.completedMovements[0]!.name).toBe('plan');
    expect(snapshot!.completedMovements[0]!.status).toBe('completed');
    expect(snapshot!.completedMovements[0]!.endIteration).toBe(2);
    expect(snapshot!.currentMovement!.name).toBe('implement');
  });
});
