/**
 * Watch workflow session logs (NDJSON).
 */

import { readFileSync, existsSync, watch, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectLogsDir, getGlobalLogsDir } from '../config/paths.js';
import { error, info, warn } from '../utils/ui.js';

export interface WatchLogOptions {
  sessionId?: string;
  file?: string;
  lines?: number;
  follow?: boolean;
}

function resolveLogPath(cwd: string, options: WatchLogOptions): string | null {
  if (options.file) return options.file;

  const logsDir = existsSync(getProjectLogsDir(cwd))
    ? getProjectLogsDir(cwd)
    : getGlobalLogsDir();

  if (options.sessionId) {
    const filename = options.sessionId.endsWith('.jsonl')
      ? options.sessionId
      : `${options.sessionId}.jsonl`;
    return join(logsDir, filename);
  }

  if (!existsSync(logsDir)) {
    return null;
  }

  const files = readdirSync(logsDir).filter((f) => f.endsWith('.jsonl'));
  if (files.length === 0) return null;

  const newest = files
    .map((file) => {
      const path = join(logsDir, file);
      const stat = existsSync(path) ? statSyncSafe(path) : null;
      return { file, path, mtime: stat?.mtimeMs ?? 0 };
    })
    .sort((a, b) => b.mtime - a.mtime)[0];

  return newest?.path ?? null;
}

function statSyncSafe(path: string): { mtimeMs: number } | null {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

function readLastLines(path: string, lineCount: number): { text: string; bytes: number } {
  const content = readFileSync(path, 'utf-8');
  const lines = content.split(/\r?\n/);
  const slice = lines.slice(Math.max(0, lines.length - lineCount));
  return { text: slice.join('\n'), bytes: Buffer.byteLength(content) };
}

export async function watchLog(cwd: string, options: WatchLogOptions): Promise<void> {
  const lines = options.lines ?? 50;
  const follow = options.follow ?? true;
  const logPath = resolveLogPath(cwd, options);

  if (!logPath) {
    error('No session log found.');
    return;
  }

  if (!existsSync(logPath)) {
    error(`Log file not found: ${logPath}`);
    return;
  }

  info(`Watching log: ${logPath}`);

  const initial = readLastLines(logPath, lines);
  if (initial.text.trim().length > 0) {
    console.log(initial.text);
  }

  if (!follow) return;

  let offset = initial.bytes;
  const watcher = watch(logPath, { persistent: true }, () => {
    try {
      const content = readFileSync(logPath, 'utf-8');
      const bytes = Buffer.byteLength(content);
      if (bytes <= offset) return;
      const chunk = content.slice(offset);
      offset = bytes;
      if (chunk.trim().length > 0) {
        process.stdout.write(chunk);
        if (!chunk.endsWith('\n')) {
          process.stdout.write('\n');
        }
      }
    } catch (err) {
      warn('Log watch error');
    }
  });

  process.on('SIGINT', () => {
    watcher.close();
    process.exit(0);
  });
}
