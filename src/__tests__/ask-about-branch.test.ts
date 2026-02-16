import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  loadGlobalConfigMock,
  buildBranchContextMock,
  getProviderMock,
  isQuietModeMock,
  infoMock,
  warnMock,
  displayCreateHandlerMock,
  displayFlushMock,
  providerSetupMock,
  providerCallMock,
} = vi.hoisted(() => {
  const providerCall = vi.fn();
  const providerSetup = vi.fn(() => ({ call: providerCall }));
  const displayCreateHandler = vi.fn(() => vi.fn());
  const displayFlush = vi.fn();

  return {
    loadGlobalConfigMock: vi.fn(),
    buildBranchContextMock: vi.fn(),
    getProviderMock: vi.fn(() => ({ setup: providerSetup })),
    isQuietModeMock: vi.fn(() => false),
    infoMock: vi.fn(),
    warnMock: vi.fn(),
    displayCreateHandlerMock: displayCreateHandler,
    displayFlushMock: displayFlush,
    providerSetupMock: providerSetup,
    providerCallMock: providerCall,
  };
});

vi.mock('../infra/config/index.js', () => ({
  loadGlobalConfig: loadGlobalConfigMock,
}));

vi.mock('../infra/task/index.js', () => ({
  buildBranchContext: buildBranchContextMock,
}));

vi.mock('../infra/providers/index.js', () => ({
  getProvider: getProviderMock,
}));

vi.mock('../shared/context.js', () => ({
  isQuietMode: isQuietModeMock,
}));

vi.mock('../shared/ui/index.js', () => ({
  info: infoMock,
  warn: warnMock,
  StreamDisplay: class MockStreamDisplay {
    createHandler = displayCreateHandlerMock;
    flush = displayFlushMock;
  },
}));

vi.mock('../shared/utils/index.js', () => ({
  createLogger: vi.fn(() => ({ error: vi.fn() })),
  getErrorMessage: (e: unknown): string => String(e),
}));

import { askAboutBranch } from '../features/tasks/execute/ask.js';

describe('askAboutBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadGlobalConfigMock.mockReturnValue({
      provider: 'claude',
      model: 'sonnet',
    });
    buildBranchContextMock.mockReturnValue('diff summary');
    providerCallMock.mockResolvedValue({
      persona: 'ask',
      status: 'done',
      content: 'ok',
      timestamp: new Date(),
    });
  });

  it('provider.setup().call() を使って Ask を実行する', async () => {
    await askAboutBranch('/repo', {
      branch: 'feature/a',
      question: 'What changed?',
    });

    expect(getProviderMock).toHaveBeenCalledWith('claude');
    expect(providerSetupMock).toHaveBeenCalledTimes(1);
    const setupArg = providerSetupMock.mock.calls[0]?.[0];
    expect(setupArg).toMatchObject({
      name: 'ask',
    });
    expect(typeof setupArg?.systemPrompt).toBe('string');

    expect(providerCallMock).toHaveBeenCalledTimes(1);
    expect(providerCallMock).toHaveBeenCalledWith(
      expect.stringContaining('## 質問'),
      expect.objectContaining({
        cwd: '/repo',
        model: 'sonnet',
        allowedTools: [],
      }),
    );
    expect(displayFlushMock).toHaveBeenCalled();
  });
});
