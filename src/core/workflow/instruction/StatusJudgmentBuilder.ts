/**
 * Phase 3 instruction builder (status judgment)
 *
 * Resumes the agent session and asks it to evaluate its work
 * and output the appropriate status tag. No tools are allowed.
 *
 * Includes:
 * - Header instruction (review and determine status)
 * - Status rules (criteria table + output format)
 */

import type { WorkflowStep, Language } from '../../models/types.js';
import { generateStatusRulesFromRules } from './status-rules.js';

/** Localized strings for status judgment phase */
const STATUS_JUDGMENT_STRINGS = {
  en: {
    header: 'Review your work results and determine the status. Do NOT perform any additional work.',
  },
  ja: {
    header: '作業結果を振り返り、ステータスを判定してください。追加の作業は行わないでください。',
  },
} as const;

/**
 * Context for building status judgment instruction.
 */
export interface StatusJudgmentContext {
  /** Language */
  language?: Language;
  /** Whether interactive-only rules are enabled */
  interactive?: boolean;
}

/**
 * Builds Phase 3 (status judgment) instructions.
 */
export class StatusJudgmentBuilder {
  constructor(
    private readonly step: WorkflowStep,
    private readonly context: StatusJudgmentContext,
  ) {}

  build(): string {
    if (!this.step.rules || this.step.rules.length === 0) {
      throw new Error(`StatusJudgmentBuilder called for step "${this.step.name}" which has no rules`);
    }

    const language = this.context.language ?? 'en';
    const s = STATUS_JUDGMENT_STRINGS[language];
    const sections: string[] = [];

    // Header
    sections.push(s.header);

    // Status rules (criteria table + output format)
    const generatedPrompt = generateStatusRulesFromRules(
      this.step.name,
      this.step.rules,
      language,
      { interactive: this.context.interactive },
    );
    sections.push(generatedPrompt);

    return sections.join('\n\n');
  }
}
