/**
 * Phase 1 instruction builder
 *
 * Builds the instruction string for main agent execution by:
 * 1. Auto-injecting standard sections (Execution Context, Workflow Context,
 *    User Request, Previous Response, Additional User Inputs, Instructions header,
 *    Status Output Rules)
 * 2. Replacing template placeholders with actual values
 */

import type { WorkflowStep, Language, ReportConfig, ReportObjectConfig } from '../../models/types.js';
import { hasTagBasedRules } from '../evaluation/rule-utils.js';
import type { InstructionContext } from './instruction-context.js';
import { buildExecutionMetadata, renderExecutionMetadata } from './instruction-context.js';
import { generateStatusRulesFromRules } from './status-rules.js';
import { escapeTemplateChars, replaceTemplatePlaceholders } from './escape.js';

/**
 * Check if a report config is the object form (ReportObjectConfig).
 */
export function isReportObjectConfig(report: string | ReportConfig[] | ReportObjectConfig): report is ReportObjectConfig {
  return typeof report === 'object' && !Array.isArray(report) && 'name' in report;
}

/** Localized strings for auto-injected sections */
const SECTION_STRINGS = {
  en: {
    workflowContext: '## Workflow Context',
    iteration: 'Iteration',
    iterationWorkflowWide: '(workflow-wide)',
    stepIteration: 'Step Iteration',
    stepIterationTimes: '(times this step has run)',
    step: 'Step',
    reportDirectory: 'Report Directory',
    reportFile: 'Report File',
    reportFiles: 'Report Files',
    userRequest: '## User Request',
    previousResponse: '## Previous Response',
    additionalUserInputs: '## Additional User Inputs',
    instructions: '## Instructions',
  },
  ja: {
    workflowContext: '## Workflow Context',
    iteration: 'Iteration',
    iterationWorkflowWide: '（ワークフロー全体）',
    stepIteration: 'Step Iteration',
    stepIterationTimes: '（このステップの実行回数）',
    step: 'Step',
    reportDirectory: 'Report Directory',
    reportFile: 'Report File',
    reportFiles: 'Report Files',
    userRequest: '## User Request',
    previousResponse: '## Previous Response',
    additionalUserInputs: '## Additional User Inputs',
    instructions: '## Instructions',
  },
} as const;

/** Localized strings for auto-generated report output instructions */
const REPORT_OUTPUT_STRINGS = {
  en: {
    singleHeading: '**Report output:** Output to the `Report File` specified above.',
    multiHeading: '**Report output:** Output to the `Report Files` specified above.',
    createRule: '- If file does not exist: Create new file',
    appendRule: '- If file exists: Append with `## Iteration {step_iteration}` section',
  },
  ja: {
    singleHeading: '**レポート出力:** `Report File` に出力してください。',
    multiHeading: '**レポート出力:** Report Files に出力してください。',
    createRule: '- ファイルが存在しない場合: 新規作成',
    appendRule: '- ファイルが存在する場合: `## Iteration {step_iteration}` セクションを追記',
  },
} as const;

/**
 * Builds Phase 1 instructions for agent execution.
 *
 * Stateless builder — all data is passed via constructor context.
 */
export class InstructionBuilder {
  constructor(
    private readonly step: WorkflowStep,
    private readonly context: InstructionContext,
  ) {}

  /**
   * Build the complete instruction string.
   *
   * Generates a complete instruction by auto-injecting standard sections
   * around the step-specific instruction_template content.
   */
  build(): string {
    const language = this.context.language ?? 'en';
    const s = SECTION_STRINGS[language];
    const sections: string[] = [];

    // 1. Execution context metadata (working directory + rules + edit permission)
    const metadata = buildExecutionMetadata(this.context, this.step.edit);
    sections.push(renderExecutionMetadata(metadata));

    // 2. Workflow Context (iteration, step, report info)
    sections.push(this.renderWorkflowContext(language));

    // Skip auto-injection for sections whose placeholders exist in the template,
    // to avoid duplicate content.
    const tmpl = this.step.instructionTemplate;
    const hasTaskPlaceholder = tmpl.includes('{task}');
    const hasPreviousResponsePlaceholder = tmpl.includes('{previous_response}');
    const hasUserInputsPlaceholder = tmpl.includes('{user_inputs}');

    // 3. User Request (skip if template embeds {task} directly)
    if (!hasTaskPlaceholder) {
      sections.push(`${s.userRequest}\n${escapeTemplateChars(this.context.task)}`);
    }

    // 4. Previous Response (skip if template embeds {previous_response} directly)
    if (this.step.passPreviousResponse && this.context.previousOutput && !hasPreviousResponsePlaceholder) {
      sections.push(
        `${s.previousResponse}\n${escapeTemplateChars(this.context.previousOutput.content)}`,
      );
    }

    // 5. Additional User Inputs (skip if template embeds {user_inputs} directly)
    if (!hasUserInputsPlaceholder) {
      const userInputsStr = this.context.userInputs.join('\n');
      sections.push(`${s.additionalUserInputs}\n${escapeTemplateChars(userInputsStr)}`);
    }

    // 6. Instructions header + instruction_template content
    const processedTemplate = replaceTemplatePlaceholders(
      this.step.instructionTemplate,
      this.step,
      this.context,
    );
    sections.push(`${s.instructions}\n${processedTemplate}`);

    // 7. Status Output Rules (for tag-based detection in Phase 1)
    if (hasTagBasedRules(this.step)) {
      const statusRulesPrompt = generateStatusRulesFromRules(
        this.step.name,
        this.step.rules!,
        language,
        { interactive: this.context.interactive },
      );
      sections.push(statusRulesPrompt);
    }

    return sections.join('\n\n');
  }

  private renderWorkflowContext(language: Language): string {
    const s = SECTION_STRINGS[language];
    const lines: string[] = [
      s.workflowContext,
      `- ${s.iteration}: ${this.context.iteration}/${this.context.maxIterations}${s.iterationWorkflowWide}`,
      `- ${s.stepIteration}: ${this.context.stepIteration}${s.stepIterationTimes}`,
      `- ${s.step}: ${this.step.name}`,
    ];
    return lines.join('\n');
  }
}

/**
 * Render report context info for Workflow Context section.
 * Used by ReportInstructionBuilder.
 */
export function renderReportContext(
  report: string | ReportConfig[] | ReportObjectConfig,
  reportDir: string,
  language: Language,
): string {
  const s = SECTION_STRINGS[language];
  const lines: string[] = [
    `- ${s.reportDirectory}: ${reportDir}/`,
  ];

  if (typeof report === 'string') {
    lines.push(`- ${s.reportFile}: ${reportDir}/${report}`);
  } else if (isReportObjectConfig(report)) {
    lines.push(`- ${s.reportFile}: ${reportDir}/${report.name}`);
  } else {
    lines.push(`- ${s.reportFiles}:`);
    for (const file of report) {
      lines.push(`  - ${file.label}: ${reportDir}/${file.path}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate report output instructions from step.report config.
 * Returns undefined if step has no report or no reportDir.
 */
export function renderReportOutputInstruction(
  step: WorkflowStep,
  context: InstructionContext,
  language: Language,
): string | undefined {
  if (!step.report || !context.reportDir) return undefined;

  const s = REPORT_OUTPUT_STRINGS[language];
  const isMulti = Array.isArray(step.report);
  const heading = isMulti ? s.multiHeading : s.singleHeading;
  const appendRule = s.appendRule.replace('{step_iteration}', String(context.stepIteration));

  return [heading, s.createRule, appendRule].join('\n');
}
