import { z } from 'zod/v4';
import { AgentModelSchema } from './agent.js';

export const WorkflowStepSchema = z.object({
  agent: z.string().min(1),
  model: AgentModelSchema.optional(),
  prompt: z.string().optional(),
  condition: z.string().optional(),
  onSuccess: z.string().optional(),
  onFailure: z.string().optional(),
});

export const WorkflowConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.string().optional().default('1.0.0'),
  steps: z.array(WorkflowStepSchema).min(1),
  entryPoint: z.string().optional(),
  variables: z.record(z.string(), z.string()).optional(),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;

export interface WorkflowDefinition {
  name: string;
  description?: string;
  version: string;
  steps: WorkflowStep[];
  entryPoint?: string;
  variables?: Record<string, string>;
  filePath?: string;
}

export interface WorkflowContext {
  workflowName: string;
  currentStep: string;
  variables: Record<string, string>;
  history: StepResult[];
  userPrompt: string;
}

export interface StepResult {
  stepName: string;
  agentName: string;
  success: boolean;
  output: string;
  timestamp: Date;
}
