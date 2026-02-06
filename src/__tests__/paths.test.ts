import { describe, it, expect } from 'vitest';
import { isPathSafe } from '../infra/config/paths.js';

describe('isPathSafe', () => {
  it('should accept paths within base directory', () => {
    expect(isPathSafe('/home/user/project', '/home/user/project/src/file.ts')).toBe(true);
    expect(isPathSafe('/home/user/project', '/home/user/project/deep/nested/file.ts')).toBe(true);
  });

  it('should reject paths outside base directory', () => {
    expect(isPathSafe('/home/user/project', '/home/user/other/file.ts')).toBe(false);
    expect(isPathSafe('/home/user/project', '/etc/passwd')).toBe(false);
  });

  it('should reject directory traversal attempts', () => {
    expect(isPathSafe('/home/user/project', '/home/user/project/../other/file.ts')).toBe(false);
    expect(isPathSafe('/home/user/project', '/home/user/project/../../etc/passwd')).toBe(false);
  });
});
