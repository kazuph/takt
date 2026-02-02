/**
 * Query management for Claude SDK
 *
 * Handles tracking and lifecycle management of active Claude queries.
 * Supports concurrent query execution with interrupt capabilities.
 *
 * QueryRegistry is a singleton that encapsulates the global activeQueries Map.
 */

import type { Query } from '@anthropic-ai/claude-agent-sdk';

/**
 * Registry for tracking active Claude queries.
 * Singleton — use QueryRegistry.getInstance().
 */
export class QueryRegistry {
  private static instance: QueryRegistry | null = null;
  private readonly activeQueries = new Map<string, Query>();

  private constructor() {}

  static getInstance(): QueryRegistry {
    if (!QueryRegistry.instance) {
      QueryRegistry.instance = new QueryRegistry();
    }
    return QueryRegistry.instance;
  }

  /** Reset singleton for testing */
  static resetInstance(): void {
    QueryRegistry.instance = null;
  }

  /** Check if there is an active Claude process */
  hasActiveProcess(): boolean {
    return this.activeQueries.size > 0;
  }

  /** Check if a specific query is active */
  isQueryActive(queryId: string): boolean {
    return this.activeQueries.has(queryId);
  }

  /** Get count of active queries */
  getActiveQueryCount(): number {
    return this.activeQueries.size;
  }

  /** Register an active query */
  registerQuery(queryId: string, queryInstance: Query): void {
    this.activeQueries.set(queryId, queryInstance);
  }

  /** Unregister an active query */
  unregisterQuery(queryId: string): void {
    this.activeQueries.delete(queryId);
  }

  /**
   * Interrupt a specific Claude query by ID.
   * @returns true if the query was interrupted, false if not found
   */
  interruptQuery(queryId: string): boolean {
    const queryInstance = this.activeQueries.get(queryId);
    if (queryInstance) {
      queryInstance.interrupt();
      this.activeQueries.delete(queryId);
      return true;
    }
    return false;
  }

  /**
   * Interrupt all active Claude queries.
   * @returns number of queries that were interrupted
   */
  interruptAllQueries(): number {
    const count = this.activeQueries.size;
    for (const [id, queryInstance] of this.activeQueries) {
      queryInstance.interrupt();
      this.activeQueries.delete(id);
    }
    return count;
  }

  /**
   * Interrupt the most recently started Claude query (backward compatibility).
   * @returns true if a query was interrupted, false if no query was running
   */
  interruptCurrentProcess(): boolean {
    if (this.activeQueries.size === 0) {
      return false;
    }
    this.interruptAllQueries();
    return true;
  }
}

// ---- Backward-compatible module-level functions ----

/** Generate a unique query ID */
export function generateQueryId(): string {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function hasActiveProcess(): boolean {
  return QueryRegistry.getInstance().hasActiveProcess();
}

export function isQueryActive(queryId: string): boolean {
  return QueryRegistry.getInstance().isQueryActive(queryId);
}

export function getActiveQueryCount(): number {
  return QueryRegistry.getInstance().getActiveQueryCount();
}

export function registerQuery(queryId: string, queryInstance: Query): void {
  QueryRegistry.getInstance().registerQuery(queryId, queryInstance);
}

export function unregisterQuery(queryId: string): void {
  QueryRegistry.getInstance().unregisterQuery(queryId);
}

export function interruptQuery(queryId: string): boolean {
  return QueryRegistry.getInstance().interruptQuery(queryId);
}

export function interruptAllQueries(): number {
  return QueryRegistry.getInstance().interruptAllQueries();
}

export function interruptCurrentProcess(): boolean {
  return QueryRegistry.getInstance().interruptCurrentProcess();
}
