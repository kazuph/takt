/**
 * Interactive mode UI functions
 *
 * Provides display and visual functions for the interactive REPL.
 */

import * as readline from 'node:readline';
import chalk from 'chalk';
import { header, info, error, divider } from '../utils/ui.js';
import { loadAllWorkflows } from '../config/index.js';
import type { InteractiveState } from './types.js';

/** Clear screen */
export function clearScreen(): void {
  console.clear();
}

/** Print welcome banner */
export function printWelcome(state: InteractiveState): void {
  console.log(chalk.bold.cyan('═'.repeat(60)));
  console.log(chalk.bold.cyan('  TAKT Interactive Mode'));
  console.log(chalk.bold.cyan('═'.repeat(60)));
  console.log(chalk.gray(`Project: ${state.cwd}`));
  console.log(chalk.gray(`Workflow: ${state.workflowName}`));
  if (state.sacrificeMyPcMode) {
    console.log(chalk.red.bold('Mode: SACRIFICE-MY-PC 💀 (auto-approve all)'));
  }
  console.log(chalk.gray('Type /help for commands, /quit to exit'));
  console.log(chalk.bold.cyan('═'.repeat(60)));
  console.log();
}

/** Print help message */
export function printHelp(): void {
  header('TAKT Commands');
  console.log(`
${chalk.bold.yellow('Basic Operations:')}
  [message]            Send message to current workflow
  Up/Down Arrow        Navigate input history (persisted across sessions)
  Enter                Submit input (execute)

  ${chalk.bold.cyan('Multi-line input:')}
  末尾に \\         行末にバックスラッシュで継続 (mac Terminal.app推奨)
  Ctrl+J             改行を挿入 (全ターミナルで動作)
  Ctrl+Enter         改行を挿入 (対応ターミナルのみ)
  Option+Enter       改行を挿入 (iTerm2等)

  /help, /h            Show this help
  /quit, /exit, /q     Exit takt

${chalk.bold.yellow('Workflow Management:')}
  /switch, /sw         Switch workflow (interactive selection)
  /workflow [name]     Show or change current workflow
  /workflows           List available workflows

${chalk.bold.yellow('Session Management:')}
  /clear               Clear session and start fresh
  /cls                 Clear screen only (keep session)
  /reset               Full reset (session + workflow)
  /status              Show current session info
  /history             Show conversation history

${chalk.bold.yellow('Agent Operations:')}
  /agents              List available agents
  /agent <name>        Run a single agent with next input

${chalk.bold.yellow('Task Execution:')}
  /task, /t            Show task list
  /task run            Execute next task
  /task run <name>     Execute specified task

${chalk.bold.yellow('Mode Control:')}
  /sacrifice, /yolo    Toggle sacrifice-my-pc mode (auto-approve all)
  /safe                Disable sacrifice mode

${chalk.bold.yellow('Workflows:')}
  default              Coder -> Architect loop (default)

${chalk.bold.cyan('Examples:')}
  Implement a login feature
  Review src/auth.ts and suggest improvements
  Add tests for the previous code
`);
}

/** Show workflow selector UI */
export async function selectWorkflow(
  state: InteractiveState,
  rl: readline.Interface
): Promise<string | null> {
  const workflows = loadAllWorkflows();
  const workflowList = Array.from(workflows.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  if (workflowList.length === 0) {
    error('No workflows available');
    return null;
  }

  console.log();
  divider('═', 60);
  console.log(chalk.bold.magenta('  Workflow Selection'));
  divider('═', 60);
  console.log();

  workflowList.forEach(([name, workflow], index) => {
    const current = name === state.workflowName ? chalk.green(' (current)') : '';
    const desc = workflow.description || `${name} workflow`;
    console.log(chalk.cyan(`  [${index + 1}] ${name}${current}`));
    console.log(chalk.gray(`      ${desc}`));
  });

  console.log(chalk.yellow(`  [0] Cancel`));
  console.log();
  divider('═', 60);

  return new Promise((resolve) => {
    rl.question(chalk.cyan('Select workflow (number)> '), (input) => {
      const trimmed = input.trim();

      if (!trimmed || trimmed === '0') {
        info('Cancelled');
        resolve(null);
        return;
      }

      const index = parseInt(trimmed, 10) - 1;
      const entry = workflowList[index];
      if (index >= 0 && entry) {
        const [name] = entry;
        resolve(name);
      } else {
        error('Invalid selection');
        resolve(null);
      }
    });
  });
}
