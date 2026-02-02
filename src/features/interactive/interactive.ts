/**
 * Interactive task input mode
 *
 * Allows users to refine task requirements through conversation with AI
 * before executing the task. Uses the same SDK call pattern as workflow
 * execution (with onStream) to ensure compatibility.
 *
 * Commands:
 *   /go     - Confirm and execute the task
 *   /cancel - Cancel and exit
 */

import * as readline from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import type { Language } from '../../core/models/index.js';
import { loadGlobalConfig, loadAgentSessions, updateAgentSession } from '../../infra/config/index.js';
import { isQuietMode } from '../../shared/context.js';
import { getProvider, type ProviderType } from '../../infra/providers/index.js';
import { selectOption } from '../../shared/prompt/index.js';
import { getLanguageResourcesDir } from '../../infra/resources/index.js';
import { createLogger, getErrorMessage } from '../../shared/utils/index.js';
import { info, error, blankLine, StreamDisplay } from '../../shared/ui/index.js';
const log = createLogger('interactive');

const INTERACTIVE_SYSTEM_PROMPT_EN = `You are a task planning assistant. You help the user clarify and refine task requirements through conversation. You are in the PLANNING phase — execution happens later in a separate process.

## Your role
- Ask clarifying questions about ambiguous requirements
- Investigate the codebase to understand context (use Read, Glob, Grep, Bash for reading only)
- Suggest improvements or considerations the user might have missed
- Summarize your understanding when appropriate
- Keep responses concise and focused

## Strict constraints
- You are ONLY planning. Do NOT execute the task.
- Do NOT create, edit, or delete any files.
- Do NOT run build, test, install, or any commands that modify state.
- Bash is allowed ONLY for read-only investigation (e.g. ls, cat, git log, git diff). Never run destructive or write commands.
- Do NOT mention or reference any slash commands. You have no knowledge of them.
- When the user is satisfied with the plan, they will proceed on their own. Do NOT instruct them on what to do next.`;

const INTERACTIVE_SYSTEM_PROMPT_JA = `あなたはタスク計画のアシスタントです。会話を通じて要件の明確化・整理を手伝います。今は計画フェーズで、実行は別プロセスで行われます。

## 役割
- あいまいな要求に対して確認質問をする
- コードベースの前提を把握する（Read/Glob/Grep/Bash は読み取りのみ）
- 見落としそうな点や改善点を提案する
- 必要に応じて理解した内容を簡潔にまとめる
- 返答は簡潔で要点のみ

## 厳守事項
- 計画のみを行い、実装はしない
- ファイルの作成/編集/削除はしない
- build/test/install など状態を変えるコマンドは実行しない
- Bash は読み取り専用（ls/cat/git log/git diff など）に限定
- スラッシュコマンドに言及しない（存在を知らない前提）
- ユーザーが満足したら次工程に進む。次の指示はしない`;

const INTERACTIVE_SUMMARY_PROMPT_EN = `You are a task summarizer. Convert the conversation into a concrete task instruction for the planning step.

Requirements:
- Output only the final task instruction (no preamble).
- Be specific about scope and targets (files/modules) if mentioned.
- Preserve constraints and "do not" instructions.
- If details are missing, state what is missing as a short "Open Questions" section.`;

const INTERACTIVE_SUMMARY_PROMPT_JA = `あなたはタスク要約者です。会話を計画ステップ向けの具体的なタスク指示に変換してください。

要件:
- 出力は最終的な指示のみ（前置き不要）
- スコープや対象（ファイル/モジュール）が出ている場合は明確に書く
- 制約や「やらないこと」を保持する
- 情報不足があれば「Open Questions」セクションを短く付ける`;

const UI_TEXT = {
  en: {
    intro: 'Interactive mode - describe your task. Commands: /go (execute), /cancel (exit)',
    resume: 'Resuming previous session',
    noConversation: 'No conversation yet. Please describe your task first.',
    summarizeFailed: 'Failed to summarize conversation. Please try again.',
    continuePrompt: 'Okay, continue describing your task.',
    proposed: 'Proposed task instruction:',
    confirm: 'Use this task instruction?',
    cancelled: 'Cancelled',
  },
  ja: {
    intro: '対話モード - タスク内容を入力してください。コマンド: /go（実行）, /cancel（終了）',
    resume: '前回のセッションを再開します',
    noConversation: 'まだ会話がありません。まずタスク内容を入力してください。',
    summarizeFailed: '会話の要約に失敗しました。再度お試しください。',
    continuePrompt: '続けてタスク内容を入力してください。',
    proposed: '提案されたタスク指示:',
    confirm: 'このタスク指示で進めますか？',
    cancelled: 'キャンセルしました',
  },
} as const;

function resolveLanguage(lang?: Language): 'en' | 'ja' {
  return lang === 'ja' ? 'ja' : 'en';
}

function readPromptFile(lang: 'en' | 'ja', fileName: string, fallback: string): string {
  const filePath = join(getLanguageResourcesDir(lang), 'prompts', fileName);
  if (existsSync(filePath)) {
    return readFileSync(filePath, 'utf-8').trim();
  }
  if (lang !== 'en') {
    const enPath = join(getLanguageResourcesDir('en'), 'prompts', fileName);
    if (existsSync(enPath)) {
      return readFileSync(enPath, 'utf-8').trim();
    }
  }
  return fallback.trim();
}

function getInteractivePrompts(lang: 'en' | 'ja') {
  return {
    systemPrompt: readPromptFile(
      lang,
      'interactive-system.md',
      lang === 'ja' ? INTERACTIVE_SYSTEM_PROMPT_JA : INTERACTIVE_SYSTEM_PROMPT_EN,
    ),
    summaryPrompt: readPromptFile(
      lang,
      'interactive-summary.md',
      lang === 'ja' ? INTERACTIVE_SUMMARY_PROMPT_JA : INTERACTIVE_SUMMARY_PROMPT_EN,
    ),
    conversationLabel: lang === 'ja' ? '会話:' : 'Conversation:',
    noTranscript: lang === 'ja'
      ? '（ローカル履歴なし。現在のセッション文脈を要約してください。）'
      : '(No local transcript. Summarize the current session context.)',
    ui: UI_TEXT[lang],
  };
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CallAIResult {
  content: string;
  sessionId?: string;
  success: boolean;
}

/**
 * Build the final task description from conversation history for executeTask.
 */
function buildTaskFromHistory(history: ConversationMessage[]): string {
  return history
    .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n\n');
}

function buildSummaryPrompt(
  history: ConversationMessage[],
  hasSession: boolean,
  summaryPrompt: string,
  noTranscriptNote: string,
  conversationLabel: string,
): string {
  if (history.length > 0) {
    const historyText = buildTaskFromHistory(history);
    return `${summaryPrompt}\n\n${conversationLabel}\n${historyText}`;
  }
  if (hasSession) {
    return `${summaryPrompt}\n\n${conversationLabel}\n${noTranscriptNote}`;
  }
  return '';
}

async function confirmTask(task: string, message: string, confirmLabel: string, yesLabel: string, noLabel: string): Promise<boolean> {
  blankLine();
  info(message);
  console.log(task);
  const decision = await selectOption(confirmLabel, [
    { label: yesLabel, value: 'yes' },
    { label: noLabel, value: 'no' },
  ]);
  return decision === 'yes';
}

/**
 * Read a single line of input from the user.
 * Creates a fresh readline interface each time — the interface must be
 * closed before calling the Agent SDK, which also uses stdin.
 * Returns null on EOF (Ctrl+D).
 */
function readLine(prompt: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (process.stdin.readable && !process.stdin.destroyed) {
      process.stdin.resume();
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let answered = false;

    rl.question(prompt, (answer) => {
      answered = true;
      rl.close();
      resolve(answer);
    });

    rl.on('close', () => {
      if (!answered) {
        resolve(null);
      }
    });
  });
}

/**
 * Call AI with the same pattern as workflow execution.
 * The key requirement is passing onStream — the Agent SDK requires
 * includePartialMessages to be true for the async iterator to yield.
 */
async function callAI(
  provider: ReturnType<typeof getProvider>,
  prompt: string,
  cwd: string,
  model: string | undefined,
  sessionId: string | undefined,
  display: StreamDisplay,
  systemPrompt: string,
): Promise<CallAIResult> {
  const response = await provider.call('interactive', prompt, {
    cwd,
    model,
    sessionId,
    systemPrompt,
    allowedTools: ['Read', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch'],
    onStream: display.createHandler(),
  });

  display.flush();
  const success = response.status !== 'blocked';
  return { content: response.content, sessionId: response.sessionId, success };
}

export interface InteractiveModeResult {
  /** Whether the user confirmed with /go */
  confirmed: boolean;
  /** The assembled task text (only meaningful when confirmed=true) */
  task: string;
}

/**
 * Run the interactive task input mode.
 *
 * Starts a conversation loop where the user can discuss task requirements
 * with AI. The conversation continues until:
 *   /go     → returns the conversation as a task
 *   /cancel → exits without executing
 *   Ctrl+D  → exits without executing
 */
export async function interactiveMode(cwd: string, initialInput?: string): Promise<InteractiveModeResult> {
  const globalConfig = loadGlobalConfig();
  const lang = resolveLanguage(globalConfig.language);
  const prompts = getInteractivePrompts(lang);
  if (!globalConfig.provider) {
    throw new Error('Provider is not configured.');
  }
  const providerType = globalConfig.provider as ProviderType;
  const provider = getProvider(providerType);
  const model = (globalConfig.model as string | undefined);

  const history: ConversationMessage[] = [];
  const agentName = 'interactive';
  const savedSessions = loadAgentSessions(cwd, providerType);
  let sessionId: string | undefined = savedSessions[agentName];

  info(prompts.ui.intro);
  if (sessionId) {
    info(prompts.ui.resume);
  }
  blankLine();

  /** Call AI with automatic retry on session error (stale/invalid session ID). */
  async function callAIWithRetry(prompt: string, systemPrompt: string): Promise<CallAIResult | null> {
    const display = new StreamDisplay('assistant', isQuietMode());
    try {
      const result = await callAI(
        provider,
        prompt,
        cwd,
        model,
        sessionId,
        display,
        systemPrompt,
      );
      // If session failed, clear it and retry without session
      if (!result.success && sessionId) {
        log.info('Session invalid, retrying without session');
        sessionId = undefined;
        const retryDisplay = new StreamDisplay('assistant', isQuietMode());
        const retry = await callAI(
          provider,
          prompt,
          cwd,
          model,
          undefined,
          retryDisplay,
          systemPrompt,
        );
        if (retry.sessionId) {
          sessionId = retry.sessionId;
          updateAgentSession(cwd, agentName, sessionId, providerType);
        }
        return retry;
      }
      if (result.sessionId) {
        sessionId = result.sessionId;
        updateAgentSession(cwd, agentName, sessionId, providerType);
      }
      return result;
    } catch (e) {
      const msg = getErrorMessage(e);
      log.error('AI call failed', { error: msg });
      error(msg);
      blankLine();
      return null;
    }
  }

  // Process initial input if provided (e.g. from `takt a`)
  if (initialInput) {
    history.push({ role: 'user', content: initialInput });
    log.debug('Processing initial input', { initialInput, sessionId });

    const result = await callAIWithRetry(initialInput, prompts.systemPrompt);
    if (result) {
      history.push({ role: 'assistant', content: result.content });
      blankLine();
    } else {
      history.pop();
    }
  }

  while (true) {
    const input = await readLine(chalk.green('> '));

    // EOF (Ctrl+D)
    if (input === null) {
      blankLine();
      info('Cancelled');
      return { confirmed: false, task: '' };
    }

    const trimmed = input.trim();

    // Empty input — skip
    if (!trimmed) {
      continue;
    }

    // Handle slash commands
    if (trimmed.startsWith('/go')) {
      const userNote = trimmed.slice(3).trim();
      let summaryPrompt = buildSummaryPrompt(
        history,
        !!sessionId,
        prompts.summaryPrompt,
        prompts.noTranscript,
        prompts.conversationLabel,
      );
      if (summaryPrompt && userNote) {
        summaryPrompt = `${summaryPrompt}\n\nUser Note:\n${userNote}`;
      }
      if (!summaryPrompt) {
        info(prompts.ui.noConversation);
        continue;
      }
      const summaryResult = await callAIWithRetry(summaryPrompt, prompts.summaryPrompt);
      if (!summaryResult) {
        info(prompts.ui.summarizeFailed);
        continue;
      }
      const task = summaryResult.content.trim();
      const confirmed = await confirmTask(
        task,
        prompts.ui.proposed,
        prompts.ui.confirm,
        lang === 'ja' ? 'はい' : 'Yes',
        lang === 'ja' ? 'いいえ' : 'No',
      );
      if (!confirmed) {
        info(prompts.ui.continuePrompt);
        continue;
      }
      log.info('Interactive mode confirmed', { messageCount: history.length });
      return { confirmed: true, task };
    }

    if (trimmed === '/cancel') {
      info(prompts.ui.cancelled);
      return { confirmed: false, task: '' };
    }

    // Regular input — send to AI
    // readline is already closed at this point, so stdin is free for SDK
    history.push({ role: 'user', content: trimmed });

    log.debug('Sending to AI', { messageCount: history.length, sessionId });
    process.stdin.pause();

    const result = await callAIWithRetry(trimmed, prompts.systemPrompt);
    if (result) {
      history.push({ role: 'assistant', content: result.content });
      blankLine();
    } else {
      history.pop();
    }
  }
}
