/**
 * Command registry and all commands
 *
 * Import this module to register all commands with the registry.
 */

// Export registry
export { commandRegistry, type Command, type CommandResult } from './registry.js';

// Import all command modules to trigger registration
import './basic.js';
import './session.js';
import './workflow.js';
import './agent.js';
import './task.js';
