import { z } from 'zod/v4';
import { AgentModelSchema } from './agent.js';

const ClaudeConfigSchema = z.object({
  command: z.string().default('claude'),
  timeout: z.number().int().positive().default(300000),
});

export const TaktConfigSchema = z.object({
  defaultModel: AgentModelSchema,
  defaultWorkflow: z.string().default('default'),
  agentDirs: z.array(z.string()).default([]),
  workflowDirs: z.array(z.string()).default([]),
  sessionDir: z.string().optional(),
  claude: ClaudeConfigSchema.default({ command: 'claude', timeout: 300000 }),
});

export type TaktConfig = z.infer<typeof TaktConfigSchema>;

export const DEFAULT_CONFIG: TaktConfig = {
  defaultModel: 'sonnet',
  defaultWorkflow: 'default',
  agentDirs: [],
  workflowDirs: [],
  claude: {
    command: 'claude',
    timeout: 300000,
  },
};
