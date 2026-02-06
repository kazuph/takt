import { z } from 'zod/v4';
import { AgentModelSchema, AgentConfigSchema } from './schemas.js';

export { AgentModelSchema, AgentConfigSchema };

export type AgentModel = z.infer<typeof AgentModelSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export interface AgentDefinition {
  name: string;
  description?: string;
  model: AgentModel;
  promptPath?: string;
  systemPrompt?: string;
  allowedTools?: string[];
  maxTurns?: number;
}

export interface AgentResult {
  agentName: string;
  success: boolean;
  output: string;
  exitCode: number;
  duration: number;
}
