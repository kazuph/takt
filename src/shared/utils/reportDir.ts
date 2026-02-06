/**
 * Report directory name generation.
 */

export function generateReportDir(task: string): string {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14)
    .replace(/(\d{8})(\d{6})/, '$1-$2');

  const summary = task
    .slice(0, 30)
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'task';

  return `${timestamp}-${summary}`;
}
