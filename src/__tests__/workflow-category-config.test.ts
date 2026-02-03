/**
 * Tests for workflow category configuration loading and building
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { WorkflowConfig } from '../core/models/index.js';

const pathsState = vi.hoisted(() => ({
  globalConfigPath: '',
  projectConfigPath: '',
  resourcesDir: '',
}));

vi.mock('../infra/config/paths.js', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    getGlobalConfigPath: () => pathsState.globalConfigPath,
    getProjectConfigPath: () => pathsState.projectConfigPath,
  };
});

vi.mock('../infra/resources/index.js', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    getLanguageResourcesDir: () => pathsState.resourcesDir,
  };
});

vi.mock('../infra/config/global/globalConfig.js', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    getLanguage: () => 'en',
  };
});

const {
  getWorkflowCategories,
  loadDefaultCategories,
  buildCategorizedWorkflows,
  findWorkflowCategories,
} = await import('../infra/config/loaders/workflowCategories.js');

function writeYaml(path: string, content: string): void {
  writeFileSync(path, content.trim() + '\n', 'utf-8');
}

function createWorkflowMap(names: string[]): Map<string, WorkflowConfig> {
  const workflows = new Map<string, WorkflowConfig>();
  for (const name of names) {
    workflows.set(name, {
      name,
      steps: [],
      initialStep: 'start',
      maxIterations: 1,
    });
  }
  return workflows;
}

describe('workflow category config loading', () => {
  let testDir: string;
  let resourcesDir: string;
  let globalConfigPath: string;
  let projectConfigPath: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `takt-cat-config-${randomUUID()}`);
    resourcesDir = join(testDir, 'resources');
    globalConfigPath = join(testDir, 'global-config.yaml');
    projectConfigPath = join(testDir, 'project-config.yaml');

    mkdirSync(resourcesDir, { recursive: true });
    pathsState.globalConfigPath = globalConfigPath;
    pathsState.projectConfigPath = projectConfigPath;
    pathsState.resourcesDir = resourcesDir;

  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should load default categories when no configs define workflow_categories', () => {
    writeYaml(join(resourcesDir, 'default-categories.yaml'), `
workflow_categories:
  Default:
    - simple
show_others_category: true
others_category_name: "Others"
`);

    const config = getWorkflowCategories(testDir);
    expect(config).not.toBeNull();
    expect(config!.workflowCategories).toEqual({ Default: ['simple'] });
  });

  it('should prefer project config over default when workflow_categories is defined', () => {
    writeYaml(join(resourcesDir, 'default-categories.yaml'), `
workflow_categories:
  Default:
    - simple
`);

    writeYaml(projectConfigPath, `
workflow_categories:
  Project:
    - custom
show_others_category: false
`);

    const config = getWorkflowCategories(testDir);
    expect(config).not.toBeNull();
    expect(config!.workflowCategories).toEqual({ Project: ['custom'] });
    expect(config!.showOthersCategory).toBe(false);
  });

  it('should prefer user config over project config when workflow_categories is defined', () => {
    writeYaml(join(resourcesDir, 'default-categories.yaml'), `
workflow_categories:
  Default:
    - simple
`);

    writeYaml(projectConfigPath, `
workflow_categories:
  Project:
    - custom
`);

    writeYaml(globalConfigPath, `
workflow_categories:
  User:
    - preferred
`);

    const config = getWorkflowCategories(testDir);
    expect(config).not.toBeNull();
    expect(config!.workflowCategories).toEqual({ User: ['preferred'] });
  });

  it('should ignore configs without workflow_categories and fall back to default', () => {
    writeYaml(join(resourcesDir, 'default-categories.yaml'), `
workflow_categories:
  Default:
    - simple
`);

    writeYaml(globalConfigPath, `
show_others_category: false
`);

    const config = getWorkflowCategories(testDir);
    expect(config).not.toBeNull();
    expect(config!.workflowCategories).toEqual({ Default: ['simple'] });
  });

  it('should return null when default categories file is missing', () => {
    const config = loadDefaultCategories();
    expect(config).toBeNull();
  });
});

describe('buildCategorizedWorkflows', () => {
  beforeEach(() => {
  });

  it('should warn for missing workflows and generate Others', () => {
    const allWorkflows = createWorkflowMap(['a', 'b', 'c']);
    const config = {
      workflowCategories: { Cat: ['a', 'missing'] },
      showOthersCategory: true,
      othersCategoryName: 'Others',
    };

    const categorized = buildCategorizedWorkflows(allWorkflows, config);
    expect(categorized.categories.get('Cat')).toEqual(['a']);
    expect(categorized.categories.get('Others')).toEqual(['b', 'c']);
    expect(categorized.missingWorkflows).toEqual([
      { categoryName: 'Cat', workflowName: 'missing' },
    ]);
  });

  it('should skip empty categories', () => {
    const allWorkflows = createWorkflowMap(['a']);
    const config = {
      workflowCategories: { Empty: [] },
      showOthersCategory: false,
      othersCategoryName: 'Others',
    };

    const categorized = buildCategorizedWorkflows(allWorkflows, config);
    expect(categorized.categories.size).toBe(0);
  });

  it('should find categories containing a workflow', () => {
    const allWorkflows = createWorkflowMap(['shared']);
    const config = {
      workflowCategories: { A: ['shared'], B: ['shared'] },
      showOthersCategory: false,
      othersCategoryName: 'Others',
    };

    const categorized = buildCategorizedWorkflows(allWorkflows, config);
    const categories = findWorkflowCategories('shared', categorized).sort();
    expect(categories).toEqual(['A', 'B']);
  });
});
