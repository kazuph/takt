/**
 * Aggregate condition evaluator for parallel workflow steps
 *
 * Evaluates all()/any() aggregate conditions against sub-step results.
 */

import type { WorkflowStep, WorkflowState } from '../../models/types.js';
import { createLogger } from '../../../shared/utils/index.js';

const log = createLogger('aggregate-evaluator');

/**
 * Evaluates aggregate conditions (all()/any()) for parallel parent steps.
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
export class AggregateEvaluator {
  constructor(
    private readonly step: WorkflowStep,
    private readonly state: WorkflowState,
  ) {}

  /**
   * Evaluate aggregate conditions.
   * Returns the 0-based rule index in the step's rules array, or -1 if no match.
   */
  evaluate(): number {
    if (!this.step.rules || !this.step.parallel || this.step.parallel.length === 0) return -1;

    for (let i = 0; i < this.step.rules.length; i++) {
      const rule = this.step.rules[i]!;
      if (!rule.isAggregateCondition || !rule.aggregateType || !rule.aggregateConditionText) {
        continue;
      }

      const subSteps = this.step.parallel;
      const targetCondition = rule.aggregateConditionText;

      if (rule.aggregateType === 'all') {
        const allMatch = subSteps.every((sub) => {
          const output = this.state.stepOutputs.get(sub.name);
          if (!output || output.matchedRuleIndex == null || !sub.rules) return false;
          const matchedRule = sub.rules[output.matchedRuleIndex];
          return matchedRule?.condition === targetCondition;
        });
        if (allMatch) {
          log.debug('Aggregate all() matched', { step: this.step.name, condition: targetCondition, ruleIndex: i });
          return i;
        }
      } else {
        // 'any'
        const anyMatch = subSteps.some((sub) => {
          const output = this.state.stepOutputs.get(sub.name);
          if (!output || output.matchedRuleIndex == null || !sub.rules) return false;
          const matchedRule = sub.rules[output.matchedRuleIndex];
          return matchedRule?.condition === targetCondition;
        });
        if (anyMatch) {
          log.debug('Aggregate any() matched', { step: this.step.name, condition: targetCondition, ruleIndex: i });
          return i;
        }
      }
    }

    return -1;
  }
}
