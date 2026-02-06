/**
 * Notification utilities for takt
 *
 * Provides audio and visual notifications for piece events.
 */

import { exec } from 'node:child_process';
import { platform } from 'node:os';

/** Notification sound types */
export type NotificationSound = 'success' | 'error' | 'warning' | 'info';

/** Sound configuration */
const SOUND_CONFIG: Record<string, Record<NotificationSound, string>> = {
  darwin: {
    success: 'Glass',
    error: 'Basso',
    warning: 'Sosumi',
    info: 'Pop',
  },
  linux: {
    success: '/usr/share/sounds/freedesktop/stereo/complete.oga',
    error: '/usr/share/sounds/freedesktop/stereo/dialog-error.oga',
    warning: '/usr/share/sounds/freedesktop/stereo/dialog-warning.oga',
    info: '/usr/share/sounds/freedesktop/stereo/message.oga',
  },
};

/**
 * Play a notification sound
 *
 * @param type - The type of notification sound to play
 */
export function playSound(type: NotificationSound = 'info'): void {
  const os = platform();

  try {
    if (os === 'darwin') {
      // macOS - use afplay with system sounds
      const darwinConfig = SOUND_CONFIG.darwin;
      const sound = darwinConfig ? darwinConfig[type] : 'Pop';
      exec(`afplay /System/Library/Sounds/${sound}.aiff 2>/dev/null`, (err) => {
        // Silently ignore errors (sound not found, etc.)
        if (err) {
          // Try terminal bell as fallback
          process.stdout.write('\x07');
        }
      });
    } else if (os === 'linux') {
      // Linux - try paplay (PulseAudio) or aplay (ALSA)
      const linuxConfig = SOUND_CONFIG.linux;
      const sound = linuxConfig ? linuxConfig[type] : '/usr/share/sounds/freedesktop/stereo/message.oga';
      exec(`paplay ${sound} 2>/dev/null || aplay ${sound} 2>/dev/null`, (err) => {
        // Fallback to terminal bell
        if (err) {
          process.stdout.write('\x07');
        }
      });
    } else {
      // Windows or other - use terminal bell
      process.stdout.write('\x07');
    }
  } catch {
    // Fallback to terminal bell
    process.stdout.write('\x07');
  }
}

/**
 * Play success notification sound
 */
export function playSuccessSound(): void {
  playSound('success');
}

/**
 * Play error notification sound
 */
export function playErrorSound(): void {
  playSound('error');
}

/**
 * Play warning notification sound
 */
export function playWarningSound(): void {
  playSound('warning');
}

/**
 * Play info notification sound
 */
export function playInfoSound(): void {
  playSound('info');
}

/** Options for system notification */
export interface NotifyOptions {
  /** Notification title */
  title: string;
  /** Notification message/body */
  message: string;
  /** Optional subtitle (macOS only) */
  subtitle?: string;
  /** Sound type to play with notification */
  sound?: NotificationSound;
}

/**
 * Send a system notification
 *
 * @param options - Notification options
 */
export function sendNotification(options: NotifyOptions): void {
  const os = platform();
  const { title, message, subtitle, sound } = options;

  try {
    if (os === 'darwin') {
      // macOS - use osascript for native notifications
      const subtitlePart = subtitle ? `subtitle "${escapeAppleScript(subtitle)}"` : '';
      const soundPart = sound ? `sound name "${SOUND_CONFIG.darwin?.[sound] || 'Pop'}"` : '';
      const script = `display notification "${escapeAppleScript(message)}" with title "${escapeAppleScript(title)}" ${subtitlePart} ${soundPart}`;
      exec(`osascript -e '${script}'`, (err) => {
        if (err) {
          // Fallback: just play sound if notification fails
          if (sound) playSound(sound);
        }
      });
    } else if (os === 'linux') {
      // Linux - use notify-send
      const urgency = sound === 'error' ? 'critical' : sound === 'warning' ? 'normal' : 'low';
      exec(`notify-send -u ${urgency} "${escapeShell(title)}" "${escapeShell(message)}"`, (err) => {
        // Play sound separately on Linux
        if (sound) playSound(sound);
        if (err) {
          // Notification daemon not available, sound already played
        }
      });
    } else {
      // Windows or other - just play sound
      if (sound) playSound(sound);
    }
  } catch {
    // Fallback to just sound
    if (sound) playSound(sound);
  }
}

/**
 * Escape string for AppleScript
 */
function escapeAppleScript(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Escape string for shell
 */
function escapeShell(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
}

/**
 * Send success notification with sound
 */
export function notifySuccess(title: string, message: string): void {
  sendNotification({ title, message, sound: 'success' });
}

/**
 * Send error notification with sound
 */
export function notifyError(title: string, message: string): void {
  sendNotification({ title, message, sound: 'error' });
}

/**
 * Send warning notification with sound
 */
export function notifyWarning(title: string, message: string): void {
  sendNotification({ title, message, sound: 'warning' });
}

/**
 * Send info notification with sound
 */
export function notifyInfo(title: string, message: string): void {
  sendNotification({ title, message, sound: 'info' });
}
