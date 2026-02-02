/**
 * Application-wide constants
 */

/** Supported language codes (duplicated from core/models to avoid shared → core dependency) */
type Language = 'en' | 'ja';

/** Default workflow name when none specified */
export const DEFAULT_WORKFLOW_NAME = 'default';

/** Default language for new installations */
export const DEFAULT_LANGUAGE: Language = 'en';
