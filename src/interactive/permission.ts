/**
 * Interactive permission handler for takt
 *
 * Prompts user for permission when Claude requests access to tools
 * that are not pre-approved.
 */

import chalk from 'chalk';
import * as readline from 'node:readline';
import type { PermissionRequest, PermissionHandler } from '../claude/process.js';
import type { PermissionResult, PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';
import { playInfoSound } from '../utils/notification.js';

/** Permission state for the current session */
export interface PermissionState {
  /** Temporarily allowed command patterns (for this iteration) */
  iterationAllowedPatterns: Set<string>;
  /** Sacrifice mode for current iteration */
  iterationSacrificeMode: boolean;
}

/** Create initial permission state */
export function createPermissionState(): PermissionState {
  return {
    iterationAllowedPatterns: new Set(),
    iterationSacrificeMode: false,
  };
}

/** Reset permission state for new iteration */
export function resetPermissionStateForIteration(state: PermissionState): void {
  state.iterationAllowedPatterns.clear();
  state.iterationSacrificeMode = false;
}

/** Format tool input for display */
function formatToolInput(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'Bash') {
    const command = input.command as string | undefined;
    const description = input.description as string | undefined;
    if (command) {
      const lines = [`  コマンド: ${chalk.bold(command)}`];
      if (description) {
        lines.push(`  説明: ${description}`);
      }
      return lines.join('\n');
    }
  }

  if (toolName === 'Edit' || toolName === 'Write' || toolName === 'Read') {
    const filePath = input.file_path as string | undefined;
    if (filePath) {
      return `  ファイル: ${chalk.bold(filePath)}`;
    }
  }

  if (toolName === 'WebSearch') {
    const query = input.query as string | undefined;
    if (query) {
      return `  検索: ${chalk.bold(query)}`;
    }
  }

  if (toolName === 'WebFetch') {
    const url = input.url as string | undefined;
    if (url) {
      return `  URL: ${chalk.bold(url)}`;
    }
  }

  // Generic display for other tools
  const entries = Object.entries(input).slice(0, 3);
  return entries.map(([k, v]) => `  ${k}: ${JSON.stringify(v).slice(0, 50)}`).join('\n');
}

/** Build permission rule for the tool */
function buildPermissionRule(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'Bash') {
    const command = (input.command as string) || '';
    const firstWord = command.split(/\s+/)[0] || command;
    return `Bash(${firstWord}:*)`;
  }
  return toolName;
}

/** Build exact command pattern for iteration-scoped permission */
function buildExactCommandPattern(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'Bash') {
    const command = (input.command as string) || '';
    return `Bash:${command}`;
  }
  return `${toolName}:${JSON.stringify(input)}`;
}

/** Check if a pattern matches the current request */
function matchesPattern(pattern: string, toolName: string, input: Record<string, unknown>): boolean {
  // Check exact command pattern
  const exactPattern = buildExactCommandPattern(toolName, input);
  if (pattern === exactPattern) {
    return true;
  }

  // Check tool pattern (e.g., "Bash(gh:*)")
  if (toolName === 'Bash' && pattern.startsWith('Bash(')) {
    const command = (input.command as string) || '';
    const firstWord = command.split(/\s+/)[0] || '';
    const patternPrefix = pattern.match(/^Bash\(([^:]+):\*\)$/)?.[1];
    if (patternPrefix && firstWord === patternPrefix) {
      return true;
    }
  }

  return false;
}

/**
 * Create an interactive permission handler with enhanced options
 *
 * @param rl - Readline interface for user input
 * @param permissionState - Shared permission state for iteration-scoped permissions
 * @returns Permission handler function
 */
export function createInteractivePermissionHandler(
  rl: readline.Interface,
  permissionState?: PermissionState
): PermissionHandler {
  // Use provided state or create a new one
  const state = permissionState || createPermissionState();

  return async (request: PermissionRequest): Promise<PermissionResult> => {
    const { toolName, input, suggestions, decisionReason } = request;

    // Check if sacrifice mode is active for this iteration
    if (state.iterationSacrificeMode) {
      return { behavior: 'allow' };
    }

    // Check if this command matches any iteration-allowed pattern
    for (const pattern of state.iterationAllowedPatterns) {
      if (matchesPattern(pattern, toolName, input)) {
        return { behavior: 'allow' };
      }
    }

    // Play notification sound
    playInfoSound();

    // Display permission request
    console.log();
    console.log(chalk.yellow('━'.repeat(60)));
    console.log(chalk.yellow.bold('⚠️  権限リクエスト'));
    console.log(`  ツール: ${chalk.cyan(toolName)}`);
    console.log(formatToolInput(toolName, input));
    if (decisionReason) {
      console.log(chalk.gray(`  理由: ${decisionReason}`));
    }
    console.log(chalk.yellow('━'.repeat(60)));

    // Show options
    console.log(chalk.gray('  [y] 許可'));
    console.log(chalk.gray('  [n] 拒否'));
    console.log(chalk.gray('  [a] 今後も許可（セッション中）'));
    console.log(chalk.gray('  [i] このイテレーションでこのコマンドを許可'));
    console.log(chalk.gray('  [p] このイテレーションでこのコマンドパターンを許可'));
    console.log(chalk.gray('  [s] このイテレーションでPC全権限譲渡（sacrificeモード）'));

    // Prompt user
    const response = await new Promise<string>((resolve) => {
      rl.question(
        chalk.yellow('選択してください [y/n/a/i/p/s]: '),
        (answer) => {
          resolve(answer.trim().toLowerCase());
        }
      );
    });

    if (response === 'y' || response === 'yes') {
      // Allow this time only
      console.log(chalk.green('✓ 許可しました'));
      return { behavior: 'allow' };
    }

    if (response === 'a' || response === 'always') {
      // Allow and remember for session
      const rule = buildPermissionRule(toolName, input);
      console.log(chalk.green(`✓ 許可しました (${rule} をセッション中記憶)`));

      // Use suggestions if available, otherwise build our own
      const updatedPermissions: PermissionUpdate[] = suggestions || [
        {
          type: 'addRules',
          rules: [{ toolName, ruleContent: rule }],
          behavior: 'allow',
          destination: 'session',
        },
      ];

      return {
        behavior: 'allow',
        updatedPermissions,
      };
    }

    if (response === 'i') {
      // Allow this exact command for this iteration
      const exactPattern = buildExactCommandPattern(toolName, input);
      state.iterationAllowedPatterns.add(exactPattern);
      console.log(chalk.green('✓ このイテレーションでこのコマンドを許可しました'));
      return { behavior: 'allow' };
    }

    if (response === 'p') {
      // Allow this command pattern for this iteration
      const pattern = buildPermissionRule(toolName, input);
      state.iterationAllowedPatterns.add(pattern);
      console.log(chalk.green(`✓ このイテレーションで ${pattern} パターンを許可しました`));
      return { behavior: 'allow' };
    }

    if (response === 's' || response === 'sacrifice') {
      // Sacrifice mode for this iteration
      state.iterationSacrificeMode = true;
      console.log(chalk.red.bold('💀 このイテレーションでPC全権限を譲渡しました'));
      return { behavior: 'allow' };
    }

    // Deny
    console.log(chalk.red('✗ 拒否しました'));
    return {
      behavior: 'deny',
      message: 'User denied permission',
    };
  };
}

/**
 * Create a non-interactive permission handler that auto-allows safe tools
 * and denies others without prompting.
 */
export function createAutoPermissionHandler(): PermissionHandler {
  // Tools that are always safe to allow
  const safeTools = new Set([
    'Read',
    'Glob',
    'Grep',
    'WebSearch',
    'WebFetch',
  ]);

  // Safe Bash command prefixes
  const safeBashPrefixes = [
    'ls', 'cat', 'head', 'tail', 'find', 'grep', 'which',
    'pwd', 'echo', 'date', 'whoami', 'uname',
    'git status', 'git log', 'git diff', 'git branch', 'git show',
    'npm ', 'npx ', 'node ', 'python ', 'pip ',
  ];

  return async (request: PermissionRequest): Promise<PermissionResult> => {
    const { toolName, input } = request;

    // Safe tools are always allowed
    if (safeTools.has(toolName)) {
      return { behavior: 'allow' };
    }

    // Check Bash commands
    if (toolName === 'Bash') {
      const command = ((input.command as string) || '').trim();
      for (const prefix of safeBashPrefixes) {
        if (command.startsWith(prefix)) {
          return { behavior: 'allow' };
        }
      }
    }

    // Deny other tools
    return {
      behavior: 'deny',
      message: `Tool ${toolName} requires explicit permission`,
    };
  };
}
