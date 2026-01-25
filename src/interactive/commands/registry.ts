/**
 * Command registry for REPL
 *
 * Provides a Command pattern implementation for handling REPL commands.
 * Commands are registered here and dispatched from the main REPL loop.
 */

import type * as readline from 'node:readline';
import type { InteractiveState } from '../types.js';

/** Command execution result */
export interface CommandResult {
  /** Whether to continue the REPL loop */
  continue: boolean;
}

/** Command interface */
export interface Command {
  /** Command name(s) - first is primary, rest are aliases */
  names: string[];
  /** Brief description for help */
  description: string;
  /** Execute the command */
  execute(
    args: string[],
    state: InteractiveState,
    rl: readline.Interface
  ): Promise<CommandResult>;
}

/** Command registry */
class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  private allCommands: Command[] = [];

  /** Register a command */
  register(command: Command): void {
    this.allCommands.push(command);
    for (const name of command.names) {
      this.commands.set(name.toLowerCase(), command);
    }
  }

  /** Get a command by name */
  get(name: string): Command | undefined {
    return this.commands.get(name.toLowerCase());
  }

  /** Get all registered commands */
  getAll(): Command[] {
    return this.allCommands;
  }

  /** Check if a command exists */
  has(name: string): boolean {
    return this.commands.has(name.toLowerCase());
  }
}

/** Global command registry instance */
export const commandRegistry = new CommandRegistry();

/** Helper to create a simple command */
export function createCommand(
  names: string[],
  description: string,
  execute: Command['execute']
): Command {
  return { names, description, execute };
}
