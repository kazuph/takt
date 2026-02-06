/**
 * Project-level configuration management
 *
 * Manages .takt/config.yaml for project-specific settings.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { copyProjectResourcesToDir } from '../../resources/index.js';
import type { PermissionMode, ProjectLocalConfig } from '../types.js';

export type { PermissionMode, ProjectLocalConfig };

/** Default project configuration */
const DEFAULT_PROJECT_CONFIG: ProjectLocalConfig = {
  piece: 'default',
  permissionMode: 'default',
};

/**
 * Get project takt config directory (.takt in project)
 * Note: Defined locally to avoid circular dependency with paths.ts
 */
function getConfigDir(projectDir: string): string {
  return join(resolve(projectDir), '.takt');
}

/**
 * Get project config file path
 * Note: Defined locally to avoid circular dependency with paths.ts
 */
function getConfigPath(projectDir: string): string {
  return join(getConfigDir(projectDir), 'config.yaml');
}

/**
 * Load project configuration from .takt/config.yaml
 */
export function loadProjectConfig(projectDir: string): ProjectLocalConfig {
  const configPath = getConfigPath(projectDir);

  if (!existsSync(configPath)) {
    return { ...DEFAULT_PROJECT_CONFIG };
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = parse(content) as ProjectLocalConfig | null;
    return { ...DEFAULT_PROJECT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_PROJECT_CONFIG };
  }
}

/**
 * Save project configuration to .takt/config.yaml
 */
export function saveProjectConfig(projectDir: string, config: ProjectLocalConfig): void {
  const configDir = getConfigDir(projectDir);
  const configPath = getConfigPath(projectDir);

  // Ensure directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Copy project resources (only copies files that don't exist)
  copyProjectResourcesToDir(configDir);

  const content = stringify(config, { indent: 2 });
  writeFileSync(configPath, content, 'utf-8');
}

/**
 * Update a single field in project configuration
 */
export function updateProjectConfig<K extends keyof ProjectLocalConfig>(
  projectDir: string,
  key: K,
  value: ProjectLocalConfig[K]
): void {
  const config = loadProjectConfig(projectDir);
  config[key] = value;
  saveProjectConfig(projectDir, config);
}

/**
 * Get current piece from project config
 */
export function getCurrentPiece(projectDir: string): string {
  const config = loadProjectConfig(projectDir);
  return config.piece || 'default';
}

/**
 * Set current piece in project config
 */
export function setCurrentPiece(projectDir: string, piece: string): void {
  updateProjectConfig(projectDir, 'piece', piece);
}

/**
 * Get verbose mode from project config
 */
export function isVerboseMode(projectDir: string): boolean {
  const config = loadProjectConfig(projectDir);
  return config.verbose === true;
}
