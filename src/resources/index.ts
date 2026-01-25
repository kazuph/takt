/**
 * Embedded resources for takt
 *
 * Contains default workflow definitions and resource paths.
 * Resources are organized into:
 * - resources/global/ - Files to copy to ~/.takt
 * - resources/global/en/ - English resources
 * - resources/global/ja/ - Japanese resources
 */

import { readFileSync, readdirSync, existsSync, statSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Language } from '../models/types.js';

/**
 * Get the resources directory path
 * Supports both development (src/) and production (dist/) environments
 */
export function getResourcesDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // From src/resources or dist/resources, go up to project root then into resources/
  return join(currentDir, '..', '..', 'resources');
}

/**
 * Get the global resources directory path (resources/global/)
 */
export function getGlobalResourcesDir(): string {
  return join(getResourcesDir(), 'global');
}

/**
 * Get the language-specific global resources directory path (resources/global/{lang}/)
 */
export function getLanguageResourcesDir(lang: Language): string {
  return join(getGlobalResourcesDir(), lang);
}

/**
 * Copy global resources directory to ~/.takt.
 * Only copies files that don't exist in target.
 * Skips language-specific directories (en/, ja/) which are handled by copyLanguageResourcesToDir.
 */
export function copyGlobalResourcesToDir(targetDir: string): void {
  const resourcesDir = getGlobalResourcesDir();
  if (!existsSync(resourcesDir)) {
    return;
  }
  // Skip language directories (they are handled by copyLanguageResourcesToDir)
  copyDirRecursive(resourcesDir, targetDir, ['en', 'ja']);
}

/**
 * Copy language-specific resources (agents and workflows) to ~/.takt.
 * Copies from resources/global/{lang}/agents to ~/.takt/agents
 * and resources/global/{lang}/workflows to ~/.takt/workflows.
 * Also copies config.yaml from language directory.
 * @throws Error if language directory doesn't exist
 */
export function copyLanguageResourcesToDir(targetDir: string, lang: Language): void {
  const langDir = getLanguageResourcesDir(lang);
  if (!existsSync(langDir)) {
    throw new Error(`Language resources not found: ${langDir}`);
  }

  // Copy agents directory
  const langAgentsDir = join(langDir, 'agents');
  const targetAgentsDir = join(targetDir, 'agents');
  if (existsSync(langAgentsDir)) {
    copyDirRecursive(langAgentsDir, targetAgentsDir);
  }

  // Copy workflows directory
  const langWorkflowsDir = join(langDir, 'workflows');
  const targetWorkflowsDir = join(targetDir, 'workflows');
  if (existsSync(langWorkflowsDir)) {
    copyDirRecursive(langWorkflowsDir, targetWorkflowsDir);
  }

  // Copy config.yaml if exists
  const langConfigPath = join(langDir, 'config.yaml');
  const targetConfigPath = join(targetDir, 'config.yaml');
  if (existsSync(langConfigPath) && !existsSync(targetConfigPath)) {
    const content = readFileSync(langConfigPath);
    writeFileSync(targetConfigPath, content);
  }
}

/**
 * Recursively copy directory contents.
 * Skips files that already exist in target.
 * @param skipDirs - Directory names to skip at top level
 */
function copyDirRecursive(srcDir: string, destDir: string, skipDirs: string[] = []): void {
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  for (const entry of readdirSync(srcDir)) {
    // Skip .DS_Store and other hidden files
    if (entry.startsWith('.')) continue;

    // Skip specified directories
    if (skipDirs.includes(entry)) continue;

    const srcPath = join(srcDir, entry);
    const destPath = join(destDir, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (!existsSync(destPath)) {
      // Only copy if file doesn't exist
      const content = readFileSync(srcPath);
      writeFileSync(destPath, content);
    }
  }
}

