/**
 * Parse structured output from provider text response.
 *
 * Codex and OpenCode return structured output as JSON text in agent messages.
 * This function extracts a JSON object from the text when outputSchema was requested.
 *
 * Extraction strategies (in order):
 * 1. Direct JSON parse — text is pure JSON starting with `{`
 * 2. Code block extraction — JSON inside ```json ... ``` or ``` ... ```
 * 3. Brace extraction — find outermost `{` ... `}` in the text
 */

function tryParseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not valid JSON
  }
  return undefined;
}

export function parseStructuredOutput(
  text: string,
  hasOutputSchema: boolean,
): Record<string, unknown> | undefined {
  if (!hasOutputSchema || !text) return undefined;

  const trimmed = text.trim();

  // Strategy 1: Direct JSON parse (text is pure JSON)
  if (trimmed.startsWith('{')) {
    const result = tryParseJsonObject(trimmed);
    if (result) return result;
  }

  // Strategy 2: Extract from markdown code block (```json\n{...}\n```)
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n(\{[\s\S]*?\})\s*\n```/);
  if (codeBlockMatch?.[1]) {
    const result = tryParseJsonObject(codeBlockMatch[1].trim());
    if (result) return result;
  }

  // Strategy 3: Find first `{` and last `}` (handles preamble/postamble text)
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    const result = tryParseJsonObject(candidate);
    if (result) return result;
  }

  return undefined;
}
