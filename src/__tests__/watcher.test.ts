/**
 * TaskWatcher tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { TaskWatcher } from '../task/watcher.js';
import type { TaskInfo } from '../task/types.js';

describe('TaskWatcher', () => {
  const testDir = `/tmp/takt-watcher-test-${Date.now()}`;

  beforeEach(() => {
    mkdirSync(join(testDir, '.takt', 'tasks'), { recursive: true });
    mkdirSync(join(testDir, '.takt', 'completed'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should create watcher with default options', () => {
      const watcher = new TaskWatcher(testDir);
      expect(watcher.isRunning()).toBe(false);
    });

    it('should accept custom poll interval', () => {
      const watcher = new TaskWatcher(testDir, { pollInterval: 500 });
      expect(watcher.isRunning()).toBe(false);
    });
  });

  describe('watch', () => {
    it('should detect and process a task file', async () => {
      const watcher = new TaskWatcher(testDir, { pollInterval: 50 });
      const processed: string[] = [];

      // Pre-create a task file
      writeFileSync(
        join(testDir, '.takt', 'tasks', 'test-task.md'),
        'Test task content'
      );

      // Start watching, stop after first task
      const watchPromise = watcher.watch(async (task: TaskInfo) => {
        processed.push(task.name);
        // Stop after processing to avoid infinite loop in test
        watcher.stop();
      });

      await watchPromise;

      expect(processed).toEqual(['test-task']);
      expect(watcher.isRunning()).toBe(false);
    });

    it('should wait when no tasks are available', async () => {
      const watcher = new TaskWatcher(testDir, { pollInterval: 50 });
      let pollCount = 0;

      // Start watching, add a task after a delay
      const watchPromise = watcher.watch(async (task: TaskInfo) => {
        pollCount++;
        watcher.stop();
      });

      // Add task after short delay (after at least one empty poll)
      await new Promise((resolve) => setTimeout(resolve, 100));
      writeFileSync(
        join(testDir, '.takt', 'tasks', 'delayed-task.md'),
        'Delayed task'
      );

      await watchPromise;

      expect(pollCount).toBe(1);
    });

    it('should process multiple tasks sequentially', async () => {
      const watcher = new TaskWatcher(testDir, { pollInterval: 50 });
      const processed: string[] = [];

      // Pre-create two task files
      writeFileSync(
        join(testDir, '.takt', 'tasks', 'a-task.md'),
        'First task'
      );
      writeFileSync(
        join(testDir, '.takt', 'tasks', 'b-task.md'),
        'Second task'
      );

      const watchPromise = watcher.watch(async (task: TaskInfo) => {
        processed.push(task.name);
        // Remove the task file to simulate completion
        rmSync(task.filePath);
        if (processed.length >= 2) {
          watcher.stop();
        }
      });

      await watchPromise;

      expect(processed).toEqual(['a-task', 'b-task']);
    });
  });

  describe('stop', () => {
    it('should stop the watcher gracefully', async () => {
      const watcher = new TaskWatcher(testDir, { pollInterval: 50 });

      // Start watching, stop after a short delay
      const watchPromise = watcher.watch(async () => {
        // Should not be called since no tasks
      });

      // Stop after short delay
      setTimeout(() => watcher.stop(), 100);

      await watchPromise;

      expect(watcher.isRunning()).toBe(false);
    });

    it('should abort sleep immediately when stopped', async () => {
      const watcher = new TaskWatcher(testDir, { pollInterval: 10000 });

      const start = Date.now();
      const watchPromise = watcher.watch(async () => {});

      // Stop after 50ms, should not wait the full 10s
      setTimeout(() => watcher.stop(), 50);

      await watchPromise;

      const elapsed = Date.now() - start;
      // Should complete well under the 10s poll interval
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
