/**
 * Tests for instruction-builder module
 */

import { describe, it, expect } from 'vitest';
import {
  buildInstruction,
  buildExecutionMetadata,
  renderExecutionMetadata,
  type InstructionContext,
} from '../workflow/instruction-builder.js';
import type { WorkflowStep } from '../models/types.js';

function createMinimalStep(template: string): WorkflowStep {
  return {
    name: 'test-step',
    agent: 'test-agent',
    agentDisplayName: 'Test Agent',
    instructionTemplate: template,
    transitions: [],
    passPreviousResponse: false,
  };
}

function createMinimalContext(overrides: Partial<InstructionContext> = {}): InstructionContext {
  return {
    task: 'Test task',
    iteration: 1,
    maxIterations: 10,
    stepIteration: 1,
    cwd: '/project',
    userInputs: [],
    ...overrides,
  };
}

describe('instruction-builder', () => {
  describe('execution context metadata', () => {
    it('should always include Working Directory', () => {
      const step = createMinimalStep('Do some work');
      const context = createMinimalContext({ cwd: '/project' });

      const result = buildInstruction(step, context);

      expect(result).toContain('## Execution Context');
      expect(result).toContain('Working Directory: /project');
      expect(result).toContain('Do some work');
    });

    it('should include Project Root and Mode when cwd !== projectCwd', () => {
      const step = createMinimalStep('Do some work');
      const context = createMinimalContext({
        cwd: '/worktree-path',
        projectCwd: '/project-path',
      });

      const result = buildInstruction(step, context);

      expect(result).toContain('## Execution Context');
      expect(result).toContain('Working Directory: /worktree-path');
      expect(result).toContain('Project Root: /project-path');
      expect(result).toContain('Mode: worktree');
      expect(result).toContain('Do some work');
    });

    it('should NOT include Project Root or Mode when cwd === projectCwd', () => {
      const step = createMinimalStep('Do some work');
      const context = createMinimalContext({
        cwd: '/project',
        projectCwd: '/project',
      });

      const result = buildInstruction(step, context);

      expect(result).toContain('Working Directory: /project');
      expect(result).not.toContain('Project Root');
      expect(result).not.toContain('Mode:');
    });

    it('should NOT include Project Root or Mode when projectCwd is not set', () => {
      const step = createMinimalStep('Do some work');
      const context = createMinimalContext({ cwd: '/project' });

      const result = buildInstruction(step, context);

      expect(result).toContain('Working Directory: /project');
      expect(result).not.toContain('Project Root');
      expect(result).not.toContain('Mode:');
    });

    it('should prepend metadata before the instruction body', () => {
      const step = createMinimalStep('Do some work');
      const context = createMinimalContext({ cwd: '/project' });

      const result = buildInstruction(step, context);
      const metadataIndex = result.indexOf('## Execution Context');
      const bodyIndex = result.indexOf('Do some work');

      expect(metadataIndex).toBeLessThan(bodyIndex);
    });
  });

  describe('report_dir replacement', () => {
    it('should replace .takt/reports/{report_dir} with full absolute path', () => {
      const step = createMinimalStep(
        '- Report Directory: .takt/reports/{report_dir}/'
      );
      const context = createMinimalContext({
        cwd: '/project',
        reportDir: '20260128-test-report',
      });

      const result = buildInstruction(step, context);

      expect(result).toContain(
        '- Report Directory: /project/.takt/reports/20260128-test-report/'
      );
    });

    it('should use projectCwd for report path when cwd is a worktree', () => {
      const step = createMinimalStep(
        '- Report: .takt/reports/{report_dir}/00-plan.md'
      );
      const context = createMinimalContext({
        cwd: '/project/.takt/worktrees/my-task',
        projectCwd: '/project',
        reportDir: '20260128-worktree-report',
      });

      const result = buildInstruction(step, context);

      expect(result).toContain(
        '- Report: /project/.takt/reports/20260128-worktree-report/00-plan.md'
      );
      expect(result).toContain('Working Directory: /project/.takt/worktrees/my-task');
      expect(result).toContain('Project Root: /project');
    });

    it('should replace multiple .takt/reports/{report_dir} occurrences', () => {
      const step = createMinimalStep(
        '- Scope: .takt/reports/{report_dir}/01-scope.md\n- Decisions: .takt/reports/{report_dir}/02-decisions.md'
      );
      const context = createMinimalContext({
        projectCwd: '/project',
        cwd: '/worktree',
        reportDir: '20260128-multi',
      });

      const result = buildInstruction(step, context);

      expect(result).toContain('/project/.takt/reports/20260128-multi/01-scope.md');
      expect(result).toContain('/project/.takt/reports/20260128-multi/02-decisions.md');
    });

    it('should replace standalone {report_dir} with directory name only', () => {
      const step = createMinimalStep(
        'Report dir name: {report_dir}'
      );
      const context = createMinimalContext({
        reportDir: '20260128-standalone',
      });

      const result = buildInstruction(step, context);

      expect(result).toContain('Report dir name: 20260128-standalone');
    });

    it('should fall back to cwd when projectCwd is not provided', () => {
      const step = createMinimalStep(
        '- Dir: .takt/reports/{report_dir}/'
      );
      const context = createMinimalContext({
        cwd: '/fallback-project',
        reportDir: '20260128-fallback',
      });

      const result = buildInstruction(step, context);

      expect(result).toContain(
        '- Dir: /fallback-project/.takt/reports/20260128-fallback/'
      );
    });
  });

  describe('buildExecutionMetadata', () => {
    it('should set workingDirectory and omit projectRoot in normal mode', () => {
      const context = createMinimalContext({ cwd: '/project' });
      const metadata = buildExecutionMetadata(context);

      expect(metadata.workingDirectory).toBe('/project');
      expect(metadata.projectRoot).toBeUndefined();
    });

    it('should set projectRoot in worktree mode', () => {
      const context = createMinimalContext({
        cwd: '/worktree-path',
        projectCwd: '/project-path',
      });
      const metadata = buildExecutionMetadata(context);

      expect(metadata.workingDirectory).toBe('/worktree-path');
      expect(metadata.projectRoot).toBe('/project-path');
    });

    it('should omit projectRoot when projectCwd is not set', () => {
      const context = createMinimalContext({ cwd: '/project' });
      // projectCwd is undefined by default
      const metadata = buildExecutionMetadata(context);

      expect(metadata.workingDirectory).toBe('/project');
      expect(metadata.projectRoot).toBeUndefined();
    });

    it('should omit projectRoot when cwd equals projectCwd', () => {
      const context = createMinimalContext({
        cwd: '/same-path',
        projectCwd: '/same-path',
      });
      const metadata = buildExecutionMetadata(context);

      expect(metadata.workingDirectory).toBe('/same-path');
      expect(metadata.projectRoot).toBeUndefined();
    });

    it('should default language to en when not specified', () => {
      const context = createMinimalContext({ cwd: '/project' });
      const metadata = buildExecutionMetadata(context);

      expect(metadata.language).toBe('en');
    });

    it('should propagate language from context', () => {
      const context = createMinimalContext({ cwd: '/project', language: 'ja' });
      const metadata = buildExecutionMetadata(context);

      expect(metadata.language).toBe('ja');
    });
  });

  describe('renderExecutionMetadata', () => {
    it('should render normal mode without Project Root or Mode', () => {
      const rendered = renderExecutionMetadata({ workingDirectory: '/project', language: 'en' });

      expect(rendered).toContain('## Execution Context');
      expect(rendered).toContain('- Working Directory: /project');
      expect(rendered).not.toContain('Project Root');
      expect(rendered).not.toContain('Mode:');
    });

    it('should render worktree mode with Project Root and Mode', () => {
      const rendered = renderExecutionMetadata({
        workingDirectory: '/worktree',
        projectRoot: '/project',
        language: 'en',
      });

      expect(rendered).toContain('## Execution Context');
      expect(rendered).toContain('- Working Directory: /worktree');
      expect(rendered).toContain('- Project Root: /project');
      expect(rendered).toContain('- Mode: worktree');
    });

    it('should end with a trailing empty line', () => {
      const rendered = renderExecutionMetadata({ workingDirectory: '/project', language: 'en' });

      expect(rendered).toMatch(/\n$/);
    });

    it('should render in Japanese when language is ja', () => {
      const rendered = renderExecutionMetadata({ workingDirectory: '/project', language: 'ja' });

      expect(rendered).toContain('## 実行コンテキスト');
      expect(rendered).toContain('- 作業ディレクトリ: /project');
      expect(rendered).not.toContain('Execution Context');
      expect(rendered).not.toContain('Working Directory');
    });

    it('should render worktree mode in Japanese', () => {
      const rendered = renderExecutionMetadata({
        workingDirectory: '/worktree',
        projectRoot: '/project',
        language: 'ja',
      });

      expect(rendered).toContain('- プロジェクトルート: /project');
      expect(rendered).toContain('モード: worktree');
    });

    it('should include English note only for en, not for ja', () => {
      const enRendered = renderExecutionMetadata({ workingDirectory: '/project', language: 'en' });
      const jaRendered = renderExecutionMetadata({ workingDirectory: '/project', language: 'ja' });

      expect(enRendered).toContain('Note:');
      expect(jaRendered).not.toContain('Note:');
    });
  });

  describe('basic placeholder replacement', () => {
    it('should replace {task} placeholder', () => {
      const step = createMinimalStep('Execute: {task}');
      const context = createMinimalContext({ task: 'Build the app' });

      const result = buildInstruction(step, context);

      expect(result).toContain('Build the app');
    });

    it('should replace {iteration} and {max_iterations}', () => {
      const step = createMinimalStep('Step {iteration}/{max_iterations}');
      const context = createMinimalContext({ iteration: 3, maxIterations: 20 });

      const result = buildInstruction(step, context);

      expect(result).toContain('Step 3/20');
    });

    it('should replace {step_iteration}', () => {
      const step = createMinimalStep('Run #{step_iteration}');
      const context = createMinimalContext({ stepIteration: 2 });

      const result = buildInstruction(step, context);

      expect(result).toContain('Run #2');
    });
  });
});
