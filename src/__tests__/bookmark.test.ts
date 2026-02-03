/**
 * Tests for workflow bookmark functionality
 */

import { describe, it, expect } from 'vitest';
import { handleKeyInput } from '../shared/prompt/index.js';
import { applyBookmarks, type SelectionOption } from '../features/workflowSelection/index.js';

describe('handleKeyInput - bookmark action', () => {
  const totalItems = 4;
  const optionCount = 3;
  const hasCancelOption = true;

  it('should return bookmark action for b key', () => {
    const result = handleKeyInput('b', 1, totalItems, hasCancelOption, optionCount);
    expect(result).toEqual({ action: 'bookmark', selectedIndex: 1 });
  });

  it('should return bookmark action with current index', () => {
    const result = handleKeyInput('b', 0, totalItems, hasCancelOption, optionCount);
    expect(result).toEqual({ action: 'bookmark', selectedIndex: 0 });
  });

  it('should return bookmark action at last option index', () => {
    const result = handleKeyInput('b', 2, totalItems, hasCancelOption, optionCount);
    expect(result).toEqual({ action: 'bookmark', selectedIndex: 2 });
  });

  it('should not interfere with existing key bindings', () => {
    // j/k should still work
    expect(handleKeyInput('j', 0, totalItems, hasCancelOption, optionCount)).toEqual({ action: 'move', newIndex: 1 });
    expect(handleKeyInput('k', 1, totalItems, hasCancelOption, optionCount)).toEqual({ action: 'move', newIndex: 0 });
    // Enter should still confirm
    expect(handleKeyInput('\r', 0, totalItems, hasCancelOption, optionCount)).toEqual({ action: 'confirm', selectedIndex: 0 });
    // Esc should still cancel
    expect(handleKeyInput('\x1B', 0, totalItems, hasCancelOption, optionCount)).toEqual({ action: 'cancel', cancelIndex: 3 });
  });
});

describe('applyBookmarks', () => {
  const options: SelectionOption[] = [
    { label: 'alpha', value: 'alpha' },
    { label: 'beta', value: 'beta' },
    { label: 'gamma', value: 'gamma' },
    { label: 'delta', value: 'delta' },
  ];

  it('should move bookmarked items to the top with ★ prefix', () => {
    const result = applyBookmarks(options, ['gamma']);
    expect(result[0]!.label).toBe('★ gamma');
    expect(result[0]!.value).toBe('gamma');
    expect(result).toHaveLength(4);
  });

  it('should preserve order of non-bookmarked items', () => {
    const result = applyBookmarks(options, ['gamma']);
    const rest = result.slice(1);
    expect(rest.map((o) => o.value)).toEqual(['alpha', 'beta', 'delta']);
  });

  it('should handle multiple bookmarks preserving their relative order', () => {
    const result = applyBookmarks(options, ['delta', 'alpha']);
    // Bookmarked items appear first, in the order they appear in options (not in bookmarks array)
    expect(result[0]!.value).toBe('alpha');
    expect(result[0]!.label).toBe('★ alpha');
    expect(result[1]!.value).toBe('delta');
    expect(result[1]!.label).toBe('★ delta');
    expect(result.slice(2).map((o) => o.value)).toEqual(['beta', 'gamma']);
  });

  it('should return unchanged options when no bookmarks', () => {
    const result = applyBookmarks(options, []);
    expect(result).toEqual(options);
  });

  it('should ignore bookmarks that do not match any option', () => {
    const result = applyBookmarks(options, ['nonexistent']);
    expect(result).toEqual(options);
  });

  it('should not mutate original options', () => {
    const original = options.map((o) => ({ ...o }));
    applyBookmarks(options, ['gamma']);
    expect(options).toEqual(original);
  });

  it('should work with category-prefixed values', () => {
    const categoryOptions: SelectionOption[] = [
      { label: 'simple', value: 'simple' },
      { label: '📁 frontend/', value: '__category__:frontend' },
      { label: '📁 backend/', value: '__category__:backend' },
    ];
    // Only workflow values should match; categories are not bookmarkable
    const result = applyBookmarks(categoryOptions, ['simple']);
    expect(result[0]!.label).toBe('★ simple');
    expect(result.slice(1).map((o) => o.value)).toEqual(['__category__:frontend', '__category__:backend']);
  });

  it('should handle all items bookmarked', () => {
    const result = applyBookmarks(options, ['alpha', 'beta', 'gamma', 'delta']);
    expect(result.every((o) => o.label.startsWith('★ '))).toBe(true);
    expect(result.map((o) => o.value)).toEqual(['alpha', 'beta', 'gamma', 'delta']);
  });
});
