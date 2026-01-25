/**
 * Task runner tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TaskRunner } from '../task/runner.js';

describe('TaskRunner', () => {
  const testDir = `/tmp/takt-task-test-${Date.now()}`;
  let runner: TaskRunner;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    runner = new TaskRunner(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('ensureDirs', () => {
    it('should create tasks and completed directories', () => {
      runner.ensureDirs();
      expect(existsSync(join(testDir, '.takt', 'tasks'))).toBe(true);
      expect(existsSync(join(testDir, '.takt', 'completed'))).toBe(true);
    });
  });

  describe('listTasks', () => {
    it('should return empty array when no tasks', () => {
      const tasks = runner.listTasks();
      expect(tasks).toEqual([]);
    });

    it('should list tasks sorted by name', () => {
      const tasksDir = join(testDir, '.takt', 'tasks');
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(join(tasksDir, '02-second.md'), 'Second task');
      writeFileSync(join(tasksDir, '01-first.md'), 'First task');
      writeFileSync(join(tasksDir, '03-third.md'), 'Third task');

      const tasks = runner.listTasks();
      expect(tasks).toHaveLength(3);
      expect(tasks[0]?.name).toBe('01-first');
      expect(tasks[1]?.name).toBe('02-second');
      expect(tasks[2]?.name).toBe('03-third');
    });

    it('should only list .md files', () => {
      const tasksDir = join(testDir, '.takt', 'tasks');
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(join(tasksDir, 'task.md'), 'Task content');
      writeFileSync(join(tasksDir, 'readme.txt'), 'Not a task');

      const tasks = runner.listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.name).toBe('task');
    });
  });

  describe('getTask', () => {
    it('should return null for non-existent task', () => {
      const task = runner.getTask('non-existent');
      expect(task).toBeNull();
    });

    it('should return task info for existing task', () => {
      const tasksDir = join(testDir, '.takt', 'tasks');
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(join(tasksDir, 'my-task.md'), 'Task content');

      const task = runner.getTask('my-task');
      expect(task).not.toBeNull();
      expect(task?.name).toBe('my-task');
      expect(task?.content).toBe('Task content');
    });
  });

  describe('getNextTask', () => {
    it('should return null when no tasks', () => {
      const task = runner.getNextTask();
      expect(task).toBeNull();
    });

    it('should return first task (alphabetically)', () => {
      const tasksDir = join(testDir, '.takt', 'tasks');
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(join(tasksDir, 'b-task.md'), 'B');
      writeFileSync(join(tasksDir, 'a-task.md'), 'A');

      const task = runner.getNextTask();
      expect(task?.name).toBe('a-task');
    });
  });

  describe('completeTask', () => {
    it('should move task to completed directory', () => {
      const tasksDir = join(testDir, '.takt', 'tasks');
      mkdirSync(tasksDir, { recursive: true });
      const taskFile = join(tasksDir, 'test-task.md');
      writeFileSync(taskFile, 'Test task content');

      const task = runner.getTask('test-task')!;
      const result = {
        task,
        success: true,
        response: 'Task completed successfully',
        executionLog: ['Started', 'Done'],
        startedAt: '2024-01-01T00:00:00.000Z',
        completedAt: '2024-01-01T00:01:00.000Z',
      };

      const reportFile = runner.completeTask(result);

      // Original task file should be moved
      expect(existsSync(taskFile)).toBe(false);

      // Report should be created
      expect(existsSync(reportFile)).toBe(true);
      const reportContent = readFileSync(reportFile, 'utf-8');
      expect(reportContent).toContain('# タスク実行レポート');
      expect(reportContent).toContain('test-task');
      expect(reportContent).toContain('成功');

      // Log file should be created
      const logFile = reportFile.replace('report.md', 'log.json');
      expect(existsSync(logFile)).toBe(true);
      const logData = JSON.parse(readFileSync(logFile, 'utf-8'));
      expect(logData.taskName).toBe('test-task');
      expect(logData.success).toBe(true);
    });

    it('should record failure status', () => {
      const tasksDir = join(testDir, '.takt', 'tasks');
      mkdirSync(tasksDir, { recursive: true });
      writeFileSync(join(tasksDir, 'fail-task.md'), 'Will fail');

      const task = runner.getTask('fail-task')!;
      const result = {
        task,
        success: false,
        response: 'Error occurred',
        executionLog: ['Error'],
        startedAt: '2024-01-01T00:00:00.000Z',
        completedAt: '2024-01-01T00:01:00.000Z',
      };

      const reportFile = runner.completeTask(result);
      const reportContent = readFileSync(reportFile, 'utf-8');
      expect(reportContent).toContain('失敗');
    });
  });

  describe('getTasksDir', () => {
    it('should return tasks directory path', () => {
      expect(runner.getTasksDir()).toBe(join(testDir, '.takt', 'tasks'));
    });
  });
});
