/**
 * User input request handlers for workflow execution
 *
 * Handles user input prompts when an agent is blocked
 * or iteration limits are reached.
 */

import chalk from 'chalk';
import type { InputHistoryManager } from './input.js';
import { multiLineQuestion, createReadlineInterface } from './input.js';
import type { UserInputRequest, IterationLimitRequest } from '../workflow/engine.js';
import { info } from '../utils/ui.js';
import { playInfoSound } from '../utils/notification.js';

/**
 * Request user input for blocked workflow step.
 *
 * Displays the blocked message and prompts the user for additional information.
 * Returns null if the user cancels or provides empty input.
 */
export async function requestUserInput(
  request: UserInputRequest,
  rl: ReturnType<typeof createReadlineInterface>,
  historyManager: InputHistoryManager
): Promise<string | null> {
  // Play notification sound to alert user
  playInfoSound();

  console.log();
  console.log(chalk.yellow('━'.repeat(60)));
  console.log(chalk.yellow.bold('❓ エージェントからの質問'));
  console.log(chalk.gray(`ステップ: ${request.step.name} (${request.step.agentDisplayName})`));
  console.log();
  console.log(chalk.white(request.response.content));
  console.log(chalk.yellow('━'.repeat(60)));
  console.log();
  console.log(chalk.cyan('回答を入力してください（キャンセル: Ctrl+C）'));
  console.log();

  return new Promise((resolve) => {
    multiLineQuestion(rl, {
      promptStr: chalk.magenta('回答> '),
      onCtrlC: () => {
        console.log();
        info('ユーザー入力がキャンセルされました');
        resolve(null);
        return true; // Cancel input
      },
      historyManager,
    }).then((input) => {
      if (input.trim() === '') {
        info('空の入力のためキャンセルされました');
        resolve(null);
      } else {
        resolve(input);
      }
    }).catch(() => {
      resolve(null);
    });
  });
}

/**
 * Handle iteration limit reached.
 * Ask user if they want to continue and how many additional iterations.
 *
 * Returns:
 * - number: The number of additional iterations to continue
 * - null: User chose to stop the workflow
 */
export async function requestIterationContinue(
  request: IterationLimitRequest,
  rl: ReturnType<typeof createReadlineInterface>,
  historyManager: InputHistoryManager
): Promise<number | null> {
  // Play notification sound to alert user
  playInfoSound();

  console.log();
  console.log(chalk.yellow('━'.repeat(60)));
  console.log(chalk.yellow.bold('⏸ イテレーション上限に達しました'));
  console.log(chalk.gray(`現在: ${request.currentIteration}/${request.maxIterations} イテレーション`));
  console.log(chalk.gray(`ステップ: ${request.currentStep}`));
  console.log(chalk.yellow('━'.repeat(60)));
  console.log();
  console.log(chalk.cyan('続けますか？'));
  console.log(chalk.gray('  - 数字を入力: 追加イテレーション数（例: 5）'));
  console.log(chalk.gray('  - Enter: デフォルト10イテレーション追加'));
  console.log(chalk.gray('  - Ctrl+C または "n": 終了'));
  console.log();

  return new Promise((resolve) => {
    multiLineQuestion(rl, {
      promptStr: chalk.magenta('追加イテレーション> '),
      onCtrlC: () => {
        console.log();
        info('ワークフローを終了します');
        resolve(null);
        return true;
      },
      historyManager,
    }).then((input) => {
      const trimmed = input.trim().toLowerCase();

      // User wants to stop
      if (trimmed === 'n' || trimmed === 'no' || trimmed === 'q' || trimmed === 'quit') {
        info('ワークフローを終了します');
        resolve(null);
        return;
      }

      // Empty input = default 10 iterations
      if (trimmed === '' || trimmed === 'y' || trimmed === 'yes') {
        info('10 イテレーション追加します');
        resolve(10);
        return;
      }

      // Try to parse as number
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num > 0 && num <= 100) {
        info(`${num} イテレーション追加します`);
        resolve(num);
        return;
      }

      // Invalid input, treat as continue with default
      info('10 イテレーション追加します');
      resolve(10);
    }).catch(() => {
      resolve(null);
    });
  });
}
