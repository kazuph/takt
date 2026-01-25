/**
 * Session management commands
 *
 * Commands: /clear, /cls, /reset, /status, /history
 */

import chalk from 'chalk';
import { info, success, status, divider } from '../../utils/ui.js';
import { generateSessionId } from '../../utils/session.js';
import { setCurrentWorkflow } from '../../config/paths.js';
import { commandRegistry, createCommand } from './registry.js';
import { clearScreen, printWelcome } from '../ui.js';

/** /clear - Clear session and start fresh */
commandRegistry.register(
  createCommand(['clear'], 'Clear session and start fresh', async (_, state) => {
    state.claudeSessionId = undefined;
    state.conversationHistory = [];
    state.sessionId = generateSessionId();
    clearScreen();
    printWelcome(state);
    success('Session cleared. Starting fresh.');
    return { continue: true };
  })
);

/** /cls - Clear screen only (keep session) */
commandRegistry.register(
  createCommand(['cls'], 'Clear screen only (keep session)', async (_, state) => {
    clearScreen();
    printWelcome(state);
    return { continue: true };
  })
);

/** /reset - Full reset (session + workflow) */
commandRegistry.register(
  createCommand(['reset'], 'Full reset (session + workflow)', async (_, state) => {
    state.claudeSessionId = undefined;
    state.conversationHistory = [];
    state.sessionId = generateSessionId();
    state.workflowName = 'default';
    setCurrentWorkflow(state.cwd, 'default');
    clearScreen();
    printWelcome(state);
    success('Session and workflow reset.');
    return { continue: true };
  })
);

/** /status - Show current session info */
commandRegistry.register(
  createCommand(['status'], 'Show current session info', async (_, state) => {
    divider();
    status('Session ID', state.sessionId);
    status('Workflow', state.workflowName);
    status('Project', state.cwd);
    status('History', `${state.conversationHistory.length} messages`);
    status(
      'Claude Session',
      state.claudeSessionId || '(none - will create on first message)'
    );
    divider();
    return { continue: true };
  })
);

/** /history - Show conversation history */
commandRegistry.register(
  createCommand(['history'], 'Show conversation history', async (_, state) => {
    if (state.conversationHistory.length === 0) {
      info('No conversation history');
    } else {
      divider('═', 60);
      console.log(chalk.bold.magenta('  Conversation History'));
      divider('═', 60);
      state.conversationHistory.forEach((msg, i) => {
        const roleColor = msg.role === 'user' ? chalk.cyan : chalk.green;
        const roleLabel = msg.role === 'user' ? 'You' : 'Assistant';
        const preview =
          msg.content.length > 100
            ? msg.content.slice(0, 100) + '...'
            : msg.content;
        console.log();
        console.log(roleColor(`[${i + 1}] ${roleLabel}:`));
        console.log(chalk.gray(`    ${preview}`));
      });
      console.log();
      divider('═', 60);
    }
    return { continue: true };
  })
);
