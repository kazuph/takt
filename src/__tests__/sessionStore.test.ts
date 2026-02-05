import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { updateAgentSession, loadAgentSessionsByProvider } from '../config/sessionStore.js';

function createTempProject(): string {
  const dir = join(tmpdir(), `takt-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('sessionStore multi-provider', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('keeps sessions for multiple providers', () => {
    updateAgentSession(projectDir, 'planner', 'sess-claude', 'claude');
    updateAgentSession(projectDir, 'reviewer', 'sess-codex', 'codex');

    const providers = loadAgentSessionsByProvider(projectDir, 'claude');
    expect(providers.claude?.planner).toBe('sess-claude');
    expect(providers.codex?.reviewer).toBe('sess-codex');

    const raw = JSON.parse(readFileSync(join(projectDir, '.takt', 'agent_sessions.json'), 'utf-8')) as {
      providers: Record<string, Record<string, string>>;
    };
    expect(raw.providers.claude.planner).toBe('sess-claude');
    expect(raw.providers.codex.reviewer).toBe('sess-codex');
  });
});
