/**
 * /refresh-builtin command — DEPRECATED
 *
 * Builtin resources are now loaded directly from the package bundle.
 * Use /eject to copy individual builtins to ~/.takt/ for customization.
 */

import { warn, info } from '../utils/ui.js';

/**
 * Show deprecation notice and guide user to /eject.
 */
export async function refreshBuiltin(): Promise<void> {
  warn('/refresh-builtin is deprecated.');
  console.log();
  info('Builtin workflows and agents are now loaded directly from the package.');
  info('They no longer need to be copied to ~/.takt/.');
  console.log();
  info('To customize a builtin, use:');
  info('  takt /eject           List available builtins');
  info('  takt /eject {name}    Copy a builtin to ~/.takt/ for editing');
}
