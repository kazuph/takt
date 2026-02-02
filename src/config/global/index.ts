/**
 * Global configuration - barrel exports
 */

export {
  GlobalConfigManager,
  invalidateGlobalConfigCache,
  loadGlobalConfig,
  saveGlobalConfig,
  getDisabledBuiltins,
  getLanguage,
  setLanguage,
  setProvider,
  addTrustedDirectory,
  isDirectoryTrusted,
  resolveAnthropicApiKey,
  resolveOpenaiApiKey,
  loadProjectDebugConfig,
  getEffectiveDebugConfig,
} from './globalConfig.js';

export {
  needsLanguageSetup,
  promptLanguageSelection,
  promptProviderSelection,
  initGlobalDirs,
  initProjectDirs,
  type InitGlobalDirsOptions,
} from './initialization.js';
