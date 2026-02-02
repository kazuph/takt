/**
 * Tests for checkForUpdates (update-notifier integration)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockNotify, mockUpdateNotifier } = vi.hoisted(() => {
  const mockNotify = vi.fn();
  const mockUpdateNotifier = vi.fn(() => ({ notify: mockNotify }));
  return { mockNotify, mockUpdateNotifier };
});

vi.mock('update-notifier', () => ({
  default: mockUpdateNotifier,
}));

vi.mock('node:module', () => {
  const mockRequire = vi.fn(() => ({
    name: 'takt',
    version: '0.2.4',
  }));
  return {
    createRequire: () => mockRequire,
  };
});

import { checkForUpdates } from '../shared/utils/index.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkForUpdates', () => {
  it('should call updateNotifier with package info from package.json', () => {
    // When
    checkForUpdates();

    // Then
    expect(mockUpdateNotifier).toHaveBeenCalledWith({
      pkg: { name: 'takt', version: '0.2.4' },
    });
  });

  it('should call notify on the notifier instance', () => {
    // When
    checkForUpdates();

    // Then
    expect(mockNotify).toHaveBeenCalled();
  });

  it('should call updateNotifier before notify', () => {
    // Given
    const callOrder: string[] = [];
    mockUpdateNotifier.mockImplementation(() => {
      callOrder.push('updateNotifier');
      return {
        notify: () => {
          callOrder.push('notify');
        },
      };
    });

    // When
    checkForUpdates();

    // Then
    expect(callOrder).toEqual(['updateNotifier', 'notify']);
  });
});
