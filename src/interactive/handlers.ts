/**
 * Interactive handlers for user questions and input
 *
 * Handles AskUserQuestion tool responses and user input prompts
 * during workflow execution.
 */

import chalk from 'chalk';
import type { InputHistoryManager } from './input.js';
import { multiLineQuestion, createReadlineInterface } from './input.js';
import type { AskUserQuestionInput, AskUserQuestionHandler } from '../claude/process.js';
import { runAgent } from '../agents/runner.js';
import { info } from '../utils/ui.js';

/**
 * Create a handler that uses another agent to answer questions.
 * This allows automatic question answering by delegating to a specified agent.
 */
export function createAgentAnswerHandler(
  answerAgentName: string,
  cwd: string
): AskUserQuestionHandler {
  return async (input: AskUserQuestionInput): Promise<Record<string, string>> => {
    const answers: Record<string, string> = {};

    console.log();
    console.log(chalk.magenta('━'.repeat(60)));
    console.log(chalk.magenta.bold(`🤖 ${answerAgentName} が質問に回答します`));
    console.log(chalk.magenta('━'.repeat(60)));

    for (let i = 0; i < input.questions.length; i++) {
      const q = input.questions[i];
      if (!q) continue;

      const questionKey = `q${i}`;

      // Build a prompt for the answer agent
      let prompt = `以下の質問に回答してください。回答のみを出力してください。\n\n`;
      prompt += `質問: ${q.question}\n`;

      if (q.options && q.options.length > 0) {
        prompt += `\n選択肢:\n`;
        q.options.forEach((opt, idx) => {
          prompt += `${idx + 1}. ${opt.label}`;
          if (opt.description) {
            prompt += ` - ${opt.description}`;
          }
          prompt += '\n';
        });
        prompt += `\n選択肢の番号またはラベルで回答してください。選択肢以外の回答も可能です。`;
      }

      console.log(chalk.gray(`質問: ${q.question}`));

      try {
        const response = await runAgent(answerAgentName, prompt, {
          cwd,
          // Don't use session for answer agent - each question is independent
        });

        // Extract the answer from agent response
        const answerContent = response.content.trim();

        // If the agent selected a numbered option, convert to label
        const options = q.options;
        if (options && options.length > 0) {
          const num = parseInt(answerContent, 10);
          if (num >= 1 && num <= options.length) {
            const selectedOption = options[num - 1];
            answers[questionKey] = selectedOption?.label ?? answerContent;
          } else {
            // Check if agent replied with exact label
            const matchedOption = options.find(
              opt => opt.label.toLowerCase() === answerContent.toLowerCase()
            );
            if (matchedOption) {
              answers[questionKey] = matchedOption.label;
            } else {
              answers[questionKey] = answerContent;
            }
          }
        } else {
          answers[questionKey] = answerContent;
        }

        console.log(chalk.green(`回答: ${answers[questionKey]}`));
      } catch (err) {
        console.log(chalk.red(`エージェントエラー: ${err instanceof Error ? err.message : String(err)}`));
        // Fall back to empty answer on error
        answers[questionKey] = '';
      }

      console.log();
    }

    console.log(chalk.magenta('━'.repeat(60)));
    console.log();

    return answers;
  };
}

/**
 * Handle AskUserQuestion tool from Claude Code.
 * Displays questions to the user and collects their answers.
 */
export function createAskUserQuestionHandler(
  rl: ReturnType<typeof createReadlineInterface>,
  historyManager: InputHistoryManager
): AskUserQuestionHandler {
  return async (input: AskUserQuestionInput): Promise<Record<string, string>> => {
    const answers: Record<string, string> = {};

    console.log();
    console.log(chalk.blue('━'.repeat(60)));
    console.log(chalk.blue.bold('❓ Claude Code からの質問'));
    console.log(chalk.blue('━'.repeat(60)));
    console.log();

    for (let i = 0; i < input.questions.length; i++) {
      const q = input.questions[i];
      if (!q) continue;

      const questionKey = `q${i}`;

      // Show the question
      if (q.header) {
        console.log(chalk.cyan.bold(`[${q.header}]`));
      }
      console.log(chalk.white(q.question));

      // Show options if available
      const options = q.options;
      if (options && options.length > 0) {
        console.log();
        options.forEach((opt, idx) => {
          const label = chalk.yellow(`  ${idx + 1}. ${opt.label}`);
          const desc = opt.description ? chalk.gray(` - ${opt.description}`) : '';
          console.log(label + desc);
        });
        console.log(chalk.gray(`  ${options.length + 1}. その他（自由入力）`));
        console.log();

        // Prompt for selection
        const answer = await new Promise<string>((resolve) => {
          multiLineQuestion(rl, {
            promptStr: chalk.magenta('選択> '),
            onCtrlC: () => {
              resolve('');
              return true;
            },
            historyManager,
          }).then(resolve).catch(() => resolve(''));
        });

        const trimmed = answer.trim();
        const num = parseInt(trimmed, 10);

        if (num >= 1 && num <= options.length) {
          // User selected an option
          const selectedOption = options[num - 1];
          answers[questionKey] = selectedOption?.label ?? '';
        } else if (num === options.length + 1 || isNaN(num)) {
          // User selected "Other" or entered free text
          if (isNaN(num) && trimmed !== '') {
            answers[questionKey] = trimmed;
          } else {
            console.log(chalk.cyan('自由入力してください:'));
            const freeAnswer = await new Promise<string>((resolve) => {
              multiLineQuestion(rl, {
                promptStr: chalk.magenta('回答> '),
                onCtrlC: () => {
                  resolve('');
                  return true;
                },
                historyManager,
              }).then(resolve).catch(() => resolve(''));
            });
            answers[questionKey] = freeAnswer.trim();
          }
        } else {
          answers[questionKey] = trimmed;
        }
      } else {
        // No options, free text input
        console.log();
        const answer = await new Promise<string>((resolve) => {
          multiLineQuestion(rl, {
            promptStr: chalk.magenta('回答> '),
            onCtrlC: () => {
              resolve('');
              return true;
            },
            historyManager,
          }).then(resolve).catch(() => resolve(''));
        });
        answers[questionKey] = answer.trim();
      }

      console.log();
    }

    console.log(chalk.blue('━'.repeat(60)));
    console.log();

    return answers;
  };
}

/**
 * Create a handler for sacrifice mode that auto-skips all questions.
 */
export function createSacrificeModeQuestionHandler(): AskUserQuestionHandler {
  return async (_input: AskUserQuestionInput): Promise<Record<string, string>> => {
    info('[SACRIFICE MODE] Auto-skipping AskUserQuestion');
    return {};
  };
}
