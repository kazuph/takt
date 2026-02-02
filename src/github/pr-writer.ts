/**
 * PR draft generator using LLM agent.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runAgent } from '../agents/runner.js';
import { getBuiltinAgentsDir } from '../config/paths.js';
import { getLanguage } from '../config/globalConfig.js';
import { createLogger } from '../utils/debug.js';

const log = createLogger('pr-writer');

export interface PrDraft {
  title: string;
  body: string;
}

export interface PrDraftInput {
  cwd: string;
  projectDir: string;
  task: string;
  workflow: string;
  branch: string;
  base: string;
  issueTitle?: string;
  issueBody?: string;
}

function getGitOutput(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: 'pipe' }).trim();
}

function getDiffStat(cwd: string, base: string, branch: string): string {
  try {
    return getGitOutput(cwd, ['diff', '--stat', `${base}..${branch}`]);
  } catch {
    return '';
  }
}

function getCommitLog(cwd: string, base: string, branch: string): string {
  try {
    return getGitOutput(cwd, ['log', '--oneline', `${base}..${branch}`]);
  } catch {
    return '';
  }
}

function getLatestReportDir(projectDir: string): string | null {
  const reportsRoot = join(projectDir, '.takt', 'reports');
  if (!existsSync(reportsRoot)) return null;
  const dirs = readdirSync(reportsRoot).map((name) => join(reportsRoot, name)).filter((p) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  });

  if (dirs.length === 0) return null;
  dirs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return dirs[0] ?? null;
}

function readReportSnippets(dir: string, maxFiles = 6, maxChars = 1600): string {
  const entries = readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((p) => {
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    })
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .slice(0, maxFiles);

  const blocks: string[] = [];
  for (const filePath of entries) {
    const fileName = filePath.split('/').pop() ?? filePath;
    const content = readFileSync(filePath, 'utf-8').slice(0, maxChars).trim();
    if (content.length === 0) continue;
    blocks.push(`### ${fileName}\n\n${content}`);
  }

  return blocks.join('\n\n');
}

function parsePrDraft(output: string): PrDraft {
  const tagMatch = output.match(/\[PR:(\d+)\]/);
  if (!tagMatch) {
    throw new Error('PR draft output missing tag');
  }

  const tag = Number.parseInt(tagMatch[1] ?? '', 10);
  if (tag !== 1) {
    throw new Error('PR draft not ready or insufficient information');
  }

  const titleMatch = output.match(/^title:\s*(.+)$/im);
  if (!titleMatch) {
    throw new Error('PR draft output missing title');
  }

  const bodyIndex = output.search(/^body:\s*$/im);
  if (bodyIndex === -1) {
    throw new Error('PR draft output missing body');
  }

  const bodyStart = output.slice(bodyIndex).split(/\r?\n/).slice(1).join('\n').trim();
  if (!bodyStart) {
    throw new Error('PR draft body is empty');
  }

  return {
    title: titleMatch[1]!.trim(),
    body: bodyStart,
  };
}

export async function generatePrDraft(input: PrDraftInput): Promise<PrDraft> {
  const language = getLanguage();
  const agentPath = join(getBuiltinAgentsDir(language), 'default', 'pr-writer.md');

  const diffStat = getDiffStat(input.cwd, input.base, input.branch);
  const commitLog = getCommitLog(input.cwd, input.base, input.branch);
  const latestReportDir = getLatestReportDir(input.projectDir);
  const reportSnippets = latestReportDir ? readReportSnippets(latestReportDir) : '';

  const promptParts = [
    `## Task\n${input.task}`,
    `## Workflow\n${input.workflow}`,
    `## Branch\n${input.branch}`,
    `## Base\n${input.base}`,
  ];

  if (input.issueTitle || input.issueBody) {
    promptParts.push('## Issue');
    if (input.issueTitle) promptParts.push(`Title: ${input.issueTitle}`);
    if (input.issueBody) promptParts.push(`Body:\n${input.issueBody}`);
  }

  if (commitLog) {
    promptParts.push(`## Commits\n${commitLog}`);
  }

  if (diffStat) {
    promptParts.push(`## Diff Stat\n${diffStat}`);
  }

  if (reportSnippets) {
    promptParts.push(`## Reports\n${reportSnippets}`);
  }

  const prompt = promptParts.join('\n\n');

  log.info('Generating PR draft via agent', { branch: input.branch, base: input.base });

  const response = await runAgent('pr-writer', prompt, {
    cwd: input.cwd,
    agentPath,
    allowedTools: [],
  });

  return parsePrDraft(response.content);
}

export const __test__ = {
  parsePrDraft,
};
