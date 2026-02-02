/**
 * Type definitions for Codex SDK integration
 */

import type { StreamCallback } from '../claude/index.js';

/** Options for calling Codex */
export interface CodexCallOptions {
  cwd: string;
  sessionId?: string;
  model?: string;
  systemPrompt?: string;
  /** Enable streaming mode with callback (best-effort) */
  onStream?: StreamCallback;
  /** OpenAI API key (bypasses CLI auth) */
  openaiApiKey?: string;
}
