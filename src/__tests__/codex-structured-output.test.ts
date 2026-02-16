/**
 * Codex CLI layer structured output tests.
 *
 * Tests CodexClient's extraction of structuredOutput by parsing
 * JSON text from `item.completed` events when outputSchema is provided.
 */

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SpawnCall = {
  command: string;
  args: string[];
  options: Record<string, unknown>;
};

type SpawnScenario = {
  stdoutLines: string[];
  stderrText?: string;
  closeCode?: number;
  closeSignal?: NodeJS.Signals | null;
  spawnError?: Error;
};

let spawnCalls: SpawnCall[] = [];
let scenarios: SpawnScenario[] = [];

function queueScenario(scenario: SpawnScenario): void {
  scenarios.push(scenario);
}

vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn((command: string, args: string[], options: Record<string, unknown>) => {
      spawnCalls.push({ command, args, options });
      const scenario = scenarios.shift() ?? { stdoutLines: [], closeCode: 0, closeSignal: null };

      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: ReturnType<typeof vi.fn>;
        killed: boolean;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.killed = false;
      child.kill = vi.fn(() => {
        child.killed = true;
        return true;
      });

      queueMicrotask(() => {
        if (scenario.spawnError) {
          child.emit('error', scenario.spawnError);
          return;
        }
        for (const line of scenario.stdoutLines) {
          child.stdout.emit('data', `${line}\n`);
        }
        if (scenario.stderrText) {
          child.stderr.emit('data', scenario.stderrText);
        }
        child.emit('close', scenario.closeCode ?? 0, scenario.closeSignal ?? null);
      });

      return child;
    }),
  };
});

const { CodexClient } = await import('../infra/codex/client.js');

describe('CodexClient — structuredOutput 抽出', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spawnCalls = [];
    scenarios = [];
  });

  it('outputSchema 指定時に agent_message の JSON テキストを structuredOutput として返す', async () => {
    const schema = { type: 'object', properties: { step: { type: 'integer' } } };
    queueScenario({
      stdoutLines: [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'msg-1', type: 'agent_message', text: '{"step": 2, "reason": "approved"}' },
        }),
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 } }),
      ],
    });

    const client = new CodexClient();
    const result = await client.call('coder', 'prompt', { cwd: '/tmp', outputSchema: schema });

    expect(result.status).toBe('done');
    expect(result.structuredOutput).toEqual({ step: 2, reason: 'approved' });
  });

  it('outputSchema なしの場合はテキストを JSON パースしない', async () => {
    queueScenario({
      stdoutLines: [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'msg-1', type: 'agent_message', text: '{"step": 2}' },
        }),
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 } }),
      ],
    });

    const client = new CodexClient();
    const result = await client.call('coder', 'prompt', { cwd: '/tmp' });

    expect(result.status).toBe('done');
    expect(result.structuredOutput).toBeUndefined();
  });

  it('agent_message が JSON でない場合は undefined', async () => {
    const schema = { type: 'object', properties: { step: { type: 'integer' } } };
    queueScenario({
      stdoutLines: [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'msg-1', type: 'agent_message', text: 'plain text response' },
        }),
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 } }),
      ],
    });

    const client = new CodexClient();
    const result = await client.call('coder', 'prompt', { cwd: '/tmp', outputSchema: schema });

    expect(result.status).toBe('done');
    expect(result.structuredOutput).toBeUndefined();
  });

  it('JSON が配列の場合は無視する', async () => {
    const schema = { type: 'object', properties: { step: { type: 'integer' } } };
    queueScenario({
      stdoutLines: [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'msg-1', type: 'agent_message', text: '[1, 2, 3]' },
        }),
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 } }),
      ],
    });

    const client = new CodexClient();
    const result = await client.call('coder', 'prompt', { cwd: '/tmp', outputSchema: schema });

    expect(result.structuredOutput).toBeUndefined();
  });

  it('agent_message がない場合は structuredOutput なし', async () => {
    const schema = { type: 'object', properties: { step: { type: 'integer' } } };
    queueScenario({
      stdoutLines: [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 } }),
      ],
    });

    const client = new CodexClient();
    const result = await client.call('coder', 'prompt', { cwd: '/tmp', outputSchema: schema });

    expect(result.status).toBe('done');
    expect(result.structuredOutput).toBeUndefined();
  });

  it('resume セッション時は codex exec resume を使う', async () => {
    queueScenario({
      stdoutLines: [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 } }),
      ],
    });

    const client = new CodexClient();
    const result = await client.call('coder', 'prompt', {
      cwd: '/tmp',
      sessionId: 'session-123',
      model: 'o3',
    });

    expect(result.status).toBe('done');
    expect(spawnCalls[0]?.command).toBe('codex');
    expect(spawnCalls[0]?.args[0]).toBe('exec');
    expect(spawnCalls[0]?.args[1]).toBe('resume');
    expect(spawnCalls[0]?.args).toContain('session-123');
    expect(spawnCalls[0]?.args).toContain('--json');
  });

  it('通常実行時は codex exec と --sandbox を使う', async () => {
    queueScenario({
      stdoutLines: [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 } }),
      ],
    });

    const client = new CodexClient();
    const result = await client.call('coder', 'prompt', {
      cwd: '/tmp',
      permissionMode: 'edit',
    });

    expect(result.status).toBe('done');
    expect(spawnCalls[0]?.command).toBe('codex');
    expect(spawnCalls[0]?.args).toContain('exec');
    expect(spawnCalls[0]?.args).toContain('--sandbox');
    expect(spawnCalls[0]?.args).toContain('workspace-write');
    expect(spawnCalls[0]?.args).toContain('--cd');
    expect(spawnCalls[0]?.args).toContain('/tmp');
  });
});
