/**
 * Query management for Claude CLI
 *
 * Tracks active Claude CLI processes for interrupt support.
 */

import type { ChildProcess } from 'node:child_process';

/** Active query registry */
const activeQueries = new Map<string, ChildProcess>();

/** Generate a unique query ID */
export function generateQueryId(): string {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Check if there is an active Claude process */
export function hasActiveProcess(): boolean {
  return activeQueries.size > 0;
}

/** Check if a specific query is active */
export function isQueryActive(queryId: string): boolean {
  return activeQueries.has(queryId);
}

/** Get count of active queries */
export function getActiveQueryCount(): number {
  return activeQueries.size;
}

/** Register an active query */
export function registerQuery(queryId: string, process: ChildProcess): void {
  activeQueries.set(queryId, process);
}

/** Unregister an active query */
export function unregisterQuery(queryId: string): void {
  activeQueries.delete(queryId);
}

/** Interrupt a specific Claude query by ID */
export function interruptQuery(queryId: string): boolean {
  const process = activeQueries.get(queryId);
  if (process) {
    process.kill('SIGINT');
    activeQueries.delete(queryId);
    return true;
  }
  return false;
}

/** Interrupt all active Claude queries */
export function interruptAllQueries(): number {
  const count = activeQueries.size;
  for (const [id, process] of activeQueries) {
    process.kill('SIGINT');
    activeQueries.delete(id);
  }
  return count;
}

/** Interrupt the most recently started Claude query (backward compatibility) */
export function interruptCurrentProcess(): boolean {
  if (activeQueries.size === 0) {
    return false;
  }
  interruptAllQueries();
  return true;
}
