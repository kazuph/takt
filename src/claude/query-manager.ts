/**
 * Query management for Claude SDK
 *
 * Handles tracking and lifecycle management of active Claude queries.
 * Supports concurrent query execution with interrupt capabilities.
 */

import type { Query } from '@anthropic-ai/claude-agent-sdk';

/**
 * Active query registry for interrupt support.
 * Uses a Map to support concurrent query execution.
 */
const activeQueries = new Map<string, Query>();

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
export function registerQuery(queryId: string, queryInstance: Query): void {
  activeQueries.set(queryId, queryInstance);
}

/** Unregister an active query */
export function unregisterQuery(queryId: string): void {
  activeQueries.delete(queryId);
}

/**
 * Interrupt a specific Claude query by ID.
 * @returns true if the query was interrupted, false if not found
 */
export function interruptQuery(queryId: string): boolean {
  const queryInstance = activeQueries.get(queryId);
  if (queryInstance) {
    queryInstance.interrupt();
    activeQueries.delete(queryId);
    return true;
  }
  return false;
}

/**
 * Interrupt all active Claude queries.
 * @returns number of queries that were interrupted
 */
export function interruptAllQueries(): number {
  const count = activeQueries.size;
  for (const [id, queryInstance] of activeQueries) {
    queryInstance.interrupt();
    activeQueries.delete(id);
  }
  return count;
}

/**
 * Interrupt the most recently started Claude query (backward compatibility).
 * @returns true if a query was interrupted, false if no query was running
 */
export function interruptCurrentProcess(): boolean {
  if (activeQueries.size === 0) {
    return false;
  }
  // Interrupt all queries for backward compatibility
  // In the old design, there was only one query
  interruptAllQueries();
  return true;
}
