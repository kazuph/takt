/**
 * Piece bookmarks management (separate from config.yaml)
 *
 * Bookmarks are stored in a configurable location (default: ~/.takt/preferences/bookmarks.yaml)
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { getGlobalConfigDir } from '../paths.js';
import { loadGlobalConfig } from './globalConfig.js';

interface BookmarksFile {
  pieces: string[];
}

function getDefaultBookmarksPath(): string {
  return join(getGlobalConfigDir(), 'preferences', 'bookmarks.yaml');
}

function getBookmarksPath(): string {
  try {
    const config = loadGlobalConfig();
    if (config.bookmarksFile) {
      return config.bookmarksFile;
    }
  } catch {
    // Ignore errors, use default
  }
  return getDefaultBookmarksPath();
}

function loadBookmarksFile(): BookmarksFile {
  const bookmarksPath = getBookmarksPath();
  if (!existsSync(bookmarksPath)) {
    return { pieces: [] };
  }

  try {
    const content = readFileSync(bookmarksPath, 'utf-8');
    const parsed = parseYaml(content);
    if (parsed && typeof parsed === 'object' && 'pieces' in parsed && Array.isArray(parsed.pieces)) {
      return { pieces: parsed.pieces };
    }
  } catch {
    // Ignore parse errors
  }

  return { pieces: [] };
}

function saveBookmarksFile(bookmarks: BookmarksFile): void {
  const bookmarksPath = getBookmarksPath();
  const dir = dirname(bookmarksPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const content = stringifyYaml(bookmarks, { indent: 2 });
  writeFileSync(bookmarksPath, content, 'utf-8');
}

/** Get bookmarked piece names */
export function getBookmarkedPieces(): string[] {
  const bookmarks = loadBookmarksFile();
  return bookmarks.pieces;
}

/**
 * Add a piece to bookmarks.
 * Persists to ~/.takt/bookmarks.yaml and returns the updated bookmarks list.
 */
export function addBookmark(pieceName: string): string[] {
  const bookmarks = loadBookmarksFile();
  if (!bookmarks.pieces.includes(pieceName)) {
    bookmarks.pieces.push(pieceName);
    saveBookmarksFile(bookmarks);
  }
  return bookmarks.pieces;
}

/**
 * Remove a piece from bookmarks.
 * Persists to ~/.takt/bookmarks.yaml and returns the updated bookmarks list.
 */
export function removeBookmark(pieceName: string): string[] {
  const bookmarks = loadBookmarksFile();
  const index = bookmarks.pieces.indexOf(pieceName);
  if (index >= 0) {
    bookmarks.pieces.splice(index, 1);
    saveBookmarksFile(bookmarks);
  }
  return bookmarks.pieces;
}

/**
 * Check if a piece is bookmarked.
 */
export function isBookmarked(pieceName: string): boolean {
  const bookmarks = loadBookmarksFile();
  return bookmarks.pieces.includes(pieceName);
}
