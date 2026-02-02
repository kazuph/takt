/**
 * Task name summarization using AI or romanization
 *
 * Generates concise English/romaji summaries for use in branch names and clone paths.
 */

import * as wanakana from 'wanakana';
import { loadGlobalConfig } from '../config/global/globalConfig.js';
import { getProvider, type ProviderType } from '../providers/index.js';
import { createLogger } from '../utils/debug.js';
import type { SummarizeOptions } from './types.js';

export type { SummarizeOptions };

const log = createLogger('summarize');

const SUMMARIZE_SYSTEM_PROMPT = `You are a slug generator. Given a task description, output ONLY a slug.

NEVER output sentences. NEVER start with "this", "the", "i", "we", or "it".
ALWAYS start with a verb: add, fix, update, refactor, implement, remove, etc.

Format: verb-noun (lowercase, hyphens, max 30 chars)

Input → Output:
認証機能を追加する → add-auth
Fix the login bug → fix-login-bug
ユーザー登録にメール認証を追加 → add-email-verification
worktreeを作るときブランチ名をAIで生成 → ai-branch-naming
レビュー画面に元の指示を表示する → show-original-instruction`;

/**
 * Sanitize a string for use as git branch name and directory name.
 * Allows only: a-z, 0-9, hyphen.
 */
function sanitizeSlug(input: string, maxLength = 30): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .slice(0, maxLength)
    .replace(/-+$/, '');
}

/**
 * Convert Japanese text to romaji slug.
 */
function toRomajiSlug(text: string): string {
  const romaji = wanakana.toRomaji(text, { customRomajiMapping: {} });
  return sanitizeSlug(romaji);
}

/**
 * Summarizes task names into concise slugs using AI or romanization.
 */
export class TaskSummarizer {
  /**
   * Summarize a task name into a concise slug.
   *
   * @param taskName - Original task name (can be in any language)
   * @param options - Summarization options
   * @returns Slug suitable for branch names (English if LLM, romaji if not)
   */
  async summarize(
    taskName: string,
    options: SummarizeOptions,
  ): Promise<string> {
    const useLLM = options.useLLM ?? true;
    log.info('Summarizing task name', { taskName, useLLM });

    if (!useLLM) {
      const slug = toRomajiSlug(taskName);
      log.info('Task name romanized', { original: taskName, slug });
      return slug || 'task';
    }

    const globalConfig = loadGlobalConfig();
    const providerType = (globalConfig.provider as ProviderType) ?? 'claude';
    const model = options.model ?? globalConfig.model ?? 'haiku';

    const provider = getProvider(providerType);
    const response = await provider.call('summarizer', taskName, {
      cwd: options.cwd,
      model,
      systemPrompt: SUMMARIZE_SYSTEM_PROMPT,
      allowedTools: [],
    });

    const slug = sanitizeSlug(response.content);
    log.info('Task name summarized', { original: taskName, slug });

    return slug || 'task';
  }
}

// ---- Backward-compatible module-level function ----

const defaultSummarizer = new TaskSummarizer();

export async function summarizeTaskName(
  taskName: string,
  options: SummarizeOptions,
): Promise<string> {
  return defaultSummarizer.summarize(taskName, options);
}
