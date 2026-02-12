/**
 * Detect rule index from numbered tag pattern [STEP_NAME:N].
 * Returns 0-based rule index, or -1 if no match.
 */
export function detectRuleIndex(content: string, movementName: string): number {
  const tag = movementName.toUpperCase();
  const regex = new RegExp(`\\[${tag}:(\\d+)\\]`, 'gi');
  const matches = [...content.matchAll(regex)];
  const match = matches.at(-1);
  if (match?.[1]) {
    const index = Number.parseInt(match[1], 10) - 1;
    return index >= 0 ? index : -1;
  }
  return -1;
}
