/**
 * Rule evaluation logic extracted from engine.ts.
 *
 * Evaluates workflow step rules to determine the matched rule index.
 * Supports tag-based detection, ai() conditions, aggregate conditions,
 * and AI judge fallback.
 */

import type {
  WorkflowStep,
  WorkflowState,
  RuleMatchMethod,
} from '../models/types.js';
import { detectRuleIndex, callAiJudge } from '../claude/client.js';
import { createLogger } from '../utils/debug.js';

const log = createLogger('rule-evaluator');

export interface RuleMatch {
  index: number;
  method: RuleMatchMethod;
}

export interface RuleEvaluatorContext {
  /** Workflow state (for accessing stepOutputs in aggregate evaluation) */
  state: WorkflowState;
  /** Working directory (for AI judge calls) */
  cwd: string;
}

/**
 * Detect matched rule for a step's response.
 * Evaluation order (first match wins):
 * 1. Aggregate conditions: all()/any() — evaluate sub-step results
 * 2. Tag detection from Phase 3 output
 * 3. Tag detection from Phase 1 output (fallback)
 * 4. ai() condition evaluation via AI judge
 * 5. All-conditions AI judge (final fallback)
 *
 * Returns undefined for steps without rules.
 * Throws if rules exist but no rule matched (Fail Fast).
 *
 * @param step - The workflow step
 * @param agentContent - Phase 1 output (main execution)
 * @param tagContent - Phase 3 output (status judgment); empty string skips tag detection
 * @param ctx - Evaluation context (state, cwd)
 */
export async function detectMatchedRule(
  step: WorkflowStep,
  agentContent: string,
  tagContent: string,
  ctx: RuleEvaluatorContext,
): Promise<RuleMatch | undefined> {
  if (!step.rules || step.rules.length === 0) return undefined;

  // 1. Aggregate conditions (all/any) — only meaningful for parallel parent steps
  const aggIndex = evaluateAggregateConditions(step, ctx.state);
  if (aggIndex >= 0) {
    return { index: aggIndex, method: 'aggregate' };
  }

  // 2. Tag detection from Phase 3 output
  if (tagContent) {
    const ruleIndex = detectRuleIndex(tagContent, step.name);
    if (ruleIndex >= 0 && ruleIndex < step.rules.length) {
      return { index: ruleIndex, method: 'phase3_tag' };
    }
  }

  // 3. Tag detection from Phase 1 output (fallback)
  if (agentContent) {
    const ruleIndex = detectRuleIndex(agentContent, step.name);
    if (ruleIndex >= 0 && ruleIndex < step.rules.length) {
      return { index: ruleIndex, method: 'phase1_tag' };
    }
  }

  // 4. AI judge for ai() conditions only
  const aiRuleIndex = await evaluateAiConditions(step, agentContent, ctx.cwd);
  if (aiRuleIndex >= 0) {
    return { index: aiRuleIndex, method: 'ai_judge' };
  }

  // 5. AI judge for all conditions (final fallback)
  const fallbackIndex = await evaluateAllConditionsViaAiJudge(step, agentContent, ctx.cwd);
  if (fallbackIndex >= 0) {
    return { index: fallbackIndex, method: 'ai_judge_fallback' };
  }

  throw new Error(`Status not found for step "${step.name}": no rule matched after all detection phases`);
}

/**
 * Evaluate aggregate conditions (all()/any()) against sub-step results.
 * Returns the 0-based rule index in the step's rules array, or -1 if no match.
 *
 * For each aggregate rule, checks the matched condition text of sub-steps:
 * - all("X"): true when ALL sub-steps have matched condition === X
 * - any("X"): true when at least ONE sub-step has matched condition === X
 *
 * Edge cases per spec:
 * - Sub-step with no matched rule: all() → false, any() → skip that sub-step
 * - No sub-steps (0 件): both → false
 * - Non-parallel step: both → false
 */
export function evaluateAggregateConditions(step: WorkflowStep, state: WorkflowState): number {
  if (!step.rules || !step.parallel || step.parallel.length === 0) return -1;

  for (let i = 0; i < step.rules.length; i++) {
    const rule = step.rules[i]!;
    if (!rule.isAggregateCondition || !rule.aggregateType || !rule.aggregateConditionText) {
      continue;
    }

    const subSteps = step.parallel;
    const targetCondition = rule.aggregateConditionText;

    if (rule.aggregateType === 'all') {
      const allMatch = subSteps.every((sub) => {
        const output = state.stepOutputs.get(sub.name);
        if (!output || output.matchedRuleIndex == null || !sub.rules) return false;
        const matchedRule = sub.rules[output.matchedRuleIndex];
        return matchedRule?.condition === targetCondition;
      });
      if (allMatch) {
        log.debug('Aggregate all() matched', { step: step.name, condition: targetCondition, ruleIndex: i });
        return i;
      }
    } else {
      // 'any'
      const anyMatch = subSteps.some((sub) => {
        const output = state.stepOutputs.get(sub.name);
        if (!output || output.matchedRuleIndex == null || !sub.rules) return false;
        const matchedRule = sub.rules[output.matchedRuleIndex];
        return matchedRule?.condition === targetCondition;
      });
      if (anyMatch) {
        log.debug('Aggregate any() matched', { step: step.name, condition: targetCondition, ruleIndex: i });
        return i;
      }
    }
  }

  return -1;
}

/**
 * Evaluate ai() conditions via AI judge.
 * Collects all ai() rules, calls the judge, and maps the result back to the original rule index.
 * Returns the 0-based rule index in the step's rules array, or -1 if no match.
 */
export async function evaluateAiConditions(step: WorkflowStep, agentOutput: string, cwd: string): Promise<number> {
  if (!step.rules) return -1;

  const aiConditions: { index: number; text: string }[] = [];
  for (let i = 0; i < step.rules.length; i++) {
    const rule = step.rules[i]!;
    if (rule.isAiCondition && rule.aiConditionText) {
      aiConditions.push({ index: i, text: rule.aiConditionText });
    }
  }

  if (aiConditions.length === 0) return -1;

  log.debug('Evaluating ai() conditions via judge', {
    step: step.name,
    conditionCount: aiConditions.length,
  });

  // Remap: judge returns 0-based index within aiConditions array
  const judgeConditions = aiConditions.map((c, i) => ({ index: i, text: c.text }));
  const judgeResult = await callAiJudge(agentOutput, judgeConditions, { cwd });

  if (judgeResult >= 0 && judgeResult < aiConditions.length) {
    const matched = aiConditions[judgeResult]!;
    log.debug('AI judge matched condition', {
      step: step.name,
      judgeResult,
      originalRuleIndex: matched.index,
      condition: matched.text,
    });
    return matched.index;
  }

  log.debug('AI judge did not match any condition', { step: step.name });
  return -1;
}

/**
 * Final fallback: evaluate ALL rule conditions via AI judge.
 * Unlike evaluateAiConditions (which only handles ai() flagged rules),
 * this sends every rule's condition text to the judge.
 * Returns the 0-based rule index, or -1 if no match.
 */
export async function evaluateAllConditionsViaAiJudge(step: WorkflowStep, agentOutput: string, cwd: string): Promise<number> {
  if (!step.rules || step.rules.length === 0) return -1;

  const conditions = step.rules.map((rule, i) => ({ index: i, text: rule.condition }));

  log.debug('Evaluating all conditions via AI judge (final fallback)', {
    step: step.name,
    conditionCount: conditions.length,
  });

  const judgeResult = await callAiJudge(agentOutput, conditions, { cwd });

  if (judgeResult >= 0 && judgeResult < conditions.length) {
    log.debug('AI judge (fallback) matched condition', {
      step: step.name,
      ruleIndex: judgeResult,
      condition: conditions[judgeResult]!.text,
    });
    return judgeResult;
  }

  log.debug('AI judge (fallback) did not match any condition', { step: step.name });
  return -1;
}
