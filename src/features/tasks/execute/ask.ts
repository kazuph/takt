/**
 * Ask about branch outcomes.
 */

import { loadGlobalConfig } from '../../../infra/config/index.js';
import { buildBranchContext } from '../../../infra/task/index.js';
import { getProvider, type ProviderType } from '../../../infra/providers/index.js';
import { isQuietMode } from '../../../shared/context.js';
import { StreamDisplay, info, warn } from '../../../shared/ui/index.js';
import { createLogger, getErrorMessage } from '../../../shared/utils/index.js';

const log = createLogger('ask');

const ASK_SYSTEM_PROMPT = `あなたはタスク結果の説明アシスタントです。
与えられた文脈（差分サマリ/コミット/依頼内容）をもとに、質問に簡潔に答えてください。
不明な点は推測せず、「情報不足」と明確に述べてください。
作業ディレクトリや現在のブランチ、worktreeの実在を断定してはいけません。`;

export interface AskPromptInput {
  question: string;
  task?: string;
  piece?: string;
  branch?: string;
  context?: string;
}

export function buildAskPrompt(input: AskPromptInput): string {
  const lines: string[] = [];

  if (input.task) {
    lines.push('## タスク');
    lines.push(input.task);
    lines.push('');
  }
  if (input.piece) {
    lines.push('## ピース');
    lines.push(input.piece);
    lines.push('');
  }
  if (input.branch) {
    lines.push('## ブランチ');
    lines.push(input.branch);
    lines.push('');
  }
  if (input.context) {
    lines.push('## 変更内容の要約');
    lines.push(input.context.trim());
    lines.push('');
  }

  lines.push('## 質問');
  lines.push(input.question);

  return lines.join('\n').trim();
}

export interface AskAboutBranchInput {
  branch: string;
  question: string;
  task?: string;
  piece?: string;
  originalInstruction?: string;
  provider?: ProviderType;
  model?: string;
}

export async function askAboutBranch(
  projectDir: string,
  input: AskAboutBranchInput,
): Promise<void> {
  const globalConfig = loadGlobalConfig();
  const providerType = input.provider ?? (globalConfig.provider as ProviderType) ?? 'claude';
  const model = input.model ?? (globalConfig.model as string | undefined);
  const provider = getProvider(providerType);

  const context = buildBranchContext(projectDir, input.branch, {
    originalInstruction: input.originalInstruction,
  });

  const prompt = buildAskPrompt({
    question: input.question,
    task: input.task,
    piece: input.piece,
    branch: input.branch,
    context,
  });

  info('Asking about outcome...');
  const display = new StreamDisplay('ask', isQuietMode());
  try {
    const response = await provider.call('ask', prompt, {
      cwd: projectDir,
      model,
      systemPrompt: ASK_SYSTEM_PROMPT,
      allowedTools: [],
      onStream: display.createHandler(),
    });
    display.flush();
    if (response.status === 'blocked') {
      warn('Ask request was blocked by the provider.');
    }
  } catch (err) {
    display.flush();
    const msg = getErrorMessage(err);
    log.error('Ask failed', { error: msg });
    warn(`Ask failed: ${msg}`);
  }
}
