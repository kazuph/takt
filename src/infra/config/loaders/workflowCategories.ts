/**
 * Workflow category configuration loader and helpers.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod/v4';
import type { WorkflowConfig } from '../../../core/models/index.js';
import { getGlobalConfigPath, getProjectConfigPath } from '../paths.js';
import { getLanguage } from '../global/globalConfig.js';
import { getLanguageResourcesDir } from '../../resources/index.js';

const CategoryConfigSchema = z.object({
  workflow_categories: z.record(z.string(), z.array(z.string())).optional(),
  show_others_category: z.boolean().optional(),
  others_category_name: z.string().min(1).optional(),
}).passthrough();

export interface CategoryConfig {
  workflowCategories: Record<string, string[]>;
  showOthersCategory: boolean;
  othersCategoryName: string;
}

export interface CategorizedWorkflows {
  categories: Map<string, string[]>;
  allWorkflows: Map<string, WorkflowConfig>;
  missingWorkflows: MissingWorkflow[];
}

export interface MissingWorkflow {
  categoryName: string;
  workflowName: string;
}

interface RawCategoryConfig {
  workflow_categories?: Record<string, string[]>;
  show_others_category?: boolean;
  others_category_name?: string;
}

function parseCategoryConfig(raw: unknown, sourceLabel: string): CategoryConfig | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const hasWorkflowCategories = Object.prototype.hasOwnProperty.call(raw, 'workflow_categories');
  if (!hasWorkflowCategories) {
    return null;
  }

  const parsed = CategoryConfigSchema.parse(raw) as RawCategoryConfig;
  if (!parsed.workflow_categories) {
    throw new Error(`workflow_categories is required in ${sourceLabel}`);
  }

  const showOthersCategory = parsed.show_others_category === undefined
    ? true
    : parsed.show_others_category;

  const othersCategoryName = parsed.others_category_name === undefined
    ? 'Others'
    : parsed.others_category_name;

  return {
    workflowCategories: parsed.workflow_categories,
    showOthersCategory,
    othersCategoryName,
  };
}

function loadCategoryConfigFromPath(path: string, sourceLabel: string): CategoryConfig | null {
  if (!existsSync(path)) {
    return null;
  }
  const content = readFileSync(path, 'utf-8');
  const raw = parseYaml(content);
  return parseCategoryConfig(raw, sourceLabel);
}

/**
 * Load default categories from builtin resource file.
 * Returns null if file doesn't exist or has no workflow_categories.
 */
export function loadDefaultCategories(): CategoryConfig | null {
  const lang = getLanguage();
  const filePath = join(getLanguageResourcesDir(lang), 'default-categories.yaml');
  return loadCategoryConfigFromPath(filePath, filePath);
}

/**
 * Get effective workflow categories configuration.
 * Priority: user config -> project config -> default categories.
 */
export function getWorkflowCategories(cwd: string): CategoryConfig | null {
  const userConfig = loadCategoryConfigFromPath(getGlobalConfigPath(), 'global config');
  if (userConfig) {
    return userConfig;
  }

  const projectConfig = loadCategoryConfigFromPath(getProjectConfigPath(cwd), 'project config');
  if (projectConfig) {
    return projectConfig;
  }

  return loadDefaultCategories();
}

/**
 * Build categorized workflows map from configuration.
 */
export function buildCategorizedWorkflows(
  allWorkflows: Map<string, WorkflowConfig>,
  config: CategoryConfig,
): CategorizedWorkflows {
  const categories = new Map<string, string[]>();
  const categorized = new Set<string>();
  const missingWorkflows: MissingWorkflow[] = [];

  for (const [categoryName, workflowNames] of Object.entries(config.workflowCategories)) {
    const validWorkflows: string[] = [];

    for (const workflowName of workflowNames) {
      if (allWorkflows.has(workflowName)) {
        validWorkflows.push(workflowName);
        categorized.add(workflowName);
      } else {
        missingWorkflows.push({ categoryName, workflowName });
      }
    }

    if (validWorkflows.length > 0) {
      categories.set(categoryName, validWorkflows);
    }
  }

  if (config.showOthersCategory) {
    const uncategorized: string[] = [];
    for (const workflowName of allWorkflows.keys()) {
      if (!categorized.has(workflowName)) {
        uncategorized.push(workflowName);
      }
    }

    if (uncategorized.length > 0 && !categories.has(config.othersCategoryName)) {
      categories.set(config.othersCategoryName, uncategorized);
    }
  }

  return { categories, allWorkflows, missingWorkflows };
}

/**
 * Find which categories contain a given workflow (for duplicate indication).
 */
export function findWorkflowCategories(
  workflow: string,
  categorized: CategorizedWorkflows,
): string[] {
  const result: string[] = [];
  for (const [categoryName, workflows] of categorized.categories) {
    if (workflows.includes(workflow)) {
      result.push(categoryName);
    }
  }
  return result;
}
