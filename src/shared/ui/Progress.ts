import { info } from './LogManager.js';

export type ProgressCompletionMessage<T> = string | ((result: T) => string);

export async function withProgress<T>(
  startMessage: string,
  completionMessage: ProgressCompletionMessage<T>,
  operation: () => Promise<T>,
): Promise<T> {
  info(startMessage);
  const result = await operation();
  const message = typeof completionMessage === 'function'
    ? completionMessage(result)
    : completionMessage;
  info(message);
  return result;
}
