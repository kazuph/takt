import { createRequire } from 'node:module';
// @ts-expect-error -- update-notifier v7.x has no type definitions
import updateNotifier from 'update-notifier';

const require = createRequire(import.meta.url);

interface PkgInfo {
  name: string;
  version: string;
}

function loadPackageJson(): PkgInfo {
  return require('../../../package.json') as PkgInfo;
}

/**
 * Check for available updates and schedule a notification on process exit.
 * This is non-blocking: the registry check runs in a background subprocess.
 */
export function checkForUpdates(): void {
  const pkg = loadPackageJson();
  const notifier = updateNotifier({ pkg });
  notifier.notify();
}
