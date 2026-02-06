/**
 * Runtime mode flags shared across modules
 */

let nonInteractiveMode = false;
let quietMode = false;

export function setNonInteractiveMode(value: boolean): void {
  nonInteractiveMode = value;
}

export function isNonInteractiveMode(): boolean {
  return nonInteractiveMode;
}

export function setQuietMode(value: boolean): void {
  quietMode = value;
}

export function isQuietMode(): boolean {
  return quietMode;
}
