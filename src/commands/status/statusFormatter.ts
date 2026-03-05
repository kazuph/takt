/**
 * Status formatter for takt status command.
 *
 * Renders a StatusSnapshot to the console with timeline view,
 * showing completed, running, and pending movements.
 */

import chalk from 'chalk';
import { header, info, status } from '../../shared/ui/LogManager.js';
import type { StatusSnapshot, MovementEntry } from './statusParser.js';

/**
 * Format elapsed time from ISO start time to now.
 */
function formatElapsed(startTime: string): string {
  const elapsedMs = Date.now() - new Date(startTime).getTime();
  const totalSec = Math.floor(elapsedMs / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}m ${sec}s`;
  const hr = Math.floor(min / 60);
  const remainMin = min % 60;
  return `${hr}h ${remainMin}m`;
}

/**
 * Format start time as HH:MM:SS.
 */
function formatTime(isoTime: string): string {
  const d = new Date(isoTime);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

/**
 * Truncate task text for display.
 */
function truncateTask(task: string, maxLength: number): string {
  const singleLine = task.replace(/\n/g, ' ').trim();
  if (singleLine.length <= maxLength) return singleLine;
  return singleLine.slice(0, maxLength - 3) + '...';
}

/**
 * Format iteration range for a movement entry.
 */
function formatIterRange(entry: MovementEntry): string {
  if (entry.endIteration != null && entry.endIteration !== entry.startIteration) {
    return `iter ${entry.startIteration}-${entry.endIteration}`;
  }
  return `iter ${entry.startIteration}`;
}

/**
 * Format and display the status snapshot.
 *
 * @param snapshot - The parsed status snapshot
 * @param allMovementNames - Optional list of all movement names in the piece (for pending display)
 */
export function formatStatus(snapshot: StatusSnapshot, allMovementNames?: string[]): void {
  header('TAKT Status');

  // Task info
  info(`Task: ${truncateTask(snapshot.task, 80)}`);

  const statusColor = snapshot.overallStatus === 'running' ? 'green'
    : snapshot.overallStatus === 'completed' ? 'green'
    : 'red';
  status('Piece', `${snapshot.pieceName} | Status: ${snapshot.overallStatus}`, statusColor);
  status('Started', `${formatTime(snapshot.startTime)} (elapsed: ${formatElapsed(snapshot.startTime)})`);

  console.log();
  console.log(chalk.bold('Movement Timeline:'));

  // Build set of completed/running movement names for pending detection
  const seenMovements = new Set<string>();

  // Completed movements
  for (const entry of snapshot.completedMovements) {
    seenMovements.add(entry.name);
    const iterRange = formatIterRange(entry);
    const arrow = entry.nextMovement ? ` ${chalk.gray('→')} ${entry.nextMovement}` : '';
    console.log(`  ${chalk.green('✅')} ${padRight(entry.name, 16)} ${chalk.gray(`(${iterRange})`)}${arrow}`);
  }

  // Current running movement
  if (snapshot.currentMovement) {
    seenMovements.add(snapshot.currentMovement.name);
    const iterRange = `iter ${snapshot.currentMovement.startIteration}`;
    const phaseInfo = snapshot.currentMovement.currentPhase
      ? `  ${chalk.yellow(`[Phase ${snapshot.currentMovement.currentPhase.phase}: ${snapshot.currentMovement.currentPhase.phaseName}]`)}`
      : '';
    console.log(`  ${chalk.yellow('🔄')} ${padRight(snapshot.currentMovement.name, 16)} ${chalk.gray(`(${iterRange})`)}${phaseInfo}`);
  }

  // Pending movements (from allMovementNames, excluding seen)
  if (allMovementNames) {
    for (const name of allMovementNames) {
      if (!seenMovements.has(name)) {
        console.log(`  ${chalk.gray('⏳')} ${chalk.gray(name)}`);
      }
    }
  }
}

/**
 * Pad string to the right for alignment.
 */
function padRight(str: string, width: number): string {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

/**
 * Show "no running task" message.
 */
export function formatNoRunningTask(): void {
  header('TAKT Status');
  info('No running task found.');
}
