import { describe, it, expect } from 'vitest';
import { extractInfoQuestions } from '../commands/workflowExecution.js';

describe('extractInfoQuestions', () => {
  it('extracts questions from 確認事項 block', () => {
    const content = [
      'some intro',
      '確認事項:',
      '- 質問1',
      '- 質問2',
      '',
      'after',
    ].join('\n');

    expect(extractInfoQuestions({ response: { content } })).toEqual(['質問1', '質問2']);
  });

  it('ignores bullets outside the block', () => {
    const content = [
      '- これは質問ではない',
      '確認事項:',
      '- 本当の質問',
    ].join('\n');

    expect(extractInfoQuestions({ response: { content } })).toEqual(['本当の質問']);
  });

  it('stops when the block ends', () => {
    const content = [
      '確認事項:',
      '- 質問1',
      'ここから別の内容',
      '- 質問じゃない',
    ].join('\n');

    expect(extractInfoQuestions({ response: { content } })).toEqual(['質問1']);
  });

  it('supports Questions header and alternate bullets', () => {
    const content = [
      'Questions:',
      '* Question A',
      '・Question B',
    ].join('\n');

    expect(extractInfoQuestions({ response: { content } })).toEqual(['Question A', 'Question B']);
  });
});
