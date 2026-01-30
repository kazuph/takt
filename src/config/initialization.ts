/**
 * Initialization module for first-time setup
 *
 * Handles language selection and initial config.yaml creation.
 * Builtin agents/workflows are loaded via fallback from resources/
 * and no longer copied to ~/.takt/ on setup.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Language } from '../models/types.js';
import { DEFAULT_LANGUAGE } from '../constants.js';
import { selectOptionWithDefault } from '../prompt/index.js';
import {
  getGlobalConfigDir,
  getGlobalConfigPath,
  getGlobalLogsDir,
  getProjectConfigDir,
  ensureDir,
} from './paths.js';
import { copyProjectResourcesToDir, getLanguageResourcesDir } from '../resources/index.js';
import { setLanguage, setProvider } from './globalConfig.js';

/**
 * Check if initial setup is needed.
 * Returns true if config.yaml doesn't exist yet.
 */
export function needsLanguageSetup(): boolean {
  return !existsSync(getGlobalConfigPath());
}

/**
 * Prompt user to select language for resources.
 * Returns 'en' for English (default), 'ja' for Japanese.
 * Exits process if cancelled (initial setup is required).
 */
export async function promptLanguageSelection(): Promise<Language> {
  const options: { label: string; value: Language }[] = [
    { label: 'English', value: 'en' },
    { label: '日本語 (Japanese)', value: 'ja' },
  ];

  const result = await selectOptionWithDefault(
    'Select language for default agents and workflows / デフォルトのエージェントとワークフローの言語を選択してください:',
    options,
    DEFAULT_LANGUAGE
  );

  if (result === null) {
    process.exit(0);
  }

  return result;
}

/**
 * Prompt user to select provider for resources.
 * Exits process if cancelled (initial setup is required).
 */
export async function promptProviderSelection(): Promise<'claude' | 'codex'> {
  const options: { label: string; value: 'claude' | 'codex' }[] = [
    { label: 'Claude Code', value: 'claude' },
    { label: 'Codex', value: 'codex' },
  ];

  const result = await selectOptionWithDefault(
    'Select provider (Claude Code or Codex) / プロバイダーを選択してください:',
    options,
    'claude'
  );

  if (result === null) {
    process.exit(0);
  }

  return result;
}

/**
 * Initialize global takt directory structure with language selection.
 * On first run, creates config.yaml from language template.
 * Agents/workflows are NOT copied — they are loaded via builtin fallback.
 */
export async function initGlobalDirs(): Promise<void> {
  ensureDir(getGlobalConfigDir());
  ensureDir(getGlobalLogsDir());

  if (needsLanguageSetup()) {
    const lang = await promptLanguageSelection();
    const provider = await promptProviderSelection();

    // Copy only config.yaml from language resources
    copyLanguageConfigYaml(lang);

    setLanguage(lang);
    setProvider(provider);
  }
}

/** Copy config.yaml from language resources to ~/.takt/ (if not already present) */
function copyLanguageConfigYaml(lang: Language): void {
  const langDir = getLanguageResourcesDir(lang);
  const srcPath = join(langDir, 'config.yaml');
  const destPath = getGlobalConfigPath();
  if (existsSync(srcPath) && !existsSync(destPath)) {
    writeFileSync(destPath, readFileSync(srcPath));
  }
}

/**
 * Initialize project-level .takt directory.
 * Creates .takt/ and copies project resources (e.g., .gitignore).
 * Only copies files that don't exist.
 */
export function initProjectDirs(projectDir: string): void {
  const configDir = getProjectConfigDir(projectDir);
  ensureDir(configDir);
  copyProjectResourcesToDir(configDir);
}
