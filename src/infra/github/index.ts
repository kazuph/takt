/**
 * GitHub integration - barrel exports
 */

export type { GitHubIssue, GhCliStatus, CreatePrOptions, CreatePrResult } from './types.js';

export {
  checkGhCli,
  fetchIssue,
  formatIssueAsTask,
  parseIssueNumbers,
  isIssueReference,
  resolveIssueTask,
} from './issue.js';

export { pushBranch, createPullRequest, buildPrBody } from './pr.js';
