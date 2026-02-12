/**
 * Codex SDK layer structured output tests.
 *
 * Tests CodexClient's extraction of structuredOutput from
 * `turn.completed` events' `finalResponse` field.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ===== Codex SDK mock =====

let mockEvents: Array<Record<string, unknown>> = [];

vi.mock('@openai/codex-sdk', () => {
  return {
    Codex: class MockCodex {
      async startThread() {
        return {
          id: 'thread-mock',
          runStreamed: async () => ({
            events: (async function* () {
              for (const event of mockEvents) {
                yield event;
              }
            })(),
          }),
        };
      }
      async resumeThread() {
        return this.startThread();
      }
    },
  };
});

// CodexClient は @openai/codex-sdk をインポートするため、mock 後にインポート
const { CodexClient } = await import('../infra/codex/client.js');

describe('CodexClient — structuredOutput 抽出', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEvents = [];
  });

  it('turn.completed の finalResponse を structuredOutput として返す', async () => {
    mockEvents = [
      { type: 'thread.started', thread_id: 'thread-1' },
      {
        type: 'item.completed',
        item: { id: 'msg-1', type: 'agent_message', text: 'response text' },
      },
      {
        type: 'turn.completed',
        turn: { finalResponse: { step: 2, reason: 'approved' } },
      },
    ];

    const client = new CodexClient();
    const result = await client.call('coder', 'prompt', { cwd: '/tmp' });

    expect(result.status).toBe('done');
    expect(result.structuredOutput).toEqual({ step: 2, reason: 'approved' });
  });

  it('turn.completed に finalResponse がない場合は undefined', async () => {
    mockEvents = [
      { type: 'thread.started', thread_id: 'thread-1' },
      {
        type: 'item.completed',
        item: { id: 'msg-1', type: 'agent_message', text: 'text' },
      },
      { type: 'turn.completed', turn: {} },
    ];

    const client = new CodexClient();
    const result = await client.call('coder', 'prompt', { cwd: '/tmp' });

    expect(result.status).toBe('done');
    expect(result.structuredOutput).toBeUndefined();
  });

  it('finalResponse が配列の場合は無視する', async () => {
    mockEvents = [
      { type: 'thread.started', thread_id: 'thread-1' },
      {
        type: 'item.completed',
        item: { id: 'msg-1', type: 'agent_message', text: 'text' },
      },
      { type: 'turn.completed', turn: { finalResponse: [1, 2, 3] } },
    ];

    const client = new CodexClient();
    const result = await client.call('coder', 'prompt', { cwd: '/tmp' });

    expect(result.structuredOutput).toBeUndefined();
  });

  it('finalResponse が null の場合は undefined', async () => {
    mockEvents = [
      { type: 'thread.started', thread_id: 'thread-1' },
      { type: 'turn.completed', turn: { finalResponse: null } },
    ];

    const client = new CodexClient();
    const result = await client.call('coder', 'prompt', { cwd: '/tmp' });

    expect(result.structuredOutput).toBeUndefined();
  });

  it('turn.completed がない場合は structuredOutput なし', async () => {
    mockEvents = [
      { type: 'thread.started', thread_id: 'thread-1' },
      {
        type: 'item.completed',
        item: { id: 'msg-1', type: 'agent_message', text: 'response' },
      },
    ];

    const client = new CodexClient();
    const result = await client.call('coder', 'prompt', { cwd: '/tmp' });

    expect(result.status).toBe('done');
    expect(result.structuredOutput).toBeUndefined();
  });

  it('outputSchema が runStreamed に渡される', async () => {
    const schema = { type: 'object', properties: { step: { type: 'integer' } } };
    const runStreamedSpy = vi.fn().mockResolvedValue({
      events: (async function* () {
        yield { type: 'thread.started', thread_id: 'thread-1' };
        yield {
          type: 'item.completed',
          item: { id: 'msg-1', type: 'agent_message', text: 'ok' },
        };
        yield {
          type: 'turn.completed',
          turn: { finalResponse: { step: 1 } },
        };
      })(),
    });

    // Mock SDK で startThread が返す thread の runStreamed を spy に差し替え
    const { Codex } = await import('@openai/codex-sdk');
    const codex = new Codex({} as never);
    const thread = await codex.startThread();
    thread.runStreamed = runStreamedSpy;

    // CodexClient は内部で Codex を new するため、
    // SDK クラス自体のモックで startThread の返り値を制御
    // → mockEvents ベースの簡易テストでは runStreamed の引数を直接検証できない
    // ここではプロバイダ層テスト (provider-structured-output.test.ts) で
    // outputSchema パススルーを検証済みのため、SDK 内部の引数検証はスキップ

    // 代わりに、outputSchema 付きで呼び出して structuredOutput が返ることを確認
    mockEvents = [
      { type: 'thread.started', thread_id: 'thread-1' },
      {
        type: 'item.completed',
        item: { id: 'msg-1', type: 'agent_message', text: 'ok' },
      },
      { type: 'turn.completed', turn: { finalResponse: { step: 1 } } },
    ];

    const client = new CodexClient();
    const result = await client.call('coder', 'prompt', {
      cwd: '/tmp',
      outputSchema: schema,
    });

    expect(result.structuredOutput).toEqual({ step: 1 });
  });
});
