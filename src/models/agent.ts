import { z } from 'zod/v4';

export const AgentModelSchema = z.enum(['opus', 'sonnet', 'haiku']).default('sonnet');

export const AgentConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  model: AgentModelSchema,
  systemPrompt: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  maxTurns: z.number().int().positive().optional(),
});

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
