/**
 * Task runner tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TaskRunner } from '../infra/task/runner.js';
import { isTaskFile, parseTaskFiles } from '../infra/task/parser.js';

describe('isTaskFile', () => {
  it('should accept .yaml files', () => {
    expect(isTaskFile('task.yaml')).toBe(true);
  });

  it('should accept .yml files', () => {
    expect(isTaskFile('task.yml')).toBe(true);
  });

  it('should accept .md files', () => {
    expect(isTaskFile('task.md')).toBe(true);
  });

  it('should reject extensionless files like TASK-FORMAT', () => {
    expect(isTaskFile('TASK-FORMAT')).toBe(false);
  });

  it('should reject .txt files', () => {
    expect(isTaskFile('readme.txt')).toBe(false);
  });
});

describe('parseTaskFiles', () => {
  const testDir = `/tmp/takt-parse-test-${Date.now()}`;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should ignore extensionless files like TASK-FORMAT', () => {
    writeFileSync(join(testDir, 'TASK-FORMAT'), 'Format documentation');
    writeFileSync(join(testDir, 'real-task.md'), 'Real task');

    const tasks = parseTaskFiles(testDir);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.name).toBe('real-task');
  });
});

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
    it('should create tasks, completed, and failed directories', () => {
      runner.ensureDirs();
      expect(existsSync(join(testDir, '.takt', 'tasks'))).toBe(true);
      expect(existsSync(join(testDir, '.takt', 'completed'))).toBe(true);
      expect(existsSync(join(testDir, '.takt', 'failed'))).toBe(true);
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

    it('should throw error when called with a failed result', () => {
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

      expect(() => runner.completeTask(result)).toThrow(
        'Cannot complete a failed task. Use failTask() instead.'
      );
    });
  });

  describe('failTask', () => {
    it('should move task to failed directory', () => {
      const tasksDir = join(testDir, '.takt', 'tasks');
      mkdirSync(tasksDir, { recursive: true });
      const taskFile = join(tasksDir, 'fail-task.md');
      writeFileSync(taskFile, 'Task that will fail');

      const task = runner.getTask('fail-task')!;
      const result = {
        task,
        success: false,
        response: 'Error occurred',
        executionLog: ['Started', 'Error'],
        startedAt: '2024-01-01T00:00:00.000Z',
        completedAt: '2024-01-01T00:01:00.000Z',
      };

      const reportFile = runner.failTask(result);

      // Original task file should be removed from tasks dir
      expect(existsSync(taskFile)).toBe(false);

      // Report should be in .takt/failed/ (not .takt/completed/)
      expect(reportFile).toContain(join('.takt', 'failed'));
      expect(reportFile).not.toContain(join('.takt', 'completed'));
      expect(existsSync(reportFile)).toBe(true);

      const reportContent = readFileSync(reportFile, 'utf-8');
      expect(reportContent).toContain('# タスク実行レポート');
      expect(reportContent).toContain('fail-task');
      expect(reportContent).toContain('失敗');

      // Log file should be created in failed dir
      const logFile = reportFile.replace('report.md', 'log.json');
      expect(existsSync(logFile)).toBe(true);
      const logData = JSON.parse(readFileSync(logFile, 'utf-8'));
      expect(logData.taskName).toBe('fail-task');
      expect(logData.success).toBe(false);
    });

    it('should not move failed task to completed directory', () => {
      const tasksDir = join(testDir, '.takt', 'tasks');
      const completedDir = join(testDir, '.takt', 'completed');
      mkdirSync(tasksDir, { recursive: true });
      const taskFile = join(tasksDir, 'another-fail.md');
      writeFileSync(taskFile, 'Another failing task');

      const task = runner.getTask('another-fail')!;
      const result = {
        task,
        success: false,
        response: 'Something went wrong',
        executionLog: [],
        startedAt: '2024-01-01T00:00:00.000Z',
        completedAt: '2024-01-01T00:01:00.000Z',
      };

      runner.failTask(result);

      // completed directory should be empty (only the dir itself exists)
      mkdirSync(completedDir, { recursive: true });
      const completedContents = readdirSync(completedDir);
      expect(completedContents).toHaveLength(0);
    });
  });

  describe('getTasksDir', () => {
    it('should return tasks directory path', () => {
      expect(runner.getTasksDir()).toBe(join(testDir, '.takt', 'tasks'));
    });
  });
});
