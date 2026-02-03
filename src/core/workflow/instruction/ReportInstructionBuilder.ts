/**
 * Phase 2 instruction builder (report output)
 *
 * Builds the instruction for the report output phase. Includes:
 * - Execution Context (cwd + rules)
 * - Workflow Context (report info only)
 * - Report output instruction + format
 *
 * Does NOT include: User Request, Previous Response, User Inputs,
 * Status rules, instruction_template.
 */

import type { WorkflowStep, Language } from '../../models/types.js';
import type { InstructionContext } from './instruction-context.js';
import { getMetadataStrings } from './instruction-context.js';
import { replaceTemplatePlaceholders } from './escape.js';
import { isReportObjectConfig, renderReportContext, renderReportOutputInstruction } from './InstructionBuilder.js';
import { getPromptObject } from '../../../shared/prompts/index.js';

/** Shape of localized report phase strings */
interface ReportPhaseStrings {
  noSourceEdit: string;
  reportDirOnly: string;
  instructionBody: string;
  reportJsonFormat: string;
  reportPlainAllowed: string;
  reportOnlyOutput: string;
}

/** Shape of localized report section strings */
interface ReportSectionStrings {
  workflowContext: string;
  instructions: string;
}

/**
 * Context for building report phase instruction.
 */
export interface ReportInstructionContext {
  /** Working directory */
  cwd: string;
  /** Report directory path */
  reportDir: string;
  /** Step iteration (for {step_iteration} replacement) */
  stepIteration: number;
  /** Language */
  language?: Language;
  /** Target report file name (when generating a single report) */
  targetFile?: string;
}

/**
 * Builds Phase 2 (report output) instructions.
 */
export class ReportInstructionBuilder {
  constructor(
    private readonly step: WorkflowStep,
    private readonly context: ReportInstructionContext,
  ) {}

  build(): string {
    if (!this.step.report) {
      throw new Error(`ReportInstructionBuilder called for step "${this.step.name}" which has no report config`);
    }

    const language = this.context.language ?? 'en';
    const s = getPromptObject<ReportSectionStrings>('instruction.reportSections', language);
    const r = getPromptObject<ReportPhaseStrings>('instruction.reportPhase', language);
    const m = getMetadataStrings(language);
    const sections: string[] = [];

    // 1. Execution Context
    const execLines = [
      m.heading,
      `- ${m.workingDirectory}: ${this.context.cwd}`,
      '',
      m.rulesHeading,
      `- ${m.noCommit}`,
      `- ${m.noCd}`,
      `- ${r.noSourceEdit}`,
      `- ${r.reportDirOnly}`,
    ];
    if (m.note) {
      execLines.push('');
      execLines.push(m.note);
    }
    execLines.push('');
    sections.push(execLines.join('\n'));

    // 2. Workflow Context (single file info when targetFile is specified)
    const workflowLines = [s.workflowContext];
    if (this.context.targetFile) {
      const sectionStr = getPromptObject<{ reportDirectory: string; reportFile: string }>('instruction.sections', language);
      workflowLines.push(`- ${sectionStr.reportDirectory}: ${this.context.reportDir}/`);
      workflowLines.push(`- ${sectionStr.reportFile}: ${this.context.reportDir}/${this.context.targetFile}`);
    } else {
      workflowLines.push(renderReportContext(this.step.report, this.context.reportDir, language));
    }
    sections.push(workflowLines.join('\n'));

    // 3. Instructions (simplified when targetFile is specified)
    const instrParts: string[] = [s.instructions];

    if (this.context.targetFile) {
      instrParts.push(r.instructionBody);
      instrParts.push(`**このフェーズではツールは使えません。レポート内容をテキストとして直接回答してください。**`);
      instrParts.push(`**レポート本文のみを回答してください。** ファイル名やJSON形式は不要です。`);
    } else {
      instrParts.push(r.instructionBody);
      instrParts.push(r.reportJsonFormat);
      instrParts.push(r.reportPlainAllowed);
      instrParts.push(r.reportOnlyOutput);
    }

    // Report output instruction (auto-generated or explicit order)
    const reportContext: InstructionContext = {
      task: '',
      iteration: 0,
      maxIterations: 0,
      stepIteration: this.context.stepIteration,
      cwd: this.context.cwd,
      projectCwd: this.context.cwd,
      userInputs: [],
      reportDir: this.context.reportDir,
      language,
    };

    if (isReportObjectConfig(this.step.report) && this.step.report.order) {
      const processedOrder = replaceTemplatePlaceholders(this.step.report.order.trimEnd(), this.step, reportContext);
      instrParts.push('');
      instrParts.push(processedOrder);
    } else if (!this.context.targetFile) {
      const reportInstruction = renderReportOutputInstruction(this.step, reportContext, language);
      if (reportInstruction) {
        instrParts.push('');
        instrParts.push(reportInstruction);
      }
    }

    // Report format
    if (isReportObjectConfig(this.step.report) && this.step.report.format) {
      const processedFormat = replaceTemplatePlaceholders(this.step.report.format.trimEnd(), this.step, reportContext);
      instrParts.push('');
      instrParts.push(processedFormat);
    }

    sections.push(instrParts.join('\n'));

    return sections.join('\n\n');
  }
}
