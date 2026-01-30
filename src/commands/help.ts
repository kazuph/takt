/**
 * Help display
 */

import { header, info } from '../utils/ui.js';
import { getDebugLogFile } from '../utils/debug.js';

/**
 * Show help information
 */
export function showHelp(): void {
  header('TAKT - Task Agent Koordination Tool');

  console.log(`
Usage:
  takt {task}             Execute task with current workflow (continues session)
  takt "#N"               Execute GitHub Issue #N as task (quote # in shell)
  takt /run-tasks (/run)           Run all pending tasks from .takt/tasks/
  takt /watch                      Watch for tasks and auto-execute (stays resident)
  takt /add-task (/add)            Add a new task (interactive, YAML format)
  takt /list-tasks (/list)         List task branches (merge/delete)
  takt /switch            Switch workflow interactively
  takt /clear             Clear agent conversation sessions (reset to initial state)
  takt /eject             Copy builtin workflow/agents to ~/.takt/ for customization
  takt /eject {name}      Eject a specific builtin workflow
  takt /help              Show this help

Examples:
  takt "Fix the bug in main.ts"         # Execute task (continues session)
  takt "#6"                             # Execute Issue #6 as task
  takt "#6 #7"                          # Execute multiple Issues as task
  takt /add-task "#6"                   # Create task from Issue #6
  takt /add-task "#6" "#7"              # Create task from multiple Issues
  takt /add-task "認証機能を追加する"   # Quick add task
  takt /add-task                        # Interactive task creation
  takt /clear                           # Clear sessions, start fresh
  takt /watch                            # Watch & auto-execute tasks
  takt /eject                            # List available builtins
  takt /eject default                    # Eject default workflow for customization
  takt /list-tasks                       # List & merge task branches
  takt /switch
  takt /run-tasks

Task files (.takt/tasks/):
  .md files    Plain text tasks (backward compatible)
  .yaml files  Structured tasks with isolation/branch/workflow options

Configuration (.takt/config.yaml):
  workflow: default    # Current workflow
  verbose: true        # Enable verbose output
`);

  // Show debug log path if enabled
  const debugLogFile = getDebugLogFile();
  if (debugLogFile) {
    info(`Debug log: ${debugLogFile}`);
  }
}
