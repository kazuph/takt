/**
 * Retry PR creation for the latest task branch.
 */

import { execFileSync } from 'node:child_process';
import { loadLatestSessionLog, loadSessionLog } from '../utils/session.js';
import { createLogger } from '../utils/debug.js';
import { info, warn, error, success } from '../utils/ui.js';
import { createPullRequest, getDefaultBranch, hasCommitsBetween, hasRemoteBranch, pushBranch, buildPrBody } from '../github/pr.js';
import { generatePrDraft } from '../github/pr-writer.js';
import { loadCloneMeta } from '../task/clone.js';
import { join } from 'node:path';

const log = createLogger('pr-retry');

export interface PrRetryOptions {
  branch?: string;
  base?: string;
  repo?: string;
}

function getCurrentBranch(cwd: string): string {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim();
}

function getLatestTaskBranch(cwd: string): string | null {
  try {
    const output = execFileSync('git', [
      'for-each-ref',
      '--sort=-committerdate',
      '--format=%(refname:short)',
      'refs/heads/takt/',
    ], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();

    const first = output.split(/\r?\n/).filter(Boolean)[0];
    return first ?? null;
  } catch {
    return null;
  }
}

function resolveBranch(cwd: string, base: string, override?: string): string | null {
  if (override) return override;

  const current = getCurrentBranch(cwd);
  if (current && current !== base) {
    return current;
  }

  return getLatestTaskBranch(cwd);
}

export async function retryPrCreation(cwd: string, projectDir: string, options: PrRetryOptions): Promise<void> {
  const base = options.base ?? getDefaultBranch(cwd);
  const branch = resolveBranch(cwd, base, options.branch);

  if (!branch) {
    error('PR作成対象のブランチが見つかりませんでした。--branch を指定してください。');
    return;
  }

  if (!hasCommitsBetween(cwd, base, branch)) {
    warn(`No commits between ${base} and ${branch}. Skipping PR creation.`);
    return;
  }

  if (!hasRemoteBranch(cwd, branch)) {
    info(`Pushing ${branch} to origin...`);
    pushBranch(cwd, branch);
    success(`Pushed to origin/${branch}`);
  }

  const cloneMeta = loadCloneMeta(projectDir, branch);
  const sessionLog = cloneMeta?.sessionId
    ? loadSessionLog(join(projectDir, '.takt', 'logs', `${cloneMeta.sessionId}.jsonl`))
    : loadLatestSessionLog(projectDir);

  const task = sessionLog?.task ?? `PR for ${branch}`;
  const workflow = sessionLog?.workflowName ?? 'default';
  const reportDir = cloneMeta?.reportDir ?? sessionLog?.reportDir;

  let draft;
  try {
    info('Generating pull request via LLM...');
    draft = await generatePrDraft({
      cwd,
      projectDir,
      task,
      workflow,
      branch,
      base,
      reportDir,
    });
  } catch (err) {
    warn(`PR draft generation failed, using fallback template: ${err instanceof Error ? err.message : String(err)}`);
    draft = {
      title: task.length > 100 ? `${task.slice(0, 97)}...` : task,
      body: buildPrBody(undefined, `Workflow \`${workflow}\` completed successfully.`),
    };
  }

  info('Creating pull request...');
  const prResult = createPullRequest(cwd, {
    branch,
    title: draft.title,
    body: draft.body,
    base,
    repo: options.repo,
  });

  if (prResult.success) {
    success(`PR created: ${prResult.url}`);
  } else {
    error(`PR creation failed: ${prResult.error}`);
  }

  log.info('PR retry completed', { branch, base });
}
