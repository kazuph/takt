import { describe, it, expect } from 'vitest';
import { parseStructuredOutput } from '../shared/utils/structuredOutput.js';

describe('parseStructuredOutput', () => {
  it('should return undefined when hasOutputSchema is false', () => {
    expect(parseStructuredOutput('{"step":1}', false)).toBeUndefined();
  });

  it('should return undefined for empty text', () => {
    expect(parseStructuredOutput('', true)).toBeUndefined();
  });

  // Strategy 1: Direct JSON parse
  describe('direct JSON parse', () => {
    it('should parse pure JSON object', () => {
      expect(parseStructuredOutput('{"step":1,"reason":"done"}', true))
        .toEqual({ step: 1, reason: 'done' });
    });

    it('should parse JSON with whitespace', () => {
      expect(parseStructuredOutput('  { "step": 2, "reason": "ok" }  ', true))
        .toEqual({ step: 2, reason: 'ok' });
    });

    it('should ignore arrays', () => {
      expect(parseStructuredOutput('[1,2,3]', true)).toBeUndefined();
    });

    it('should ignore primitive JSON', () => {
      expect(parseStructuredOutput('"hello"', true)).toBeUndefined();
    });
  });

  // Strategy 2: Code block extraction
  describe('code block extraction', () => {
    it('should extract JSON from ```json code block', () => {
      const text = 'Here is the result:\n```json\n{"step":1,"reason":"matched"}\n```';
      expect(parseStructuredOutput(text, true))
        .toEqual({ step: 1, reason: 'matched' });
    });

    it('should extract JSON from ``` code block (no language)', () => {
      const text = 'Result:\n```\n{"step":2,"reason":"fallback"}\n```';
      expect(parseStructuredOutput(text, true))
        .toEqual({ step: 2, reason: 'fallback' });
    });
  });

  // Strategy 3: Brace extraction
  describe('brace extraction', () => {
    it('should extract JSON with preamble text', () => {
      const text = 'The matched rule is: {"step":1,"reason":"condition met"}';
      expect(parseStructuredOutput(text, true))
        .toEqual({ step: 1, reason: 'condition met' });
    });

    it('should extract JSON with postamble text', () => {
      const text = '{"step":3,"reason":"done"}\nEnd of response.';
      expect(parseStructuredOutput(text, true))
        .toEqual({ step: 3, reason: 'done' });
    });

    it('should extract JSON with both preamble and postamble', () => {
      const text = 'Based on my analysis:\n{"matched_index":2,"reason":"test"}\nThat is my judgment.';
      expect(parseStructuredOutput(text, true))
        .toEqual({ matched_index: 2, reason: 'test' });
    });
  });

  // Edge cases
  describe('edge cases', () => {
    it('should return undefined for text without JSON', () => {
      expect(parseStructuredOutput('No JSON here at all.', true)).toBeUndefined();
    });

    it('should return undefined for invalid JSON', () => {
      expect(parseStructuredOutput('{invalid json}', true)).toBeUndefined();
    });

    it('should handle nested objects', () => {
      const text = '{"step":1,"reason":"ok","meta":{"detail":"extra"}}';
      expect(parseStructuredOutput(text, true))
        .toEqual({ step: 1, reason: 'ok', meta: { detail: 'extra' } });
    });
  });
});
