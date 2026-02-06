/**
 * Application-wide constants
 */

/** Supported language codes (duplicated from core/models to avoid shared → core dependency) */
type Language = 'en' | 'ja';

/** Default piece name when none specified */
export const DEFAULT_PIECE_NAME = 'default';

/** Default language for new installations */
export const DEFAULT_LANGUAGE: Language = 'en';
