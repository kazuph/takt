#!/usr/bin/env node

/**
 * TAKT CLI entry point
 *
 * Import order matters: program setup → commands → routing → parse.
 */

import { checkForUpdates } from '../../shared/utils/index.js';

checkForUpdates();

// Import in dependency order
import { program } from './program.js';
import './commands.js';
import './routing.js';

program.parse();
