/**
 * Agent operation commands
 *
 * Commands: /agents, /agent
 */

import chalk from 'chalk';
import { listCustomAgents } from '../../config/index.js';
import { runAgent } from '../../agents/runner.js';
import { info, error, status, list, StreamDisplay } from '../../utils/ui.js';
import { commandRegistry, createCommand } from './registry.js';
import { multiLineQuestion } from '../input.js';

/** /agents - List available agents */
commandRegistry.register(
  createCommand(['agents'], 'List available agents', async (_) => {
    const agents = listCustomAgents();
    info('Built-in: coder, architect, supervisor');
    if (agents.length > 0) {
      info('Custom:');
      list(agents);
    }
    return { continue: true };
  })
);

/** /agent <name> - Run a single agent with next input */
commandRegistry.register(
  createCommand(
    ['agent'],
    'Run a single agent with next input',
    async (args, state, rl) => {
      if (args.length === 0) {
        error('Usage: /agent <name>');
        return { continue: true };
      }

      const agentName = args[0];
      if (!agentName) {
        error('Usage: /agent <name>');
        return { continue: true };
      }

      info(`Next input will be sent to agent: ${agentName}`);

      // Read next input for the agent using multiLineQuestion for multi-line support
      const agentInput = await multiLineQuestion(rl, {
        promptStr: chalk.cyan('Task> '),
        onCtrlC: () => {
          // Return true to cancel input and resolve with empty string
          info('Cancelled');
          return true;
        },
        historyManager: state.historyManager,
      });

      if (agentInput.trim()) {
        const display = new StreamDisplay(agentName);
        const streamHandler = display.createHandler();

        try {
          const response = await runAgent(agentName, agentInput, {
            cwd: state.cwd,
            onStream: streamHandler,
          });
          display.flushThinking();
          display.flushText();
          console.log();
          status('Status', response.status);
        } catch (err) {
          display.flushThinking();
          display.flushText();
          error(err instanceof Error ? err.message : String(err));
        }
      }

      return { continue: true };
    }
  )
);
