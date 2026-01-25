/**
 * Basic commands
 *
 * Commands: /help, /h, /quit, /exit, /q, /sacrifice
 */

import chalk from 'chalk';
import { info, success } from '../../utils/ui.js';
import { commandRegistry, createCommand } from './registry.js';
import { printHelp } from '../ui.js';

/** /help, /h - Show help message */
commandRegistry.register(
  createCommand(['help', 'h'], 'Show help message', async () => {
    printHelp();
    return { continue: true };
  })
);

/** /quit, /exit, /q - Exit takt */
commandRegistry.register(
  createCommand(['quit', 'exit', 'q'], 'Exit takt', async () => {
    info('Goodbye!');
    return { continue: false };
  })
);

/** /sacrifice, /yolo - Toggle sacrifice-my-pc mode */
commandRegistry.register(
  createCommand(
    ['sacrifice', 'yolo', 'sacrificemypc', 'sacrifice-my-pc'],
    'Toggle sacrifice-my-pc mode (auto-approve everything)',
    async (_args, state) => {
      state.sacrificeMyPcMode = !state.sacrificeMyPcMode;

      if (state.sacrificeMyPcMode) {
        console.log();
        console.log(chalk.red('━'.repeat(60)));
        console.log(chalk.red.bold('⚠️  SACRIFICE-MY-PC MODE ENABLED ⚠️'));
        console.log(chalk.red('━'.repeat(60)));
        console.log(chalk.yellow('All permissions will be auto-approved.'));
        console.log(chalk.yellow('Blocked states will be auto-skipped.'));
        console.log(chalk.red('━'.repeat(60)));
        console.log();
        success('Sacrifice mode: ON - May your PC rest in peace 💀');
      } else {
        console.log();
        info('Sacrifice mode: OFF - Normal confirmation mode restored');
      }

      return { continue: true };
    }
  )
);

/** /safe, /confirm - Disable sacrifice-my-pc mode and enable confirmation mode */
commandRegistry.register(
  createCommand(
    ['safe', 'careful', 'confirm'],
    'Enable confirmation mode (prompt for permissions)',
    async (_args, state) => {
      if (state.sacrificeMyPcMode) {
        state.sacrificeMyPcMode = false;
        console.log();
        console.log(chalk.green('━'.repeat(60)));
        console.log(chalk.green.bold('✓ 確認モードが有効になりました'));
        console.log(chalk.green('━'.repeat(60)));
        console.log(chalk.gray('権限リクエスト時に以下の選択肢が表示されます:'));
        console.log(chalk.gray('  [y] 許可'));
        console.log(chalk.gray('  [n] 拒否'));
        console.log(chalk.gray('  [a] 今後も許可（セッション中）'));
        console.log(chalk.gray('  [i] このイテレーションでこのコマンドを許可'));
        console.log(chalk.gray('  [p] このイテレーションでこのコマンドパターンを許可'));
        console.log(chalk.gray('  [s] このイテレーションでPC全権限譲渡'));
        console.log(chalk.green('━'.repeat(60)));
        console.log();
        success('確認モード: ON - 権限リクエストが表示されます');
      } else {
        info('Already in confirmation mode');
      }
      return { continue: true };
    }
  )
);

/** /mode - Show current permission mode */
commandRegistry.register(
  createCommand(['mode', 'status'], 'Show current permission mode', async (_args, state) => {
    console.log();
    if (state.sacrificeMyPcMode) {
      console.log(chalk.red.bold('現在のモード: 💀 SACRIFICE-MY-PC MODE'));
      console.log(chalk.yellow('  - 全ての権限リクエストが自動承認されます'));
      console.log(chalk.yellow('  - ブロック状態は自動でスキップされます'));
      console.log(chalk.gray('\n/confirm または /safe で確認モードに戻れます'));
    } else {
      console.log(chalk.green.bold('現在のモード: ✓ 確認モード'));
      console.log(chalk.gray('  - 権限リクエスト時にプロンプトが表示されます'));
      console.log(chalk.gray('\n/sacrifice で全自動モードに切り替えられます'));
    }
    console.log();
    return { continue: true };
  })
);
