/**
 * Workflow resolution — 3-layer lookup logic.
 *
 * Resolves workflow names and paths to concrete WorkflowConfig objects,
 * using the priority chain: project-local → user → builtin.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import type { WorkflowConfig } from '../../models/types.js';
import { getGlobalWorkflowsDir, getBuiltinWorkflowsDir, getProjectConfigDir } from '../paths.js';
import { getLanguage, getDisabledBuiltins } from '../global/globalConfig.js';
import { createLogger } from '../../utils/debug.js';
import { getErrorMessage } from '../../utils/error.js';
import { loadWorkflowFromFile } from './workflowParser.js';

const log = createLogger('workflow-resolver');

/** Get builtin workflow by name */
export function getBuiltinWorkflow(name: string): WorkflowConfig | null {
  const lang = getLanguage();
  const disabled = getDisabledBuiltins();
  if (disabled.includes(name)) return null;

  const builtinDir = getBuiltinWorkflowsDir(lang);
  const yamlPath = join(builtinDir, `${name}.yaml`);
  if (existsSync(yamlPath)) {
    return loadWorkflowFromFile(yamlPath);
  }
  return null;
}

/**
 * Resolve a path that may be relative, absolute, or home-directory-relative.
 */
function resolvePath(pathInput: string, basePath: string): string {
  if (pathInput.startsWith('~')) {
    const home = homedir();
    return resolve(home, pathInput.slice(1).replace(/^\//, ''));
  }
  if (isAbsolute(pathInput)) {
    return pathInput;
  }
  return resolve(basePath, pathInput);
}

/**
 * Load workflow from a file path.
 */
function loadWorkflowFromPath(
  filePath: string,
  basePath: string,
): WorkflowConfig | null {
  const resolvedPath = resolvePath(filePath, basePath);
  if (!existsSync(resolvedPath)) {
    return null;
  }
  return loadWorkflowFromFile(resolvedPath);
}

/**
 * Load workflow by name (name-based loading only, no path detection).
 *
 * Priority:
 * 1. Project-local workflows → .takt/workflows/{name}.yaml
 * 2. User workflows → ~/.takt/workflows/{name}.yaml
 * 3. Builtin workflows → resources/global/{lang}/workflows/{name}.yaml
 */
export function loadWorkflow(
  name: string,
  projectCwd: string,
): WorkflowConfig | null {
  const projectWorkflowsDir = join(getProjectConfigDir(projectCwd), 'workflows');
  const projectWorkflowPath = join(projectWorkflowsDir, `${name}.yaml`);
  if (existsSync(projectWorkflowPath)) {
    return loadWorkflowFromFile(projectWorkflowPath);
  }

  const globalWorkflowsDir = getGlobalWorkflowsDir();
  const workflowYamlPath = join(globalWorkflowsDir, `${name}.yaml`);
  if (existsSync(workflowYamlPath)) {
    return loadWorkflowFromFile(workflowYamlPath);
  }

  return getBuiltinWorkflow(name);
}

/**
 * Check if a workflow identifier looks like a file path (vs a workflow name).
 */
export function isWorkflowPath(identifier: string): boolean {
  return (
    identifier.startsWith('/') ||
    identifier.startsWith('~') ||
    identifier.startsWith('./') ||
    identifier.startsWith('../') ||
    identifier.endsWith('.yaml') ||
    identifier.endsWith('.yml')
  );
}

/**
 * Load workflow by identifier (auto-detects name vs path).
 */
export function loadWorkflowByIdentifier(
  identifier: string,
  projectCwd: string,
): WorkflowConfig | null {
  if (isWorkflowPath(identifier)) {
    return loadWorkflowFromPath(identifier, projectCwd);
  }
  return loadWorkflow(identifier, projectCwd);
}

/** Entry for a workflow file found in a directory */
interface WorkflowDirEntry {
  name: string;
  path: string;
}

/**
 * Iterate workflow YAML files in a directory, yielding name and path.
 * Shared by both loadAllWorkflows and listWorkflows to avoid DRY violation.
 */
function* iterateWorkflowDir(
  dir: string,
  disabled?: string[],
): Generator<WorkflowDirEntry> {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.yaml') && !entry.endsWith('.yml')) continue;
    const entryPath = join(dir, entry);
    if (!statSync(entryPath).isFile()) continue;
    const workflowName = entry.replace(/\.ya?ml$/, '');
    if (disabled?.includes(workflowName)) continue;
    yield { name: workflowName, path: entryPath };
  }
}

/** Get the 3-layer directory list (builtin → user → project-local) */
function getWorkflowDirs(cwd: string): { dir: string; disabled?: string[] }[] {
  const disabled = getDisabledBuiltins();
  const lang = getLanguage();
  return [
    { dir: getBuiltinWorkflowsDir(lang), disabled },
    { dir: getGlobalWorkflowsDir() },
    { dir: join(getProjectConfigDir(cwd), 'workflows') },
  ];
}

/**
 * Load all workflows with descriptions (for switch command).
 *
 * Priority (later entries override earlier):
 *   1. Builtin workflows
 *   2. User workflows (~/.takt/workflows/)
 *   3. Project-local workflows (.takt/workflows/)
 */
export function loadAllWorkflows(cwd: string): Map<string, WorkflowConfig> {
  const workflows = new Map<string, WorkflowConfig>();

  for (const { dir, disabled } of getWorkflowDirs(cwd)) {
    for (const entry of iterateWorkflowDir(dir, disabled)) {
      try {
        workflows.set(entry.name, loadWorkflowFromFile(entry.path));
      } catch (err) {
        log.debug('Skipping invalid workflow file', { path: entry.path, error: getErrorMessage(err) });
      }
    }
  }

  return workflows;
}

/**
 * List available workflow names (builtin + user + project-local, excluding disabled).
 */
export function listWorkflows(cwd: string): string[] {
  const workflows = new Set<string>();

  for (const { dir, disabled } of getWorkflowDirs(cwd)) {
    for (const entry of iterateWorkflowDir(dir, disabled)) {
      workflows.add(entry.name);
    }
  }

  return Array.from(workflows).sort();
}
