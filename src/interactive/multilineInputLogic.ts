/**
 * Multiline input state handling logic
 *
 * Pure functions for handling state transformations in multiline text editing.
 */

/** State for multiline input */
export interface MultilineInputState {
  lines: string[];
  currentLine: number;
  cursor: number;
}

/** Create initial state */
export function createInitialState(): MultilineInputState {
  return {
    lines: [''],
    currentLine: 0,
    cursor: 0,
  };
}

/** Get full input as single string (trimmed) */
export function getFullInput(state: MultilineInputState): string {
  return state.lines.join('\n').trim();
}

/** Handle character input */
export function handleCharacterInput(
  state: MultilineInputState,
  char: string
): MultilineInputState {
  const { lines, currentLine, cursor } = state;
  const line = lines[currentLine] || '';

  const newLine = line.slice(0, cursor) + char + line.slice(cursor);
  const newLines = [...lines];
  newLines[currentLine] = newLine;

  return {
    lines: newLines,
    currentLine,
    cursor: cursor + char.length,
  };
}

/** Handle newline insertion */
export function handleNewLine(state: MultilineInputState): MultilineInputState {
  const { lines, currentLine, cursor } = state;
  const line = lines[currentLine] || '';

  // Split current line at cursor
  const before = line.slice(0, cursor);
  const after = line.slice(cursor);

  const newLines = [
    ...lines.slice(0, currentLine),
    before,
    after,
    ...lines.slice(currentLine + 1),
  ];

  return {
    lines: newLines,
    currentLine: currentLine + 1,
    cursor: 0,
  };
}

/** Handle backspace */
export function handleBackspace(state: MultilineInputState): MultilineInputState {
  const { lines, currentLine, cursor } = state;
  const line = lines[currentLine] || '';

  if (cursor > 0) {
    // Delete character before cursor
    const newLine = line.slice(0, cursor - 1) + line.slice(cursor);
    const newLines = [...lines];
    newLines[currentLine] = newLine;

    return {
      lines: newLines,
      currentLine,
      cursor: cursor - 1,
    };
  } else if (currentLine > 0) {
    // At start of line, merge with previous line
    const prevLine = lines[currentLine - 1] || '';
    const mergedLine = prevLine + line;

    const newLines = [
      ...lines.slice(0, currentLine - 1),
      mergedLine,
      ...lines.slice(currentLine + 1),
    ];

    return {
      lines: newLines,
      currentLine: currentLine - 1,
      cursor: prevLine.length,
    };
  }

  // At start of first line, nothing to do
  return state;
}

/** Handle left arrow */
export function handleLeftArrow(state: MultilineInputState): MultilineInputState {
  const { lines, currentLine, cursor } = state;

  if (cursor > 0) {
    return { ...state, cursor: cursor - 1 };
  } else if (currentLine > 0) {
    // Move to end of previous line
    const prevLineLength = (lines[currentLine - 1] || '').length;
    return {
      ...state,
      currentLine: currentLine - 1,
      cursor: prevLineLength,
    };
  }

  return state;
}

/** Handle right arrow */
export function handleRightArrow(state: MultilineInputState): MultilineInputState {
  const { lines, currentLine, cursor } = state;
  const lineLength = (lines[currentLine] || '').length;

  if (cursor < lineLength) {
    return { ...state, cursor: cursor + 1 };
  } else if (currentLine < lines.length - 1) {
    // Move to start of next line
    return {
      ...state,
      currentLine: currentLine + 1,
      cursor: 0,
    };
  }

  return state;
}

/** Handle up arrow */
export function handleUpArrow(state: MultilineInputState): MultilineInputState {
  const { lines, currentLine, cursor } = state;

  if (currentLine > 0) {
    const prevLineLength = (lines[currentLine - 1] || '').length;
    return {
      ...state,
      currentLine: currentLine - 1,
      cursor: Math.min(cursor, prevLineLength),
    };
  }

  return state;
}

/** Handle down arrow */
export function handleDownArrow(state: MultilineInputState): MultilineInputState {
  const { lines, currentLine, cursor } = state;

  if (currentLine < lines.length - 1) {
    const nextLineLength = (lines[currentLine + 1] || '').length;
    return {
      ...state,
      currentLine: currentLine + 1,
      cursor: Math.min(cursor, nextLineLength),
    };
  }

  return state;
}
