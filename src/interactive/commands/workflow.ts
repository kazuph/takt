/**
 * Workflow management commands
 *
 * Commands: /switch, /sw, /workflow, /workflows
 */

import {
  loadWorkflow,
  listWorkflows,
  getBuiltinWorkflow,
} from '../../config/index.js';
import { setCurrentWorkflow } from '../../config/paths.js';
import { header, info, success, error, list } from '../../utils/ui.js';
import { commandRegistry, createCommand } from './registry.js';
import { selectWorkflow } from '../ui.js';

/** /switch, /sw - Interactive workflow selection */
commandRegistry.register(
  createCommand(
    ['switch', 'sw'],
    'Switch workflow (interactive selection)',
    async (_, state, rl) => {
      const selected = await selectWorkflow(state, rl);
      if (selected) {
        state.workflowName = selected;
        setCurrentWorkflow(state.cwd, selected);
        success(`Switched to workflow: ${selected}`);
        info('Enter a task to start the workflow.');
      }
      return { continue: true };
    }
  )
);

/** /workflow [name] - Show or change current workflow */
commandRegistry.register(
  createCommand(
    ['workflow'],
    'Show or change current workflow',
    async (args, state) => {
      if (args.length > 0) {
        const newWorkflow = args.join(' ');
        // Check if it exists
        const builtin = getBuiltinWorkflow(newWorkflow);
        const custom = loadWorkflow(newWorkflow);
        if (builtin || custom) {
          state.workflowName = newWorkflow;
          setCurrentWorkflow(state.cwd, newWorkflow);
          success(`Switched to workflow: ${newWorkflow}`);
        } else {
          error(`Workflow not found: ${newWorkflow}`);
        }
      } else {
        info(`Current workflow: ${state.workflowName}`);
      }
      return { continue: true };
    }
  )
);

/** /workflows - List available workflows */
commandRegistry.register(
  createCommand(['workflows'], 'List available workflows', async () => {
    const workflows = listWorkflows();
    if (workflows.length === 0) {
      info('No workflows defined.');
      info('Add workflow files to ~/.takt/workflows/');
    } else {
      header('Available Workflows');
      list(workflows);
    }
    return { continue: true };
  })
);
